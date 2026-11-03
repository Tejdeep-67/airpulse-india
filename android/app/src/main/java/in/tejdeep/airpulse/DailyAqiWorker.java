package in.tejdeep.airpulse;

import android.Manifest;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.os.Build;
import android.util.Log;

import androidx.annotation.NonNull;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;
import androidx.work.Constraints;
import androidx.work.Data;
import androidx.work.ExistingWorkPolicy;
import androidx.work.NetworkType;
import androidx.work.OneTimeWorkRequest;
import androidx.work.WorkManager;
import androidx.work.Worker;
import androidx.work.WorkerParameters;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.text.SimpleDateFormat;
import java.util.Calendar;
import java.util.Date;
import java.util.Locale;
import java.util.TimeZone;
import java.util.concurrent.TimeUnit;

/**
 * Runs once a day at the time the user picked: downloads the last 2 days of air quality for
 * their city from Open-Meteo, works out the AQI and shows it as a notification.
 * Then it queues itself again for the same time tomorrow.
 */
public class DailyAqiWorker extends Worker {

    static final String TAG = "DailyAqi";
    static final String WORK_NAME = "daily-aqi";
    static final String PREFS = "daily_aqi";
    static final String CHANNEL = "daily_aqi";
    static final String KEY_TEST = "test";

    public DailyAqiWorker(@NonNull Context context, @NonNull WorkerParameters params) {
        super(context, params);
    }

    // ---------- scheduling ----------

