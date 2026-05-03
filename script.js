const DAYS_TO_TRACK = 1619;
const END_DATE = new Date('2030-10-08T00:00:00'); // Oct 8, 2030 gives 1619 remaining days from 2026-05-03.
const API_URL = 'https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec';
const WINDOW_BEFORE = 10;
const WINDOW_AFTER = 7;

const STORAGE_KEYS = { entries: 'dayTrackerEntries', config: 'dayTrackerWeeklyConfig' };
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const defaultConfig = WEEKDAYS.reduce((a, d) => ((a[d] = { workout: '', diet: '' }), a), {});

const state = {
  today: new Date(),
  days: [],
  entries: JSON.parse(localStorage.getItem(STORAGE_KEYS.entries) || '{}'),
  weeklyConfig: JSON.parse(localStorage.getItem(STORAGE_KEYS.config) || 'null') || defaultConfig,
  activeDateISO: null,
  showAll: false
};

const el = {
  daysList: document.getElementById('daysList'), summaryPanel: document.getElementById('summaryPanel'), summaryRange: document.getElementById('summaryRange'),
  viewWindowBtn: document.getElementById('viewWindowBtn'), viewAllBtn: document.getElementById('viewAllBtn'),
  dayDialog: document.getElementById('dayDialog'), dayForm: document.getElementById('dayForm'), formDateTitle: document.getElementById('formDateTitle'),
  closeDayDialog: document.getElementById('closeDayDialog'), submitBtn: document.getElementById('submitBtn'), scorePreview: document.getElementById('scorePreview'),
  configDialog: document.getElementById('configDialog'), configForm: document.getElementById('configForm'), weekdayConfigContainer: document.getElementById('weekdayConfigContainer'),
  openConfigBtn: document.getElementById('openConfigBtn'), closeConfigDialog: document.getElementById('closeConfigDialog')
};

const toISODate = (d) => d.toISOString().slice(0, 10);
const parseLines = (t = '') => t.split('\n').map((v) => v.trim()).filter(Boolean);
const dayDiff = (a, b) => Math.ceil((b - a) / 86400000);

function computeScores(payload) {
  const planned = parseLines(payload.tasksPlanned).length;
  const done = parseLines(payload.tasksCompleted).length;
  const taskCompletion = planned ? Math.min(100, Math.round((done / planned) * 100)) : 0;
  const workoutScore = payload.workoutDone === 'yes' ? 100 : 0;
  const dietScore = payload.dietFollowed === 'yes' ? 100 : 0;
  const finalDailyScore = Math.round(taskCompletion * 0.5 + workoutScore * 0.25 + dietScore * 0.25);
  return { taskCompletion, workoutScore, dietScore, finalDailyScore };
}

function generateDays() {
  const start = new Date(); start.setHours(0, 0, 0, 0);
  const days = [];
  for (let i = 0; i < DAYS_TO_TRACK; i++) {
    const d = new Date(start); d.setDate(start.getDate() + i);
    if (d > END_DATE) break;
    days.push(d);
  }
  return days;
}

function getVisibleDays() {
  if (state.showAll) return state.days;
  const todayISO = toISODate(state.today);
  const idx = state.days.findIndex((d) => toISODate(d) === todayISO);
  const start = Math.max(0, idx - WINDOW_BEFORE);
  const end = Math.min(state.days.length, idx + WINDOW_AFTER + 1);
  return state.days.slice(start, end);
}

