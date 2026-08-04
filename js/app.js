/* B.C Tracker application logic. All data is stored locally in the
   browser using localStorage, so profiles and logs persist between
   visits on the same device without any server. */

/* ---------------------------------------------------------
   Reference data: fasting stages
--------------------------------------------------------- */
const FASTING_STAGES = [
  { start: 0, end: 4, title: "Digesting", body: "Blood sugar and insulin rise after eating, then begin to level off as the meal is processed." },
  { start: 4, end: 8, title: "Insulin falling", body: "Insulin levels start to drop and the body begins leaning on stored glycogen for energy." },
  { start: 8, end: 12, title: "Fat burning increases", body: "Glycogen stores run lower and the body shifts toward burning more stored fat for fuel." },
  { start: 12, end: 16, title: "Ketosis begins", body: "Ketone production starts to rise and growth hormone levels increase." },
  { start: 16, end: 18, title: "Deeper ketosis", body: "Fat burning and ketone production keep climbing the longer the fast continues." },
  { start: 18, end: 24, title: "Autophagy rising", body: "Cellular cleanup processes are commonly reported to increase from this point on." },
  { start: 24, end: 9999, title: "Autophagy peak", body: "Autophagy and cellular repair activity are reported to be at their highest." }
];

const RING_CIRCUMFERENCE = 653.5;

function setRingArc(el, startFraction, lengthFraction) {
  if (!el) return;
  const start = RING_CIRCUMFERENCE * startFraction;
  const len = RING_CIRCUMFERENCE * Math.max(lengthFraction, 0);
  el.style.strokeDasharray = len.toFixed(2) + " " + RING_CIRCUMFERENCE.toFixed(2);
  el.style.strokeDashoffset = (-start).toFixed(2);
}

/* ---------------------------------------------------------
   Small helpers
--------------------------------------------------------- */
function $(sel) { return document.querySelector(sel); }
function $all(sel) { return Array.from(document.querySelectorAll(sel)); }

function hashCode(str) {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) + str.charCodeAt(i);
    hash = hash & 0xffffffff;
  }
  return String(hash);
}

function uid(prefix) {
  return prefix + "_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function todayStr() {
  const d = new Date();
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}

function initials(name) {
  return name.trim().split(/\s+/).map(p => p[0]).slice(0, 2).join("").toUpperCase();
}

function toLocalInputValue(d) {
  const pad = n => String(n).padStart(2, "0");
  return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()) + "T" + pad(d.getHours()) + ":" + pad(d.getMinutes());
}

function formatMealTime(date) {
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  const isTomorrow = date.toDateString() === tomorrow.toDateString();
  const timeStr = date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  if (isToday) return "Today, " + timeStr;
  if (isTomorrow) return "Tomorrow, " + timeStr;
  return date.toLocaleDateString([], { month: "short", day: "numeric" }) + ", " + timeStr;
}

function formatDuration(hoursFloat) {
  let hours = Math.floor(hoursFloat);
  let minutes = Math.round((hoursFloat - hours) * 60);
  if (minutes === 60) { hours += 1; minutes = 0; }
  return hours + ":" + String(minutes).padStart(2, "0");
}

/* ---------------------------------------------------------
   Storage
--------------------------------------------------------- */
function getUsers() {
  return JSON.parse(localStorage.getItem("bct_users") || "[]");
}
function saveUsers(users) {
  localStorage.setItem("bct_users", JSON.stringify(users));
}
function getSession() {
  return JSON.parse(localStorage.getItem("bct_session") || "null");
}
function setSession(userId) {
  localStorage.setItem("bct_session", JSON.stringify({ userId }));
}
function clearSession() {
  localStorage.removeItem("bct_session");
}
function dataKey(userId) { return "bct_data_" + userId; }

function defaultData(sex) {
  return {
    sex: sex || "female",
    dailyGoal: sex === "male" ? 2000 : 1500,
    fastPlan: 12,
    lastMealISO: null,
    foodLog: [],
    customFoods: [],
    fastHistory: [],
    workouts: [],
    customWorkoutsLibrary: [],
    theme: "dark",
    accent: "blue"
  };
}

function getData(userId) {
  const raw = localStorage.getItem(dataKey(userId));
  const base = defaultData();
  if (!raw) return base;
  let parsed;
  try { parsed = JSON.parse(raw); } catch (e) { return base; }
  return Object.assign({}, base, parsed, {
    foodLog: parsed.foodLog || [],
    customFoods: parsed.customFoods || [],
    fastHistory: parsed.fastHistory || [],
    workouts: parsed.workouts || [],
    customWorkoutsLibrary: parsed.customWorkoutsLibrary || []
  });
}
function persist() {
  if (currentUser) localStorage.setItem(dataKey(currentUser.id), JSON.stringify(currentData));
}

/* ---------------------------------------------------------
   State
--------------------------------------------------------- */
let currentUser = null;
let currentData = null;
let pendingLoginUser = null;
let tickTimer = null;

/* ---------------------------------------------------------
   Auth screens
--------------------------------------------------------- */
function showAuthPanel(id) {
  $all(".auth-panel").forEach(p => p.classList.add("hidden"));
  $("#" + id).classList.remove("hidden");
}

