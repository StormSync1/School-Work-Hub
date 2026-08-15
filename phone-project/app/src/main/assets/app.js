
const app = document.getElementById("app");

const categories = ["Math", "Science", "English", "Social Studies", "Morning Work", "Extra Credit", "General"];
const recoveryQuestions = ["What was your first pet's name?", "What city were you born in?", "What is your favorite subject?", "What was your childhood nickname?", "What is your favorite food?"];
const STORE_KEY = "schoolwork_accounts_v4";
const LAST_USER_KEY = "schoolwork_last_user_v4";
const REMEMBER_ME_KEY = "schoolwork_remember_me_v1";
const DEVICE_PROFILE_KEY = "schoolwork_device_profile_v1";

const defaultSchedule = {
  schoolName: "My School",
  blockName: "Sharp and the Saw",
  deadlineType: "weekly",
  deadlineWeekday: 5,
  deadlineDate: "",
  deadlineHour: 15,
  deadlineMinute: 0,
  timeZone: "America/Chicago",
  timeFormat: "12h"
};

const timeZones = ["America/Chicago", "America/New_York", "America/Denver", "America/Los_Angeles", "America/Phoenix", "Pacific/Honolulu", "UTC", "auto"];
const weekDays = [
  { label: "Sunday", value: 0 },
  { label: "Monday", value: 1 },
  { label: "Tuesday", value: 2 },
  { label: "Wednesday", value: 3 },
  { label: "Thursday", value: 4 },
  { label: "Friday", value: 5 },
  { label: "Saturday", value: 6 }
];

const defaultLifetime = {
  createdTotal: 0,
  completedTotal: 0,
  canceledTotal: 0,
  overdueMisses: 0,
  deadlineMetCount: 0,
  deadlineAudit: {},
  coins: 0,
  coinsEarned: 0,
  coinsSpent: 0,
  studySeconds: 0,
  xp: 0,
  xpEarned: 0,
  rewardMinutesThisWeek: 0,
  rewardWeek: "",
  rewardCapMinutes: 60,
  meter100Rewarded: false,
  history: []
};

const state = {
  user: null,
  authMode: "signin",
  currentTab: "dashboard",
  focusAssignmentId: null,
  recoveryMode: false,
  profileSection: "account",
  assignments: [],
  toast: null,
  search: "",
  sortBy: "due",
  filterBy: "all",
  profile: { nickname: "", avatar: "", theme: "dark" },
  classData: {},
  grades: [],
  study: { workMinutes: 25, breakMinutes: 5, mode: "work", running: false, startedAt: null, seconds: 0, flashcards: [], cardIndex: 0, showAnswer: false, mistakes: [] },
  pinned: [],
  favorites: [],
  trash: [],
  recovery: { question: "", answer: "" },
  recurringSetupDone: false,
  achievements: [],
  lifetime: { ...defaultLifetime },
  schedule: { ...defaultSchedule },
  notificationPermission: "default",
  games: {
    flappy: { running: false, score: 0 },
    math: { mode: "regular", op: "multiply", question: null, feedback: "" },
    grammar: { challenge: null, feedback: "", selected: null }
  }
};

const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const todayStr = () => new Date().toISOString().slice(0, 10);

const readJSON = (k, f) => {
  try {
    return JSON.parse(localStorage.getItem(k)) ?? f;
  } catch {
    return f;
  }
};

const writeJSON = (k, v) => localStorage.setItem(k, JSON.stringify(v));

function effectiveTimeZone() {
  return state.schedule.timeZone && state.schedule.timeZone !== "auto"
    ? state.schedule.timeZone
    : (Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Chicago");
}

function tzParts(date, timeZone) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    weekday: "short",
    hour12: false
  }).formatToParts(date);
  const get = (t) => parts.find((p) => p.type === t)?.value;
  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
    hour: Number(get("hour")),
    minute: Number(get("minute")),
    second: Number(get("second")),
    weekday: ({ Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 })[get("weekday")]
  };
}

function tzOffsetMs(date, tz) {
  const p = tzParts(date, tz);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - date.getTime();
}

function zonedToUtc(parts, tz) {
  let t = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, 0);
  for (let i = 0; i < 3; i += 1) {
    t = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, 0) - tzOffsetMs(new Date(t), tz);
  }
  return new Date(t);
}

