// Safe HTML templates.
// Views are written as html`<p>${note}</p>`: every ${value} is escaped unless it is
// itself an html`` template or raw(), so text typed by the user (like a transaction
// note) can never inject markup or scripts into the page.

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ESCAPES[char]);
}

class SafeHtml {
  constructor(text) {
    this.text = text;
  }

  toString() {
    return this.text;
  }
}

/** Marks a string as trusted HTML. Only use it for markup written in this code base (e.g. icons). */
export function raw(text) {
  return new SafeHtml(String(text));
}

export function html(strings, ...values) {
  let out = strings[0];
  for (let i = 0; i < values.length; i++) out += toHtml(values[i]) + strings[i + 1];
  return new SafeHtml(out);
}

function toHtml(value) {
  if (value instanceof SafeHtml) return value.text;
  if (Array.isArray(value)) return value.map(toHtml).join('');
  if (value === null || value === undefined || value === false) return '';
  return escapeHtml(value);
}