function renderProfileList() {
  const users = getUsers();
  const list = $("#profile-list");
  list.innerHTML = "";
  $("#no-profiles").style.display = users.length === 0 ? "block" : "none";
  users.forEach(u => {
    const btn = document.createElement("button");
    btn.className = "profile-row";
    const avatar = document.createElement("div");
    avatar.className = "profile-avatar";
    avatar.textContent = initials(u.name);
    const textWrap = document.createElement("div");
    const nameEl = document.createElement("div");
    nameEl.className = "profile-row-name";
    nameEl.textContent = u.name;
    const subEl = document.createElement("div");
    subEl.className = "profile-row-sub";
    subEl.textContent = "Tap to log in";
    textWrap.appendChild(nameEl);
    textWrap.appendChild(subEl);
    btn.appendChild(avatar);
    btn.appendChild(textWrap);
    btn.addEventListener("click", () => showLogin(u));
    list.appendChild(btn);
  });
}

function showLogin(user) {
  pendingLoginUser = user;
  $("#login-name-label").textContent = "Enter passcode for " + user.name;
  $("#login-passcode").value = "";
  $("#login-error").textContent = "";
  showAuthPanel("auth-login");
}

function attemptLogin() {
  const code = $("#login-passcode").value.trim();
  if (!pendingLoginUser) return;
  if (hashCode(code) === pendingLoginUser.passcode) {
    setSession(pendingLoginUser.id);
    loadApp(pendingLoginUser);
  } else {
    $("#login-error").textContent = "That passcode does not match.";
  }
}

function attemptCreate() {
  const name = $("#create-name").value.trim();
  const code = $("#create-passcode").value.trim();
  const confirm = $("#create-passcode-confirm").value.trim();
  const sex = $("#create-sex .seg-btn.active").dataset.value;
  const errEl = $("#create-error");

  if (!name) { errEl.textContent = "Enter a name."; return; }
  if (!/^\d{4,6}$/.test(code)) { errEl.textContent = "Passcode must be 4-6 digits."; return; }
  if (code !== confirm) { errEl.textContent = "Passcodes do not match."; return; }

  const users = getUsers();
  const user = { id: uid("u"), name, passcode: hashCode(code), createdAt: Date.now() };
  users.push(user);
  saveUsers(users);
  localStorage.setItem(dataKey(user.id), JSON.stringify(defaultData(sex)));
  errEl.textContent = "";
  setSession(user.id);
  loadApp(user);
}

function logout() {
  clearSession();
  currentUser = null;
  currentData = null;
  if (tickTimer) clearInterval(tickTimer);
  $("#app").classList.remove("active");
  $("#screen-auth").classList.add("active");
  showAuthPanel("auth-welcome");
  renderProfileList();
}

/* ---------------------------------------------------------
   App load
--------------------------------------------------------- */
function loadApp(user) {
  currentUser = user;
  currentData = getData(user.id);

  document.documentElement.setAttribute("data-theme", currentData.theme || "dark");
  document.documentElement.setAttribute("data-accent", currentData.accent || "blue");
  updateAppIcon(currentData.accent || "blue");

  $("#screen-auth").classList.remove("active");
  $("#app").classList.add("active");

  renderAll();
  setActiveView("dashboard");

  if (tickTimer) clearInterval(tickTimer);
  tickTimer = setInterval(() => {
    renderRing();
    renderStageTimeline();
    renderCalRing();
  }, 20000);
}

function renderAll() {
  renderThemeIcon();
  renderGreeting();
  renderRing();
  renderDashboardStats();
  renderDashboardWorkouts();
  renderFastingPanel();
  renderFood();
  renderWorkouts();
  renderHistory();
  renderProfileTab();
  renderAccentPicker();
}

/* ---------------------------------------------------------
   Navigation
--------------------------------------------------------- */
const VIEW_TITLES = {
  dashboard: "Today",
  fasting: "Fasting",
  food: "Food",
  workouts: "Workouts",
  history: "History",
  profile: "Profile"
};

function setActiveView(view) {
  $all(".view").forEach(v => v.classList.remove("active"));
  $("#view-" + view).classList.add("active");
  $all(".tab-btn").forEach(b => b.classList.toggle("active", b.dataset.view === view));
  $("#topbar-title").textContent = VIEW_TITLES[view];
  if (view === "fasting") renderFastingPanel();
  if (view === "dashboard") { renderRing(); renderDashboardStats(); renderDashboardWorkouts(); }
  if (view === "food") renderFood();
  if (view === "workouts") renderWorkouts();
  if (view === "history") renderHistory();
  if (view === "profile") renderProfileTab();
}

/* ---------------------------------------------------------
   Dashboard
--------------------------------------------------------- */
function renderGreeting() {
  const hour = new Date().getHours();
  let word = "Good evening";
  if (hour < 12) word = "Good morning";
  else if (hour < 18) word = "Good afternoon";
  $("#greeting-text").textContent = word + ", " + currentUser.name.split(" ")[0];
}

function currentElapsedHours() {
  if (!currentData.lastMealISO) return null;
  const last = new Date(currentData.lastMealISO);
  return (Date.now() - last.getTime()) / 3600000;
}

function currentStage(elapsedHours) {
  return FASTING_STAGES.find(s => elapsedHours >= s.start && elapsedHours < s.end) || FASTING_STAGES[FASTING_STAGES.length - 1];
}

