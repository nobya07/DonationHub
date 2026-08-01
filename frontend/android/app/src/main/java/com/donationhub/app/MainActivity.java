package com.donationhub.app;

import android.os.Bundle;
import android.view.View;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // App-like feel: no overscroll glow, no pull-to-refresh bounce.
        getBridge().getWebView().setOverScrollMode(View.OVER_SCROLL_NEVER);
        // Lets the web app enable/disable screenshot protection per screen
        // (used on the login page). No-op in the browser.
        getBridge().getWebView().addJavascriptInterface(new Object() {
            @JavascriptInterface
            public void setSecure(boolean secure) {
                runOnUiThread(() -> {
                    if (secure) {
                        getWindow().addFlags(WindowManager.LayoutParams.FLAG_SECURE);
                    } else {
                        getWindow().clearFlags(WindowManager.LayoutParams.FLAG_SECURE);
                    }
                });
            }
        }, "AndroidSecure");
    }
}
