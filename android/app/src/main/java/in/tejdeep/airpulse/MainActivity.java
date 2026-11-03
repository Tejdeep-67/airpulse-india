package in.tejdeep.airpulse;

import android.content.Intent;
import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    private static final String SITE = "https://airpulse-india.netlify.app";

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(DailyAqiPlugin.class);
        super.onCreate(savedInstanceState);
        openCityFrom(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        openCityFrom(intent);
    }

    // tapping the daily notification opens that city's page
    private void openCityFrom(Intent intent) {
        if (intent == null || bridge == null) return;
        String cityId = intent.getStringExtra("cityId");
        if (cityId != null && cityId.matches("[a-z0-9-]+")) {
            intent.removeExtra("cityId");
            bridge.getWebView().loadUrl(SITE + "/city/" + cityId);
        }
    }
}