function renderRing() {
  const ring = $("#ring-progress");
  const elapsedEl = $("#ring-elapsed");
  const statusEl = $("#ring-status");
  const stageNameEl = $("#stage-name");
  const stageDescEl = $("#stage-desc");
  const planHours = currentData.fastPlan;

  const elapsed = currentElapsedHours();

  if (elapsed === null) {
    ring.style.strokeDashoffset = RING_CIRCUMFERENCE;
    elapsedEl.textContent = "--:--";
    statusEl.textContent = "Not fasting";
    stageNameEl.textContent = "Start a fast to see stages";
    stageDescEl.textContent = "Set your last meal time on the Fasting tab.";
    $("#ring-segments").innerHTML = "";
    return;
  }

  const fraction = Math.min(Math.max(elapsed / planHours, 0), 1);
  ring.style.strokeDashoffset = RING_CIRCUMFERENCE * (1 - fraction);
  elapsedEl.textContent = formatDuration(Math.max(elapsed, 0));
  statusEl.textContent = elapsed >= planHours ? "Eating window open" : "Fasting";

  const stage = currentStage(elapsed);
  stageNameEl.textContent = stage.title;
  stageDescEl.textContent = stage.body;

  renderRingTicks(planHours);
}

function renderRingTicks(planHours) {
  const g = $("#ring-segments");
  g.innerHTML = "";
  const boundaries = [4, 8, 12, 16, 18, 24];
  boundaries.forEach(h => {
    if (h <= 0 || h >= planHours) return;
    const angle = (h / planHours) * 2 * Math.PI;
    const x = 120 + 104 * Math.cos(angle);
    const y = 120 + 104 * Math.sin(angle);
    const c = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    c.setAttribute("cx", x.toFixed(2));
    c.setAttribute("cy", y.toFixed(2));
    c.setAttribute("r", 3.5);
    c.setAttribute("class", "ring-tick");
    g.appendChild(c);
  });
}

function todayCalories() {
  const t = todayStr();
  return currentData.foodLog.filter(f => f.date === t).reduce((sum, f) => sum + f.calories, 0);
}

function workoutCaloriesToday() {
  const t = todayStr();
  return currentData.workouts
    .filter(w => w.doneDates.includes(t))
    .reduce((sum, w) => sum + (w.calories || 0), 0);
}

function fastingBurnEstimate() {
  const elapsed = currentElapsedHours();
  if (elapsed === null || elapsed <= 0) return 0;
  return (elapsed / 24) * currentData.dailyGoal;
}

function computeBurnToday() {
  const workout = workoutCaloriesToday();
  const fasting = fastingBurnEstimate();
  return { workout, fasting, total: workout + fasting };
}

function renderCalRing() {
  const eaten = todayCalories();
  const burn = computeBurnToday();
  const burnt = Math.round(burn.total);
  const goal = currentData.dailyGoal;
  const total = goal + burnt;
  const remaining = total - eaten;

  $("#cal-eaten-val").textContent = eaten;
  $("#cal-total-val").textContent = total;
  $("#cal-workout-val").textContent = Math.round(burn.workout);
  $("#cal-fast-burn-val").textContent = Math.round(burn.fasting);

  const remainingEl = $("#cal-remaining");
  remainingEl.textContent = Math.abs(remaining);
  $("#cal-remaining-label").textContent = remaining >= 0 ? "remaining" : "over budget";
  remainingEl.style.color = remaining < 0 ? "var(--red)" : "var(--text-primary)";

  const goalFraction = total > 0 ? Math.min(goal / total, 1) : 1;
  const burntFraction = total > 0 ? Math.max(1 - goalFraction, 0) : 0;
  setRingArc($("#cal-base-goal"), 0, goalFraction);
  setRingArc($("#cal-base-burnt"), goalFraction, burntFraction);

  const eatenFraction = total > 0 ? Math.min(eaten / total, 1) : 0;
  const progress = $("#cal-progress");
  progress.classList.toggle("over", eaten > total);
  setRingArc(progress, 0, eatenFraction);
}

function renderDashboardStats() {
  renderCalRing();

  if (currentData.lastMealISO) {
    const next = new Date(new Date(currentData.lastMealISO).getTime() + currentData.fastPlan * 3600000);
    $("#dash-next-meal").textContent = formatMealTime(next);
  } else {
    $("#dash-next-meal").textContent = "Set your last meal time";
  }
}

function renderDashboardWorkouts() {
  const wrap = $("#dash-workouts");
  wrap.innerHTML = "";
  if (currentData.workouts.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty-note";
    empty.textContent = "Add a workout on the Workouts tab.";
    wrap.appendChild(empty);
    return;
  }
  const t = todayStr();
  currentData.workouts.forEach(w => {
    const done = w.doneDates.includes(t);
    const row = buildWorkoutRow(w, done, false);
    wrap.appendChild(row);
  });
}

/* ---------------------------------------------------------
   Fasting panel
--------------------------------------------------------- */
function renderFastingPanel() {
  $all("#fast-plan-select .seg-btn").forEach(b => {
    b.classList.toggle("active", Number(b.dataset.value) === currentData.fastPlan);
  });

  const input = $("#last-meal-input");
  if (currentData.lastMealISO) {
    input.value = toLocalInputValue(new Date(currentData.lastMealISO));
  } else if (!input.value) {
    input.value = toLocalInputValue(new Date());
  }

  if (currentData.lastMealISO) {
    const start = new Date(currentData.lastMealISO);
    const end = new Date(start.getTime() + currentData.fastPlan * 3600000);
    $("#fast-start-display").textContent = formatMealTime(start);
    $("#fast-end-display").textContent = formatMealTime(end);
  } else {
    $("#fast-start-display").textContent = "--";
    $("#fast-end-display").textContent = "--";
  }

  renderStageTimeline();
  updateEndFastVisibility();
  $("#last-meal-warning").classList.add("hidden");
  $("#btn-use-now").classList.add("hidden");
}

