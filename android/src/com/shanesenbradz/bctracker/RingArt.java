package com.shanesenbradz.bctracker;

import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.RectF;
import android.graphics.Typeface;

/**
 * Draws the widget art: a ring like the iPhone battery widget (progress arc
 * with a charging bolt and the percentage inside), and a battery-shaped bar
 * with ticks at each fasting stage.
 */
final class RingArt {
    private RingArt() {}

    static int withAlpha(int color, int alpha) {
        return Color.argb(alpha, Color.red(color), Color.green(color), Color.blue(color));
    }

    /**
     * @param fraction 0..1 progress through the plan
     * @param ticks    stage boundaries as fractions of the plan (0..1)
     * @param label    big text in the middle ("62%" or "--")
     * @param bolt     draw the charging bolt (only while fasting)
     */
    static Bitmap ring(int size, float fraction, float[] ticks, int accent, boolean dark, String label, boolean bolt, boolean done) {
        Bitmap bm = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888);
        Canvas cv = new Canvas(bm);
        float stroke = size * 0.095f;
        float pad = stroke / 2f + size * 0.02f;
        RectF box = new RectF(pad, pad, size - pad, size - pad);

        Paint track = new Paint(Paint.ANTI_ALIAS_FLAG);
        track.setStyle(Paint.Style.STROKE);
        track.setStrokeWidth(stroke);
        track.setColor(dark ? withAlpha(0xFFFFFFFF, 34) : withAlpha(0xFF3C3C43, 30));
        cv.drawArc(box, 0, 360, false, track);

        int ringColor = done ? 0xFF30D158 : accent;
        Paint arc = new Paint(Paint.ANTI_ALIAS_FLAG);
        arc.setStyle(Paint.Style.STROKE);
        arc.setStrokeWidth(stroke);
        arc.setStrokeCap(Paint.Cap.ROUND);
        arc.setColor(ringColor);
        float f = Math.max(0f, Math.min(1f, fraction));
        if (f > 0f) {
            float sweep = Math.max(f * 360f, 1.5f);
            if (f >= 1f) {
                arc.setStrokeCap(Paint.Cap.BUTT);
                cv.drawArc(box, -90, 360, false, arc);
            } else {
                cv.drawArc(box, -90, sweep, false, arc);
            }
        }

        /* small dots on the ring where each stage starts */
        if (ticks != null) {
            Paint dot = new Paint(Paint.ANTI_ALIAS_FLAG);
            float r = (box.width()) / 2f, cx = size / 2f, cy = size / 2f;
            for (float t : ticks) {
                if (t <= 0f || t >= 1f) continue;
                double ang = Math.toRadians(-90 + t * 360f);
                float x = cx + (float) (r * Math.cos(ang)), y = cy + (float) (r * Math.sin(ang));
                dot.setColor(t <= f ? withAlpha(0xFFFFFFFF, 210) : (dark ? withAlpha(0xFFFFFFFF, 90) : withAlpha(0xFF3C3C43, 80)));
                cv.drawCircle(x, y, stroke * 0.17f, dot);
            }
        }

        int fg = dark ? 0xFFF5F5F7 : 0xFF1C1C1E;
        Paint txt = new Paint(Paint.ANTI_ALIAS_FLAG);
        txt.setTextAlign(Paint.Align.CENTER);
        txt.setColor(fg);
        txt.setTypeface(Typeface.create("sans-serif", Typeface.BOLD));
        txt.setTextSize(size * (label.length() > 3 ? 0.165f : 0.2f));
        float textY = size / 2f + (bolt ? size * 0.14f : size * 0.07f);
        cv.drawText(label, size / 2f, textY, txt);

        if (bolt) {
            float bw = size * 0.1f, bh = size * 0.155f;
            float bx = size / 2f - bw / 2f, by = size / 2f - size * 0.215f;
            Path p = new Path();
            p.moveTo(bx + bw * 0.62f, by);
            p.lineTo(bx, by + bh * 0.58f);
            p.lineTo(bx + bw * 0.45f, by + bh * 0.58f);
            p.lineTo(bx + bw * 0.36f, by + bh);
            p.lineTo(bx + bw, by + bh * 0.4f);
            p.lineTo(bx + bw * 0.55f, by + bh * 0.4f);
            p.close();
            Paint bp = new Paint(Paint.ANTI_ALIAS_FLAG);
            bp.setColor(ringColor);
            cv.drawPath(p, bp);
        }
        return bm;
    }

    /** A battery-shaped bar: rounded body, nub at the end, fill, and stage ticks. */
    static Bitmap bar(int w, int h, float fraction, float[] ticks, int accent, boolean dark, boolean done) {
        w = Math.max(w, h * 4);
        Bitmap bm = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888);
        Canvas cv = new Canvas(bm);
        float nubW = h * 0.16f;
        float bodyR = h * 0.32f;
        RectF body = new RectF(0, 0, w - nubW - h * 0.08f, h);

        Paint outline = new Paint(Paint.ANTI_ALIAS_FLAG);
        outline.setColor(dark ? withAlpha(0xFFFFFFFF, 30) : withAlpha(0xFF3C3C43, 26));
        cv.drawRoundRect(body, bodyR, bodyR, outline);

        RectF nub = new RectF(w - nubW, h * 0.3f, w, h * 0.7f);
        cv.drawRoundRect(nub, nubW / 2f, nubW / 2f, outline);

        float inset = h * 0.14f;
        RectF inner = new RectF(body.left + inset, body.top + inset, body.right - inset, body.bottom - inset);
        float f = Math.max(0f, Math.min(1f, fraction));
        if (f > 0f) {
            Paint fill = new Paint(Paint.ANTI_ALIAS_FLAG);
            fill.setColor(done ? 0xFF30D158 : accent);
            RectF fr = new RectF(inner.left, inner.top, inner.left + Math.max(inner.height(), inner.width() * f), inner.bottom);
            float r = inner.height() * 0.32f;
            cv.drawRoundRect(fr, r, r, fill);
        }
        if (ticks != null) {
            Paint tk = new Paint(Paint.ANTI_ALIAS_FLAG);
            tk.setStrokeWidth(Math.max(1.5f, h * 0.07f));
            for (float t : ticks) {
                if (t <= 0f || t >= 1f) continue;
                float x = inner.left + inner.width() * t;
                tk.setColor(t <= f ? withAlpha(0xFFFFFFFF, 150) : (dark ? withAlpha(0xFFFFFFFF, 60) : withAlpha(0xFF3C3C43, 60)));
                cv.drawLine(x, inner.top + inner.height() * 0.2f, x, inner.bottom - inner.height() * 0.2f, tk);
            }
        }
        return bm;
    }
}