function addDays(year, month, day, delta) {
  const d = new Date(Date.UTC(year, month - 1, day + delta));
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

function nextDeadlineDateTime() {
  const tz = effectiveTimeZone();
  const now = new Date();

  if (state.schedule.deadlineType === "date" && state.schedule.deadlineDate) {
    const [y, m, d] = state.schedule.deadlineDate.split("-").map(Number);
    if (y && m && d) {
      return zonedToUtc(
        { year: y, month: m, day: d, hour: state.schedule.deadlineHour, minute: state.schedule.deadlineMinute },
        tz
      );
    }
  }

  const z = tzParts(now, tz);
  let delta = (state.schedule.deadlineWeekday - z.weekday + 7) % 7;
  const past = delta === 0 && (z.hour > state.schedule.deadlineHour || (z.hour === state.schedule.deadlineHour && z.minute >= state.schedule.deadlineMinute));
  if (past) delta = 7;
  const target = addDays(z.year, z.month, z.day, delta);
  return zonedToUtc(
    { year: target.year, month: target.month, day: target.day, hour: state.schedule.deadlineHour, minute: state.schedule.deadlineMinute },
    tz
  );
}

const nextDeadlineDateString = () => nextDeadlineDateTime().toISOString().slice(0, 10);
const minutesUntilDeadline = () => Math.round((nextDeadlineDateTime().getTime() - Date.now()) / 60000);
const scheduleAuditKey = () => `${nextDeadlineDateTime().toISOString()}|${state.schedule.blockName}|${state.schedule.deadlineType}`;

function formatSchedule() {
  const day = state.schedule.deadlineType === "date"
    ? (state.schedule.deadlineDate || "No date")
    : (weekDays.find((d) => d.value === state.schedule.deadlineWeekday)?.label || "Friday");
  const hour24 = state.schedule.deadlineHour;
  const minute = String(state.schedule.deadlineMinute).padStart(2, "0");
  const tz = state.schedule.timeZone === "auto" ? "Auto" : state.schedule.timeZone;

  if (state.schedule.timeFormat === "24h") return `${day} ${String(hour24).padStart(2, "0")}:${minute} (${tz})`;
  const h12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  const ampm = hour24 >= 12 ? "PM" : "AM";
  return `${day} ${h12}:${minute} ${ampm} (${tz})`;
}

function addHistory(text, type = "info") {
  const entry = { id: uid(), text, type, at: new Date().toISOString() };
  state.lifetime.history.unshift(entry);
  state.lifetime.history = state.lifetime.history.slice(0, 150);
}

function awardCoins(amount, reason) {
  if (amount <= 0) return;
  state.lifetime.coins += amount;
  state.lifetime.coinsEarned += amount;
  addHistory(`+${amount} coins: ${reason}`, "coin");
  pushToast(`+${amount} coins`);
  persist();
}

function spendCoins(amount, reason) {
  if (state.lifetime.coins < amount) {
    pushToast("Not enough coins");
    return false;
  }
  state.lifetime.coins -= amount;
  state.lifetime.coinsSpent += amount;
  addHistory(`-${amount} coins: ${reason}`, "coin");
  persist();
  return true;
}

function awardXp(amount, reason) {
  if (amount <= 0) return;
  const oldLevel = Math.floor((state.lifetime.xp || 0) / 100) + 1;
  state.lifetime.xp = (state.lifetime.xp || 0) + amount;
  state.lifetime.xpEarned = (state.lifetime.xpEarned || 0) + amount;
  const newLevel = Math.floor(state.lifetime.xp / 100) + 1;
  addHistory(`+${amount} XP: ${reason}`, "xp");
  if (newLevel > oldLevel) pushToast(`Level up! You reached Level ${newLevel}.`);
  persist();
}

function currentLevel() { return Math.floor((state.lifetime.xp || 0) / 100) + 1; }

function updateStudyTimer() {
  if (state.currentTab !== "study" || !state.study.running || !state.study.startedAt) return;
  const total = state.study.seconds || (state.study.mode === "work" ? state.study.workMinutes : state.study.breakMinutes) * 60;
  const left = Math.max(0, total - Math.floor((Date.now() - Date.parse(state.study.startedAt)) / 1000));
  const chip = document.querySelector(".hero-chip strong");
  if (chip) chip.textContent = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`;
  if (left === 0) { state.study.running = false; state.study.startedAt = null; state.study.seconds = 0; awardXp(25, "Completed a study session"); pushToast("Study session complete!"); render(); }
}

function remainingSeconds(assignment) {
  const saved = Number(assignment.elapsedSeconds) || 0;
  if (!assignment.sessionStart) return Math.max(0, assignment.minutes * 60 - saved);
  const elapsed = saved + Math.floor((Date.now() - Date.parse(assignment.sessionStart)) / 1000);
  return Math.max(0, assignment.minutes * 60 - elapsed);
}

function pauseAssignment(assignment) {
  if (!assignment?.sessionStart) return;
  assignment.elapsedSeconds = (Number(assignment.elapsedSeconds) || 0) + Math.floor((Date.now() - Date.parse(assignment.sessionStart)) / 1000);
  assignment.sessionStart = null;
}

function canComplete(assignment) {
  return remainingSeconds(assignment) <= 0;
}

function grantTimerCoins() {
  let changed = false;
  for (const item of state.assignments) {
    if (item.canceled || item.done) continue;
    if (!item.sessionStart) continue;
    if (item.timerCoinGranted) continue;
    if (remainingSeconds(item) > 0) continue;
    item.timerCoinGranted = true;
    awardCoins(20, `Timer finished: ${item.name}`);
    addHistory(`Timer completed for ${item.name} (+20 coins)`, "coin");
    changed = true;
  }
  if (changed) persist();
}

function timerBeep() {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    const ctx = new AudioContext();
    [0, 0.22, 0.44].forEach((delay) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.0001, ctx.currentTime + delay);
      gain.gain.exponentialRampToValueAtTime(0.18, ctx.currentTime + delay + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + delay + 0.16);
      osc.connect(gain).connect(ctx.destination);
      osc.start(ctx.currentTime + delay);
      osc.stop(ctx.currentTime + delay + 0.18);
    });
  } catch (_) { /* Browser audio may be unavailable until a user gesture. */ }
}

function updateStartTimers() {
  if (state.currentTab !== "start") return;
  for (const a of state.assignments) {
    if (a.done || a.canceled) continue;
    const card = document.querySelector(`[data-timer-card="${a.id}"]`);
    if (!card) continue;
    const rem = remainingSeconds(a);
    const total = Math.max(1, (a.minutes || 0) * 60);
    const pct = Math.max(0, Math.min(100, Math.round(((total - rem) / total) * 100)));
    const fill = card.querySelector("[data-timer-fill]");
    const label = card.querySelector("[data-timer-label]");
    if (fill) fill.style.width = `${pct}%`;
    if (label) label.textContent = rem > 0 ? `Time left: ${Math.floor(rem / 60)}:${String(rem % 60).padStart(2, "0")}` : "Ready for checkmark and coins";
    if (rem === 0 && a.sessionStart && !a.timerFinishedNotified) {
      a.timerFinishedNotified = true;
      timerBeep();
      sendWindowsNotification("Schoolwork timer finished", `${a.name} is ready to complete.`);
      pushToast(`${a.name} finished. +20 coins earned.`);
      persist();
    }
  }
}

function updateFocusTimer() {
  if (!state.focusAssignmentId) return;
  const a = state.assignments.find((item) => item.id === state.focusAssignmentId);
  if (!a) return;
  const rem = remainingSeconds(a);
  const clock = document.querySelector("[data-focus-clock]");
  const fill = document.querySelector("[data-focus-fill]");
  const status = document.querySelector("[data-focus-status]");
  if (clock) clock.textContent = `${Math.floor(rem / 60)}:${String(rem % 60).padStart(2, "0")}`;
  if (fill) fill.style.width = `${Math.max(0, Math.min(100, Math.round(((a.minutes * 60 - rem) / (a.minutes * 60)) * 100)))}%`;
  if (status) status.textContent = rem > 0 ? "Stay focused. Your work is being saved." : "Finished! Check the assignment when you are ready.";
}

function currentRewardWeek() {
  const d = new Date();
  const first = new Date(d.getFullYear(), 0, 1);
  return `${d.getFullYear()}-${Math.ceil((((d - first) / 86400000) + first.getDay() + 1) / 7)}`;
}

function rewardShopView() {
  const week = currentRewardWeek();
  if (state.lifetime.rewardWeek !== week) {
    state.lifetime.rewardWeek = week;
    state.lifetime.rewardMinutesThisWeek = 0;
    persist();
  }
  const used = state.lifetime.rewardMinutesThisWeek || 0;
  const cap = state.lifetime.rewardCapMinutes || 60;
  const rewards = [
    { id: "gaming-10", title: "Gaming Break", detail: "10 minutes of gaming", minutes: 10, cost: 1000 },
    { id: "gaming-20", title: "Long Gaming Break", detail: "20 minutes of gaming", minutes: 20, cost: 2000 },
    { id: "snack", title: "Snack Break", detail: "Enjoy a snack and reset", minutes: 10, cost: 1000 },
    { id: "music", title: "Music Break", detail: "10 minutes of music", minutes: 10, cost: 1000 },
    { id: "choice", title: "Choice Reward", detail: "Choose your own 30-minute reward", minutes: 30, cost: 3000 },
    { id: "profile-color", title: "Profile Color", detail: "Unlock a new profile accent", minutes: 0, cost: 50 },
    { id: "timer-sound", title: "Special Timer Sound", detail: "Unlock a special completion sound", minutes: 0, cost: 100 },
    { id: "premium-badge", title: "Premium Badge", detail: "Add a premium achievement badge", minutes: 0, cost: 250 },
    { id: "special-theme", title: "Special Theme", detail: "Unlock a special dashboard theme", minutes: 0, cost: 500 }
  ];
  return `<section class="hero"><div><h2>Reward Shop</h2><p class="subtitle">Spend coins on earned breaks. Rewards are limited to ${cap} minutes each week.</p></div><div class="hero-chip"><strong>${state.lifetime.coins}</strong><span>coins</span></div></section><section class="card reward-meter"><h3>Weekly reward allowance</h3><div class="meter-wrap"><div class="meter-fill" style="width:${Math.min(100, Math.round((used / cap) * 100))}%"></div></div><p class="subtitle">${used} of ${cap} minutes used this week</p></section><section class="grid-3 reward-grid">${rewards.map((r) => `<article class="card reward-card"><div class="reward-icon">${r.minutes}m</div><h3>${r.title}</h3><p class="subtitle">${r.detail}</p><strong>${r.cost.toLocaleString()} coins</strong><button class="btn" data-reward="${r.id}" style="margin-top:12px;">Unlock Reward</button></article>`).join("")}</section>`;
}

function loadUser(email, password) {
  const key = email.trim().toLowerCase();
  const accounts = readJSON(STORE_KEY, {});
  const account = accounts[key];
  if (!account || (typeof password === "string" && account.password !== password)) return false;

  state.user = { name: account.name, email: key };
  state.recovery = { question: account.recoveryQuestion || "", answer: account.recoveryAnswer || "" };
  state.assignments = account.assignments || [];
  state.assignments = state.assignments.map((a) => ({
    ...a,
    timerCoinGranted: Boolean(a.timerCoinGranted)
  }));
  state.profile = account.profile || { nickname: "", avatar: "", theme: "dark" };
  state.classData = account.classData || {};
  state.grades = account.grades || [];
  state.study = { ...state.study, ...(account.study || {}) };
  state.pinned = account.pinned || [];
  state.favorites = account.favorites || [];
  state.trash = account.trash || [];
  state.recurringSetupDone = Boolean(account.recurringSetupDone);
  state.achievements = account.achievements || [];
  state.schedule = { ...defaultSchedule, ...(account.schedule || {}) };
  state.lifetime = { ...defaultLifetime, ...(account.lifetime || {}) };
  localStorage.setItem(LAST_USER_KEY, key);
  return true;
}

function loadDeviceProfile() {
  const saved = readJSON(DEVICE_PROFILE_KEY, null);
  const deviceId = saved?.deviceId || `device-${uid()}`;
  state.user = { name: saved?.name || "Student", email: `${deviceId}@local.device` };
  state.assignments = saved?.assignments || [];
  state.profile = saved?.profile || { nickname: "", avatar: "", theme: "dark" };
  state.classData = saved?.classData || {};
  state.grades = saved?.grades || [];
  state.study = { ...state.study, ...(saved?.study || {}) };
  state.pinned = saved?.pinned || [];
  state.favorites = saved?.favorites || [];
  state.trash = saved?.trash || [];
  state.achievements = saved?.achievements || [];
  state.schedule = { ...defaultSchedule, ...(saved?.schedule || {}) };
  state.lifetime = { ...defaultLifetime, ...(saved?.lifetime || {}) };
  writeJSON(DEVICE_PROFILE_KEY, { ...saved, deviceId });
}

function persist() {
  if (!state.user) return;
  const key = state.user.email.toLowerCase();
  const accounts = readJSON(STORE_KEY, {});
  accounts[key] = {
    name: state.user.name,
    password: accounts[key]?.password || "",
    recoveryQuestion: state.recovery?.question || "",
    recoveryAnswer: state.recovery?.answer || "",
    assignments: state.assignments,
    profile: state.profile,
    classData: state.classData,
    grades: state.grades,
    study: state.study,
    pinned: state.pinned,
    favorites: state.favorites,
    trash: state.trash,
    recurringSetupDone: state.recurringSetupDone,
    achievements: state.achievements,
    schedule: state.schedule,
    lifetime: state.lifetime
  };
  writeJSON(STORE_KEY, accounts);
  writeJSON(DEVICE_PROFILE_KEY, { deviceId: state.user.email.split("@")[0], name: state.user.name, assignments: state.assignments, profile: state.profile, classData: state.classData, grades: state.grades, study: state.study, pinned: state.pinned, favorites: state.favorites, trash: state.trash, achievements: state.achievements, schedule: state.schedule, lifetime: state.lifetime });
  localStorage.setItem(LAST_USER_KEY, key);
}

function notificationSupported() {
  return typeof window !== "undefined" && "Notification" in window;
}

function refreshNotificationState() {
  state.notificationPermission = notificationSupported() ? Notification.permission : "unsupported";
}

function sendWindowsNotification(title, body) {
  if (window.AndroidNotifications?.notify) {
    window.AndroidNotifications.notify(title, body);
    return;
  }
  if (notificationSupported() && Notification.permission === "granted") {
    const n = new Notification(title, { body });
    setTimeout(() => n.close(), 7000);
  }
}

async function requestNotificationPermission() {
  if (!notificationSupported()) {
    pushToast("Windows notifications are not supported in this browser.");
    return;
  }
  const p = await Notification.requestPermission();
  state.notificationPermission = p;
  pushToast(p === "granted" ? "Windows notifications enabled" : "Notifications blocked");
  render();
}

function pushToast(message, undo) {
  state.toast = { message, undo };
  render();
  clearTimeout(pushToast.timer);
  pushToast.timer = setTimeout(() => {
    state.toast = null;
    render();
  }, 4000);
}

function isOverdue(a) {
  return !a.done && a.dueDate && a.dueDate < todayStr();
}

function stats() {
  const total = state.assignments.filter((a) => !a.canceled).length;
  const complete = state.assignments.filter((a) => a.done && !a.canceled).length;
  const pending = total - complete;
  const pendingMinutes = state.assignments.filter((a) => !a.done && !a.canceled).reduce((s, a) => s + (a.minutes || 0), 0);
  return { total, complete, pending, pendingMinutes };
}

function weekSummary() {
  const days = [];
  const now = new Date();
  for (let i = 6; i >= 0; i -= 1) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    days.push(d.toISOString().slice(0, 10));
  }
  const byDay = Object.fromEntries(days.map((d) => [d, 0]));
  for (const a of state.assignments) {
    if (!a.completedAt) continue;
    const day = a.completedAt.slice(0, 10);
    if (day in byDay) byDay[day] += 1;
  }
  const data = days.map((d) => ({ day: d.slice(5), completed: byDay[d] }));
  return {
    completedThisWeek: Object.values(byDay).reduce((s, n) => s + n, 0),
    pending: state.assignments.filter((a) => !a.done && !a.canceled).length,
    pendingMinutes: state.assignments.filter((a) => !a.done && !a.canceled).reduce((s, a) => s + (a.minutes || 0), 0),
    data
  };
}

function achievementDefs() {
  const s = stats();
  const w = weekSummary();
  const done = state.lifetime.completedTotal;
  const checks = state.lifetime.deadlineMetCount + state.lifetime.overdueMisses;
  const onTime = checks ? Math.round((state.lifetime.deadlineMetCount / checks) * 100) : 100;
  const activeDays = w.data.filter((d) => d.completed > 0).length;
  return [
    { id: "done-1", title: "First Win", desc: "Complete 1 assignment.", unlocked: done >= 1 },
    { id: "done-5", title: "Starter Five", desc: "Complete 5 assignments.", unlocked: done >= 5 },
    { id: "done-10", title: "Double Digits", desc: "Complete 10 assignments.", unlocked: done >= 10 },
    { id: "done-20", title: "Workhorse", desc: "Complete 20 assignments.", unlocked: done >= 20 },
    { id: "done-50", title: "Half Century", desc: "Complete 50 assignments.", unlocked: done >= 50 },
    { id: "done-75", title: "Seventy Five", desc: "Complete 75 assignments.", unlocked: done >= 75 },
    { id: "done-100", title: "Century Club", desc: "Complete 100 assignments.", unlocked: done >= 100 },
    { id: "done-150", title: "Beyond 100", desc: "Complete 150 assignments.", unlocked: done >= 150 },
    { id: "done-250", title: "Quarter Thousand", desc: "Complete 250 assignments.", unlocked: done >= 250 },
    { id: "done-500", title: "Schoolwork Legend", desc: "Complete 500 assignments.", unlocked: done >= 500 },
    { id: "coins-200", title: "Coin Saver", desc: "Hold 200 coins.", unlocked: state.lifetime.coins >= 200 },
    { id: "coins-1000", title: "Four Digits", desc: "Hold 1,000 coins.", unlocked: state.lifetime.coins >= 1000 },
    { id: "coins-5000", title: "Reward Planner", desc: "Earn 5,000 coins total.", unlocked: state.lifetime.coinsEarned >= 5000 },
    { id: "week-10", title: "Weekly Ten", desc: "Complete 10 in one week.", unlocked: w.completedThisWeek >= 10 },
    { id: "days-5", title: "5-Day Streak", desc: "Complete work on 5 days this week.", unlocked: activeDays >= 5 },
    { id: "days-7", title: "Perfect Week", desc: "Complete work every day this week.", unlocked: activeDays >= 7 },
    { id: "created-10", title: "Ready Set Plan", desc: "Create 10 assignments.", unlocked: state.lifetime.createdTotal >= 10 },
    { id: "created-50", title: "Planner Pro", desc: "Create 50 assignments.", unlocked: state.lifetime.createdTotal >= 50 },
    { id: "timer-10", title: "Focus Ten", desc: "Complete 10 timed sessions.", unlocked: state.assignments.filter((a) => a.timerCoinGranted).length >= 10 },
    { id: "all-clear", title: "All Clear", desc: "No pending assignments.", unlocked: s.total > 0 && s.pending === 0 },
    { id: "quick-queue", title: "Quick Queue", desc: "Keep pending workload <= 60 min.", unlocked: s.pending > 0 && s.pendingMinutes <= 60 },
    { id: "ontime-5", title: "On-Time 5", desc: "Meet the deadline 5 times.", unlocked: state.lifetime.deadlineMetCount >= 5 },
    { id: "ontime-90", title: "90% On-Time", desc: "Keep on-time rate >= 90%.", unlocked: onTime >= 90 && checks >= 5 },
    { id: "planner-100", title: "Master Planner", desc: "Create 100 assignments.", unlocked: state.lifetime.createdTotal >= 100 }
  ];
}

function checkAchievements() {
  const defs = achievementDefs();
  const newly = defs.filter((d) => d.unlocked && !state.achievements.includes(d.id));
  if (newly.length) {
    state.achievements = [...state.achievements, ...newly.map((d) => d.id)];
    pushToast(`Achievement unlocked: ${newly[0].title}`);
    sendWindowsNotification("Achievement unlocked", newly[0].title);
    addHistory(`Unlocked achievement: ${newly[0].title}`, "achievement");
  }

  if (state.lifetime.completedTotal >= 100 && !state.lifetime.meter100Rewarded) {
    state.lifetime.meter100Rewarded = true;
    awardCoins(1000, "100 completion meter milestone");
  }

  persist();
}

function badgeGrid() {
  return achievementDefs()
    .map((a) => `<div class="badge ${state.achievements.includes(a.id) ? "unlocked" : "locked"}"><h4>${a.title}</h4><p>${a.desc}</p></div>`)
    .join("");
}

function weekChart(summary) {
  const max = Math.max(1, ...summary.data.map((d) => d.completed));
  return `<div class="chart-wrap">${summary.data.map((d) => `<div class="bar-col"><div class="bar" style="height:${Math.max(8, (d.completed / max) * 100)}%"></div><span>${d.day}</span></div>`).join("")}</div>`;
}

function performance() {
  const checks = state.lifetime.deadlineMetCount + state.lifetime.overdueMisses;
  const onTimeRate = checks ? Math.round((state.lifetime.deadlineMetCount / checks) * 100) : 100;
  const completionRate = state.lifetime.createdTotal ? Math.round((state.lifetime.completedTotal / state.lifetime.createdTotal) * 100) : 100;
  const score = Math.max(0, Math.min(100, Math.round(completionRate * 0.65 + onTimeRate * 0.35 - state.lifetime.overdueMisses * 2)));
  const label = score >= 75 ? "Great" : score >= 50 ? "Good" : "Needs Improvement";
  return { onTimeRate, completionRate, score, label };
}

function evaluateDeadlineOutcome() {
  if (!state.user) return;
  const key = scheduleAuditKey();
  if (state.lifetime.deadlineAudit[key]) return;
  if (minutesUntilDeadline() > 0) return;

  const pending = state.assignments.filter((a) => !a.done && !a.canceled).length;
  if (pending === 0) {
    state.lifetime.deadlineMetCount += 1;
    const p = performance();
    const bonus = p.score >= 75 ? 120 : p.score >= 50 ? 60 : 20;
    awardCoins(bonus, `Deadline rating bonus (${p.label})`);
    addHistory(`Deadline met. Rating: ${p.label}`, "deadline");
  } else {
    state.lifetime.overdueMisses += 1;
    sendWindowsNotification("Deadline missed", `${pending} assignment(s) became overdue.`);
    addHistory(`Deadline missed with ${pending} pending assignment(s)`, "deadline");
  }

  state.lifetime.deadlineAudit[key] = pending === 0 ? "met" : "missed";
  persist();
  checkAchievements();
}

function reminderCheck() {
  if (!state.user) return;
  const pending = state.assignments.filter((a) => !a.done && !a.canceled);
  if (!pending.length) return;
  const mins = minutesUntilDeadline();
  const key = `rem-${scheduleAuditKey()}-${pending.length}`;

  if (mins <= 60 && mins > 0 && !sessionStorage.getItem(`${key}-1h`)) {
    sessionStorage.setItem(`${key}-1h`, "1");
    sendWindowsNotification(`Finish by ${formatSchedule()}`, `${pending.length} task(s) still pending.`);
  }

  if (mins <= 15 && mins > 0 && !sessionStorage.getItem(`${key}-15m`)) {
    sessionStorage.setItem(`${key}-15m`, "1");
    sendWindowsNotification(state.schedule.blockName, `Only ${mins} minutes left.`);
  }
}

function addAssignment(payload, options = {}) {
  const assignment = {
    id: uid(),
    name: payload.name,
    dueDate: payload.dueDate || nextDeadlineDateString(),
    done: false,
    canceled: false,
    priority: payload.priority || "Medium",
    category: payload.category || "General",
    className: payload.className || payload.category || "Other",
    workType: payload.workType || "Assignment",
    status: "Not Started",
    minutes: Number.isFinite(payload.minutes) ? payload.minutes : 20,
    completedAt: null,
    completedLogged: false,
    sessionStart: null,
    elapsedSeconds: 0,
    timerCoinGranted: false
  };

  state.assignments.unshift(assignment);
  state.lifetime.createdTotal += 1;
  addHistory(`Created assignment: ${assignment.name}`, "assignment");
  persist();

  if (!options.silent) {
    pushToast("Assignment added", () => {
      state.assignments = state.assignments.filter((a) => a.id !== assignment.id);
      persist();
      render();
    });
    sendWindowsNotification("Assignment added", `${assignment.name} (${assignment.minutes} min)`);
  }

  checkAchievements();
}

function setupRecurring() {
  if (state.recurringSetupDone) return;
  state.recurringSetupDone = true;
  persist();
}

function sortedAssignments() {
  let list = state.assignments.filter((a) => !a.canceled);
  if (state.search.trim()) list = list.filter((a) => a.name.toLowerCase().includes(state.search.toLowerCase()));
  if (state.filterBy === "completed") list = list.filter((a) => a.done);
  if (state.filterBy === "today") list = list.filter((a) => a.dueDate === todayStr());
  if (state.filterBy.startsWith("cat:")) list = list.filter((a) => a.category === state.filterBy.split(":")[1]);

  const rank = { High: 0, Medium: 1, Low: 2 };
  if (state.sortBy === "due") list.sort((a, b) => (a.dueDate || "9999").localeCompare(b.dueDate || "9999"));
  if (state.sortBy === "alpha") list.sort((a, b) => a.name.localeCompare(b.name));
  if (state.sortBy === "priority") list.sort((a, b) => rank[a.priority] - rank[b.priority]);
  return list;
}

function authView() {
  if (state.recoveryMode) return `<div class="auth-wrap"><div class="auth-card lift-up"><img class="app-logo" src="icons/schoolwork-hub-logo.png" alt="Schoolwork Hub" /><h2>Reset Password</h2><p class="subtitle">Enter your account email. Older accounts can set up recovery here.</p><form class="form" id="recovery-form"><input class="input" required type="email" name="email" placeholder="Account email" /><input class="input" name="currentPassword" type="password" placeholder="Current password (only for first-time setup)" /><select class="select" name="recoveryQuestion"><option value="">Choose a recovery question if needed</option>${recoveryQuestions.map((q) => `<option>${q}</option>`).join("")}</select><input class="input" name="recoveryAnswer" placeholder="New recovery answer if needed" /><input class="input" name="answer" placeholder="Existing recovery answer" /><input class="input" required minlength="6" type="password" name="newPassword" placeholder="New password" /><button class="btn" type="submit">Reset Password</button><button class="btn alt" type="button" id="cancel-recovery">Back to Sign In</button></form></div></div>`;
  const signIn = state.authMode === "signin";
  const remembered = localStorage.getItem(REMEMBER_ME_KEY) === "1";
  return `<div class="auth-wrap"><div class="auth-card lift-up"><img class="app-logo" src="icons/schoolwork-hub-logo.png" alt="Schoolwork Hub" /><h2>${signIn ? "Sign In" : "Sign Up"}</h2><p class="subtitle">${signIn ? "Welcome back." : "Create your account."}</p><form class="form" id="auth-form">${signIn ? "" : `<input class="input" required name="name" placeholder="Full name" />`}<input class="input" required type="email" name="email" placeholder="Email" /><input class="input" required type="password" name="password" placeholder="Password" />${signIn ? "" : `<select class="select" required name="recoveryQuestion"><option value="">Choose a recovery question</option>${recoveryQuestions.map((q) => `<option>${q}</option>`).join("")}<option value="custom">Write my own question</option></select><input class="input" name="customQuestion" placeholder="Custom question (optional)" /><input class="input" required name="recoveryAnswer" placeholder="Recovery answer" />`}<label class="subtitle" style="display:flex;gap:8px;align-items:center;"><input type="checkbox" name="rememberMe" ${remembered ? "checked" : ""} /> Remember me on this device</label><button class="btn" type="submit">${signIn ? "Sign In" : "Sign Up"}</button>${signIn ? `<button class="btn alt" type="button" id="forgot-password">Forgot password?</button>` : ""}<button class="btn alt" type="button" id="toggle-auth">${signIn ? "Need an account? Sign Up" : "Already have an account? Sign In"}</button></form></div></div>`;
}

function dashboardView() {
  const userName = state.profile.nickname || state.user.name;
  const s = stats();
  const w = weekSummary();
  const mins = minutesUntilDeadline();
  const next = state.assignments.filter((a) => !a.done && !a.canceled).sort((a, b) => (a.dueDate || "9999").localeCompare(b.dueDate || "9999"))[0];
  const missing = state.assignments.filter((a) => isOverdue(a));
  const dueSoon = state.assignments.filter((a) => !a.done && !a.canceled && a.dueDate).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowDate = tomorrow.toISOString().slice(0, 10);
  const dueSoonPanel = `<section class="card due-soon-panel"><div class="section-heading"><div><p class="eyebrow">UP NEXT</p><h3>Due Soon</h3></div><span class="pill">${dueSoon.length} open</span></div><div class="due-soon-columns"><div><strong>Today</strong>${dueSoon.filter((a) => a.dueDate === todayStr()).map((a) => `<p>${a.name}</p>`).join("") || `<p class="subtitle">Nothing due today.</p>`}</div><div><strong>Tomorrow</strong>${dueSoon.filter((a) => a.dueDate === tomorrowDate).map((a) => `<p>${a.name}</p>`).join("") || `<p class="subtitle">Nothing due tomorrow.</p>`}</div><div><strong>This Week</strong>${dueSoon.filter((a) => a.dueDate > tomorrowDate).slice(0, 5).map((a) => `<p>${a.name}<small>${a.dueDate}</small></p>`).join("") || `<p class="subtitle">No upcoming work.</p>`}</div></div></section>`;
  const missingPanel = `<section class="card dashboard-panel"><div class="section-heading"><div><p class="eyebrow">ATTENTION</p><h3>Missing Work</h3></div><span class="pill priority-high">${missing.length}</span></div><p class="subtitle">${missing.length ? missing.map((a) => a.name).join(", ") : "Nothing is overdue."}</p></section>`;
  const challengePanel = `<section class="card dashboard-panel"><p class="eyebrow">CHALLENGES</p><h3>Daily Challenge</h3><p class="subtitle">Complete 2 assignments today</p><h3 style="margin-top:12px;">Weekly Challenge</h3><p class="subtitle">Complete 5 assignments this week</p><div class="xp-line"><strong>Level ${currentLevel()}</strong><span>${state.lifetime.xp || 0} XP</span></div></section>`;

  const cards = sortedAssignments()
    .map((a) => `<article class="card lift-up ${isOverdue(a) ? "overdue" : ""}"><div class="assignment-head"><div class="assignment-left"><input type="checkbox" data-action="toggle-done" data-id="${a.id}" ${a.done ? "checked" : ""} /><div><div class="assignment-name ${a.done ? "done" : ""}">${a.name}</div><div class="pill">${a.category}</div></div></div><button class="btn alt" data-action="pin" data-id="${a.id}">${state.pinned.includes(a.id) ? "Unpin" : "Pin"}</button><button class="btn alt" data-action="one-complete" data-id="${a.id}">Complete</button><button class="btn alt" data-action="cancel" data-id="${a.id}">Cancel</button></div><div class="assignment-meta"><div style="display:flex;gap:6px;flex-wrap:wrap;"><div class="pill priority-${a.priority.toLowerCase()}">${a.priority}</div><div class="pill">${a.minutes || 0} min</div><div class="pill">${canComplete(a) ? "Ready" : `${Math.ceil(remainingSeconds(a) / 60)} min left`}</div></div><input class="due-input" type="date" value="${a.dueDate || ""}" data-action="due" data-id="${a.id}" /></div></article>`)
    .join("") || `<div class="card"><p>No assignments yet.</p></div>`;

  return dueSoonPanel + `<section class="grid-2">${missingPanel}${challengePanel}</section><section class="hero lift-up"><div><h2>Schoolwork Dashboard</h2><p class="subtitle">Hello, ${userName} | ${state.schedule.schoolName}</p></div><div class="hero-chip"><strong>${state.schedule.blockName}</strong><span>Finish by ${formatSchedule()}</span><span>${mins > 0 ? `${mins} min left` : "Deadline passed"}</span><span>Coins: ${state.lifetime.coins}</span></div></section><section class="summary"><div class="card"><h3>${s.total}</h3><p class="subtitle">Total</p></div><div class="card"><h3>${s.complete}</h3><p class="subtitle">Completed</p></div><div class="card"><h3>${s.pending}</h3><p class="subtitle">Pending</p><p class="subtitle">${s.pendingMinutes} min est.</p></div></section><section class="grid-2" style="margin-bottom: 14px;"><article class="card lift-up"><h3>Weekly Summary</h3><p class="subtitle">Completed: ${w.completedThisWeek} | Pending: ${w.pending}</p>${weekChart(w)}</article><article class="card lift-up"><h3>Achievement Progress</h3><p class="subtitle">Unlocked: ${state.achievements.length} / ${achievementDefs().length}</p><p class="subtitle" style="margin-top:8px;">Open Achievements tab for full badges.</p></article></section><section class="grid-4" style="margin-bottom:12px;"><input class="input" id="search" placeholder="Search assignments" value="${state.search}" /><select class="select" id="sort"><option value="due" ${state.sortBy === "due" ? "selected" : ""}>Sort by due date</option><option value="alpha" ${state.sortBy === "alpha" ? "selected" : ""}>Sort alphabetically</option><option value="priority" ${state.sortBy === "priority" ? "selected" : ""}>Sort by priority</option></select><select class="select" id="filter"><option value="all" ${state.filterBy === "all" ? "selected" : ""}>Filter: all</option><option value="completed" ${state.filterBy === "completed" ? "selected" : ""}>Filter: completed</option><option value="today" ${state.filterBy === "today" ? "selected" : ""}>Filter: due today</option>${categories.map((c) => `<option value="cat:${c}" ${state.filterBy === `cat:${c}` ? "selected" : ""}>Filter: ${c}</option>`).join("")}</select><button class="btn alt" id="logout">Log Out</button></section><section class="grid-2">${cards}</section>`;
}

function overviewView() {
  const p = performance();
  const done = state.lifetime.completedTotal;
  const meter = Math.min(100, done);
  const history = state.lifetime.history.slice(0, 20).map((h) => `<li><span>${new Date(h.at).toLocaleString()}</span><span>${h.text}</span></li>`).join("") || "<li><span>No history yet</span></li>";

  return `<section class="hero lift-up"><div><h2>Overview</h2><p class="subtitle">All-time progress and performance</p></div></section><section class="overview-grid"><article class="card lift-up"><h3>By ${formatSchedule()}</h3><p class="subtitle" style="margin-top:8px;">${state.lifetime.overdueMisses ? "Missed deadlines recorded" : "On track"}</p><div class="metric-row"><span>Deadline Met</span><strong>${state.lifetime.deadlineMetCount}</strong></div><div class="metric-row"><span>Missed Deadline</span><strong>${state.lifetime.overdueMisses}</strong></div><div class="metric-row"><span>On-Time Rate</span><strong>${p.onTimeRate}%</strong></div></article><article class="card lift-up"><h3>Completion Meter</h3><p class="subtitle" style="margin-top:8px;">Reach 100 for +1000 coins</p><div class="meter-wrap"><div class="meter-fill" style="width:${meter}%"></div><div class="meter-ticks"></div></div><div class="meter-labels">${Array.from({ length: 11 }, (_, i) => `<span>${i * 10}</span>`).join("")}</div><p class="subtitle" style="margin-top:8px;">Completed all-time: <strong>${done}</strong></p></article><article class="card lift-up"><h3>Rating</h3><div class="rating-pill ${p.score >= 75 ? "rating-great" : p.score >= 50 ? "rating-good" : "rating-low"}">${p.label}</div><div class="metric-row"><span>Score</span><strong>${p.score}/100</strong></div><div class="metric-row"><span>Completion Rate</span><strong>${p.completionRate}%</strong></div><div class="metric-row"><span>On-Time Rate</span><strong>${p.onTimeRate}%</strong></div><p class="subtitle" style="margin-top:8px;">Good deadline ratings award coins.</p></article></section><section class="card lift-up" style="margin-top:14px;"><h3>Lifetime Totals</h3><div class="grid-4" style="margin-top:10px;"><div class="mini-stat"><strong>${state.lifetime.createdTotal}</strong><span>Created</span></div><div class="mini-stat"><strong>${state.lifetime.completedTotal}</strong><span>Completed</span></div><div class="mini-stat"><strong>${state.lifetime.canceledTotal}</strong><span>Canceled</span></div><div class="mini-stat"><strong>${state.lifetime.coins}</strong><span>Coins</span></div></div><h3 style="margin-top:14px;">History</h3><ul class="history-list">${history}</ul></section>`;
}

function classView() {
  const classNames = ["Math", "ELA", "Science", "Social Studies", "Electives", "Other"];
  const selected = state.selectedClass || "Math";
  const items = state.assignments.filter((a) => (a.className || a.category || "Other") === selected && !a.canceled);
  const data = state.classData[selected] || {};
  return `<section class="hero"><div><h2>Classes</h2><p class="subtitle">Your work, notes, tests, grades, and study materials by class.</p></div></section><section class="section-tabs class-tabs">${classNames.map((name) => `<button data-class="${name}" class="${selected === name ? "active" : ""}">${name}</button>`).join("")}</section><section class="grid-2" style="margin-top:14px;"><article class="card"><h3>${selected}</h3><p class="subtitle">Assignments: ${items.length} | Completed: ${items.filter((a) => a.done).length}</p><form class="form" id="class-form"><input class="input" name="teacher" value="${data.teacher || ""}" placeholder="Teacher information" /><input class="input" name="schedule" value="${data.schedule || ""}" placeholder="Class schedule" /><textarea class="input" name="notes" rows="5" placeholder="Class notes">${data.notes || ""}</textarea><textarea class="input" name="tests" rows="3" placeholder="Tests and projects">${data.tests || ""}</textarea><textarea class="input" name="materials" rows="3" placeholder="Study materials and file links">${data.materials || ""}</textarea><input class="input" name="grade" value="${data.grade || ""}" placeholder="Current grade, e.g. 94%" /><button class="btn" type="submit">Save ${selected} Details</button></form></article><article class="card"><h3>${selected} Assignments</h3>${items.map((a) => `<div class="metric-row"><span>${a.name}<small class="subtitle">${a.dueDate || "No due date"}</small></span><strong>${a.done ? "Completed" : (a.status || "Not Started")}</strong></div>`).join("") || `<p class="subtitle">No assignments in this class yet.</p>`}</article></section>`;
}

function calendarView() {
  const month = new Date();
  const monthLabel = month.toLocaleString(undefined, { month: "long", year: "numeric" });
  const items = state.assignments.filter((a) => !a.canceled).sort((a, b) => (a.dueDate || "").localeCompare(b.dueDate || ""));
  return `<section class="hero"><div><h2>Calendar</h2><p class="subtitle">${monthLabel} | Upcoming work, tests, projects, and deadlines</p></div></section><section class="card" style="margin-bottom:14px;"><h3>Add to Calendar</h3><form class="form" id="calendar-form"><input class="input" required name="name" placeholder="Test, project, assignment, or event" /><div class="grid-4"><input class="input" required type="date" name="dueDate" /><select class="select" name="workType"><option>Assignment</option><option>Test</option><option>Project</option><option>School Event</option></select><select class="select" name="className"><option>Math</option><option>ELA</option><option>Science</option><option>Social Studies</option><option>Electives</option><option>Other</option></select><input class="input" type="number" min="1" name="minutes" value="20" placeholder="Minutes" /></div><button class="btn" type="submit">Save to This Device</button></form></section><section class="calendar-grid">${items.map((a) => `<article class="card calendar-item"><div class="pill">${a.dueDate || "No date"}</div><h3>${a.name}</h3><p class="subtitle">${a.workType || "Assignment"} | ${a.className || a.category} | ${a.status || (a.done ? "Completed" : "Not Started")}</p></article>`).join("") || `<article class="card"><p class="subtitle">No scheduled work yet.</p></article>`}</section>`;
}

function gradesView() {
  const average = state.grades.length ? Math.round(state.grades.reduce((sum, g) => sum + Number(g.value), 0) / state.grades.length) : 0;
  return `<section class="hero"><div><h2>Grade Calculator</h2><p class="subtitle">Enter grades and track your average.</p></div><div class="hero-chip"><strong>${average}%</strong><span>Average</span></div></section><section class="card"><form class="form" id="grade-form"><div class="grid-2"><input class="input" required name="className" placeholder="Class" /><input class="input" required type="number" min="0" max="100" name="value" placeholder="Grade percent" /></div><button class="btn" type="submit">Add Grade</button></form></section><section class="grid-2" style="margin-top:14px;">${state.grades.map((g) => `<article class="card"><div class="metric-row"><span>${g.className}</span><strong>${g.value}%</strong></div></article>`).join("") || `<article class="card"><p class="subtitle">No grades entered yet.</p></article>`}</section>`;
}

function studyView() {
  const s = state.study;
  const total = s.mode === "work" ? s.workMinutes * 60 : s.breakMinutes * 60;
  const remaining = s.running && s.startedAt ? Math.max(0, (s.seconds || total) - Math.floor((Date.now() - Date.parse(s.startedAt)) / 1000)) : (s.seconds || total);
  const card = s.flashcards[s.cardIndex] || { question: "Add a flashcard to start studying.", answer: "Use the form below to create one." };
  return `<section class="hero"><div><h2>Study Center</h2><p class="subtitle">Pomodoro, flashcards, practice, and study tracking.</p></div><div class="hero-chip"><strong>${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, "0")}</strong><span>${s.mode === "work" ? "Focus" : "Break"}</span></div></section><section class="grid-2"><article class="card"><h3>Pomodoro Timer</h3><p class="subtitle">25-minute work + 5-minute break, or choose your own times.</p><div class="grid-2"><input class="input" id="work-minutes" type="number" min="1" value="${s.workMinutes}" placeholder="Work minutes" /><input class="input" id="break-minutes" type="number" min="1" value="${s.breakMinutes}" placeholder="Break minutes" /></div><div style="display:flex;gap:8px;margin-top:10px;"><button class="btn" id="study-start">${s.running ? "Pause" : "Start"}</button><button class="btn alt" id="study-reset">Reset</button></div><p class="subtitle" style="margin-top:10px;">Total tracked study time: ${Math.round((state.lifetime.studySeconds || 0) / 60)} minutes</p></article><article class="card"><h3>Flashcards</h3><div class="flashcard" id="flashcard"><strong>${card.question}</strong><p class="subtitle">${s.showAnswer ? card.answer : "Tap Flip to reveal"}</p></div><button class="btn alt" id="flashcard-flip">Flip</button><form class="form" id="flashcard-form" style="margin-top:12px;"><input class="input" name="question" required placeholder="Question" /><input class="input" name="answer" required placeholder="Answer" /><button class="btn" type="submit">Add Flashcard</button></form></article></section><section class="card" style="margin-top:14px;"><h3>Practice Question</h3><p class="subtitle">Create questions for Multiple Choice, True/False, or Fill-in-the-Blank practice.</p><form class="form" id="practice-form"><input class="input" name="question" placeholder="Question" required /><select class="select" name="type"><option>Multiple Choice</option><option>True / False</option><option>Fill in the Blank</option></select><input class="input" name="answer" placeholder="Correct answer" required /><button class="btn" type="submit">Save Practice Question</button></form><p class="subtitle">Saved mistakes: ${s.mistakes.length}</p></section><section class="card tool-panel" style="margin-top:14px;"><h3>School Tools</h3><div class="tool-grid"><button class="btn alt" data-tool="calculator">Calculator</button><button class="btn alt" data-tool="multiplication">Multiplication Table</button><button class="btn alt" data-tool="word-counter">Word Counter</button><button class="btn alt" data-tool="stopwatch">Stopwatch</button></div><p class="subtitle" id="tool-output">Choose a tool to begin.</p></section>`;
}

function extrasView() {
  const tests = state.assignments.filter((a) => !a.done && !a.canceled && a.workType === "Test").sort((a, b) => (a.dueDate || "").localeCompare(b.dueDate || ""));
  const pinned = state.assignments.filter((a) => state.pinned.includes(a.id) && !a.canceled);
  const completed = state.assignments.filter((a) => a.completedAt).slice(0, 14);
  const trash = state.trash || [];
  return `<section class="hero"><div><h2>More Tools</h2><p class="subtitle">Heatmaps, pinned work, countdowns, links, and recovery.</p></div></section><section class="grid-2"><article class="card"><h3>Exam Countdown</h3>${tests.map((a) => `<div class="metric-row"><span>${a.name}<small class="subtitle">${a.className || a.category}</small></span><strong>${a.dueDate || "No date"}</strong></div>`).join("") || `<p class="subtitle">No exams scheduled.</p>`}</article><article class="card"><h3>Pinned Assignments</h3>${pinned.map((a) => `<div class="metric-row"><span>${a.name}</span><button class="btn alt" data-unpin="${a.id}">Unpin</button></div>`).join("") || `<p class="subtitle">Pin important work from the dashboard.</p>`}</article></section><section class="card" style="margin-top:14px;"><h3>Homework Heatmap</h3><p class="subtitle">Recent completed work</p><div class="heatmap">${Array.from({ length: 28 }, (_, i) => `<span class="heat-cell ${i < completed.length ? "filled" : ""}"></span>`).join("")}</div></section><section class="grid-2" style="margin-top:14px;"><article class="card"><h3>Favorite Websites</h3><form class="form" id="favorite-form"><input class="input" name="site" placeholder="https://example.com" required /><button class="btn" type="submit">Add Favorite</button></form><ul class="history-list">${state.favorites.map((site) => `<li><a href="${site}" target="_blank" rel="noreferrer">${site}</a></li>`).join("")}</ul></article><article class="card"><h3>Recycle Bin</h3>${trash.map((a) => `<div class="metric-row"><span>${a.name}</span><button class="btn alt" data-restore="${a.id}">Restore</button></div>`).join("") || `<p class="subtitle">Nothing to restore.</p>`}</article></section>`;
}

function achievementsView() {
  const defs = achievementDefs();
  const unlocked = defs.filter((a) => state.achievements.includes(a.id)).length;
  return `<section class="hero lift-up"><div><h2>Achievements</h2><p class="subtitle">Your badges and milestone progress</p></div></section><section class="card lift-up" style="margin-bottom:12px;"><h3>Progress</h3><p class="subtitle">${unlocked} of ${defs.length} unlocked</p></section><section class="badge-grid">${badgeGrid()}</section>`;
}

function startSchoolworkView() {
  const pending = state.assignments.filter((a) => !a.done && !a.canceled);
  const cards = pending.map((a) => {
    const rem = remainingSeconds(a);
    const remMin = Math.floor(rem / 60);
    const remSec = rem % 60;
    const pct = Math.max(0, Math.min(100, Math.round(((a.minutes * 60 - rem) / (a.minutes * 60)) * 100)));
    return `<article class="card timer-card" data-timer-card="${a.id}"><h3>${a.name}</h3><p class="subtitle">${a.minutes} minute session required</p><div class="timer-bar"><div class="timer-fill" data-timer-fill style="width:${pct}%"></div></div><p class="subtitle" data-timer-label>${rem > 0 ? `Time left: ${remMin}:${String(remSec).padStart(2, "0")}` : "Ready for checkmark and coins"}</p><div style="display:flex; gap:8px; margin-top:8px;"><button class="btn" data-action="start-work" data-id="${a.id}">${a.sessionStart ? "Resume" : "Start"}</button><button class="btn alt" data-action="reset-work" data-id="${a.id}">Reset Timer</button></div></article>`;
  }).join("") || `<div class="card"><p>No pending assignments. Nice work.</p></div>`;

  return `<section class="hero"><div><h2>Start Schoolwork</h2><p class="subtitle">Timer must finish before completion is allowed.</p></div><div class="hero-chip"><strong>Coins</strong><span>${state.lifetime.coins}</span></div></section><section class="grid-2">${cards}</section>`;
}

function focusModeView() {
  const a = state.assignments.find((item) => item.id === state.focusAssignmentId);
  if (!a) { state.focusAssignmentId = null; return ""; }
  const rem = remainingSeconds(a);
  const total = Math.max(1, a.minutes * 60);
  const pct = Math.max(0, Math.min(100, Math.round(((total - rem) / total) * 100)));
  return `<div class="focus-mode"><button class="focus-exit" id="focus-stop">Stop and Save</button><div class="focus-inner"><p class="eyebrow">FOCUS MODE</p><h1>${a.name}</h1><p class="subtitle">${a.className || a.category} | ${a.minutes} minute session</p><div class="focus-clock" data-focus-clock>${Math.floor(rem / 60)}:${String(rem % 60).padStart(2, "0")}</div><div class="timer-bar"><div class="timer-fill" data-focus-fill style="width:${pct}%"></div></div><p class="subtitle" data-focus-status>${rem > 0 ? "Stay focused. Your work is being saved." : "Finished! Check the assignment when you are ready."}</p><button class="btn" data-action="focus-finish" data-id="${a.id}">${rem <= 0 ? "Finished!" : "Timer Running"}</button></div></div>`;
}

function createView() {
  return `<section class="hero lift-up"><div><h2>Create Schoolwork</h2><p class="subtitle">Custom assignments only.</p></div></section><section class="card lift-up"><h3>Custom Assignment</h3><form class="form" id="custom-form" style="margin-top: 12px;"><input class="input" required name="name" placeholder="Assignment name" /><div class="grid-4"><input class="input" type="date" name="dueDate" value="${nextDeadlineDateString()}" /><select class="select" name="priority"><option>High</option><option selected>Medium</option><option>Low</option></select><select class="select" name="category">${categories.map((c) => `<option>${c}</option>`).join("")}</select><input class="input" type="number" min="1" name="minutes" value="20" /></div><button class="btn" type="submit">Add Assignment</button></form></section>`;
}

function notificationsView() {
  const dueToday = state.assignments.filter((a) => !a.done && !a.canceled && a.dueDate === todayStr());
  const overdue = state.assignments.filter((a) => isOverdue(a));
  const status = state.notificationPermission === "granted" ? "Enabled" : state.notificationPermission === "denied" ? "Blocked" : state.notificationPermission === "unsupported" ? "Unsupported" : "Not enabled";
  return `<section class="hero lift-up"><div><h2>Notifications</h2><p class="subtitle">Windows reminders + assignment alerts</p></div></section><section class="card lift-up" style="margin-bottom:12px;"><h3>Windows Notification Status: ${status}</h3><div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap;"><button class="btn" id="enable-notifications">Enable Windows Notifications</button><button class="btn alt" id="test-notification">Send Test Notification</button></div><p class="subtitle" style="margin-top:8px;">Use Edge/Chrome and keep browser open.</p></section><section class="grid-2"><article class="card lift-up"><h3>Due Today (${dueToday.length})</h3><p class="subtitle" style="margin-top:8px;">${dueToday.map((a) => a.name).join(", ") || "No assignments due today."}</p></article><article class="card lift-up"><h3>Overdue (${overdue.length})</h3><p class="subtitle" style="margin-top:8px;">${overdue.map((a) => a.name).join(", ") || "No overdue assignments."}</p></article></section>`;
}