function renderStageTimeline() {
  const wrap = $("#stage-timeline");
  wrap.innerHTML = "";
  const planHours = currentData.fastPlan;
  const elapsed = currentElapsedHours();

  FASTING_STAGES.forEach(stage => {
    const row = document.createElement("div");
    const isCurrent = elapsed !== null && elapsed >= stage.start && elapsed < stage.end;
    const beyondPlan = stage.start >= planHours;
    row.className = "stage-row" + (beyondPlan ? " dim" : "") + (isCurrent ? " current" : "");

    const dot = document.createElement("div");
    dot.className = "stage-dot";

    const textWrap = document.createElement("div");
    const hoursLabel = document.createElement("div");
    hoursLabel.className = "stage-row-hours";
    hoursLabel.textContent = stage.end >= 9999 ? ("Hour " + stage.start + "+") : ("Hour " + stage.start + "-" + stage.end);
    const title = document.createElement("div");
    title.className = "stage-row-title";
    title.textContent = stage.title;
    const body = document.createElement("div");
    body.className = "stage-row-body";
    body.textContent = stage.body;

    textWrap.appendChild(hoursLabel);
    textWrap.appendChild(title);
    textWrap.appendChild(body);
    row.appendChild(dot);
    row.appendChild(textWrap);
    wrap.appendChild(row);
  });
}

function setFastPlan(hours) {
  currentData.fastPlan = hours;
  persist();
  renderFastingPanel();
  renderRing();
  renderDashboardStats();
}

function applyNewLastMeal(date) {
  if (currentData.lastMealISO) {
    const prevStart = new Date(currentData.lastMealISO);
    const actualHours = (date.getTime() - prevStart.getTime()) / 3600000;
    if (actualHours > 0.05) {
      currentData.fastHistory.unshift({
        id: uid("fh"),
        startISO: currentData.lastMealISO,
        endISO: date.toISOString(),
        plannedHours: currentData.fastPlan,
        actualHours: actualHours
      });
      if (currentData.fastHistory.length > 200) currentData.fastHistory.length = 200;
    }
  }

  currentData.lastMealISO = date.toISOString();
  persist();
  renderFastingPanel();
  renderRing();
  renderDashboardStats();
  renderHistory();
}

function saveLastMeal() {
  const val = $("#last-meal-input").value;
  if (!val) return;
  const date = new Date(val);
  if (isNaN(date.getTime())) return;
  applyNewLastMeal(date);
  $("#last-meal-warning").classList.add("hidden");
  $("#btn-use-now").classList.add("hidden");
}

function checkPastMealTime() {
  const val = $("#last-meal-input").value;
  const warn = $("#last-meal-warning");
  const useNowBtn = $("#btn-use-now");
  if (!val) { warn.classList.add("hidden"); useNowBtn.classList.add("hidden"); return; }
  const date = new Date(val);
  if (isNaN(date.getTime())) { warn.classList.add("hidden"); useNowBtn.classList.add("hidden"); return; }

  const isPast = (Date.now() - date.getTime()) > 120000;
  warn.classList.toggle("hidden", !isPast);
  useNowBtn.classList.toggle("hidden", !isPast);
  if (isPast) {
    warn.textContent = "That time is in the past (" + formatMealTime(date) + "). If you're logging this retroactively that's fine, just tap Save. Otherwise use the current time instead.";
  }
}

function useCurrentTimeForMeal() {
  $("#last-meal-input").value = toLocalInputValue(new Date());
  saveLastMeal();
}

function updateEndFastVisibility() {
  const card = $("#end-fast-card");
  card.classList.toggle("hidden", !currentData.lastMealISO);
  $("#end-fast-prompt").classList.remove("hidden");
  $("#end-fast-confirm").classList.add("hidden");
}

function endFastNow() {
  applyNewLastMeal(new Date());
  updateEndFastVisibility();
}

/* ---------------------------------------------------------
   Food
--------------------------------------------------------- */
function renderFood() {
  $("#food-eaten").textContent = todayCalories();
  $("#food-goal").textContent = currentData.dailyGoal;
  renderFoodLogList();
}

function renderFoodSearchResults(query) {
  const wrap = $("#food-search-results");
  wrap.innerHTML = "";
  if (!query) return;
  const q = query.toLowerCase();
  const combined = currentData.customFoods.concat(KNOWN_FOODS);
  const seen = new Set();
  const matches = [];
  combined.forEach(f => {
    const key = f.name.toLowerCase();
    if (seen.has(key) || !key.includes(q)) return;
    seen.add(key);
    matches.push(f);
  });
  matches.slice(0, 8).forEach(f => {
    const btn = document.createElement("button");
    btn.className = "food-result-row";
    const nameEl = document.createElement("span");
    nameEl.className = "food-result-name";
    nameEl.textContent = f.name;
    const calEl = document.createElement("span");
    calEl.className = "food-result-cal";
    calEl.textContent = f.calories + " cal";
    btn.appendChild(nameEl);
    btn.appendChild(calEl);
    btn.addEventListener("click", () => {
      addFoodEntry(f.name, f.calories);
      $("#food-search").value = "";
      wrap.innerHTML = "";
    });
    wrap.appendChild(btn);
  });
}

