/* Motion helpers: haptics, toasts, the sliding tab pill, view
   transitions and small "bump" animations. Kept separate from the
   app logic so every screen can use the same feel. */

const Motion = (function () {
  const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* Named haptic moments. The Android app supplies BCNative.haptic(name)
     for real haptic effects; browsers fall back to a short vibration. */
  const VIBE = { tick: [6], tab: [8], toggle: [12], confirm: [12, 40, 18], reject: [40] };
  function haptic(name) {
    try {
      if (window.BCNative && typeof window.BCNative.haptic === "function") { window.BCNative.haptic(name); return; }
    } catch (e) {}
    try {
      if (navigator.vibrate && navigator.userActivation && navigator.userActivation.hasBeenActive) navigator.vibrate(VIBE[name] || [8]);
    } catch (e) {}
  }

  /* Re-trigger a CSS animation class on an element */
  function replay(el, cls) {
    if (!el) return;
    el.classList.remove(cls);
    void el.offsetWidth;
    el.classList.add(cls);
    el.addEventListener("animationend", function done() {
      el.classList.remove(cls);
      el.removeEventListener("animationend", done);
    });
  }

  let toastTimer = 0;
  function toast(msg, ms) {
    const el = document.getElementById("toast");
    if (!el) return;
    clearTimeout(toastTimer);
    el.classList.remove("out");
    el.textContent = msg;
    el.hidden = true;
    void el.offsetWidth;
    el.hidden = false;
    toastTimer = setTimeout(() => {
      el.classList.add("out");
      toastTimer = setTimeout(() => { el.hidden = true; el.classList.remove("out"); }, 260);
    }, ms || 2400);
  }

  /* Sets text and gives it a small bump when the value changes */
  function setNumber(el, value) {
    if (!el) return;
    const v = String(value);
    if (el.textContent === v) return;
    const had = el.textContent !== "" && el.dataset.ready === "1";
    el.textContent = v;
    el.dataset.ready = "1";
    if (had) replay(el, "bump");
  }

  function setText(el, value, cls) {
    if (!el) return;
    const v = String(value);
    if (el.textContent === v) return;
    el.textContent = v;
    replay(el, cls || "swap");
  }

  /* The soft pill that springs to the active tab */
  function movePill(instant) {
    const pill = document.getElementById("tab-pill");
    const bar = document.getElementById("tabbar");
    const active = bar && bar.querySelector(".tab-btn.active");
    if (!pill || !active || !bar.getClientRects().length || !active.offsetWidth) return;
    const desktop = window.matchMedia("(min-width: 860px)").matches;
    let x, y, w, h;
    if (desktop) {
      x = active.offsetLeft; y = active.offsetTop; w = active.offsetWidth; h = active.offsetHeight;
    } else {
      const icon = active.querySelector(".tab-icon");
      w = Math.min(64, active.offsetWidth - 6);
      h = 32;
      x = active.offsetLeft + (active.offsetWidth - w) / 2;
      const br = bar.getBoundingClientRect();
      const ir = (icon || active).getBoundingClientRect();
      y = ir.top - br.top - bar.clientTop + ir.height / 2 - h / 2;
    }
    if (instant || reduce) pill.classList.add("no-anim");
    pill.style.width = w + "px";
    pill.style.height = h + "px";
    pill.style.transform = "translate(" + x + "px," + y + "px)";
    if (instant || reduce) { void pill.offsetWidth; pill.classList.remove("no-anim"); }
    pill.classList.add("ready");
  }

  const ORDER = ["dashboard", "fasting", "food", "workouts", "history", "profile"];
  let lastView = null;

  /* Animates a view in. Slides from the side the tab sits on, and
     staggers its cards so the screen settles in instead of popping. */
  function enterView(view, el) {
    if (!el) return;
    el.classList.remove("anim-r", "anim-l", "anim-up", "stagger");
    void el.offsetWidth;
    if (!reduce) {
      let cls = "anim-up";
      if (lastView && lastView !== view) cls = ORDER.indexOf(view) > ORDER.indexOf(lastView) ? "anim-r" : "anim-l";
      Array.from(el.children).forEach((c, i) => c.style.setProperty("--i", Math.min(i, 8)));
      el.classList.add(cls, "stagger");
      clearTimeout(el._animT);
      el._animT = setTimeout(() => el.classList.remove("anim-r", "anim-l", "anim-up", "stagger"), 1100);
    }
    lastView = view;
  }

  function bounceTab(btn) {
    if (!btn || reduce) return;
    replay(btn, "bounce");
  }

  /* Plays a row's exit animation, then runs the real removal */
  function removeRow(row, then) {
    if (!row || reduce) { then(); return; }
    row.classList.add("row-out");
    let ran = false;
    const go = () => { if (ran) return; ran = true; then(); };
    row.addEventListener("animationend", go);
    setTimeout(go, 320);
  }

  window.addEventListener("resize", () => movePill(true));

  return { haptic, replay, toast, setNumber, setText, movePill, enterView, bounceTab, removeRow, reduce };
})();
