package com.shanesenbradz.bctracker;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.content.Intent;
import android.os.Bundle;
import android.os.SystemClock;
import android.text.format.DateFormat;
import android.util.DisplayMetrics;
import android.view.View;
import android.widget.RemoteViews;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.Date;

/**
 * Home screen widget. Small size: a battery-style ring with the percentage
 * and the time left. Wider: the ring plus stage name, countdown, a battery
 * bar with stage ticks, and when the next stage starts.
 *
 * The countdown is a Chronometer, so it ticks live on the home screen
 * without the app waking up. The ring is redrawn every few minutes.
 */
public class FastWidget extends AppWidgetProvider {

    @Override
    public void onUpdate(Context c, AppWidgetManager m, int[] ids) {
        for (int id : ids) update(c, m, id);
        FastStore.scheduleTick(c);
    }

    @Override
    public void onAppWidgetOptionsChanged(Context c, AppWidgetManager m, int id, Bundle newOptions) {
        update(c, m, id);
    }

    @Override
    public void onEnabled(Context c) {
        FastStore.scheduleTick(c);
    }

    static void updateAll(Context c) {
        try {
            AppWidgetManager m = AppWidgetManager.getInstance(c);
            for (int id : FastStore.widgetIds(c)) update(c, m, id);
        } catch (Exception ignored) {}
    }

    static void update(Context c, AppWidgetManager m, int id) {
        Bundle o = m.getAppWidgetOptions(id);
        int minW = o.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH, 110);
        int maxH = o.getInt(AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT, 110);
        try {
            m.updateAppWidget(id, build(c, minW, maxH));
        } catch (Exception ignored) {}
    }

    static RemoteViews build(Context c, int widthDp, int heightDp) {
        boolean wide = widthDp >= 220;
        RemoteViews v = new RemoteViews(c.getPackageName(), wide ? R.layout.widget_wide : R.layout.widget_small);
        DisplayMetrics dm = c.getResources().getDisplayMetrics();

        JSONObject s = FastStore.load(c);
        boolean dark = s == null || !"light".equals(s.optString("theme"));
        int accent = s == null ? 0xFF0A84FF : FastStore.accent(s);
        int fg = dark ? 0xFFF5F5F7 : 0xFF1C1C1E;
        int fg2 = dark ? 0x99EBEBF5 : 0x993C3C43;

        v.setInt(R.id.w_root, "setBackgroundResource", dark ? R.drawable.widget_bg_dark : R.drawable.widget_bg_light);
        v.setTextColor(R.id.w_stage, wide ? fg : fg2);
        v.setTextColor(R.id.w_chrono, fg);
        if (wide) {
            v.setTextColor(R.id.w_caption, fg2);
            v.setTextColor(R.id.w_next, fg2);
        }

        Intent open = new Intent(c, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        v.setOnClickPendingIntent(R.id.w_root, PendingIntent.getActivity(c, 10, open,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE));

        int ringPx = Math.round((wide ? Math.min(132, Math.max(80, heightDp - 28)) : Math.max(70, Math.min(widthDp, heightDp) - 46)) * dm.density);
        ringPx = Math.max(160, Math.min(ringPx, 420));

        if (!FastStore.active(s)) {
            boolean loggedOut = s == null || s.optBoolean("loggedOut");
            v.setImageViewBitmap(R.id.w_ring, RingArt.ring(ringPx, 0f, null, accent, dark, "--", false, false));
            v.setViewVisibility(R.id.w_chrono, View.GONE);
            v.setTextViewText(R.id.w_stage, loggedOut ? "Open B.C Tracker" : "Not fasting");
            if (wide) {
                v.setTextViewText(R.id.w_caption, "B.C TRACKER");
                v.setImageViewBitmap(R.id.w_bar, RingArt.bar(barWidthPx(widthDp, heightDp, dm), Math.round(18 * dm.density), 0f, null, accent, dark, false));
                v.setTextViewText(R.id.w_next, loggedOut ? "Log in to see your fast" : "Set your last meal time to start");
            }
            return v;
        }

        long now = System.currentTimeMillis();
        long start = s.optLong("startMs");
        double planH = s.optDouble("planHours", 12);
        long planEnd = start + Math.round(planH * 3600000L);
        double elapsedH = Math.max(0, (now - start) / 3600000.0);
        float fraction = (float) Math.min(1.0, elapsedH / planH);
        boolean done = now >= planEnd;
        int pct = (int) Math.floor(fraction * 100);

        JSONArray st = s.optJSONArray("stages");
        String stageTitle = "Fasting";
        String nextTitle = null;
        long nextAt = 0L;
        float[] ticks = null;
        if (st != null) {
            ticks = new float[st.length()];
            for (int i = 0; i < st.length(); i++) {
                JSONObject g = st.optJSONObject(i);
                double a = g.optDouble("start"), b = g.optDouble("end");
                ticks[i] = (float) (a / planH);
                if (elapsedH >= a && elapsedH < b) {
                    stageTitle = g.optString("title");
                    if (i + 1 < st.length()) {
                        JSONObject n = st.optJSONObject(i + 1);
                        nextTitle = n.optString("title");
                        nextAt = start + Math.round(n.optDouble("start") * 3600000L);
                    }
                }
            }
        }

        v.setImageViewBitmap(R.id.w_ring, RingArt.ring(ringPx, fraction, ticks, accent, dark, pct + "%", !done, done));
        v.setViewVisibility(R.id.w_chrono, View.VISIBLE);
        long base = SystemClock.elapsedRealtime() + (planEnd - now);
        if (!done) {
            v.setChronometer(R.id.w_chrono, base, "%s left", true);
            v.setChronometerCountDown(R.id.w_chrono, true);
        } else {
            v.setChronometer(R.id.w_chrono, base, "+%s", true);
            v.setChronometerCountDown(R.id.w_chrono, false);
        }
        v.setTextViewText(R.id.w_stage, done && !wide ? "Goal reached" : stageTitle);

        if (wide) {
            String plan = (planH == Math.floor(planH) ? String.valueOf((int) planH) : String.valueOf(planH)) + " HR PLAN";
            v.setTextViewText(R.id.w_caption, (done ? "GOAL REACHED" : "FASTING") + "  ·  " + plan);
            v.setImageViewBitmap(R.id.w_bar, RingArt.bar(barWidthPx(widthDp, heightDp, dm), Math.round(18 * dm.density), fraction, ticks, accent, dark, done));
            String next;
            if (nextTitle != null && nextAt > now) {
                next = "Next: " + nextTitle + " at " + DateFormat.getTimeFormat(c).format(new Date(nextAt));
            } else if (done) {
                next = "Eating window open since " + DateFormat.getTimeFormat(c).format(new Date(planEnd));
            } else {
                next = "Eating window opens at " + DateFormat.getTimeFormat(c).format(new Date(planEnd));
            }
            v.setTextViewText(R.id.w_next, next);
        }
        return v;
    }

    private static int barWidthPx(int widthDp, int heightDp, DisplayMetrics dm) {
        int ringDp = Math.min(132, Math.max(80, heightDp - 28));
        int col = Math.max(90, widthDp - 28 - 14 - ringDp);
        return Math.round(col * dm.density);
    }
}
