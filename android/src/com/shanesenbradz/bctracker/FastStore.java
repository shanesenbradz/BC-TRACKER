package com.shanesenbradz.bctracker;

import android.app.AlarmManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.os.Build;

import org.json.JSONArray;
import org.json.JSONObject;

/**
 * The current fast, as last sent by the web app, plus the alarm logic.
 *
 * The web app sends a list of upcoming alerts (time, title, body). Only the
 * next one is booked with the alarm service at a time. When it fires, the
 * receiver shows it and books the one after, so the chain survives the app
 * being closed. A reboot or app update re-books it from the saved state.
 */
final class FastStore {
    static final String PREFS = "bct";
    static final String CHANNEL = "fast_stages";
    static final String ACTION_FIRE = "com.shanesenbradz.bctracker.FIRE";
    static final String ACTION_TICK = "com.shanesenbradz.bctracker.TICK";
    private static final long TICK_MS = 5 * 60 * 1000L;

    private FastStore() {}

    static SharedPreferences prefs(Context c) {
        return c.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    static JSONObject load(Context c) {
        try {
            String s = prefs(c).getString("state", null);
            return s == null ? null : new JSONObject(s);
        } catch (Exception e) {
            return null;
        }
    }

    /** Saves a new state from the web app and re-books alarms and widgets. */
    static void sync(Context c, String json) {
        JSONObject next;
        try { next = new JSONObject(json); } catch (Exception e) { return; }
        SharedPreferences p = prefs(c);
        long newStart = next.optBoolean("active") ? next.optLong("startMs") : 0L;
        SharedPreferences.Editor ed = p.edit().putString("state", next.toString());
        /* A different fast resets the "already shown" marker */
        if (p.getLong("firedStart", -1L) != newStart) {
            ed.putLong("firedStart", newStart).putLong("lastFiredAt", 0L);
        }
        ed.apply();
        reschedule(c);
        FastWidget.updateAll(c);
    }

    static boolean active(JSONObject s) {
        return s != null && s.optBoolean("active") && s.optLong("startMs") > 0;
    }

    /* ---------------- Alarms ---------------- */

    private static PendingIntent pending(Context c, String action) {
        Intent i = new Intent(c, AlarmReceiver.class).setAction(action);
        return PendingIntent.getBroadcast(c, action.equals(ACTION_FIRE) ? 1 : 2, i,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    static boolean exactAllowed(Context c) {
        AlarmManager am = (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
        if (am == null) return false;
        if (Build.VERSION.SDK_INT >= 31) return am.canScheduleExactAlarms();
        return true;
    }

    /** Books the next alert that has not been shown yet, and the widget tick. */
    static void reschedule(Context c) {
        AlarmManager am = (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
        if (am == null) return;
        PendingIntent fire = pending(c, ACTION_FIRE);
        am.cancel(fire);
        JSONObject s = load(c);
        if (active(s)) {
            long lastFired = prefs(c).getLong("lastFiredAt", 0L);
            long now = System.currentTimeMillis();
            JSONArray ev = s.optJSONArray("events");
            long at = 0L;
            if (ev != null) {
                for (int i = 0; i < ev.length(); i++) {
                    long t = ev.optJSONObject(i).optLong("atMs");
                    if (t > lastFired && t > now - 60000L && (at == 0L || t < at)) at = t;
                }
            }
            if (at > 0L) {
                try {
                    if (exactAllowed(c)) am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, fire);
                    else am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, fire);
                } catch (SecurityException e) {
                    am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, fire);
                }
            }
        }
        scheduleTick(c);
    }

    /**
     * Keeps the widget ring current. The countdown text runs by itself, so
     * this only redraws the ring every few minutes, and never wakes the phone.
     */
    static void scheduleTick(Context c) {
        AlarmManager am = (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
        if (am == null) return;
        PendingIntent tick = pending(c, ACTION_TICK);
        am.cancel(tick);
        JSONObject s = load(c);
        if (!active(s) || widgetIds(c).length == 0) return;
        long now = System.currentTimeMillis();
        long start = s.optLong("startMs");
        long at = now + TICK_MS;
        long planEnd = start + Math.round(s.optDouble("planHours", 12) * 3600000L);
        if (planEnd > now && planEnd < at) at = planEnd + 1000L;
        JSONArray st = s.optJSONArray("stages");
        if (st != null) {
            for (int i = 0; i < st.length(); i++) {
                long b = start + Math.round(st.optJSONObject(i).optDouble("start") * 3600000L);
                if (b > now && b < at) at = b + 1000L;
            }
        }
        am.set(AlarmManager.RTC, at, tick);
    }

    static int[] widgetIds(Context c) {
        try {
            return AppWidgetManager.getInstance(c).getAppWidgetIds(new ComponentName(c, FastWidget.class));
        } catch (Exception e) {
            return new int[0];
        }
    }

    /** Called when the alert alarm fires: shows what is due, books the next. */
    static void onFire(Context c) {
        JSONObject s = load(c);
        if (active(s)) {
            long now = System.currentTimeMillis();
            long lastFired = prefs(c).getLong("lastFiredAt", 0L);
            JSONArray ev = s.optJSONArray("events");
            JSONObject due = null;
            if (ev != null) {
                for (int i = 0; i < ev.length(); i++) {
                    JSONObject e = ev.optJSONObject(i);
                    long t = e.optLong("atMs");
                    /* If several were missed (phone off), show only the latest */
                    if (t > lastFired && t <= now + 30000L && (due == null || t > due.optLong("atMs"))) due = e;
                }
            }
            if (due != null) {
                prefs(c).edit().putLong("lastFiredAt", due.optLong("atMs")).apply();
                boolean stale = now - due.optLong("atMs") > 6 * 3600000L;
                if (!stale) notify(c, due.optString("id").hashCode(), due.optString("title"), due.optString("body"), accent(s));
            }
        }
        reschedule(c);
        FastWidget.updateAll(c);
    }

    static int accent(JSONObject s) {
        try { return Color.parseColor(s.optString("accent", "#0A84FF")); } catch (Exception e) { return 0xFF0A84FF; }
    }

    /* ---------------- Notifications ---------------- */

    static void ensureChannel(Context c) {
        if (Build.VERSION.SDK_INT < 26) return;
        NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null || nm.getNotificationChannel(CHANNEL) != null) return;
        NotificationChannel ch = new NotificationChannel(CHANNEL, "Fasting stages", NotificationManager.IMPORTANCE_HIGH);
        ch.setDescription("A heads up as you reach each stage of your fast");
        ch.enableVibration(true);
        nm.createNotificationChannel(ch);
    }

    static boolean notificationsAllowed(Context c) {
        NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null || !nm.areNotificationsEnabled()) return false;
        if (Build.VERSION.SDK_INT >= 26) {
            ensureChannel(c);
            NotificationChannel ch = nm.getNotificationChannel(CHANNEL);
            if (ch != null && ch.getImportance() == NotificationManager.IMPORTANCE_NONE) return false;
        }
        return true;
    }

    @SuppressWarnings("deprecation")
    static void notify(Context c, int id, String title, String body, int color) {
        if (!notificationsAllowed(c)) return;
        ensureChannel(c);
        Intent open = new Intent(c, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent pi = PendingIntent.getActivity(c, 0, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        Notification.Builder b = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(c, CHANNEL) : new Notification.Builder(c);
        b.setSmallIcon(R.drawable.ic_stat)
                .setContentTitle(title)
                .setContentText(body)
                .setStyle(new Notification.BigTextStyle().bigText(body))
                .setColor(color)
                .setAutoCancel(true)
                .setContentIntent(pi)
                .setCategory(Notification.CATEGORY_REMINDER)
                .setWhen(System.currentTimeMillis())
                .setShowWhen(true);
        if (Build.VERSION.SDK_INT < 26) {
            b.setPriority(Notification.PRIORITY_HIGH).setDefaults(Notification.DEFAULT_ALL);
        }
        NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
        try { if (nm != null) nm.notify(id, b.build()); } catch (SecurityException ignored) {}
    }
}
