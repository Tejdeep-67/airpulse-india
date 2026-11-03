package in.tejdeep.airpulse;

import android.Manifest;
import android.content.SharedPreferences;
import android.os.Build;

import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

/**
 * Small plugin the website calls (only inside the Android app) to turn the daily AQI
 * notification on or off. The actual work happens in DailyAqiWorker.
 *
 * JS side: src/lib/app.js
 */
@CapacitorPlugin(
    name = "DailyAqi",
    permissions = { @Permission(alias = "notifications", strings = { Manifest.permission.POST_NOTIFICATIONS }) }
)
public class DailyAqiPlugin extends Plugin {

    private boolean notificationsAllowed() {
        return Build.VERSION.SDK_INT < 33 || getPermissionState("notifications") == PermissionState.GRANTED;
    }

    @PluginMethod
    public void getStatus(PluginCall call) {
        SharedPreferences p = DailyAqiWorker.prefs(getContext());
        JSObject ret = new JSObject();
        ret.put("enabled", p.getBoolean("enabled", false));
        ret.put("cityId", p.getString("cityId", null));
        ret.put("cityName", p.getString("cityName", null));
        ret.put("hour", p.getInt("hour", 8));
        ret.put("minute", p.getInt("minute", 0));
        ret.put("permission", notificationsAllowed() ? "granted" : getPermissionState("notifications").toString());
        if (p.contains("lastAqi")) {
            ret.put("lastAqi", p.getInt("lastAqi", 0));
            ret.put("lastAt", p.getLong("lastAt", 0));
        }
        call.resolve(ret);
    }

    @PluginMethod
    public void enable(PluginCall call) {
        String cityId = call.getString("cityId");
        Double lat = call.getDouble("lat");
        Double lon = call.getDouble("lon");
        if (cityId == null || lat == null || lon == null) {
            call.reject("cityId, lat and lon are needed");
            return;
        }
        if (!notificationsAllowed()) {
            requestPermissionForAlias("notifications", call, "afterPermission");
            return;
        }
        save(call);
    }

    @PermissionCallback
    private void afterPermission(PluginCall call) {
        if (notificationsAllowed()) save(call);
        else call.reject("Notifications are turned off for AirPulse", "DENIED");
    }

    private void save(PluginCall call) {
        int hour = clamp(call.getInt("hour", 8), 0, 23);
        int minute = clamp(call.getInt("minute", 0), 0, 59);
        DailyAqiWorker.prefs(getContext())
            .edit()
            .putBoolean("enabled", true)
            .putString("cityId", call.getString("cityId"))
            .putString("cityName", call.getString("cityName", call.getString("cityId")))
            .putFloat("lat", call.getDouble("lat").floatValue())
            .putFloat("lon", call.getDouble("lon").floatValue())
            .putInt("hour", hour)
            .putInt("minute", minute)
            .apply();
        DailyAqiWorker.createChannel(getContext());
        DailyAqiWorker.schedule(getContext());
        getStatus(call);
    }

    @PluginMethod
    public void disable(PluginCall call) {
        DailyAqiWorker.prefs(getContext()).edit().putBoolean("enabled", false).apply();
        DailyAqiWorker.cancel(getContext());
        getStatus(call);
    }

    @PluginMethod
    public void sendNow(PluginCall call) {
        if (!notificationsAllowed()) {
            call.reject("Notifications are turned off for AirPulse", "DENIED");
            return;
        }
        DailyAqiWorker.runNow(getContext());
        call.resolve();
    }

    private static int clamp(Integer v, int lo, int hi) {
        if (v == null) return lo;
        return Math.max(lo, Math.min(hi, v));
    }
}
