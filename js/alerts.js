/* Stage alerts and the bridge to the Android app.

   In the Android app (window.BCNative exists) the app hands the native
   side a list of upcoming alerts. Android schedules them with the alarm
   service, so they arrive even when the app is closed or the phone
   restarts, and the home screen widget reads the same fast.

   In a browser, alerts are timers that fire while the page is open. */

const Alerts = (function () {
  /* One alert per stage boundary, plus "plan complete" */
  const STAGE_ALERTS = [
    { h: 4,  chip: "Digestion done", title: "Digestion done", body: "Insulin is falling and your body is turning to stored glycogen for energy." },
    { h: 8,  chip: "Fat burning",    title: "Fat burning is ramping up", body: "Glycogen is running lower, so your body is leaning more on stored fat." },
    { h: 12, chip: "Ketosis",        title: "Ketosis is starting", body: "Ketone production is rising and growth hormone is going up." },
    { h: 16, chip: "Deep ketosis",   title: "Deeper ketosis", body: "Fat burning and ketone production keep climbing from here." },
    { h: 18, chip: "Autophagy",      title: "Autophagy is rising", body: "Cellular clean-up is commonly reported to increase from this point on." },
    { h: 24, chip: "Autophagy peak", title: "Autophagy peak", body: "Cellular repair activity is reported to be at its highest." }
  ];

  const isNative = () => !!(window.BCNative && typeof window.BCNative.syncFast === "function");

  function defaults() {
    const stages = {};
    STAGE_ALERTS.forEach(s => { stages[s.h] = true; });
    return { enabled: true, complete: true, pastPlan: true, stages: stages, asked: false };
  }

  function settings(data) {
    const d = defaults();
    const n = data.notify || {};
    return Object.assign(d, n, { stages: Object.assign(d.stages, n.stages || {}) });
  }

  function hoursLabel(h) { return h + (h === 1 ? " hour" : " hours"); }

  /* Every alert still to come for the current fast, in time order */
  function upcoming(data, fromMs) {
    const n = settings(data);
    if (!n.enabled || !data.lastMealISO) return [];
    const start = new Date(data.lastMealISO).getTime();
    const plan = data.fastPlan;
    const out = [];
    const planStage = STAGE_ALERTS.find(s => s.h === plan);
    STAGE_ALERTS.forEach(s => {
      if (!n.stages[s.h]) return;
      if (s.h > plan && !n.pastPlan) return;
      if (s.h === plan && n.complete) return; /* merged into the completion alert */
      out.push({ id: "s" + s.h, kind: "stage", h: s.h, atMs: start + s.h * 3600000, title: s.title, body: hoursLabel(s.h) + " in. " + s.body });
    });
    if (n.complete) {
      out.push({
        id: "done", kind: "complete", h: plan, atMs: start + plan * 3600000,
        title: "Your " + plan + " hour fast is complete",
        body: planStage && n.stages[planStage.h]
          ? "You reached " + planStage.title.toLowerCase() + ". Your eating window is open."
          : "Nice work. Your eating window is open."
      });
    }
    out.sort((a, b) => a.atMs - b.atMs);
    const now = fromMs || Date.now();
    return out.filter(e => e.atMs > now - 1000);
  }

  function accentHex() {
    const v = getComputedStyle(document.documentElement).getPropertyValue("--accent").trim();
    return /^#[0-9a-f]{6}$/i.test(v) ? v : "#0a84ff";
  }

  /* ---------- Sync with the Android app or browser timers ---------- */
  let syncTimer = 0;
  let webTimers = [];

  function sync(user, data) {
    clearTimeout(syncTimer);
    syncTimer = setTimeout(() => syncNow(user, data), 250);
  }

  function syncNow(user, data) {
    if (isNative()) {
      const payload = user && data ? {
        active: !!data.lastMealISO,
        name: user.name,
        startMs: data.lastMealISO ? new Date(data.lastMealISO).getTime() : 0,
        planHours: data.fastPlan,
        accent: accentHex(),
        theme: data.theme || "dark",
        stages: FASTING_STAGES.map(s => ({ start: s.start, end: s.end >= 9999 ? 9999 : s.end, title: s.title })),
        events: upcoming(data)
      } : { active: false, loggedOut: true };
      try { window.BCNative.syncFast(JSON.stringify(payload)); } catch (e) {}
      return;
    }
    webTimers.forEach(clearTimeout);
    webTimers = [];
    if (!user || !data || !("Notification" in window) || Notification.permission !== "granted") return;
    const now = Date.now();
    upcoming(data, now).forEach(e => {
      const wait = e.atMs - now;
      if (wait > 0 && wait < 2147000000) webTimers.push(setTimeout(() => showWeb(e.title, e.body), wait));
    });
  }

  function showWeb(title, body) {
    const opts = { body: body, icon: "icons/icon-192.png", badge: "icons/icon-192.png", tag: "bct-" + title };
    if (navigator.serviceWorker && navigator.serviceWorker.ready) {
      navigator.serviceWorker.getRegistration().then(reg => {
        if (reg && reg.showNotification) return reg.showNotification(title, opts).catch(() => { new Notification(title, opts); });
        new Notification(title, opts);
      }).catch(() => { try { new Notification(title, opts); } catch (e) {} });
    } else {
      try { new Notification(title, opts); } catch (e) {}
    }
  }

  /* ---------- Permission ---------- */
  function permission() {
    if (isNative()) {
      try { return window.BCNative.notificationsAllowed() ? "granted" : "denied"; } catch (e) { return "denied"; }
    }
    if (!("Notification" in window)) return "unsupported";
    return Notification.permission;
  }

  let pendingPerm = null;
  function requestPermission() {
    if (isNative()) {
      return new Promise(res => {
        pendingPerm = res;
        try { window.BCNative.requestNotifications(); } catch (e) { pendingPerm = null; res(false); }
        setTimeout(() => { if (pendingPerm === res) { pendingPerm = null; res(permission() === "granted"); } }, 30000);
      });
    }
    if (!("Notification" in window)) return Promise.resolve(false);
    if (Notification.permission === "granted") return Promise.resolve(true);
    return Promise.resolve(Notification.requestPermission()).then(p => p === "granted").catch(() => false);
  }

  /* Native side calls window.bcNativeEvent(name, value) */
  window.bcNativeEvent = function (name, value) {
    if (name === "notif" && pendingPerm) { const r = pendingPerm; pendingPerm = null; r(!!value); }
    if (name === "resume" && typeof window.bcOnResume === "function") window.bcOnResume();
  };

  function test() {
    const title = "Test alert";
    const body = "Stage alerts are working. You'll get one like this at each stage of your fast.";
    if (isNative()) { try { window.BCNative.testNotification(title, body); } catch (e) {} return; }
    showWeb(title, body);
  }

  /* ---------- The Stage alerts card ---------- */
  function render(data, opts) {
    const n = settings(data);
    const perm = permission();
    const master = document.getElementById("alerts-master");
    const on = n.enabled && perm === "granted";
    master.setAttribute("aria-checked", on ? "true" : "false");
    master.disabled = perm === "unsupported";
    document.getElementById("alerts-body").classList.toggle("off", !on);
    document.getElementById("alerts-past").setAttribute("aria-checked", n.pastPlan ? "true" : "false");

    const chips = document.getElementById("alert-chips");
    chips.innerHTML = "";
    STAGE_ALERTS.forEach(s => {
      chips.appendChild(chip(s.chip, s.h + "h", !!n.stages[s.h], s.h > data.fastPlan, "s" + s.h));
    });
    chips.appendChild(chip("Plan complete", data.fastPlan + "h", n.complete, false, "done"));

    const status = document.getElementById("alerts-status");
    status.classList.remove("alert-blocked");
    let text = "";
    if (perm === "unsupported") text = "This browser can't show notifications. Install the Android app to get stage alerts.";
    else if (n.enabled && perm !== "granted") {
      text = isNative() ? "Notifications are turned off for B.C Tracker. Tap the switch to allow them." : "Tap the switch and allow notifications to get stage alerts.";
      status.classList.add("alert-blocked");
    } else if (!n.enabled) text = "Alerts are off. Turn them on to get a notification as you reach each stage.";
    else {
      const next = upcoming(data)[0];
      if (!data.lastMealISO) text = "Alerts start when you save a last meal time.";
      else if (next) text = "Next alert: " + next.title + ", " + formatMealTime(new Date(next.atMs)).replace("Today, ", "today at ").replace("Tomorrow, ", "tomorrow at ") + ".";
      else text = "No more alerts for this fast.";
      if (!isNative()) text += " In the browser, alerts arrive only while the app is open.";
    }
    status.textContent = text;

    const exactBtn = document.getElementById("btn-exact-alarms");
    let showExact = false;
    if (isNative() && on) { try { showExact = !window.BCNative.exactAlarmsAllowed(); } catch (e) {} }
    exactBtn.classList.toggle("hidden", !showExact);

    const wc = document.getElementById("widget-card");
    if (wc) wc.classList.toggle("hidden", !isNative());
    if (isNative()) {
      let canPin = false;
      try { canPin = window.BCNative.canPinWidget(); } catch (e) {}
      document.getElementById("btn-add-widget").classList.toggle("hidden", !canPin);
    }
    if (opts && opts.pop) Motion.replay(chips.querySelector('[data-id="' + opts.pop + '"]'), "pop");
  }

  function chip(label, hours, on, beyond, id) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "alert-chip" + (on ? " on" : "") + (beyond ? " beyond" : "");
    b.dataset.id = id;
    b.setAttribute("aria-pressed", on ? "true" : "false");
    const l = document.createElement("span");
    l.textContent = label;
    const h = document.createElement("span");
    h.className = "chip-h";
    h.textContent = hours;
    b.appendChild(l);
    b.appendChild(h);
    return b;
  }

  return { STAGE_ALERTS, settings, defaults, upcoming, sync, syncNow, requestPermission, permission, render, test, isNative, accentHex };
})();
