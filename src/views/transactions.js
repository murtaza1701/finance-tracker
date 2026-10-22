// Transaksjoner: alle inntekter og utgifter, gruppert per dag, med filtre og søk.
import { CATEGORIES, categoriesFor, getCategory } from '../categories.js';
import { dayLabel, monthLabel } from '../dates.js';
import { filterTransactions, groupByDate, monthsWithData, summarize } from '../finance.js';
import { html } from '../html.js';
import { icon } from '../icons.js';
import { formatMoney } from '../money.js';
import { emptyState, pageHeader, transactionRow } from './shared.js';

const TYPES = [
  ['all', 'Alle'],
  ['expense', 'Utgifter'],
  ['income', 'Inntekter'],
];

export function renderTransactions({ state, ui, today, thisMonth }) {
  const { transactions, settings } = state;
  const currency = settings.currency;
  const filters = ui.filters;

  if (transactions.length === 0) {
    return html`${pageHeader('Transaksjoner')}
      <section class="card">
        ${emptyState({
          emoji: '🧾',
          title: 'Ingen transaksjoner ennå',
          text: 'Legg inn din første inntekt eller utgift – det tar bare noen sekunder.',
          actions: html`
            <button type="button" class="button button-primary" data-action="add-transaction">${icon('plus', { size: 18 })} Ny transaksjon</button>
            <button type="button" class="button button-secondary" data-action="load-demo">Prøv med eksempeldata</button>`,
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
    ${pageHeader('Transaksjoner', {
      actions: html`<button type="button" class="button button-secondary" data-action="export-csv" ${list.length ? '' : 'disabled'}>
        ${icon('download', { size: 18 })} Eksporter CSV</button>`,
    })}

    <div class="filters" role="search">
      <label class="visually-hidden" for="filter-month">Måned</label>
      <select class="input" id="filter-month" data-filter="month">
        <option value="all" ${filters.month === 'all' ? 'selected' : ''}>Hele perioden</option>
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

      <label class="visually-hidden" for="filter-category">Kategori</label>
      <select class="input" id="filter-category" data-filter="category">
        <option value="all">Alle kategorier</option>
        ${categories.map((c) => html`<option value="${c.id}" ${c.id === filters.category ? 'selected' : ''}>${c.icon} ${c.name}</option>`)}
      </select>

      <div class="search">
        ${icon('search', { size: 18 })}
        <label class="visually-hidden" for="filter-query">Søk</label>
        <input class="input" type="search" id="filter-query" data-filter="query" value="${filters.query}"
          placeholder="Søk i notater og kategorier" autocomplete="off">
      </div>
    </div>

    <p class="list-summary" aria-live="polite">
      <span>${list.length} ${list.length === 1 ? 'transaksjon' : 'transaksjoner'}</span>
      <span>Inn <strong>${formatMoney(totals.income, currency)}</strong></span>
      <span>Ut <strong>${formatMoney(totals.expense, currency)}</strong></span>
      ${isFiltered ? html`<button type="button" class="link-button" data-action="clear-filters">Nullstill filtre</button>` : ''}
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
            title: 'Fant ingenting',
            text: isFiltered ? 'Ingen transaksjoner passer med filtrene.' : `Ingen transaksjoner i ${monthLabel(filters.month).toLowerCase()}.`,
            actions: isFiltered
              ? html`<button type="button" class="button button-secondary" data-action="clear-filters">Nullstill filtre</button>`
              : html`<button type="button" class="button button-primary" data-action="add-transaction">${icon('plus', { size: 18 })} Ny transaksjon</button>`,
          })}
        </section>`}`;
}