const grammarChallenges = [
  { sentence: "I like math and reading they are fun.", bad: "reading", fix: "reading,", note: "Missing comma" },
  { sentence: "The student write the answer quickly.", bad: "write", fix: "writes", note: "Verb agreement" },
  { sentence: "Please bring youre notebook today.", bad: "youre", fix: "your", note: "Spelling/word choice" }
];

function startFlappyRound() {
  if (!spendCoins(50, "Flappy laptop game entry")) return;
  state.games.flappy = { running: true, score: 0, birdY: 130, birdV: 0, pipes: [{ x: 360, gapY: 120, passed: false }], last: performance.now() };
  addHistory("Started Flappy Laptop (cost 50 coins)", "game");
  startFlappyLoop();
  render();
}

function startMathChallenge() {
  if (!spendCoins(50, "Math challenge entry")) return;
  const op = state.games.math.op;
  const mode = state.games.math.mode;
  let question;
  if (mode === "regular") {
    const a = Math.floor(Math.random() * 12) + 1;
    const b = Math.floor(Math.random() * 12) + 1;
    question = { text: op === "multiply" ? `${a} x ${b}` : `${a * b} / ${a}`, answer: String(op === "multiply" ? a * b : b) };
  } else {
    const a = Math.floor(Math.random() * 8) + 1;
    const b = Math.floor(Math.random() * 8) + 2;
    const c = Math.floor(Math.random() * 8) + 1;
    const d = Math.floor(Math.random() * 8) + 2;
    if (op === "multiply") question = { text: `${a}/${b} x ${c}/${d}`, answer: `${a * c}/${b * d}` };
    else question = { text: `${a}/${b} / ${c}/${d}`, answer: `${a * d}/${b * c}` };
  }
  state.games.math.question = question;
  state.games.math.feedback = "";
  addHistory("Started Math Challenge (cost 50 coins)", "game");
  render();
}

