// Small pieces of markup used by several pages.
import { getCategory } from '../categories.js';
import { monthLabel } from '../dates.js';
import { html } from '../html.js';
import { icon } from '../icons.js';
import { formatMoney } from '../money.js';

export function pageHeader(title, { month = null, thisMonth = null, actions = '' } = {}) {
  return html`<header class="page-header">
    <h1>${title}</h1>
    <div class="page-actions">${month ? monthSwitcher(month, thisMonth) : ''}${actions}</div>
  </header>`;
}

function monthSwitcher(month, thisMonth) {
  return html`<div class="month-switcher" role="group" aria-label="Month">
    <button type="button" class="icon-button" id="month-prev" data-action="prev-month" aria-label="Previous month">${icon('chevron-left')}</button>
    <button type="button" class="month-label" id="month-current" data-action="this-month"
      title="${month === thisMonth ? 'This month' : 'Back to this month'}">${monthLabel(month)}</button>
    <button type="button" class="icon-button" id="month-next" data-action="next-month" aria-label="Next month">${icon('chevron-right')}</button>
  </div>`;
}

/** A transaction in a list; clicking it opens the edit dialog. */
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
