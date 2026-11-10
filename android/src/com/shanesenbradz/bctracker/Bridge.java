package com.shanesenbradz.bctracker;

import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.view.HapticFeedbackConstants;
import android.webkit.JavascriptInterface;

/** window.BCNative in the web app. Calls arrive on a background thread. */
final class Bridge {
    private final MainActivity a;

    Bridge(MainActivity a) { this.a = a; }

    private void ui(Runnable r) { a.runOnUiThread(r); }

    @JavascriptInterface
    public String appVersion() { return BuildInfo.VERSION; }

    /** The web app's current fast and upcoming alerts, as JSON */
    @JavascriptInterface
    public void syncFast(String json) {
        FastStore.sync(a.getApplicationContext(), json);
    }

    @JavascriptInterface
    public boolean notificationsAllowed() {
        return FastStore.notificationsAllowed(a);
    }

    @JavascriptInterface
    public void requestNotifications() {
        ui(new Runnable() { @Override public void run() { a.askNotifications(); } });
    }

    @JavascriptInterface
    public void testNotification(String title, String body) {
        FastStore.notify(a, 999, title, body, FastStore.accent(FastStore.load(a)));
    }

    @JavascriptInterface
    public boolean exactAlarmsAllowed() {
        return FastStore.exactAllowed(a);
    }

    @JavascriptInterface
    public void openExactAlarmSettings() {
        if (Build.VERSION.SDK_INT < 31) return;
        ui(new Runnable() {
            @Override public void run() {
                try {
                    a.startActivity(new Intent("android.settings.REQUEST_SCHEDULE_EXACT_ALARM", Uri.parse("package:" + a.getPackageName())));
                } catch (Exception e) {
                    a.toast("Open Settings, Apps, B.C Tracker, then Alarms and reminders.");
                }
            }
        });
    }

    @JavascriptInterface
    public boolean canPinWidget() {
        if (Build.VERSION.SDK_INT < 26) return false;
        AppWidgetManager m = a.getSystemService(AppWidgetManager.class);
        return m != null && m.isRequestPinAppWidgetSupported();
    }

    @JavascriptInterface
    public boolean pinWidget() {
        if (!canPinWidget()) return false;
        AppWidgetManager m = a.getSystemService(AppWidgetManager.class);
        try {
            return m.requestPinAppWidget(new ComponentName(a, FastWidget.class), null, null);
        } catch (Exception e) {
            return false;
        }
    }

    @JavascriptInterface
    public void setChrome(final String theme) {
        ui(new Runnable() { @Override public void run() { a.setChrome(!"light".equals(theme)); } });
    }

    @JavascriptInterface
    public void saveFile(final String name, final String mime, final String content) {
        ui(new Runnable() { @Override public void run() { a.saveFile(name, mime, content); } });
    }

    @JavascriptInterface
    public void haptic(final String name) {
        ui(new Runnable() {
            @Override public void run() {
                if (a.web == null) return;
                int k;
                switch (name == null ? "" : name) {
                    case "tick": k = HapticFeedbackConstants.CLOCK_TICK; break;
                    case "tab": k = HapticFeedbackConstants.KEYBOARD_TAP; break;
                    case "toggle": k = Build.VERSION.SDK_INT >= 34 ? HapticFeedbackConstants.TOGGLE_ON : HapticFeedbackConstants.CONTEXT_CLICK; break;
                    case "confirm": k = Build.VERSION.SDK_INT >= 30 ? HapticFeedbackConstants.CONFIRM : HapticFeedbackConstants.LONG_PRESS; break;
                    case "reject": k = Build.VERSION.SDK_INT >= 30 ? HapticFeedbackConstants.REJECT : HapticFeedbackConstants.LONG_PRESS; break;
                    default: k = HapticFeedbackConstants.KEYBOARD_TAP;
                }
                a.web.performHapticFeedback(k);
            }
        });
    }
}
