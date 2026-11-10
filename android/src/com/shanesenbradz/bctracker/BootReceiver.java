package com.shanesenbradz.bctracker;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** Alarms are cleared on reboot and app updates, so book them again. */
public class BootReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context c, Intent intent) {
        FastStore.reschedule(c);
        FastWidget.updateAll(c);
    }
}