function startGrammarChallenge() {
  if (!spendCoins(50, "Find the problem game entry")) return;
  state.games.grammar.challenge = grammarChallenges[Math.floor(Math.random() * grammarChallenges.length)];
  state.games.grammar.feedback = "Click the wrong word.";
  state.games.grammar.selected = null;
  addHistory("Started Grammar Challenge (cost 50 coins)", "game");
  render();
}

function gamesView() {
  const g = state.games;
  const sentenceWords = g.grammar.challenge ? g.grammar.challenge.sentence.split(" ") : [];
  return `<section class="hero lift-up"><div><h2>Games</h2><p class="subtitle">Each game costs 50 coins to play.</p></div><div class="hero-chip"><strong>Coins</strong><span>${state.lifetime.coins}</span></div></section><section class="grid-2"><article class="card lift-up"><h3>Flappy Laptop</h3><p class="subtitle">Tap Space or click jump.</p><canvas id="flappy-canvas" width="420" height="220" class="game-canvas"></canvas><div style="display:flex;gap:8px;margin-top:8px;"><button class="btn" id="start-flappy">Play (50 coins)</button><button class="btn alt" id="jump-flappy">Jump</button></div><p class="subtitle">Score: ${g.flappy.score || 0}</p></article><article class="card lift-up"><h3>Math Minigame</h3><div class="grid-2" style="margin-top:10px;"><select class="select" id="math-op"><option value="multiply" ${g.math.op === "multiply" ? "selected" : ""}>Multiplication</option><option value="divide" ${g.math.op === "divide" ? "selected" : ""}>Division</option></select><select class="select" id="math-mode"><option value="regular" ${g.math.mode === "regular" ? "selected" : ""}>Regular numbers</option><option value="fraction" ${g.math.mode === "fraction" ? "selected" : ""}>Fractions</option></select></div><button class="btn" id="start-math" style="margin-top:8px;">Start (50 coins)</button>${g.math.question ? `<p style="margin-top:8px;">${g.math.question.text}</p><input id="math-answer" class="input" placeholder="Answer" /><button id="submit-math" class="btn alt" style="margin-top:8px;">Submit</button>` : ""}<p class="subtitle">${g.math.feedback || ""}</p></article><article class="card lift-up"><h3>Find The Problem</h3><button class="btn" id="start-grammar">Start (50 coins)</button>${g.grammar.challenge ? `<p class="subtitle" style="margin-top:8px;">${g.grammar.challenge.note}</p><div class="sentence-wrap">${sentenceWords.map((w) => `<button class="word-btn" data-word="${w}">${w}</button>`).join(" ")}</div>` : ""}<p class="subtitle">${g.grammar.feedback || ""}</p></article></section>`;
}

