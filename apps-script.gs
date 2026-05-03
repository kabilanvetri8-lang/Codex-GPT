const SHEET_NAME = 'Entries';
const KEYS = [
  'date','plan','tasksCompleted','workoutPlanned','workoutDone','dietPlanned','dietFollowed',
  'expenseItems','expenseTotal','note','taskCompletion','workoutScore','dietScore','finalDailyScore','locked','updatedAt'
];

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents || '{}');
    const sheet = getSheet_();
    const normalized = { ...data, expenseItems: JSON.stringify(data.expenseItems || []) };
    const row = KEYS.map((k) => normalized[k] ?? '');

    const existingRow = findRowByDate_(sheet, data.date);
    if (existingRow > 0) {
      const locked = String(sheet.getRange(existingRow, KEYS.indexOf('locked') + 1).getValue()).toLowerCase() === 'true';
      if (locked) return json_({ ok: false, message: 'Entry locked; no updates allowed.' });
      sheet.getRange(existingRow, 1, 1, KEYS.length).setValues([row]);
      return json_({ ok: true, updated: true });
    }
    sheet.appendRow(row);
    return json_({ ok: true, created: true });
  } catch (err) {
    return json_({ ok: false, error: err.message });
  }
}

function doGet() { return json_({ ok: true, service: 'goal-tracker-backend' }); }

function getSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) { sheet = ss.insertSheet(SHEET_NAME); sheet.appendRow(KEYS); }
  return sheet;
}

function findRowByDate_(sheet, dateStr) {
  if (!dateStr) return -1;
  const rowCount = Math.max(sheet.getLastRow() - 1, 0);
  if (!rowCount) return -1;
  const values = sheet.getRange(2, 1, rowCount, 1).getValues();
  for (let i = 0; i < values.length; i++) if (String(values[i][0]) === String(dateStr)) return i + 2;
  return -1;
}

function json_(obj) { return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON); }