function addFoodEntry(name, calories) {
  currentData.foodLog.push({
    id: uid("f"),
    name: name,
    calories: Math.round(Number(calories)),
    date: todayStr(),
    time: new Date().toISOString()
  });
  persist();
  renderFood();
  renderDashboardStats();
}

function upsertCustomFood(name, calories) {
  const idx = currentData.customFoods.findIndex(f => f.name.toLowerCase() === name.toLowerCase());
  if (idx >= 0) currentData.customFoods[idx].calories = Math.round(Number(calories));
  else currentData.customFoods.unshift({ id: uid("cf"), name: name, calories: Math.round(Number(calories)) });
}

function addCustomFood() {
  const nameInput = $("#custom-food-name");
  const calInput = $("#custom-food-calories");
  const name = nameInput.value.trim();
  const cal = Number(calInput.value);
  if (!name || !cal || cal <= 0) return;
  upsertCustomFood(name, cal);
  addFoodEntry(name, cal);
  nameInput.value = "";
  calInput.value = "";
}

function removeFoodEntry(id) {
  currentData.foodLog = currentData.foodLog.filter(f => f.id !== id);
  persist();
  renderFood();
  renderDashboardStats();
}

function renderFoodLogList() {
  const list = $("#food-log-list");
  const t = todayStr();
  const entries = currentData.foodLog.filter(f => f.date === t).sort((a, b) => new Date(b.time) - new Date(a.time));
  list.innerHTML = "";
  $("#food-log-empty").style.display = entries.length === 0 ? "block" : "none";
  entries.forEach(f => {
    const row = document.createElement("div");
    row.className = "food-log-row";

    const left = document.createElement("div");
    const nameEl = document.createElement("div");
    nameEl.className = "food-log-name";
    nameEl.textContent = f.name;
    const timeEl = document.createElement("div");
    timeEl.className = "food-log-time";
    timeEl.textContent = new Date(f.time).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    left.appendChild(nameEl);
    left.appendChild(timeEl);

    const right = document.createElement("div");
    right.className = "food-log-right";
    const calEl = document.createElement("div");
    calEl.className = "food-log-cal";
    calEl.textContent = f.calories;
    const rm = document.createElement("button");
    rm.className = "remove-btn";
    rm.textContent = "\u2715";
    rm.addEventListener("click", () => removeFoodEntry(f.id));
    right.appendChild(calEl);
    right.appendChild(rm);

    row.appendChild(left);
    row.appendChild(right);
    list.appendChild(row);
  });
}

/* ---------------------------------------------------------
   Workouts
--------------------------------------------------------- */
function buildWorkoutRow(w, done, showRemove) {
  const row = document.createElement("div");
  row.className = "workout-row";

  const check = document.createElement("button");
  check.className = "workout-check" + (done ? " checked" : "");
  check.addEventListener("click", () => toggleWorkout(w.id));

  const textWrap = document.createElement("div");
  const nameEl = document.createElement("div");
  nameEl.className = "workout-name" + (done ? " checked" : "");
  nameEl.textContent = w.name;
  textWrap.appendChild(nameEl);
  if (w.detail) {
    const detailEl = document.createElement("div");
    detailEl.className = "workout-detail";
    detailEl.textContent = w.detail;
    textWrap.appendChild(detailEl);
  }
  if (w.calories) {
    const calEl = document.createElement("div");
    calEl.className = "workout-cal-badge";
    calEl.textContent = "\u2248 " + w.calories + " cal burnt";
    textWrap.appendChild(calEl);
  }

  row.appendChild(check);
  row.appendChild(textWrap);

  if (showRemove !== false) {
    const rm = document.createElement("button");
    rm.className = "remove-btn";
    rm.style.marginLeft = "auto";
    rm.textContent = "\u2715";
    rm.addEventListener("click", () => removeWorkout(w.id));
    row.appendChild(rm);
  }

  return row;
}

function renderWorkouts() {
  const list = $("#workout-list");
  list.innerHTML = "";
  $("#workout-empty").style.display = currentData.workouts.length === 0 ? "block" : "none";
  const t = todayStr();
  currentData.workouts.forEach(w => {
    const done = w.doneDates.includes(t);
    list.appendChild(buildWorkoutRow(w, done, true));
  });
}

function renderWorkoutSearchResults(query) {
  const wrap = $("#workout-search-results");
  wrap.innerHTML = "";
  if (!query) return;
  const q = query.toLowerCase();
  const combined = currentData.customWorkoutsLibrary.concat(KNOWN_WORKOUTS);
  const seen = new Set();
  const matches = [];
  combined.forEach(w => {
    const key = w.name.toLowerCase();
    if (seen.has(key) || !key.includes(q)) return;
    seen.add(key);
    matches.push(w);
  });
  matches.slice(0, 8).forEach(w => {
    const btn = document.createElement("button");
    btn.className = "food-result-row";
    const nameEl = document.createElement("span");
    nameEl.className = "food-result-name";
    nameEl.textContent = w.name;
    const calEl = document.createElement("span");
    calEl.className = "food-result-cal";
    calEl.textContent = w.calories + " cal";
    btn.appendChild(nameEl);
    btn.appendChild(calEl);
    btn.addEventListener("click", () => {
      addWorkoutEntry(w.name, "", w.calories);
      $("#workout-search").value = "";
      wrap.innerHTML = "";
    });
    wrap.appendChild(btn);
  });
}

