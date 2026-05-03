/**
 * Google Apps Script Web App backend.
 * 1) Create sheet named "Entries" with headers matching KEYS below.
 * 2) Deploy as Web App (Anyone with link).
 */
const SHEET_NAME = 'Entries';
const KEYS = [
  'date','plan','priorities','tasksPlanned','tasksCompleted',
  'workoutPlanned','workoutDone','workoutDetails','workoutDuration','workoutIntensity',
  'dietPlanned','dietFollowed','dietMeals','dietNotes',
  'expenseTotal','expenseCategories','reflection','wins','improvements',
  'taskCompletion','workoutScore','dietScore','finalDailyScore','locked','updatedAt'
];

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents || '{}');
    const sheet = getSheet_();
    const row = KEYS.map((k) => data[k] ?? '');

    const existingRow = findRowByDate_(sheet, data.date);
    if (existingRow > 0) {
      const locked = sheet.getRange(existingRow, KEYS.indexOf('locked') + 1).getValue();
      if (String(locked).toLowerCase() === 'true') {
        return json_({ ok: false, message: 'Entry locked; no updates allowed.' });
      }
      sheet.getRange(existingRow, 1, 1, KEYS.length).setValues([row]);
      return json_({ ok: true, updated: true });
    }

    sheet.appendRow(row);
    return json_({ ok: true, created: true });
  } catch (err) {
    return json_({ ok: false, error: err.message });
  }
}

function doGet() {
  return json_({ ok: true, service: 'day-tracker-backend' });
}

function getSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    sheet.appendRow(KEYS);
  }
  return sheet;
}

function findRowByDate_(sheet, dateStr) {
  if (!dateStr) return -1;
  const values = sheet.getRange(2, 1, Math.max(sheet.getLastRow() - 1, 0), 1).getValues();
  for (let i = 0; i < values.length; i++) {
    if (String(values[i][0]) === String(dateStr)) return i + 2;
  }
  return -1;
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
