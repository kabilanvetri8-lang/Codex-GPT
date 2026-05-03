const DAYS_TO_TRACK = 1619;
const END_DATE = new Date('2030-10-08T00:00:00');
const API_URL = 'https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec';
const WINDOW_BEFORE = 10;
const WINDOW_AFTER = 7;

const STORAGE_KEYS = { entries: 'goalTrackerEntries', config: 'goalTrackerWeeklyConfig', goals: 'goalTrackerGoals' };
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const EXPENSE_CATEGORIES = ['Essentials', 'Lifestyle', 'Savings'];
const defaultConfig = WEEKDAYS.reduce((a, d) => ((a[d] = { workout: '', diet: '' }), a), {});

const state = {
  today: new Date(), days: [], activeDateISO: null, showAll: false, pendingLock: false,
  entries: JSON.parse(localStorage.getItem(STORAGE_KEYS.entries) || '{}'),
  weeklyConfig: JSON.parse(localStorage.getItem(STORAGE_KEYS.config) || 'null') || defaultConfig,
  goals: JSON.parse(localStorage.getItem(STORAGE_KEYS.goals) || '{"weeklyGoal":"","monthlyGoal":"","endGoal":""}')
};

const el = {
  daysList: document.getElementById('daysList'), summaryPanel: document.getElementById('summaryPanel'), summaryRange: document.getElementById('summaryRange'),
  viewWindowBtn: document.getElementById('viewWindowBtn'), viewAllBtn: document.getElementById('viewAllBtn'), expenseItems: document.getElementById('expenseItems'),
  addExpenseBtn: document.getElementById('addExpenseBtn'), saveBtn: document.getElementById('saveBtn'), lockBtn: document.getElementById('lockBtn'),
  weeklyGoalText: document.getElementById('weeklyGoalText'), monthlyGoalText: document.getElementById('monthlyGoalText'), endGoalText: document.getElementById('endGoalText'),
  editGoalsBtn: document.getElementById('editGoalsBtn'), goalsDialog: document.getElementById('goalsDialog'), goalsForm: document.getElementById('goalsForm'), closeGoalsDialog: document.getElementById('closeGoalsDialog'),
  dayDialog: document.getElementById('dayDialog'), dayForm: document.getElementById('dayForm'), formDateTitle: document.getElementById('formDateTitle'), closeDayDialog: document.getElementById('closeDayDialog'), scorePreview: document.getElementById('scorePreview'),
  configDialog: document.getElementById('configDialog'), configForm: document.getElementById('configForm'), weekdayConfigContainer: document.getElementById('weekdayConfigContainer'), openConfigBtn: document.getElementById('openConfigBtn'), closeConfigDialog: document.getElementById('closeConfigDialog')
};

const toISODate = (d) => d.toISOString().slice(0, 10);
const parseLines = (t = '') => t.split('\n').map((v) => v.trim()).filter(Boolean);
const dayDiff = (a, b) => Math.ceil((b - a) / 86400000);

function computeScores(payload) {
  const completed = parseLines(payload.tasksCompleted).length;
  const taskCompletion = Math.min(100, completed * 20);
  const workoutScore = payload.workoutDone === 'yes' ? 100 : 0;
  const dietScore = payload.dietFollowed === 'yes' ? 100 : 0;
  const finalDailyScore = Math.round(taskCompletion * 0.4 + workoutScore * 0.3 + dietScore * 0.3);
  return { taskCompletion, workoutScore, dietScore, finalDailyScore };
}

function generateDays() {
  const start = new Date(); start.setHours(0, 0, 0, 0);
  const days = [];
  for (let i = 0; i < DAYS_TO_TRACK; i++) { const d = new Date(start); d.setDate(start.getDate() + i); if (d > END_DATE) break; days.push(d); }
  return days;
}

function getVisibleDays() {
  if (state.showAll) return state.days;
  const idx = state.days.findIndex((d) => toISODate(d) === toISODate(state.today));
  return state.days.slice(Math.max(0, idx - WINDOW_BEFORE), Math.min(state.days.length, idx + WINDOW_AFTER + 1));
}

function renderDays() {
  el.daysList.innerHTML = '';
  const todayISO = toISODate(state.today);
  getVisibleDays().forEach((date) => {
    const iso = toISODate(date); const locked = state.entries[iso]?.locked; const isToday = iso === todayISO;
    const btn = document.createElement('button'); btn.className = `day-card ${locked ? 'locked' : ''} ${isToday ? 'today' : ''}`; btn.dataset.date = iso;
    btn.innerHTML = `<h3>${date.toDateString()}</h3><p>${locked ? 'Locked Day' : 'Open Day'} · ${Math.max(0, dayDiff(date, END_DATE))} day(s) remaining</p>`;
    btn.addEventListener('click', () => openDayForm(iso)); el.daysList.appendChild(btn);
  });
}