function upsertCustomWorkout(name, calories) {
  const idx = currentData.customWorkoutsLibrary.findIndex(w => w.name.toLowerCase() === name.toLowerCase());
  if (idx >= 0) currentData.customWorkoutsLibrary[idx].calories = Math.round(Number(calories));
  else currentData.customWorkoutsLibrary.unshift({ id: uid("cw"), name: name, calories: Math.round(Number(calories)) });
}

function addWorkoutEntry(name, detail, calories) {
  currentData.workouts.push({
    id: uid("w"),
    name: name,
    detail: detail || "",
    calories: Math.round(Number(calories)) || 0,
    doneDates: []
  });
  persist();
  renderWorkouts();
  renderDashboardWorkouts();
  renderCalRing();
}

function addWorkout() {
  const nameInput = $("#workout-name-input");
  const detailInput = $("#workout-detail-input");
  const calInput = $("#workout-calories-input");
  const name = nameInput.value.trim();
  const detail = detailInput.value.trim();
  const cal = Number(calInput.value) || 0;
  if (!name) return;
  if (cal > 0) upsertCustomWorkout(name, cal);
  addWorkoutEntry(name, detail, cal);
  nameInput.value = "";
  detailInput.value = "";
  calInput.value = "";
}

function toggleWorkout(id) {
  const w = currentData.workouts.find(w => w.id === id);
  if (!w) return;
  const t = todayStr();
  const idx = w.doneDates.indexOf(t);
  if (idx >= 0) w.doneDates.splice(idx, 1);
  else w.doneDates.push(t);
  persist();
  renderWorkouts();
  renderDashboardWorkouts();
  renderCalRing();
}

function removeWorkout(id) {
  currentData.workouts = currentData.workouts.filter(w => w.id !== id);
  persist();
  renderWorkouts();
  renderDashboardWorkouts();
  renderCalRing();
}

/* ---------------------------------------------------------
   History
--------------------------------------------------------- */
function dateStrFromISO(iso) {
  const d = new Date(iso);
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}

function formatHistoryDate(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  if (dateStr === todayStr()) return "Today";
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yStr = yesterday.getFullYear() + "-" + String(yesterday.getMonth() + 1).padStart(2, "0") + "-" + String(yesterday.getDate()).padStart(2, "0");
  if (dateStr === yStr) return "Yesterday";
  return date.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
}

function renderHistory() {
  const wrap = $("#history-list");
  wrap.innerHTML = "";

  const map = {};
  function ensure(d) {
    if (!map[d]) map[d] = { calories: 0, workoutsDone: [], fasts: [] };
    return map[d];
  }

  currentData.foodLog.forEach(f => { ensure(f.date).calories += f.calories; });
  currentData.workouts.forEach(w => {
    w.doneDates.forEach(d => ensure(d).workoutsDone.push(w.name));
  });
  currentData.fastHistory.forEach(fh => {
    ensure(dateStrFromISO(fh.endISO)).fasts.push(fh);
  });

  const dates = Object.keys(map).sort().reverse();
  $("#history-empty").style.display = dates.length === 0 ? "block" : "none";

  dates.slice(0, 60).forEach(d => {
    const entry = map[d];
    const card = document.createElement("div");
    card.className = "history-day";

    const dateEl = document.createElement("div");
    dateEl.className = "history-date";
    dateEl.textContent = formatHistoryDate(d);
    card.appendChild(dateEl);

    if (entry.calories > 0) {
      const row = document.createElement("div");
      row.className = "history-row";
      const balance = currentData.dailyGoal - entry.calories;
      const label = document.createElement("span");
      label.textContent = "Calories";
      const val = document.createElement("strong");
      val.textContent = entry.calories + " eaten, " + (balance >= 0 ? balance + " remaining" : Math.abs(balance) + " over");
      row.appendChild(label);
      row.appendChild(val);
      card.appendChild(row);
    }

    if (entry.workoutsDone.length > 0) {
      const label = document.createElement("div");
      label.className = "history-section-label";
      label.textContent = "Workouts done";
      card.appendChild(label);
      const chipWrap = document.createElement("div");
      chipWrap.className = "history-chip-list";
      entry.workoutsDone.forEach(name => {
        const chip = document.createElement("span");
        chip.className = "history-chip";
        chip.textContent = name;
        chipWrap.appendChild(chip);
      });
      card.appendChild(chipWrap);
    }

    if (entry.fasts.length > 0) {
      const label = document.createElement("div");
      label.className = "history-section-label";
      label.textContent = "Fasts completed";
      card.appendChild(label);
      entry.fasts.forEach(fh => {
        const row = document.createElement("div");
        row.className = "history-row";
        const l = document.createElement("span");
        l.textContent = fh.plannedHours + " hr plan";
        const v = document.createElement("strong");
        v.textContent = formatDuration(fh.actualHours) + " actual";
        row.appendChild(l);
        row.appendChild(v);
        card.appendChild(row);
      });
    }

    wrap.appendChild(card);
  });
}

