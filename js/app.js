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
    workouts: [],
    theme: "dark",
    accent: "blue"
  };
}

function getData(userId) {
  const raw = localStorage.getItem(dataKey(userId));
  if (raw) return JSON.parse(raw);
  return defaultData();
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

  $("#screen-auth").classList.remove("active");
  $("#app").classList.add("active");

  renderAll();
  setActiveView("dashboard");

  if (tickTimer) clearInterval(tickTimer);
  tickTimer = setInterval(() => {
    renderRing();
    renderStageTimeline();
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

function renderDashboardStats() {
  const eaten = todayCalories();
  const goal = currentData.dailyGoal;
  const balance = goal - eaten;

  $("#dash-eaten").textContent = eaten;
  $("#dash-balance-label").textContent = balance >= 0 ? "Remaining" : "Over goal";
  $("#dash-balance").textContent = Math.abs(balance);

  const elapsed = currentElapsedHours();
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

function saveLastMeal() {
  const val = $("#last-meal-input").value;
  if (!val) return;
  const date = new Date(val);
  if (isNaN(date.getTime())) return;
  currentData.lastMealISO = date.toISOString();
  persist();
  renderFastingPanel();
  renderRing();
  renderDashboardStats();
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
  const matches = KNOWN_FOODS.filter(f => f.name.toLowerCase().includes(q)).slice(0, 8);
  matches.forEach(f => {
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

function addCustomFood() {
  const nameInput = $("#custom-food-name");
  const calInput = $("#custom-food-calories");
  const name = nameInput.value.trim();
  const cal = Number(calInput.value);
  if (!name || !cal || cal <= 0) return;
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

function addWorkout() {
  const nameInput = $("#workout-name-input");
  const detailInput = $("#workout-detail-input");
  const name = nameInput.value.trim();
  const detail = detailInput.value.trim();
  if (!name) return;
  currentData.workouts.push({ id: uid("w"), name, detail, doneDates: [] });
  persist();
  nameInput.value = "";
  detailInput.value = "";
  renderWorkouts();
  renderDashboardWorkouts();
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
}

function removeWorkout(id) {
  currentData.workouts = currentData.workouts.filter(w => w.id !== id);
  persist();
  renderWorkouts();
  renderDashboardWorkouts();
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
      renderAccentPicker();
      renderRing();
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

  $("#food-search").addEventListener("input", e => renderFoodSearchResults(e.target.value.trim()));
  $("#btn-add-custom-food").addEventListener("click", addCustomFood);

  $("#btn-add-workout").addEventListener("click", addWorkout);

  $("#profile-sex").addEventListener("click", e => {
    const btn = e.target.closest(".seg-btn");
    if (!btn) return;
    $all("#profile-sex .seg-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
  });
  $("#btn-save-profile").addEventListener("click", saveProfile);

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
