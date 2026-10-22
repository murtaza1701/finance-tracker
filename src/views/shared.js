// Små biter med markup som brukes på flere sider.
import { accountKind, findAccountType, movementLabel } from '../accounts.js';
import { getCategory } from '../categories.js';
import { dateLabel, monthLabel, timeLabel } from '../dates.js';
import { html } from '../html.js';
import { icon } from '../icons.js';
import { formatMoney, formatPercent, formatQuantity } from '../money.js';

export function pageHeader(title, { month = null, thisMonth = null, actions = '' } = {}) {
  return html`<header class="page-header">
    <h1>${title}</h1>
    <div class="page-actions">${month ? monthSwitcher(month, thisMonth) : ''}${actions}</div>
  </header>`;
}

function monthSwitcher(month, thisMonth) {
  return html`<div class="month-switcher" role="group" aria-label="Måned">
    <button type="button" class="icon-button" id="month-prev" data-action="prev-month" aria-label="Forrige måned">${icon('chevron-left')}</button>
    <button type="button" class="month-label" id="month-current" data-action="this-month"
      title="${month === thisMonth ? 'Denne måneden' : 'Tilbake til denne måneden'}">${monthLabel(month)}</button>
    <button type="button" class="icon-button" id="month-next" data-action="next-month" aria-label="Neste måned">${icon('chevron-right')}</button>
  </div>`;
}

/** En transaksjon i en liste; et klikk åpner redigering. */
export function transactionRow(t, currency) {
  const category = getCategory(t.category);
  const amount = t.type === 'income' ? formatMoney(t.amount, currency, { sign: true }) : formatMoney(-t.amount, currency);
  return html`<li>
    <button type="button" class="tx-row" id="tx-${t.id}" data-action="edit-transaction" data-id="${t.id}">
      <span class="tx-icon" aria-hidden="true">${category.icon}</span>
      <span class="tx-main">
        <span class="tx-title">${t.note || category.name}</span>
        ${t.note ? html`<span class="tx-sub">${category.name}</span>` : ''}
      </span>
      <span class="tx-amount ${t.type === 'income' ? 'is-income' : ''}">${amount}</span>
    </button>
  </li>`;
}

export function emptyState({ emoji, title, text, actions = '' }) {
  return html`<div class="empty">
    <div class="empty-emoji" aria-hidden="true">${emoji}</div>
    <h2>${title}</h2>
    <p>${text}</p>
    ${actions ? html`<div class="button-row">${actions}</div>` : ''}
  </div>`;
}

// ---------- Formue ----------

/** Tekst og stil for merket som viser om kursene er live. Brukes også når kursene oppdateres. */
export function liveStatus(feed) {
  const status = feed.status();
  const updatedAt = feed.updatedAt();
  const at = updatedAt ? timeLabel(new Date(updatedAt)) : null;
  const texts = {
    live: ['Live', 'Kryptokursene oppdateres i sanntid fra Binance'],
    loading: ['Henter kurser …', 'Henter kryptokurser'],
    ok: [at ? `Kurser kl. ${at}` : 'Kurser hentet', 'Kryptokursene oppdateres hvert minutt fra CoinGecko'],
    error: [at ? `Frakoblet – kurser fra kl. ${at}` : 'Fikk ikke hentet kurser', 'Får ikke kontakt med kurstjenestene akkurat nå'],
    idle: ['', ''],
  };
  const [text, title] = texts[status] ?? texts.idle;
  return { status, text, title };
}

export function liveChip(feed) {
  const { status, text, title } = liveStatus(feed);
  if (status === 'idle') return '';
  return html`<span class="live-chip live-${status}" data-live-status title="${title}">
    <span class="live-dot" aria-hidden="true"></span><span data-live-status-text>${text}</span>
  </span>`;
}

/** "+3 200 kr (+8 %)" – avkastning i kroner og prosent. */
export function gainText(gain, ratio, currency) {
  const amount = formatMoney(gain, currency, { whole: true, sign: true });
  return ratio === null ? amount : `${amount} (${formatPercent(ratio, { sign: true })})`;
}

/** "+12,6 % på det du har satt inn" */
export function gainRatioText(ratio) {
  return `${formatPercent(ratio, { sign: true })} på det du har satt inn`;
}

export const trendClass = (value) => (value > 0 ? 'is-up' : value < 0 ? 'is-down' : '');

/** "▲ 1,2 %" – døgnendring for en kurs. Pilen gjør at det ikke bare er fargen som forteller retningen. */
export function changeText(change24h) {
  if (typeof change24h !== 'number') return '–';
  const arrow = change24h > 0 ? '▲' : change24h < 0 ? '▼' : '';
  return `${arrow} ${formatPercent(Math.abs(change24h) / 100)}`.trim();
}

/** "0,0213 BTC · 0,5 ETH" */
export function holdingsText(holdings) {
  const entries = Object.entries(holdings);
  const shown = entries.slice(0, 3).map(([symbol, quantity]) => `${formatQuantity(quantity, { short: true })} ${symbol}`);
  if (entries.length > 3) shown.push(`+${entries.length - 3}`);
  return shown.join(' · ');
}

/** En bevegelse i en liste. Med showAccount vises kontonavnet først (på formuesiden). */
export function movementRow(m, account, currency, { showAccount = false, deletable = false } = {}) {
  const kind = accountKind(account);
  const label = movementLabel(m.kind, kind);
  const money = (minor, options) => formatMoney(minor, currency, options);
  let amount;
  let detail = '';
  let up = false;
  switch (m.kind) {
    case 'deposit':
      amount = money(m.amount, { sign: true });
      up = kind !== 'debt';
      break;
    case 'withdrawal':
      amount = money(-m.amount, { sign: true });
      break;
    case 'buy':
      amount = `+${formatQuantity(m.quantity)} ${m.asset}`;
      detail = `${money(m.amount)} betalt`;
      break;
    case 'sell':
      amount = `−${formatQuantity(m.quantity)} ${m.asset}`;
      detail = `${money(m.amount)} mottatt`;
      break;
    default:
      amount = money(m.amount);
  }
  const title = showAccount ? account?.name ?? 'Slettet konto' : m.note || label;
  const sub = [showAccount ? (m.note ? `${label}: ${m.note}` : label) : m.note ? label : null, dateLabel(m.date)].filter(Boolean).join(' · ');
  const iconText = findAccountType(account?.type)?.icon ?? '❔';
  const content = html`
    <span class="tx-icon" aria-hidden="true">${iconText}</span>
    <span class="tx-main">
      <span class="tx-title">${title}</span>
      <span class="tx-sub">${sub}</span>
    </span>
    <span class="tx-figures">
      <span class="tx-amount ${up ? 'is-income' : ''}">${amount}</span>
      ${detail ? html`<span class="tx-sub">${detail}</span>` : ''}
    </span>`;

  if (showAccount && account) {
    return html`<li><a class="tx-row" href="#/konto?id=${account.id}">${content}</a></li>`;
  }
  return html`<li class="movement-item">
    <div class="tx-row is-static">${content}</div>
    ${deletable
      ? html`<button type="button" class="icon-button movement-delete" id="delete-${m.id}" data-action="delete-movement" data-id="${m.id}"
          aria-label="Slett ${label.toLowerCase()} ${dateLabel(m.date)}" title="Slett">${icon('trash', { size: 18 })}</button>`
      : ''}
  </li>`;
}