/* ---------------------------------------------------------
   Backup and restore
--------------------------------------------------------- */
function exportBackup() {
  const payload = {
    app: "bc-tracker",
    version: 1,
    exportedAt: new Date().toISOString(),
    user: currentUser,
    data: currentData
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "bc-tracker-" + currentUser.name.trim().replace(/\s+/g, "-").toLowerCase() + "-" + todayStr() + ".json";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function isValidBackup(obj) {
  return !!(obj && obj.app === "bc-tracker" && obj.user && obj.user.id && obj.data);
}

function importBackupIntoCurrentProfile(file) {
  const errEl = $("#import-error");
  errEl.textContent = "";
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(reader.result);
      if (!isValidBackup(parsed)) { errEl.textContent = "That file does not look like a B.C Tracker backup."; return; }
      currentData = Object.assign({}, defaultData(), parsed.data, {
        foodLog: parsed.data.foodLog || [],
        customFoods: parsed.data.customFoods || [],
        fastHistory: parsed.data.fastHistory || [],
        workouts: parsed.data.workouts || [],
        customWorkoutsLibrary: parsed.data.customWorkoutsLibrary || []
      });
      persist();
      document.documentElement.setAttribute("data-theme", currentData.theme || "dark");
      document.documentElement.setAttribute("data-accent", currentData.accent || "blue");
      updateAppIcon(currentData.accent || "blue");
      renderAll();
    } catch (e) {
      errEl.textContent = "Could not read that file.";
    }
  };
  reader.readAsText(file);
}

function restoreFromWelcomeFile(file) {
  const errEl = $("#restore-error");
  errEl.textContent = "";
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(reader.result);
      if (!isValidBackup(parsed)) { errEl.textContent = "That file does not look like a B.C Tracker backup."; return; }
      const users = getUsers();
      const idx = users.findIndex(u => u.id === parsed.user.id);
      if (idx >= 0) users[idx] = parsed.user;
      else users.push(parsed.user);
      saveUsers(users);
      localStorage.setItem(dataKey(parsed.user.id), JSON.stringify(parsed.data));
      renderProfileList();
      showLogin(parsed.user);
    } catch (e) {
      errEl.textContent = "Could not read that file.";
    }
  };
  reader.readAsText(file);
}

/* ---------------------------------------------------------
   Profile + BMI + appearance
--------------------------------------------------------- */
function renderProfileTab() {
  $("#profile-name").value = currentUser.name;
  $all("#profile-sex .seg-btn").forEach(b => b.classList.toggle("active", b.dataset.value === currentData.sex));
  $("#profile-goal").value = currentData.dailyGoal;
}

function saveProfile() {
  const name = $("#profile-name").value.trim();
  const sex = $("#profile-sex .seg-btn.active") ? $("#profile-sex .seg-btn.active").dataset.value : currentData.sex;
  const goal = Number($("#profile-goal").value);
  if (!name || !goal || goal <= 0) return;

  const users = getUsers();
  const idx = users.findIndex(u => u.id === currentUser.id);
  if (idx >= 0) { users[idx].name = name; saveUsers(users); currentUser.name = name; }

  currentData.sex = sex;
  currentData.dailyGoal = goal;
  persist();
  renderGreeting();
  renderDashboardStats();
  renderFood();
}

function calcBmi() {
  const unit = $("#bmi-unit-select .seg-btn.active").dataset.value;
  let heightCm, weightKg;

  if (unit === "metric") {
    heightCm = Number($("#bmi-height-cm").value);
    weightKg = Number($("#bmi-weight-kg").value);
  } else {
    const ft = Number($("#bmi-height-ft").value) || 0;
    const inch = Number($("#bmi-height-in").value) || 0;
    heightCm = (ft * 12 + inch) * 2.54;
    weightKg = Number($("#bmi-weight-lb").value) * 0.453592;
  }

  if (!heightCm || !weightKg || heightCm <= 0 || weightKg <= 0) return;

  const bmi = weightKg / Math.pow(heightCm / 100, 2);
  let category = "Healthy weight";
  if (bmi < 18.5) category = "Underweight";
  else if (bmi < 25) category = "Healthy weight";
  else if (bmi < 30) category = "Overweight";
  else category = "Obesity range";

  $("#bmi-number").textContent = bmi.toFixed(1);
  $("#bmi-category").textContent = category;
  $("#bmi-result").classList.remove("hidden");
}

const ACCENTS = ["blue", "green", "orange", "pink", "purple", "teal"];
const ACCENT_HEX = {
  blue: "#0a84ff",
  green: "#30d158",
  orange: "#ff9f0a",
  pink: "#ff375f",
  purple: "#bf5af2",
  teal: "#64d2ff"
};

let manifestBlobUrl = null;

function updateAppIcon(color) {
  if (!ACCENT_HEX[color]) color = "blue";

  const iconPath192 = "icons/icon-192-" + color + ".png";
  const iconPath512 = "icons/icon-512-" + color + ".png";

  const appleIcon = $("#apple-touch-icon-link");
  if (appleIcon) appleIcon.setAttribute("href", iconPath192);

  const themeMeta = $("#meta-theme-color");
  if (themeMeta) themeMeta.setAttribute("content", ACCENT_HEX[color]);

  const manifest = {
    name: "B.C Tracker",
    short_name: "B.C Tracker",
    description: "Fasting, calorie and workout tracker",
    start_url: "./index.html",
    scope: "./",
    display: "standalone",
    background_color: "#000000",
    theme_color: ACCENT_HEX[color],
    orientation: "portrait",
    icons: [
      { src: iconPath192, sizes: "192x192", type: "image/png", purpose: "any" },
      { src: iconPath192, sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: iconPath512, sizes: "512x512", type: "image/png", purpose: "any" },
      { src: iconPath512, sizes: "512x512", type: "image/png", purpose: "maskable" }
    ]
  };

  const blob = new Blob([JSON.stringify(manifest)], { type: "application/manifest+json" });
  const newUrl = URL.createObjectURL(blob);
  const manifestLink = $("#manifest-link");
  if (manifestLink) manifestLink.setAttribute("href", newUrl);
  if (manifestBlobUrl) URL.revokeObjectURL(manifestBlobUrl);
  manifestBlobUrl = newUrl;
}

