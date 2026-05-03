const DAYS_TO_TRACK = 1619;
const END_DATE = new Date('2030-10-30T00:00:00');
const API_URL = 'https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec';

const STORAGE_KEYS = {
  entries: 'dayTrackerEntries',
  config: 'dayTrackerWeeklyConfig'
};

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const defaultConfig = WEEKDAYS.reduce((acc, day) => {
  acc[day] = { workout: '', diet: '' };
  return acc;
}, {});

const state = {
  today: new Date(),
  days: [],
  entries: JSON.parse(localStorage.getItem(STORAGE_KEYS.entries) || '{}'),
  weeklyConfig: JSON.parse(localStorage.getItem(STORAGE_KEYS.config) || 'null') || defaultConfig,
  activeDateISO: null
};

const el = {
  daysList: document.getElementById('daysList'),
  dayDialog: document.getElementById('dayDialog'),
  dayForm: document.getElementById('dayForm'),
  formDateTitle: document.getElementById('formDateTitle'),
  closeDayDialog: document.getElementById('closeDayDialog'),
  submitBtn: document.getElementById('submitBtn'),
  scorePreview: document.getElementById('scorePreview'),
  configDialog: document.getElementById('configDialog'),
  configForm: document.getElementById('configForm'),
  weekdayConfigContainer: document.getElementById('weekdayConfigContainer'),
  openConfigBtn: document.getElementById('openConfigBtn'),
  closeConfigDialog: document.getElementById('closeConfigDialog')
};

function toISODate(date) {
  return date.toISOString().slice(0, 10);
}

function parseLines(text) {
  return text.split('\n').map(v => v.trim()).filter(Boolean);
}

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
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const days = [];
  for (let i = 0; i < DAYS_TO_TRACK; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    if (d > END_DATE) break;
    days.push(d);
  }
  return days;
}

function renderDays() {
  el.daysList.innerHTML = '';
  const todayISO = toISODate(state.today);
  state.days.forEach((date) => {
    const iso = toISODate(date);
    const done = state.entries[iso]?.locked;
    const isToday = iso === todayISO;
    const btn = document.createElement('button');
    btn.className = `day-card ${done ? 'completed' : ''} ${isToday ? 'today' : ''}`;
    btn.dataset.date = iso;
    btn.innerHTML = `<h3>${date.toDateString()}</h3><p>${done ? 'Completed & Locked' : 'Tap to fill'}</p>`;
    btn.addEventListener('click', () => openDayForm(iso));
    el.daysList.appendChild(btn);
  });

  const todayEl = el.daysList.querySelector(`[data-date="${todayISO}"]`);
  if (todayEl) todayEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function renderConfigForm() {
  el.weekdayConfigContainer.innerHTML = '';
  WEEKDAYS.forEach((weekday) => {
    const wrap = document.createElement('fieldset');
    wrap.innerHTML = `
      <legend>${weekday}</legend>
      <label>Workout Plan<input name="${weekday}_workout" value="${state.weeklyConfig[weekday]?.workout || ''}" /></label>
      <label>Diet Plan<input name="${weekday}_diet" value="${state.weeklyConfig[weekday]?.diet || ''}" /></label>`;
    el.weekdayConfigContainer.appendChild(wrap);
  });
}

function openDayForm(iso) {
  state.activeDateISO = iso;
  const existing = state.entries[iso] || {};
  const weekday = WEEKDAYS[new Date(`${iso}T00:00:00`).getDay()];
  el.formDateTitle.textContent = `Entry: ${iso}`;

  const data = {
    ...existing,
    workoutPlanned: existing.workoutPlanned || state.weeklyConfig[weekday]?.workout || '',
    dietPlanned: existing.dietPlanned || state.weeklyConfig[weekday]?.diet || ''
  };

  [...el.dayForm.elements].forEach((input) => {
    if (input.name) input.value = data[input.name] || '';
  });

  const isLocked = !!existing.locked;
  [...el.dayForm.elements].forEach((input) => {
    if (!['', 'workoutPlanned', 'dietPlanned'].includes(input.name)) input.disabled = isLocked;
  });
  el.submitBtn.disabled = isLocked;
  el.submitBtn.textContent = isLocked ? 'Locked after submission' : 'Save & Lock Day';

  updateScorePreview(data);
  el.dayDialog.showModal();
}

function updateScorePreview(data) {
  const scores = computeScores(data);
  el.scorePreview.innerHTML = `Task Completion: <strong>${scores.taskCompletion}%</strong> · Workout: <strong>${scores.workoutScore}</strong> · Diet: <strong>${scores.dietScore}</strong> · Final: <strong>${scores.finalDailyScore}</strong>`;
}

async function submitEntry(evt) {
  evt.preventDefault();
  const formData = new FormData(el.dayForm);
  const payload = Object.fromEntries(formData.entries());
  const scores = computeScores(payload);
  const entry = { ...payload, ...scores, date: state.activeDateISO, locked: true, updatedAt: new Date().toISOString() };

  state.entries[state.activeDateISO] = entry;
  localStorage.setItem(STORAGE_KEYS.entries, JSON.stringify(state.entries));

  try {
    await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(entry)
    });
  } catch (error) {
    console.warn('Sync failed; saved locally for retry.', error);
  }

  el.dayDialog.close();
  renderDays();
}

function saveWeeklyConfig(evt) {
  evt.preventDefault();
  const formData = new FormData(el.configForm);
  WEEKDAYS.forEach((day) => {
    state.weeklyConfig[day] = {
      workout: formData.get(`${day}_workout`) || '',
      diet: formData.get(`${day}_diet`) || ''
    };
  });
  localStorage.setItem(STORAGE_KEYS.config, JSON.stringify(state.weeklyConfig));
  el.configDialog.close();
}

function registerSW() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(console.warn);
  }
}

el.dayForm.addEventListener('input', () => {
  const data = Object.fromEntries(new FormData(el.dayForm).entries());
  updateScorePreview(data);
});
el.dayForm.addEventListener('submit', submitEntry);
el.closeDayDialog.addEventListener('click', () => el.dayDialog.close());
el.openConfigBtn.addEventListener('click', () => { renderConfigForm(); el.configDialog.showModal(); });
el.closeConfigDialog.addEventListener('click', () => el.configDialog.close());
el.configForm.addEventListener('submit', saveWeeklyConfig);

state.days = generateDays();
renderDays();
registerSW();