function renderDays() {
  el.daysList.innerHTML = '';
  const todayISO = toISODate(state.today);
  const visible = getVisibleDays();
  visible.forEach((date) => {
    const iso = toISODate(date);
    const done = state.entries[iso]?.locked;
    const isToday = iso === todayISO;
    const remaining = Math.max(0, dayDiff(date, END_DATE));
    const btn = document.createElement('button');
    btn.className = `day-card ${done ? 'completed' : ''} ${isToday ? 'today' : ''}`;
    btn.dataset.date = iso;
    btn.innerHTML = `<h3>${date.toDateString()}</h3><p>${done ? 'Completed & Locked' : 'Tap to fill'} · ${remaining} day(s) remaining to Oct 8, 2030</p>`;
    btn.addEventListener('click', () => openDayForm(iso));
    el.daysList.appendChild(btn);
  });

  const todayEl = el.daysList.querySelector(`[data-date="${todayISO}"]`);
  if (todayEl) todayEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function rangeFor(type) {
  const now = new Date(); now.setHours(0, 0, 0, 0);
  let s; let e;
  const dow = now.getDay();
  if (type === 'thisWeek') { s = new Date(now); s.setDate(now.getDate() - dow); e = new Date(s); e.setDate(s.getDate() + 6); }
  if (type === 'lastWeek') { e = new Date(now); e.setDate(now.getDate() - dow - 1); s = new Date(e); s.setDate(e.getDate() - 6); }
  if (type === 'thisMonth') { s = new Date(now.getFullYear(), now.getMonth(), 1); e = new Date(now.getFullYear(), now.getMonth() + 1, 0); }
  if (type === 'lastMonth') { s = new Date(now.getFullYear(), now.getMonth() - 1, 1); e = new Date(now.getFullYear(), now.getMonth(), 0); }
  return { start: s, end: e };
}

function showSummary(type) {
  if (!type) { el.summaryPanel.classList.add('hidden'); el.summaryPanel.innerHTML = ''; return; }
  const { start, end } = rangeFor(type);
  const rows = Object.values(state.entries).filter((e) => {
    const d = new Date(`${e.date}T00:00:00`);
    return d >= start && d <= end;
  });
  const completed = rows.filter((r) => r.locked).length;
  const avgScore = rows.length ? Math.round(rows.reduce((a, r) => a + Number(r.finalDailyScore || 0), 0) / rows.length) : 0;
  const doneTasks = rows.flatMap((r) => parseLines(r.tasksCompleted || '')).slice(0, 20);
  el.summaryPanel.innerHTML = `<strong>${type}</strong><br/>Entries: ${rows.length} · Completed: ${completed} · Avg score: ${avgScore}<br/>Things done: ${doneTasks.length ? doneTasks.join(', ') : 'None yet'}`;
  el.summaryPanel.classList.remove('hidden');
}

function renderConfigForm() { el.weekdayConfigContainer.innerHTML = ''; WEEKDAYS.forEach((w) => { const f = document.createElement('fieldset'); f.innerHTML = `<legend>${w}</legend><label>Workout Plan<input name="${w}_workout" value="${state.weeklyConfig[w]?.workout || ''}" /></label><label>Diet Plan<input name="${w}_diet" value="${state.weeklyConfig[w]?.diet || ''}" /></label>`; el.weekdayConfigContainer.appendChild(f); }); }
function openDayForm(iso) {
  state.activeDateISO = iso;
  const existing = state.entries[iso] || {}; const weekday = WEEKDAYS[new Date(`${iso}T00:00:00`).getDay()];
  el.formDateTitle.textContent = `Entry: ${iso}`;
  const data = { ...existing, workoutPlanned: existing.workoutPlanned || state.weeklyConfig[weekday]?.workout || '', dietPlanned: existing.dietPlanned || state.weeklyConfig[weekday]?.diet || '' };
  [...el.dayForm.elements].forEach((input) => { if (input.name) input.value = data[input.name] || ''; });
  const isLocked = !!existing.locked;
  [...el.dayForm.elements].forEach((input) => { if (!['', 'workoutPlanned', 'dietPlanned'].includes(input.name)) input.disabled = isLocked; });
  el.submitBtn.disabled = isLocked; el.submitBtn.textContent = isLocked ? 'Locked after submission' : 'Save & Lock Day';
  updateScorePreview(data); el.dayDialog.showModal();
}

const updateScorePreview = (data) => { const s = computeScores(data); el.scorePreview.innerHTML = `Task Completion: <strong>${s.taskCompletion}%</strong> · Workout: <strong>${s.workoutScore}</strong> · Diet: <strong>${s.dietScore}</strong> · Final: <strong>${s.finalDailyScore}</strong>`; };

async function submitEntry(evt) {
  evt.preventDefault();
  const payload = Object.fromEntries(new FormData(el.dayForm).entries());
  const entry = { ...payload, ...computeScores(payload), date: state.activeDateISO, locked: true, updatedAt: new Date().toISOString() };
  state.entries[state.activeDateISO] = entry; localStorage.setItem(STORAGE_KEYS.entries, JSON.stringify(state.entries));
  try { await fetch(API_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(entry) }); } catch (e) { console.warn('Sync failed; saved locally.', e); }
  el.dayDialog.close(); renderDays(); showSummary(el.summaryRange.value);
}

function saveWeeklyConfig(evt) { evt.preventDefault(); const f = new FormData(el.configForm); WEEKDAYS.forEach((d) => { state.weeklyConfig[d] = { workout: f.get(`${d}_workout`) || '', diet: f.get(`${d}_diet`) || '' }; }); localStorage.setItem(STORAGE_KEYS.config, JSON.stringify(state.weeklyConfig)); el.configDialog.close(); }
function registerSW() { if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(console.warn); }

el.dayForm.addEventListener('input', () => updateScorePreview(Object.fromEntries(new FormData(el.dayForm).entries())));
el.dayForm.addEventListener('submit', submitEntry);
el.closeDayDialog.addEventListener('click', () => el.dayDialog.close());
el.openConfigBtn.addEventListener('click', () => { renderConfigForm(); el.configDialog.showModal(); });
el.closeConfigDialog.addEventListener('click', () => el.configDialog.close());
el.configForm.addEventListener('submit', saveWeeklyConfig);
el.viewWindowBtn.addEventListener('click', () => { state.showAll = false; renderDays(); });
el.viewAllBtn.addEventListener('click', () => { state.showAll = true; renderDays(); });
el.summaryRange.addEventListener('change', (e) => showSummary(e.target.value));

state.days = generateDays();
renderDays();
registerSW();