function profileView() {
  const w = weekSummary();
  const displayName = state.profile.nickname || state.user.name;
  const hour12 = state.schedule.deadlineHour % 12 === 0 ? 12 : state.schedule.deadlineHour % 12;
  const ampm = state.schedule.deadlineHour >= 12 ? "PM" : "AM";

  const accountPanel = `<article class="card lift-up"><form class="form" id="profile-form-account"><input class="input" name="displayName" value="${state.user.name}" placeholder="Full name" /><input class="input" name="nickname" value="${state.profile.nickname}" placeholder="Nickname" /><input class="input" name="avatar" value="${state.profile.avatar}" placeholder="Avatar URL" /><select class="select" name="theme"><option value="dark" ${state.profile.theme === "dark" ? "selected" : ""}>Dark</option><option value="light" ${state.profile.theme === "light" ? "selected" : ""}>Light</option><option value="custom" ${state.profile.theme === "custom" ? "selected" : ""}>School Blue</option></select><button class="btn" type="submit">Save Account</button></form><div class="subtitle" style="margin-top:14px;">Signed in as: ${displayName} (${state.user.email})</div>${state.profile.avatar ? `<img src="${state.profile.avatar}" alt="avatar" style="margin-top:12px;width:72px;height:72px;border-radius:50%;object-fit:cover;border:1px solid var(--card-border);" />` : ""}</article>`;

  const settingsPanel = `<article class="card lift-up"><form class="form" id="profile-form-settings"><input class="input" name="schoolName" value="${state.schedule.schoolName}" placeholder="School name" /><input class="input" name="blockName" value="${state.schedule.blockName}" placeholder="Work block name" /><select class="select" name="timeZone">${timeZones.map((tz) => `<option value="${tz}" ${state.schedule.timeZone === tz ? "selected" : ""}>${tz === "auto" ? "Auto (not recommended)" : tz}</option>`).join("")}</select><label class="subtitle">Weekly reward limit (minutes)<input class="input" type="number" min="0" max="600" name="rewardCapMinutes" value="${state.lifetime.rewardCapMinutes || 60}" /></label><select class="select" name="deadlineType"><option value="weekly" ${state.schedule.deadlineType === "weekly" ? "selected" : ""}>Weekly deadline</option><option value="date" ${state.schedule.deadlineType === "date" ? "selected" : ""}>Specific date deadline</option></select><select class="select" name="deadlineWeekday">${weekDays.map((d) => `<option value="${d.value}" ${Number(state.schedule.deadlineWeekday) === d.value ? "selected" : ""}>${d.label}</option>`).join("")}</select><input class="input" type="date" name="deadlineDate" value="${state.schedule.deadlineDate || nextDeadlineDateString()}" /><select class="select" name="timeFormat"><option value="12h" ${state.schedule.timeFormat === "12h" ? "selected" : ""}>Regular Time (AM/PM)</option><option value="24h" ${state.schedule.timeFormat === "24h" ? "selected" : ""}>Military Time</option></select>${state.schedule.timeFormat === "24h" ? `<div class="grid-2"><input class="input" type="number" min="0" max="23" name="deadlineHour24" value="${state.schedule.deadlineHour}" /><input class="input" type="number" min="0" max="59" name="deadlineMinute" value="${state.schedule.deadlineMinute}" /></div>` : `<div class="grid-3"><input class="input" type="number" min="1" max="12" name="deadlineHour12" value="${hour12}" /><select class="select" name="deadlineAmPm"><option ${ampm === "AM" ? "selected" : ""}>AM</option><option ${ampm === "PM" ? "selected" : ""}>PM</option></select><input class="input" type="number" min="0" max="59" name="deadlineMinute" value="${state.schedule.deadlineMinute}" /></div>`}<button class="btn" type="submit">Save Settings</button></form><p class="subtitle" style="margin-top:10px;">Current deadline: ${formatSchedule()}</p></article>`;

  return `<section class="hero lift-up"><div><h2>Profile</h2><p class="subtitle">Account + Settings</p></div></section><section class="section-tabs"><button data-profile="account" class="${state.profileSection === "account" ? "active" : ""}">Account</button><button data-profile="settings" class="${state.profileSection === "settings" ? "active" : ""}">Settings</button></section><section class="grid-2" style="margin-top:12px;">${state.profileSection === "account" ? accountPanel : settingsPanel}<article class="card lift-up"><h3>Weekly Summary</h3><p class="subtitle">Completed: ${w.completedThisWeek} | Pending: ${w.pending} (${w.pendingMinutes} min)</p>${weekChart(w)}</article></section>`;
}

