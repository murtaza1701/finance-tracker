// Transactions page: every transaction, grouped by day, with filters and search.
import { CATEGORIES, categoriesFor, getCategory } from '../categories.js';
import { dayLabel, monthLabel } from '../dates.js';
import { filterTransactions, groupByDate, monthsWithData, summarize } from '../finance.js';
import { html } from '../html.js';
import { icon } from '../icons.js';
import { formatMoney } from '../money.js';
import { emptyState, pageHeader, transactionRow } from './shared.js';

const TYPES = [
  ['all', 'All'],
  ['expense', 'Expenses'],
  ['income', 'Income'],
];

export function renderTransactions({ state, ui, today, thisMonth }) {
  const { transactions, settings } = state;
  const currency = settings.currency;
  const filters = ui.filters;

  if (transactions.length === 0) {
    return html`${pageHeader('Transactions')}
      <section class="card">
        ${emptyState({
          emoji: '🧾',
          title: 'No transactions yet',
          text: 'Add your first income or expense – it only takes a few seconds.',
          actions: html`
            <button type="button" class="button button-primary" data-action="add-transaction">${icon('plus', { size: 18 })} Add transaction</button>
            <button type="button" class="button button-secondary" data-action="load-demo">Load demo data</button>`,
        })}
      </section>`;
  }

  const list = filterTransactions(transactions, filters, (id) => getCategory(id).name);
  const totals = summarize(list);
  const months = monthsWithData(transactions);
  for (const month of [thisMonth, filters.month]) {
    if (month !== 'all' && !months.includes(month)) months.push(month);
  }
  months.sort().reverse();
  const categories = filters.type === 'all' ? CATEGORIES : categoriesFor(filters.type);
  const isFiltered = filters.type !== 'all' || filters.category !== 'all' || filters.query.trim() !== '';

  return html`
    ${pageHeader('Transactions', {
      actions: html`<button type="button" class="button button-secondary" data-action="export-csv" ${list.length ? '' : 'disabled'}>
        ${icon('download', { size: 18 })} Export CSV</button>`,
    })}

    <div class="filters" role="search">
      <label class="visually-hidden" for="filter-month">Month</label>
      <select class="input" id="filter-month" data-filter="month">
        <option value="all" ${filters.month === 'all' ? 'selected' : ''}>All time</option>
        ${months.map((month) => html`<option value="${month}" ${month === filters.month ? 'selected' : ''}>${monthLabel(month)}</option>`)}
      </select>

      <fieldset class="segmented">
        <legend class="visually-hidden">Type</legend>
        ${TYPES.map(
          ([value, label]) => html`<label>
            <input type="radio" name="filter-type" id="filter-type-${value}" value="${value}" data-filter="type" ${filters.type === value ? 'checked' : ''}>
            <span>${label}</span>
          </label>`,
        )}
      </fieldset>

      <label class="visually-hidden" for="filter-category">Category</label>
      <select class="input" id="filter-category" data-filter="category">
        <option value="all">All categories</option>
        ${categories.map((c) => html`<option value="${c.id}" ${c.id === filters.category ? 'selected' : ''}>${c.icon} ${c.name}</option>`)}
      </select>

      <div class="search">
        ${icon('search', { size: 18 })}
        <label class="visually-hidden" for="filter-query">Search</label>
        <input class="input" type="search" id="filter-query" data-filter="query" value="${filters.query}"
          placeholder="Search notes and categories" autocomplete="off">
      </div>
    </div>

    <p class="list-summary" aria-live="polite">
      <span>${list.length} ${list.length === 1 ? 'transaction' : 'transactions'}</span>
      <span>In <strong>${formatMoney(totals.income, currency)}</strong></span>
      <span>Out <strong>${formatMoney(totals.expense, currency)}</strong></span>
      ${isFiltered ? html`<button type="button" class="link-button" data-action="clear-filters">Clear filters</button>` : ''}
    </p>

    ${list.length > 0
      ? html`<section class="card tx-card">
          ${groupByDate(list).map(
            (group) => html`<div class="day-group">
              <h2 class="day-header">
                <span>${dayLabel(group.date, today)}</span>
                <span class="day-total">${formatMoney(group.net, currency, { sign: true })}</span>
              </h2>
              <ul class="tx-list">${group.items.map((t) => transactionRow(t, currency))}</ul>
            </div>`,
          )}
        </section>`
      : html`<section class="card">
          ${emptyState({
            emoji: '🔍',
            title: 'Nothing found',
            text: isFiltered ? 'No transactions match these filters.' : `No transactions in ${monthLabel(filters.month)}.`,
            actions: isFiltered
              ? html`<button type="button" class="button button-secondary" data-action="clear-filters">Clear filters</button>`
              : html`<button type="button" class="button button-primary" data-action="add-transaction">${icon('plus', { size: 18 })} Add transaction</button>`,
          })}
        </section>`}`;
}
