// Date helpers.
// Dates are stored as "YYYY-MM-DD" strings and months as "YYYY-MM" strings, always in
// the user's local time zone. (toISOString() would convert to UTC, which moves a
// transaction added late in the evening in Norway to the next day.)

const UI_LOCALE = 'en-GB'; // English names, day before month: "Wed 22 Oct"

export function toISODate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function todayISO(now = new Date()) {
  return toISODate(now);
}

export function parseISODate(iso) {
  const [year, month, day] = iso.split('-').map(Number);
  return new Date(year, month - 1, day);
}

export function isValidISODate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  return toISODate(parseISODate(value)) === value; // rejects e.g. 2026-02-30
}

export function isValidMonth(value) {
  return typeof value === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

export function addDays(iso, days) {
  const date = parseISODate(iso);
  date.setDate(date.getDate() + days);
  return toISODate(date);
}

export function monthOf(iso) {
  return iso.slice(0, 7);
}

export function currentMonth(now = new Date()) {
  return monthOf(toISODate(now));
}

export function shiftMonth(month, delta) {
  const [year, mon] = month.split('-').map(Number);
  const index = year * 12 + (mon - 1) + delta;
  const newYear = Math.floor(index / 12);
  const newMonth = index - newYear * 12 + 1;
  return `${newYear}-${String(newMonth).padStart(2, '0')}`;
}

export function daysInMonth(month) {
  const [year, mon] = month.split('-').map(Number);
  return new Date(year, mon, 0).getDate();
}

export function dayOfMonth(iso) {
  return Number(iso.slice(8, 10));
}

/** "October 2026", or just "Oct" with { short: true }. */
export function monthLabel(month, { short = false } = {}) {
  const [year, mon] = month.split('-').map(Number);
  const options = short ? { month: 'short' } : { month: 'long', year: 'numeric' };
  return new Intl.DateTimeFormat(UI_LOCALE, options).format(new Date(year, mon - 1, 1));
}

/** "Today", "Yesterday" or e.g. "Mon 20 Oct" (with the year if it isn't this year). */
export function dayLabel(iso, today = todayISO()) {
  if (iso === today) return 'Today';
  if (iso === addDays(today, -1)) return 'Yesterday';
  const options = { weekday: 'short', day: 'numeric', month: 'short' };
  if (iso.slice(0, 4) !== today.slice(0, 4)) options.year = 'numeric';
  return new Intl.DateTimeFormat(UI_LOCALE, options).format(parseISODate(iso));
}