    static SharedPreferences prefs(Context c) {
        return c.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    /** milliseconds from now until the next hour:minute on the phone's clock */
    static long delayUntil(int hour, int minute) {
        Calendar now = Calendar.getInstance();
        Calendar next = (Calendar) now.clone();
        next.set(Calendar.HOUR_OF_DAY, hour);
        next.set(Calendar.MINUTE, minute);
        next.set(Calendar.SECOND, 0);
        next.set(Calendar.MILLISECOND, 0);
        if (!next.after(now)) next.add(Calendar.DAY_OF_MONTH, 1);
        return next.getTimeInMillis() - now.getTimeInMillis();
    }

    static OneTimeWorkRequest request(long delayMs, boolean test) {
        Constraints net = new Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build();
        return new OneTimeWorkRequest.Builder(DailyAqiWorker.class)
            .setInitialDelay(delayMs, TimeUnit.MILLISECONDS)
            .setConstraints(net)
            .setInputData(new Data.Builder().putBoolean(KEY_TEST, test).build())
            .addTag(WORK_NAME)
            .build();
    }

    /** (re)start the daily chain from the saved settings */
    static void schedule(Context c) {
        SharedPreferences p = prefs(c);
        long delay = delayUntil(p.getInt("hour", 8), p.getInt("minute", 0));
        WorkManager.getInstance(c).enqueueUniqueWork(WORK_NAME, ExistingWorkPolicy.REPLACE, request(delay, false));
    }

    static void cancel(Context c) {
        WorkManager.getInstance(c).cancelUniqueWork(WORK_NAME);
    }

    /** one notification right now, to try it out. Doesn't touch the daily chain. */
    static void runNow(Context c) {
        WorkManager.getInstance(c).enqueueUniqueWork(WORK_NAME + "-test", ExistingWorkPolicy.REPLACE, request(0, true));
    }

    // ---------- the work ----------

    @NonNull
    @Override
    public Result doWork() {
        Context c = getApplicationContext();
        boolean test = getInputData().getBoolean(KEY_TEST, false);
        SharedPreferences p = prefs(c);
        if (!test && !p.getBoolean("enabled", false)) return Result.success();

        String city = p.getString("cityName", "your city");
        try {
            Aqi.Result r = fetchAqi(p.getFloat("lat", 0), p.getFloat("lon", 0));
            if (r == null) {
                notify(c, city + ": AQI not available right now",
                    "Open-Meteo didn't have enough data for this hour. Open AirPulse for the latest.", p.getString("cityId", ""));
            } else {
                int band = r.band();
                notify(c, city + " AQI " + r.aqi + " · " + Aqi.NAMES[band],
                    "Main pollutant " + r.dominant + ". " + Aqi.ADVICE[band], p.getString("cityId", ""));
                p.edit().putInt("lastAqi", r.aqi).putLong("lastAt", System.currentTimeMillis()).apply();
            }
        } catch (Exception e) {
            Log.w(TAG, "fetch failed", e);
            // no internet or the API is down: WorkManager tries again with backoff, 3 times at most
            if (getRunAttemptCount() < 3) return Result.retry();
        }

        if (!test) {
            // queue tomorrow's run. APPEND_OR_REPLACE puts it after this one instead of cancelling this one.
            long delay = delayUntil(p.getInt("hour", 8), p.getInt("minute", 0));
            if (delay < TimeUnit.HOURS.toMillis(1)) delay += TimeUnit.DAYS.toMillis(1);
            WorkManager.getInstance(c).enqueueUniqueWork(WORK_NAME, ExistingWorkPolicy.APPEND_OR_REPLACE, request(delay, false));
        }
        return Result.success();
    }

    static Aqi.Result fetchAqi(double lat, double lon) throws Exception {
        String url = String.format(Locale.US,
            "https://air-quality-api.open-meteo.com/v1/air-quality?latitude=%.4f&longitude=%.4f"
                + "&hourly=pm2_5,pm10,nitrogen_dioxide,sulphur_dioxide,ozone,carbon_monoxide"
                + "&timezone=Asia%%2FKolkata&past_days=2&forecast_days=1",
            lat, lon);
        HttpURLConnection conn = (HttpURLConnection) new URL(url).openConnection();
        conn.setConnectTimeout(15000);
        conn.setReadTimeout(20000);
        conn.setRequestProperty("User-Agent", "AirPulse-Android/1.0");
        if (conn.getResponseCode() != 200) throw new Exception("HTTP " + conn.getResponseCode());
        StringBuilder sb = new StringBuilder();
        try (BufferedReader in = new BufferedReader(new InputStreamReader(conn.getInputStream(), "UTF-8"))) {
            String line;
            while ((line = in.readLine()) != null) sb.append(line);
        } finally {
            conn.disconnect();
        }
        JSONObject hourly = new JSONObject(sb.toString()).getJSONObject("hourly");
        JSONArray time = hourly.getJSONArray("time");

        // times are like "2026-11-03T08:00" in IST; find the current hour
        SimpleDateFormat fmt = new SimpleDateFormat("yyyy-MM-dd'T'HH':00'", Locale.US);
        fmt.setTimeZone(TimeZone.getTimeZone("Asia/Kolkata"));
        String nowHour = fmt.format(new Date());
        int idx = -1;
        for (int i = 0; i < time.length(); i++) {
            if (time.getString(i).equals(nowHour)) {
                idx = i;
                break;
            }
        }
        if (idx < 0) idx = time.length() - 1;

        return Aqi.at(series(hourly, "pm2_5"), series(hourly, "pm10"), series(hourly, "nitrogen_dioxide"),
            series(hourly, "sulphur_dioxide"), series(hourly, "ozone"), series(hourly, "carbon_monoxide"), idx);
    }

    private static Double[] series(JSONObject hourly, String key) {
        JSONArray a = hourly.optJSONArray(key);
        if (a == null) return null;
        Double[] out = new Double[a.length()];
        for (int i = 0; i < a.length(); i++) out[i] = a.isNull(i) ? null : a.optDouble(i);
        return out;
    }

    static void createChannel(Context c) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel ch = new NotificationChannel(CHANNEL, "Daily AQI", NotificationManager.IMPORTANCE_DEFAULT);
            ch.setDescription("Your city's air quality once a day");
            NotificationManager nm = c.getSystemService(NotificationManager.class);
            if (nm != null) nm.createNotificationChannel(ch);
        }
    }

    private static void notify(Context c, String title, String body, String cityId) {
        if (Build.VERSION.SDK_INT >= 33
            && ContextCompat.checkSelfPermission(c, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            Log.w(TAG, "notification permission missing");
            return;
        }
        createChannel(c);
        Intent open = new Intent(c, MainActivity.class);
        open.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        open.putExtra("cityId", cityId);
        PendingIntent pi = PendingIntent.getActivity(c, 0, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        NotificationCompat.Builder b = new NotificationCompat.Builder(c, CHANNEL)
            .setSmallIcon(R.drawable.ic_stat_airpulse)
            .setColor(Color.parseColor("#3563f0"))
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
            .setContentIntent(pi)
            .setAutoCancel(true);
        NotificationManagerCompat.from(c).notify(1001, b.build());
    }
}
