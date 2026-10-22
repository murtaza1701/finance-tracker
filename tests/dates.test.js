import { test, assert, assertEqual } from './harness.js';
import { addDays, dayLabel, daysInMonth, isValidISODate, isValidMonth, monthLabel, shiftMonth, toISODate } from '../src/dates.js';

test('toISODate uses the local date, even late in the evening', () => {
  assertEqual(toISODate(new Date(2026, 0, 5, 23, 59)), '2026-01-05');
  assertEqual(toISODate(new Date(2026, 11, 31, 0, 1)), '2026-12-31');
});

test('isValidISODate rejects impossible dates and wrong formats', () => {
  assert(isValidISODate('2024-02-29'), 'leap day 2024');
  assert(!isValidISODate('2026-02-29'), 'no leap day in 2026');
  assert(!isValidISODate('2026-02-30'));
  assert(!isValidISODate('2026-13-01'));
  assert(!isValidISODate('26-1-1'));
  assert(!isValidISODate(20260101));
  assert(!isValidISODate(null));
});

test('isValidMonth only accepts YYYY-MM', () => {
  assert(isValidMonth('2026-10'));
  assert(!isValidMonth('2026-13'));
  assert(!isValidMonth('2026-1'));
  assert(!isValidMonth('all'));
});

test('shiftMonth moves across year boundaries', () => {
  assertEqual(shiftMonth('2026-01', -1), '2025-12');
  assertEqual(shiftMonth('2025-12', 1), '2026-01');
  assertEqual(shiftMonth('2026-10', -12), '2025-10');
  assertEqual(shiftMonth('2026-10', 0), '2026-10');
  assertEqual(shiftMonth('2026-03', -27), '2023-12');
});

test('daysInMonth knows about leap years', () => {
  assertEqual(daysInMonth('2024-02'), 29);
  assertEqual(daysInMonth('2026-02'), 28);
  assertEqual(daysInMonth('2026-10'), 31);
  assertEqual(daysInMonth('2026-11'), 30);
});

test('addDays crosses month and year boundaries', () => {
  assertEqual(addDays('2026-11-01', -1), '2026-10-31');
  assertEqual(addDays('2026-12-31', 1), '2027-01-01');
});

test('dayLabel says Today and Yesterday, otherwise shows the date', () => {
  assertEqual(dayLabel('2026-10-22', '2026-10-22'), 'Today');
  assertEqual(dayLabel('2026-10-31', '2026-11-01'), 'Yesterday');
  const older = dayLabel('2026-10-20', '2026-10-22');
  assert(older.includes('20') && older.includes('Oct'), `got "${older}"`);
  assert(dayLabel('2025-10-20', '2026-10-22').includes('2025'), 'shows the year for earlier years');
});

test('monthLabel writes the month in English', () => {
  assertEqual(monthLabel('2026-10'), 'October 2026');
  assertEqual(monthLabel('2026-01', { short: true }), 'Jan');
});
