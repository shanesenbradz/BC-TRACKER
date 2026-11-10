package com.shanesenbradz.bctracker;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** Stage alert alarms, and the quiet widget refresh tick. */
public class AlarmReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context c, Intent intent) {
        String a = intent.getAction();
        if (FastStore.ACTION_FIRE.equals(a)) {
            FastStore.onFire(c);
        } else if (FastStore.ACTION_TICK.equals(a)) {
            FastWidget.updateAll(c);
            FastStore.scheduleTick(c);
        }
    }
}