function addExpenseRow(item = { category: 'Essentials', amount: '', detail: '' }) {
  const row = document.createElement('div'); row.className = 'expense-row';
  row.innerHTML = `<select class="expense-category">${EXPENSE_CATEGORIES.map((c) => `<option ${c === item.category ? 'selected' : ''}>${c}</option>`).join('')}</select>
  <input class="expense-amount" type="number" min="0" step="0.01" value="${item.amount}" placeholder="Amount"/>
  <input class="expense-detail" value="${item.detail}" placeholder="Short detail"/>
  <button type="button" class="icon-btn">✕</button>`;
  row.querySelector('.icon-btn').addEventListener('click', () => { row.remove(); recalcExpenseTotal(); });
  row.querySelectorAll('input,select').forEach((i) => i.addEventListener('input', recalcExpenseTotal));
  el.expenseItems.appendChild(row);
}

function getExpenseItems() {
  return [...el.expenseItems.querySelectorAll('.expense-row')].map((r) => ({
    category: r.querySelector('.expense-category').value,
    amount: Number(r.querySelector('.expense-amount').value || 0),
    detail: r.querySelector('.expense-detail').value || ''
  })).filter((x) => x.amount > 0 || x.detail);
}

function recalcExpenseTotal() {
  const total = getExpenseItems().reduce((a, x) => a + x.amount, 0);
  el.dayForm.elements.expenseTotal.value = total.toFixed(2);
}

function openDayForm(iso) {
  state.activeDateISO = iso;
  const existing = state.entries[iso] || {}; const weekday = WEEKDAYS[new Date(`${iso}T00:00:00`).getDay()];
  const data = { ...existing, workoutPlanned: existing.workoutPlanned || state.weeklyConfig[weekday]?.workout || '', dietPlanned: existing.dietPlanned || state.weeklyConfig[weekday]?.diet || '' };
  el.formDateTitle.textContent = `Entry: ${iso}`;
  ['plan', 'tasksCompleted', 'workoutPlanned', 'workoutDone', 'dietPlanned', 'dietFollowed', 'note'].forEach((n) => { if (el.dayForm.elements[n]) el.dayForm.elements[n].value = data[n] || ''; });
  el.expenseItems.innerHTML = ''; (existing.expenseItems || [{ category: 'Essentials', amount: '', detail: '' }]).forEach(addExpenseRow); recalcExpenseTotal();

  const isLocked = !!existing.locked;
  [...el.dayForm.elements].forEach((input) => { if (input.name !== '') input.disabled = isLocked; });
  el.addExpenseBtn.disabled = isLocked; el.saveBtn.disabled = isLocked; el.lockBtn.disabled = isLocked;
  el.lockBtn.textContent = isLocked ? 'Day Locked' : 'Save & Lock Day';
  updateScorePreview(data); el.dayDialog.showModal();
}

function updateScorePreview(data) { const s = computeScores(data); el.scorePreview.innerHTML = `Tasks: <strong>${s.taskCompletion}%</strong> · Workout: <strong>${s.workoutScore}</strong> · Diet: <strong>${s.dietScore}</strong> · Final: <strong>${s.finalDailyScore}</strong>`; }

async function persistEntry(lockDay) {
  const payload = Object.fromEntries(new FormData(el.dayForm).entries());
  const entry = { ...payload, ...computeScores(payload), expenseItems: getExpenseItems(), date: state.activeDateISO, locked: !!lockDay, updatedAt: new Date().toISOString() };
  recalcExpenseTotal();
  state.entries[state.activeDateISO] = entry; localStorage.setItem(STORAGE_KEYS.entries, JSON.stringify(state.entries));
  try { await fetch(API_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(entry) }); } catch (e) { console.warn('Sync failed', e); }
  renderDays(); showSummary(el.summaryRange.value);
}

async function submitEntry(evt) { evt.preventDefault(); await persistEntry(true); el.dayDialog.close(); }