function renderAccentPicker() {
  const wrap = $("#accent-picker");
  wrap.innerHTML = "";
  ACCENTS.forEach(color => {
    const btn = document.createElement("button");
    btn.className = "accent-swatch" + (currentData.accent === color ? " active" : "");
    btn.style.background = "var(--" + color + ")";
    btn.addEventListener("click", () => {
      currentData.accent = color;
      document.documentElement.setAttribute("data-accent", color);
      persist();
      updateAppIcon(color);
      renderAccentPicker();
      renderRing();
      renderCalRing();
    });
    wrap.appendChild(btn);
  });
}

const SUN_ICON = '<circle cx="12" cy="12" r="4.2"></circle><path d="M12 2.5v2.4M12 19.1v2.4M4.6 4.6l1.7 1.7M17.7 17.7l1.7 1.7M2.5 12h2.4M19.1 12h2.4M4.6 19.4l1.7-1.7M17.7 6.3l1.7-1.7"></path>';
const MOON_ICON = '<path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5z"></path>';

function renderThemeIcon() {
  const icon = $("#theme-icon");
  icon.innerHTML = currentData.theme === "dark" ? MOON_ICON : SUN_ICON;
}

function toggleTheme() {
  currentData.theme = currentData.theme === "dark" ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", currentData.theme);
  persist();
  renderThemeIcon();
}

/* ---------------------------------------------------------
   Event wiring
--------------------------------------------------------- */
document.addEventListener("DOMContentLoaded", () => {
  $all("[data-back]").forEach(b => b.addEventListener("click", () => showAuthPanel(b.dataset.back)));

  $("#btn-show-create").addEventListener("click", () => {
    $("#create-name").value = "";
    $("#create-passcode").value = "";
    $("#create-passcode-confirm").value = "";
    $("#create-error").textContent = "";
    showAuthPanel("auth-create");
  });

  $("#btn-login").addEventListener("click", attemptLogin);
  $("#login-passcode").addEventListener("keydown", e => { if (e.key === "Enter") attemptLogin(); });
  $("#btn-create").addEventListener("click", attemptCreate);

  $("#create-sex").addEventListener("click", e => {
    const btn = e.target.closest(".seg-btn");
    if (!btn) return;
    $all("#create-sex .seg-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
  });

  $("#btn-theme").addEventListener("click", toggleTheme);
  $("#btn-logout").addEventListener("click", logout);

  $all(".tab-btn").forEach(b => b.addEventListener("click", () => setActiveView(b.dataset.view)));

  $("#fast-plan-select").addEventListener("click", e => {
    const btn = e.target.closest(".seg-btn");
    if (!btn) return;
    setFastPlan(Number(btn.dataset.value));
  });
  $("#btn-set-last-meal").addEventListener("click", saveLastMeal);
  $("#last-meal-input").addEventListener("input", checkPastMealTime);
  $("#last-meal-input").addEventListener("change", checkPastMealTime);
  $("#btn-use-now").addEventListener("click", useCurrentTimeForMeal);

  $("#btn-end-fast").addEventListener("click", () => {
    $("#end-fast-prompt").classList.add("hidden");
    $("#end-fast-confirm").classList.remove("hidden");
  });
  $("#btn-end-fast-cancel").addEventListener("click", () => {
    $("#end-fast-confirm").classList.add("hidden");
    $("#end-fast-prompt").classList.remove("hidden");
  });
  $("#btn-end-fast-yes").addEventListener("click", endFastNow);

  $("#food-search").addEventListener("input", e => renderFoodSearchResults(e.target.value.trim()));
  $("#btn-add-custom-food").addEventListener("click", addCustomFood);

  $("#workout-search").addEventListener("input", e => renderWorkoutSearchResults(e.target.value.trim()));
  $("#btn-add-workout").addEventListener("click", addWorkout);

  $("#profile-sex").addEventListener("click", e => {
    const btn = e.target.closest(".seg-btn");
    if (!btn) return;
    $all("#profile-sex .seg-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
  });
  $("#btn-save-profile").addEventListener("click", saveProfile);

  $("#btn-export").addEventListener("click", exportBackup);
  $("#btn-import").addEventListener("click", () => $("#import-file-input").click());
  $("#import-file-input").addEventListener("change", e => {
    const file = e.target.files[0];
    if (file) importBackupIntoCurrentProfile(file);
    e.target.value = "";
  });

  $("#btn-show-restore").addEventListener("click", () => $("#restore-file-input").click());
  $("#restore-file-input").addEventListener("change", e => {
    const file = e.target.files[0];
    if (file) restoreFromWelcomeFile(file);
    e.target.value = "";
  });

  $("#bmi-unit-select").addEventListener("click", e => {
    const btn = e.target.closest(".seg-btn");
    if (!btn) return;
    $all("#bmi-unit-select .seg-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    const metric = btn.dataset.value === "metric";
    $("#bmi-metric-fields").classList.toggle("hidden", !metric);
    $("#bmi-imperial-fields").classList.toggle("hidden", metric);
  });
  $("#btn-calc-bmi").addEventListener("click", calcBmi);

  renderProfileList();

  const session = getSession();
  if (session && session.userId) {
    const user = getUsers().find(u => u.id === session.userId);
    if (user) loadApp(user);
  }

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("service-worker.js").catch(() => {});
  }
});