let flappyLoopHandle = null;

function drawFlappy() {
  const canvas = document.getElementById("flappy-canvas");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const g = state.games.flappy;

  ctx.fillStyle = "#10233c";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  if (!g.birdY && g.birdY !== 0) {
    ctx.fillStyle = "#fff";
    ctx.fillText("Press Play to start", 150, 110);
    return;
  }

  ctx.fillStyle = "#22d3ee";
  for (const p of g.pipes || []) {
    ctx.fillRect(p.x, 0, 44, p.gapY - 36);
    ctx.fillRect(p.x, p.gapY + 36, 44, canvas.height - (p.gapY + 36));
  }

  ctx.fillStyle = "#f59e0b";
  ctx.fillRect(70, g.birdY, 24, 18);
  ctx.fillStyle = "#fff";
  ctx.fillText("Laptop", 64, g.birdY - 4);
  ctx.fillText(`Score: ${g.score || 0}`, 12, 18);
}

function stopFlappy() {
  if (flappyLoopHandle) cancelAnimationFrame(flappyLoopHandle);
  flappyLoopHandle = null;
  state.games.flappy.running = false;
}

function startFlappyLoop() {
  stopFlappy();
  const step = (ts) => {
    const g = state.games.flappy;
    const canvas = document.getElementById("flappy-canvas");
    if (!g.running || !canvas || state.currentTab !== "games") {
      stopFlappy();
      drawFlappy();
      return;
    }

    const dt = Math.min(0.04, (ts - (g.last || ts)) / 1000);
    g.last = ts;

    g.birdV += 520 * dt;
    g.birdY += g.birdV * dt;

    for (const p of g.pipes) p.x -= 140 * dt;
    if (g.pipes[g.pipes.length - 1].x < 220) g.pipes.push({ x: 420, gapY: 70 + Math.random() * 90, passed: false });
    g.pipes = g.pipes.filter((p) => p.x > -60);

    for (const p of g.pipes) {
      if (!p.passed && p.x + 44 < 70) {
        p.passed = true;
        g.score += 1;
      }
      const hitX = 70 + 24 > p.x && 70 < p.x + 44;
      const hitY = g.birdY < p.gapY - 36 || g.birdY + 18 > p.gapY + 36;
      if (hitX && hitY) g.running = false;
    }

    if (g.birdY < 0 || g.birdY + 18 > canvas.height) g.running = false;

    if (!g.running) {
      stopFlappy();
      if (g.score >= 10) awardCoins(80, "Flappy Laptop high score");
      else if (g.score >= 5) awardCoins(40, "Flappy Laptop score bonus");
      addHistory(`Flappy Laptop ended with score ${g.score}`, "game");
      render();
      return;
    }

    drawFlappy();
    flappyLoopHandle = requestAnimationFrame(step);
  };

  flappyLoopHandle = requestAnimationFrame(step);
}

function headerNav() {
  return `<header class="top-header"><button class="brand" id="go-home"><img class="brand-logo" src="icons/schoolwork-hub-logo.png" alt="" />Schoolwork Hub</button><div class="coin-chip">XP: ${state.lifetime.xp || 0} | Coins: ${state.lifetime.coins}</div><div class="top-actions" role="navigation" aria-label="Main navigation"><button class="${state.currentTab === "dashboard" ? "active" : ""}" data-nav="dashboard">Home</button><button class="${state.currentTab === "classes" ? "active" : ""}" data-nav="classes">Classes</button><button class="${state.currentTab === "calendar" ? "active" : ""}" data-nav="calendar">Calendar</button><button class="${state.currentTab === "grades" ? "active" : ""}" data-nav="grades">Grades</button><button class="${state.currentTab === "study" ? "active" : ""}" data-nav="study">Study Center</button><button class="${state.currentTab === "start" ? "active" : ""}" data-nav="start">Focus</button><button class="${state.currentTab === "overview" ? "active" : ""}" data-nav="overview">Progress</button><button class="${state.currentTab === "achievements" ? "active" : ""}" data-nav="achievements">Achievements</button><button class="${state.currentTab === "create" ? "active" : ""}" data-nav="create">Create</button><button class="${state.currentTab === "rewards" ? "active" : ""}" data-nav="rewards">XP Shop</button><button class="${state.currentTab === "extras" ? "active" : ""}" data-nav="extras">More</button><button class="${state.currentTab === "notifications" ? "active" : ""}" data-nav="notifications">Notifications</button><button class="${state.currentTab === "profile" ? "active" : ""}" data-nav="profile">Profile</button></div></header>`;
}