function renderConfigForm() { el.weekdayConfigContainer.innerHTML = ''; WEEKDAYS.forEach((w) => { const f = document.createElement('fieldset'); f.innerHTML = `<legend>${w}</legend><label>Workout Plan<textarea name="${w}_workout">${state.weeklyConfig[w]?.workout || ''}</textarea></label><label>Diet Plan<textarea name="${w}_diet">${state.weeklyConfig[w]?.diet || ''}</textarea></label>`; el.weekdayConfigContainer.appendChild(f); }); }
function saveWeeklyConfig(evt) { evt.preventDefault(); const f = new FormData(el.configForm); WEEKDAYS.forEach((d) => { state.weeklyConfig[d] = { workout: f.get(`${d}_workout`) || '', diet: f.get(`${d}_diet`) || '' }; }); localStorage.setItem(STORAGE_KEYS.config, JSON.stringify(state.weeklyConfig)); el.configDialog.close(); }

function renderGoals() { el.weeklyGoalText.textContent = state.goals.weeklyGoal || 'Not set'; el.monthlyGoalText.textContent = state.goals.monthlyGoal || 'Not set'; el.endGoalText.textContent = state.goals.endGoal || 'Not set'; }
function openGoalsDialog() { el.goalsForm.elements.weeklyGoal.value = state.goals.weeklyGoal || ''; el.goalsForm.elements.monthlyGoal.value = state.goals.monthlyGoal || ''; el.goalsForm.elements.endGoal.value = state.goals.endGoal || ''; el.goalsDialog.showModal(); }
function saveGoals(evt) { evt.preventDefault(); const f = new FormData(el.goalsForm); state.goals = { weeklyGoal: f.get('weeklyGoal') || '', monthlyGoal: f.get('monthlyGoal') || '', endGoal: f.get('endGoal') || '' }; localStorage.setItem(STORAGE_KEYS.goals, JSON.stringify(state.goals)); renderGoals(); el.goalsDialog.close(); }

function rangeFor(type) { const now = new Date(); now.setHours(0, 0, 0, 0); let s; let e; const dow = now.getDay(); if (type === 'thisWeek') { s = new Date(now); s.setDate(now.getDate() - dow); e = new Date(s); e.setDate(s.getDate() + 6); } if (type === 'lastWeek') { e = new Date(now); e.setDate(now.getDate() - dow - 1); s = new Date(e); s.setDate(e.getDate() - 6); } if (type === 'thisMonth') { s = new Date(now.getFullYear(), now.getMonth(), 1); e = new Date(now.getFullYear(), now.getMonth() + 1, 0); } if (type === 'lastMonth') { s = new Date(now.getFullYear(), now.getMonth() - 1, 1); e = new Date(now.getFullYear(), now.getMonth(), 0); } return { start: s, end: e }; }
function showSummary(type) { if (!type) { el.summaryPanel.classList.add('hidden'); el.summaryPanel.innerHTML = ''; return; } const { start, end } = rangeFor(type); const rows = Object.values(state.entries).filter((e) => { const d = new Date(`${e.date}T00:00:00`); return d >= start && d <= end; }); const doneTasks = rows.flatMap((r) => parseLines(r.tasksCompleted || '')).slice(0, 20); el.summaryPanel.innerHTML = `<strong>${type}</strong><br/>Entries: ${rows.length} · Locked: ${rows.filter((r) => r.locked).length}<br/>Things done: ${doneTasks.length ? doneTasks.join(', ') : 'None yet'}`; el.summaryPanel.classList.remove('hidden'); }

function registerSW() { if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(console.warn); }

el.addExpenseBtn.addEventListener('click', () => addExpenseRow());
el.saveBtn.addEventListener('click', async () => { await persistEntry(false); el.dayDialog.close(); });
el.dayForm.addEventListener('input', () => updateScorePreview(Object.fromEntries(new FormData(el.dayForm).entries())));
el.dayForm.addEventListener('submit', submitEntry);
el.closeDayDialog.addEventListener('click', () => el.dayDialog.close());
el.openConfigBtn.addEventListener('click', () => { renderConfigForm(); el.configDialog.showModal(); });
el.closeConfigDialog.addEventListener('click', () => el.configDialog.close());
el.configForm.addEventListener('submit', saveWeeklyConfig);
el.viewWindowBtn.addEventListener('click', () => { state.showAll = false; renderDays(); });
el.viewAllBtn.addEventListener('click', () => { state.showAll = true; renderDays(); });
el.summaryRange.addEventListener('change', (e) => showSummary(e.target.value));
el.editGoalsBtn.addEventListener('click', openGoalsDialog); el.closeGoalsDialog.addEventListener('click', () => el.goalsDialog.close()); el.goalsForm.addEventListener('submit', saveGoals);

state.days = generateDays();
renderGoals();
renderDays();
registerSW();
