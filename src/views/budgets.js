// Budsjett: en månedlig grense per kategori og hvor mye av den som er brukt.
import { budgetMeter, statusBadge } from '../charts.js';
import { categoriesFor, getCategory } from '../categories.js';
import { dayOfMonth, daysInMonth, monthLabel } from '../dates.js';
import { budgetReport, dailyAllowance, monthProgress } from '../finance.js';
import { html } from '../html.js';
import { icon } from '../icons.js';
import { formatMoney } from '../money.js';
import { bankTabs, pageHeader } from './shared.js';

export function renderBudgets({ state, ui, today, thisMonth }) {
  const { transactions, budgets, settings } = state;
  const currency = settings.currency;
  const month = ui.month;
  const report = budgetReport(transactions, budgets, month);
  const pace = month === thisMonth ? monthProgress(month, today) : null;
  const money = (minor) => formatMoney(minor, currency, { whole: true });

  const spentWithoutBudget = new Map(report.unbudgeted.map((row) => [row.category, row.spent]));
  const withoutBudget = categoriesFor('expense')
    .filter((category) => !Object.hasOwn(budgets, category.id))
    .sort((a, b) => (spentWithoutBudget.get(b.id) ?? 0) - (spentWithoutBudget.get(a.id) ?? 0));

  return html`
    ${pageHeader('Bank', { month, thisMonth })}
    ${bankTabs('budgets')}

    ${report.rows.length > 0 ? summaryCard(report.total, { month, today, thisMonth, pace, currency, money }) : intro()}

    ${report.rows.length > 0
      ? html`<section class="card">
          <header class="card-header">
            <div>
              <h2 class="card-title">Dine budsjetter</h2>
              <p class="card-subtitle">${pace === null ? `Forbruk i ${monthLabel(month).toLowerCase()}` : 'Streken på hver linje viser hvor langt ut i måneden vi er'}</p>
            </div>
          </header>
          <ul class="budget-list">${report.rows.map((row) => budgetRow(row, { currency, pace, money }))}</ul>
        </section>`
      : ''}

    <section class="card">
      <header class="card-header">
        <div>
          <h2 class="card-title">${report.rows.length > 0 ? 'Uten budsjett' : 'Kategorier'}</h2>
          <p class="card-subtitle">Forbruk i ${monthLabel(month).toLowerCase()}</p>
        </div>
        <button type="button" class="button button-secondary" id="suggest-budgets" data-action="suggest-budgets">
          ${icon('sparkle', { size: 18 })} Foreslå budsjetter
        </button>
      </header>
      ${withoutBudget.length > 0
        ? html`<ul class="plain-list">
            ${withoutBudget.map((category) => {
              const spent = spentWithoutBudget.get(category.id) ?? 0;
              return html`<li class="unbudgeted-row">
                <span class="cat-name"><span class="cat-icon" aria-hidden="true">${category.icon}</span>${category.name}</span>
                <span class="muted">${spent > 0 ? `${money(spent)} brukt` : 'Ingenting brukt'}</span>
                <button type="button" class="button button-small button-secondary" id="set-budget-${category.id}"
                  data-action="edit-budget" data-category="${category.id}">Sett budsjett</button>
              </li>`;
            })}
          </ul>`
        : html`<p class="muted-note">Alle kategoriene har budsjett.</p>`}
    </section>`;
}

function intro() {
  return html`<section class="card callout-card">
    <h2 class="card-title">Planlegg måneden</h2>
    <p>
      Gi en kategori en månedlig grense, så holder Pengeflyt styr på hvor mye du har brukt, varsler deg ved 80 %
      og forteller hvor mye du kan bruke per dag resten av måneden. Usikker på hvor du skal begynne?
      <strong>Foreslå budsjetter</strong> ser på hva du pleier å bruke.
    </p>
  </section>`;
}

function summaryCard(total, { month, today, thisMonth, pace, currency, money }) {
  let paceNote;
  if (month === thisMonth) {
    const day = dayOfMonth(today);
    const days = daysInMonth(month);
    const allowance = dailyAllowance(total.remaining, month, today);
    paceNote =
      total.remaining > 0
        ? `Dag ${day} av ${days}: du kan bruke rundt ${money(allowance)} per dag resten av måneden.`
        : `Dag ${day} av ${days}: budsjettet for denne måneden er brukt opp.`;
  } else if (month < thisMonth) {
    paceNote = total.remaining >= 0 ? `Du holdt deg ${money(total.remaining)} under budsjett.` : `Du gikk ${money(-total.remaining)} over budsjett.`;
  } else {
    paceNote = 'Denne måneden har ikke begynt ennå.';
  }
  const label = monthLabel(month).toLowerCase();
  let headline = `Igjen å bruke i ${label}`;
  if (total.remaining < 0) headline = `Over budsjett i ${label}`;
  else if (month < thisMonth) headline = `Under budsjett i ${label}`;
  else if (month > thisMonth) headline = `Budsjett for ${label}`;

  return html`<section class="card budget-summary">
    <div class="budget-summary-top">
      <div>
        <p class="hero-label">${headline}</p>
        <p class="summary-value">${money(Math.abs(total.remaining))}</p>
        <p class="muted">${money(total.spent)} brukt av ${money(total.limit)} budsjettert</p>
      </div>
      ${statusBadge(total.level)}
    </div>
    ${budgetMeter(total, { label: 'Alle budsjetter', currency, pace })}
    <p class="pace-note">${paceNote}</p>
  </section>`;
}

function budgetRow(row, { currency, pace, money }) {
  const { name, icon: emoji } = getCategory(row.category);
  return html`<li class="budget-row">
    <div class="budget-row-head">
      <span class="cat-name"><span class="cat-icon" aria-hidden="true">${emoji}</span>${name}</span>
      <button type="button" class="link-button" id="edit-budget-${row.category}" data-action="edit-budget"
        data-category="${row.category}" aria-label="Endre budsjett for ${name}">Endre</button>
    </div>
    <div class="budget-row-figures">
      <span><strong>${money(row.spent)}</strong> <span class="muted">av ${money(row.limit)}</span></span>
      <span class="muted">${row.remaining >= 0 ? `${money(row.remaining)} igjen` : `${money(-row.remaining)} over`}</span>
    </div>
    ${budgetMeter(row, { label: `Budsjett for ${name}`, currency, pace })}
    ${statusBadge(row.level)}
  </li>`;
}