function shellView() {
  if (state.focusAssignmentId) return focusModeView();
  const view = state.currentTab === "dashboard"
    ? dashboardView()
    : state.currentTab === "classes"
    ? classView()
    : state.currentTab === "calendar"
    ? calendarView()
    : state.currentTab === "grades"
    ? gradesView()
    : state.currentTab === "study"
    ? studyView()
    : state.currentTab === "extras"
    ? extrasView()
    : state.currentTab === "start"
    ? startSchoolworkView()
    : state.currentTab === "overview"
    ? overviewView()
    : state.currentTab === "achievements"
    ? achievementsView()
    : state.currentTab === "create"
    ? createView()
    : state.currentTab === "rewards"
    ? rewardShopView()
    : state.currentTab === "notifications"
    ? notificationsView()
    : profileView();

  return `<div class="shell school-layout">${headerNav()}<main class="content">${view}</main>${state.toast ? `<div class="toast"><span>${state.toast.message}</span>${state.toast.undo ? `<button id="toast-undo">Undo</button>` : ""}</div>` : ""}</div>`;
}

function bind() {
  if (!state.user) {
    document.getElementById("toggle-auth")?.addEventListener("click", () => {
      state.authMode = state.authMode === "signin" ? "signup" : "signin";
      render();
    });
    document.getElementById("forgot-password")?.addEventListener("click", () => { state.recoveryMode = true; render(); });
    document.getElementById("cancel-recovery")?.addEventListener("click", () => { state.recoveryMode = false; render(); });
    document.getElementById("recovery-form")?.addEventListener("submit", (e) => {
      e.preventDefault();
      const fd = new FormData(e.currentTarget);
      const email = String(fd.get("email")).trim().toLowerCase();
      const accounts = readJSON(STORE_KEY, {});
      const account = accounts[email];
      const answer = String(fd.get("answer")).trim().toLowerCase();
      if (!account) { pushToast("No account was found for that email."); return; }
      if (!account.recoveryAnswer) {
        const currentPassword = String(fd.get("currentPassword") || "");
        const question = String(fd.get("recoveryQuestion") || "");
        const recoveryAnswer = String(fd.get("recoveryAnswer") || "").trim().toLowerCase();
        if (account.password !== currentPassword || !question || !recoveryAnswer) { pushToast("Enter your current password, question, and recovery answer to set up recovery."); return; }
        account.recoveryQuestion = question;
        account.recoveryAnswer = recoveryAnswer;
      } else if (account.recoveryAnswer !== answer) { pushToast("Email or recovery answer is incorrect."); return; }
      account.password = String(fd.get("newPassword"));
      accounts[email] = account;
      writeJSON(STORE_KEY, accounts);
      state.recoveryMode = false;
      pushToast("Password reset. You can sign in now.");
      render();
    });

    document.getElementById("auth-form")?.addEventListener("submit", (e) => {
      e.preventDefault();
      const fd = new FormData(e.currentTarget);
      const email = String(fd.get("email")).trim().toLowerCase();
      const password = String(fd.get("password"));
      const rememberMe = fd.get("rememberMe") === "on";

      if (state.authMode === "signin") {
        if (!loadUser(email, password)) {
          pushToast("Account not found or password incorrect.");
          return;
        }
        refreshNotificationState();
        evaluateDeadlineOutcome();
        if (rememberMe) {
          localStorage.setItem(REMEMBER_ME_KEY, "1");
          localStorage.setItem(LAST_USER_KEY, email);
        } else {
          localStorage.removeItem(REMEMBER_ME_KEY);
          localStorage.removeItem(LAST_USER_KEY);
        }
        render();
        return;
      }

      const accounts = readJSON(STORE_KEY, {});
      if (accounts[email]) {
        pushToast("Account already exists. Please sign in.");
        state.authMode = "signin";
        render();
        return;
      }

      state.user = { name: String(fd.get("name") || "Student").trim() || "Student", email };
      state.assignments = [];
      state.profile = { nickname: "", avatar: "", theme: "dark" };
      const selectedQuestion = String(fd.get("recoveryQuestion") || "");
      state.recovery = { question: selectedQuestion === "custom" ? String(fd.get("customQuestion") || "").trim() : selectedQuestion, answer: String(fd.get("recoveryAnswer") || "").trim().toLowerCase() };
      state.recurringSetupDone = false;
      state.achievements = [];
      state.lifetime = { ...defaultLifetime };
      state.schedule = { ...defaultSchedule };
      state.profileSection = "account";

      setupRecurring();
      persist();
      const updated = readJSON(STORE_KEY, {});
      updated[email].password = password;
      writeJSON(STORE_KEY, updated);
      if (rememberMe) {
        localStorage.setItem(REMEMBER_ME_KEY, "1");
        localStorage.setItem(LAST_USER_KEY, email);
      } else {
        localStorage.removeItem(REMEMBER_ME_KEY);
        localStorage.removeItem(LAST_USER_KEY);
      }
      addHistory("Created account", "account");
      refreshNotificationState();
      checkAchievements();
      render();
    });
    return;
  }

  document.getElementById("go-home")?.addEventListener("click", () => {
    state.currentTab = "dashboard";
    render();
  });

  document.querySelectorAll("[data-nav]").forEach((b) => {
    b.addEventListener("click", () => {
      state.currentTab = b.getAttribute("data-nav");
      render();
    });
  });

  document.getElementById("logout")?.addEventListener("click", () => {
    state.user = null;
    state.assignments = [];
    state.currentTab = "dashboard";
    state.profileSection = "account";
    state.toast = null;
    state.search = "";
    state.filterBy = "all";
    state.sortBy = "due";
    state.profile = { nickname: "", avatar: "", theme: "dark" };
    state.recurringSetupDone = false;
    state.achievements = [];
    state.lifetime = { ...defaultLifetime };
    state.schedule = { ...defaultSchedule };
    stopFlappy();
    render();
  });

  document.getElementById("toast-undo")?.addEventListener("click", () => {
    if (state.toast?.undo) state.toast.undo();
    state.toast = null;
    render();
  });

  document.getElementById("search")?.addEventListener("input", (e) => {
    state.search = e.target.value;
    render();
  });

  document.getElementById("sort")?.addEventListener("change", (e) => {
    state.sortBy = e.target.value;
    render();
  });

  document.getElementById("filter")?.addEventListener("change", (e) => {
    state.filterBy = e.target.value;
    render();
  });

  document.getElementById("enable-notifications")?.addEventListener("click", () => requestNotificationPermission());
  document.getElementById("test-notification")?.addEventListener("click", () => {
    sendWindowsNotification("Schoolwork Hub", "This is a test Windows notification.");
    pushToast("Test notification sent");
  });

  document.querySelectorAll("[data-reward]").forEach((btn) => btn.addEventListener("click", () => {
    const rewards = { "gaming-10": [1000, 10, "10 minutes of gaming"], "gaming-20": [2000, 20, "20 minutes of gaming"], snack: [1000, 10, "a snack break"], music: [1000, 10, "a music break"], choice: [3000, 30, "a 30-minute choice reward"], "profile-color": [50, 0, "a profile color"], "timer-sound": [100, 0, "a special timer sound"], "premium-badge": [250, 0, "a premium achievement badge"], "special-theme": [500, 0, "a special theme"] };
    const reward = rewards[btn.getAttribute("data-reward")];
    if (!reward) return;
    const week = currentRewardWeek();
    if (state.lifetime.rewardWeek !== week) { state.lifetime.rewardWeek = week; state.lifetime.rewardMinutesThisWeek = 0; }
    if ((state.lifetime.rewardMinutesThisWeek || 0) + reward[1] > (state.lifetime.rewardCapMinutes || 60)) { pushToast("That would exceed this week's reward limit"); return; }
    if (!spendCoins(reward[0], `Unlocked ${reward[2]}`)) return;
    state.lifetime.rewardMinutesThisWeek = (state.lifetime.rewardMinutesThisWeek || 0) + reward[1];
    addHistory(`Reward unlocked: ${reward[2]}`, "reward");
    persist();
    pushToast(`Reward unlocked: ${reward[2]}`);
    sendWindowsNotification("Reward unlocked", `You earned ${reward[2]}.`);
    render();
  }));
  document.querySelectorAll("[data-profile]").forEach((b) => b.addEventListener("click", () => { state.profileSection = b.getAttribute("data-profile"); render(); }));
  document.querySelectorAll("[data-class]").forEach((b) => b.addEventListener("click", () => { state.selectedClass = b.getAttribute("data-class"); render(); }));
  document.getElementById("class-form")?.addEventListener("submit", (e) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const name = state.selectedClass || "Math";
    state.classData[name] = { teacher: String(fd.get("teacher")), schedule: String(fd.get("schedule")), notes: String(fd.get("notes")), tests: String(fd.get("tests")), materials: String(fd.get("materials")), grade: String(fd.get("grade")) };
    persist();
    pushToast(`${name} details saved`);
    render();
  });
  document.querySelectorAll("[data-unpin]").forEach((b) => b.addEventListener("click", () => { state.pinned = state.pinned.filter((id) => id !== b.getAttribute("data-unpin")); persist(); render(); }));
  document.querySelectorAll("[data-restore]").forEach((b) => b.addEventListener("click", () => { const id = b.getAttribute("data-restore"); const old = state.trash.find((a) => a.id === id); if (old) { old.canceled = false; state.assignments.push(old); state.trash = state.trash.filter((a) => a.id !== id); persist(); render(); } }));
  document.getElementById("favorite-form")?.addEventListener("submit", (e) => { e.preventDefault(); const site = String(new FormData(e.currentTarget).get("site")); state.favorites.push(site); persist(); render(); });
  document.getElementById("calendar-form")?.addEventListener("submit", (e) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    addAssignment({
      name: String(fd.get("name")).trim(),
      dueDate: String(fd.get("dueDate")),
      workType: String(fd.get("workType")),
      className: String(fd.get("className")),
      category: String(fd.get("className")),
      minutes: Number(fd.get("minutes")) || 20
    });
    persist();
    pushToast("Saved to this device's calendar");
    render();
  });
  document.getElementById("grade-form")?.addEventListener("submit", (e) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    state.grades.push({ className: String(fd.get("className")), value: Number(fd.get("value")) || 0 });
    persist();
    pushToast("Grade saved");
    render();
  });
  document.getElementById("study-start")?.addEventListener("click", () => {
    const s = state.study;
    if (s.running) {
      const elapsed = Math.floor((Date.now() - Date.parse(s.startedAt)) / 1000);
      s.seconds = Math.max(0, (s.seconds || (s.mode === "work" ? s.workMinutes * 60 : s.breakMinutes * 60)) - elapsed);
      if (s.mode === "work") state.lifetime.studySeconds = (state.lifetime.studySeconds || 0) + elapsed;
      s.running = false; s.startedAt = null;
    } else {
      if (!s.seconds) s.seconds = (s.mode === "work" ? s.workMinutes : s.breakMinutes) * 60;
      s.running = true; s.startedAt = new Date().toISOString();
    }
    persist(); render();
  });
  document.getElementById("study-reset")?.addEventListener("click", () => { state.study.running = false; state.study.startedAt = null; state.study.seconds = 0; persist(); render(); });
  document.getElementById("work-minutes")?.addEventListener("change", (e) => { state.study.workMinutes = Math.max(1, Number(e.target.value) || 25); persist(); });
  document.getElementById("break-minutes")?.addEventListener("change", (e) => { state.study.breakMinutes = Math.max(1, Number(e.target.value) || 5); persist(); });
  document.getElementById("flashcard-flip")?.addEventListener("click", () => { state.study.showAnswer = !state.study.showAnswer; render(); });
  document.getElementById("flashcard-form")?.addEventListener("submit", (e) => { e.preventDefault(); const fd = new FormData(e.currentTarget); state.study.flashcards.push({ question: String(fd.get("question")), answer: String(fd.get("answer")) }); state.study.cardIndex = state.study.flashcards.length - 1; state.study.showAnswer = false; persist(); render(); });
  document.getElementById("practice-form")?.addEventListener("submit", (e) => { e.preventDefault(); const fd = new FormData(e.currentTarget); state.study.mistakes.push({ question: String(fd.get("question")), answer: String(fd.get("answer")), type: String(fd.get("type")) }); persist(); pushToast("Practice question saved"); render(); });
  document.querySelectorAll("[data-tool]").forEach((b) => b.addEventListener("click", () => { const output = document.getElementById("tool-output"); if (!output) return; const tool = b.getAttribute("data-tool"); output.textContent = tool === "calculator" ? "Calculator ready: use the browser or add an expression in your notes." : tool === "multiplication" ? "Multiplication table: 1 x 1 through 12 x 12 is ready to practice." : tool === "word-counter" ? "Word Counter ready for your study notes." : "Stopwatch ready for your next study session."; }));

  document.querySelectorAll("[data-action='start-work']").forEach((btn) => btn.addEventListener("click", () => {
    const a = state.assignments.find((x) => x.id === btn.getAttribute("data-id"));
    if (!a) return;
    if (!a.sessionStart) a.sessionStart = new Date().toISOString();
    a.status = "Started";
    addHistory(`Started timer for ${a.name}`, "timer");
    persist();
    state.focusAssignmentId = a.id;
    render();
  }));

  document.querySelectorAll("[data-action='pin']").forEach((btn) => btn.addEventListener("click", () => {
    const id = btn.getAttribute("data-id");
    state.pinned = state.pinned.includes(id) ? state.pinned.filter((x) => x !== id) : [...state.pinned, id];
    persist(); render();
  }));
  document.querySelectorAll("[data-action='one-complete']").forEach((btn) => btn.addEventListener("click", () => {
    const item = state.assignments.find((a) => a.id === btn.getAttribute("data-id"));
    if (!item || !canComplete(item)) { pushToast("Finish the timer before completing this assignment."); return; }
    item.done = true; item.status = "Completed"; item.completedAt = new Date().toISOString(); state.lifetime.completedTotal += 1; awardCoins(20, `Completed ${item.name}`); awardXp(10, `Completed ${item.name}`); persist(); checkAchievements(); pushToast("Assignment completed!"); render();
  }));

  document.getElementById("focus-stop")?.addEventListener("click", () => {
    if (confirm("Stop and save this session? The timer will pause and your remaining time will be saved.")) { pauseAssignment(state.assignments.find((a) => a.id === state.focusAssignmentId)); state.focusAssignmentId = null; persist(); render(); }
  });
  document.querySelectorAll("[data-action='focus-finish']").forEach((btn) => btn.addEventListener("click", () => {
    const a = state.assignments.find((x) => x.id === btn.getAttribute("data-id"));
    if (!a) return;
    if (!canComplete(a)) { pushToast("The timer must finish before this assignment can be completed."); return; }
    state.focusAssignmentId = null;
    render();
  }));

  document.querySelectorAll("[data-action='reset-work']").forEach((btn) => btn.addEventListener("click", () => {
    const a = state.assignments.find((x) => x.id === btn.getAttribute("data-id"));
    if (!a) return;
    a.sessionStart = null;
    a.elapsedSeconds = 0;
    a.timerCoinGranted = false;
    persist();
    pushToast("Timer reset");
    render();
  }));

  document.querySelectorAll("[data-action='toggle-done']").forEach((el) => {
    el.addEventListener("change", () => {
      const item = state.assignments.find((a) => a.id === el.getAttribute("data-id"));
      if (!item) return;

      if (el.checked && !canComplete(item)) {
        el.checked = false;
        pushToast("Finish timer first in Start Schoolwork tab");
        return;
      }

      item.done = el.checked;
      item.status = item.done ? "Completed" : (item.sessionStart || item.elapsedSeconds > 0 ? "Started" : "Not Started");
      if (item.done) {
        item.completedAt = new Date().toISOString();
        if (!item.completedLogged) {
          item.completedLogged = true;
          state.lifetime.completedTotal += 1;
          if (!item.timerCoinGranted) {
            item.timerCoinGranted = true;
            awardCoins(20, `Completed ${item.name}`);
            awardXp(10, `Completed ${item.name}`);
          }
          const completedDays = new Set(state.assignments.filter((a) => a.completedAt).map((a) => a.completedAt.slice(0, 10))).size;
          const rare = Math.random() < 0.001;
          pushToast(rare ? "This is a 0.1% chance. Anyways, cool." : `🔥 ${completedDays} day${completedDays === 1 ? "" : "s"} done! Woohoo!`);
        }
        addHistory(`Completed assignment: ${item.name}`, "assignment");
      } else {
        item.completedAt = null;
      }

      persist();
      checkAchievements();
      render();
    });
  });

  document.querySelectorAll("[data-action='due']").forEach((el) => el.addEventListener("change", () => {
    const item = state.assignments.find((a) => a.id === el.getAttribute("data-id"));
    if (!item) return;
    item.dueDate = el.value;
    persist();
    render();
  }));

  document.querySelectorAll("[data-action='cancel']").forEach((btn) => btn.addEventListener("click", () => {
    const item = state.assignments.find((a) => a.id === btn.getAttribute("data-id"));
    if (!item) return;
    if (!item.canceled) state.lifetime.canceledTotal += 1;
    item.canceled = true;
    state.trash = [...(state.trash || []).filter((a) => a.id !== item.id), { ...item }];
    addHistory(`Canceled assignment: ${item.name}`, "assignment");
    persist();
    pushToast("Assignment canceled", () => { item.canceled = false; persist(); render(); });
    sendWindowsNotification("Assignment canceled", item.name);
    checkAchievements();
    render();
  }));

  document.getElementById("custom-form")?.addEventListener("submit", (e) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    addAssignment({
      name: String(fd.get("name")).trim(),
      dueDate: String(fd.get("dueDate")),
      priority: String(fd.get("priority")),
      category: String(fd.get("category")),
      minutes: Number(fd.get("minutes")) || 20
    });
    e.currentTarget.reset();
    render();
  });

  document.getElementById("profile-form-account")?.addEventListener("submit", (e) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    state.user.name = String(fd.get("displayName")).trim() || state.user.name;
    state.profile.nickname = String(fd.get("nickname")).trim();
    state.profile.avatar = String(fd.get("avatar")).trim();
    state.profile.theme = String(fd.get("theme"));
    document.body.dataset.theme = state.profile.theme;
    persist();
    pushToast("Account updated");
    render();
  });

  document.getElementById("profile-form-settings")?.addEventListener("submit", (e) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    state.schedule.schoolName = String(fd.get("schoolName")).trim() || defaultSchedule.schoolName;
    state.schedule.blockName = String(fd.get("blockName")).trim() || defaultSchedule.blockName;
    state.schedule.timeZone = String(fd.get("timeZone")) || defaultSchedule.timeZone;
    state.lifetime.rewardCapMinutes = Math.min(600, Math.max(0, Number(fd.get("rewardCapMinutes")) || 60));
    state.schedule.deadlineType = String(fd.get("deadlineType")) || defaultSchedule.deadlineType;
    state.schedule.deadlineWeekday = Number(fd.get("deadlineWeekday"));
    state.schedule.deadlineDate = String(fd.get("deadlineDate"));
    state.schedule.timeFormat = String(fd.get("timeFormat")) || defaultSchedule.timeFormat;

    const minute = Math.min(59, Math.max(0, Number(fd.get("deadlineMinute")) || 0));
    state.schedule.deadlineMinute = minute;

    if (state.schedule.timeFormat === "24h") {
      state.schedule.deadlineHour = Math.min(23, Math.max(0, Number(fd.get("deadlineHour24")) || 0));
    } else {
      let h = Math.min(12, Math.max(1, Number(fd.get("deadlineHour12")) || 12));
      const period = String(fd.get("deadlineAmPm") || "AM");
      if (period === "AM") state.schedule.deadlineHour = h === 12 ? 0 : h;
      else state.schedule.deadlineHour = h === 12 ? 12 : h + 12;
    }

    persist();
    pushToast("Settings updated");
    render();
  });

  document.getElementById("start-flappy")?.addEventListener("click", () => startFlappyRound());
  document.getElementById("jump-flappy")?.addEventListener("click", () => {
    if (!state.games.flappy.running) return;
    state.games.flappy.birdV = -220;
    drawFlappy();
  });

  document.getElementById("math-op")?.addEventListener("change", (e) => { state.games.math.op = e.target.value; persist(); });
  document.getElementById("math-mode")?.addEventListener("change", (e) => { state.games.math.mode = e.target.value; persist(); });
  document.getElementById("start-math")?.addEventListener("click", () => startMathChallenge());
  document.getElementById("submit-math")?.addEventListener("click", () => {
    const input = (document.getElementById("math-answer")?.value || "").trim();
    const answer = state.games.math.question?.answer || "";
    if (!answer) return;
    if (input === answer) {
      state.games.math.feedback = "Correct! +70 coins";
      awardCoins(70, "Math challenge solved");
      addHistory("Won Math Challenge", "game");
    } else {
      state.games.math.feedback = `Not quite. Correct: ${answer}`;
    }
    persist();
    render();
  });

  document.getElementById("start-grammar")?.addEventListener("click", () => startGrammarChallenge());
  document.querySelectorAll("[data-word]").forEach((btn) => btn.addEventListener("click", () => {
    const challenge = state.games.grammar.challenge;
    if (!challenge) return;
    const picked = btn.getAttribute("data-word");
    if (picked === challenge.bad) {
      state.games.grammar.feedback = `Correct. It should be: ${challenge.fix}. +60 coins`;
      awardCoins(60, "Grammar challenge solved");
      addHistory("Won Grammar Challenge", "game");
    } else {
      state.games.grammar.feedback = `Try again. That's not the error.`;
    }
    render();
  }));

  if (state.currentTab === "games") stopFlappy();
}

window.addEventListener("keydown", (e) => {
  if (e.code === "Space" && state.games.flappy.running) {
    e.preventDefault();
    state.games.flappy.birdV = -220;
  }
});

function bootstrap() {
  refreshNotificationState();
  loadDeviceProfile();
  document.body.dataset.theme = state.profile.theme;

  setInterval(() => {
    if (state.user) {
      reminderCheck();
      evaluateDeadlineOutcome();
      grantTimerCoins();
      if (state.currentTab === "start") updateStartTimers();
      if (state.focusAssignmentId) updateFocusTimer();
      updateStudyTimer();
    }
  }, 1000);
}

function render() {
  document.body.dataset.theme = state.profile.theme;
  app.innerHTML = state.user ? shellView() : authView();
  bind();
}

bootstrap();
render();
