// Budgets page: a monthly limit per category and how much of it is used.
import { budgetMeter, statusBadge } from '../charts.js';
import { categoriesFor, getCategory } from '../categories.js';
import { dayOfMonth, daysInMonth, monthLabel } from '../dates.js';
import { budgetReport, dailyAllowance, monthProgress } from '../finance.js';
import { html } from '../html.js';
import { icon } from '../icons.js';
import { formatMoney } from '../money.js';
import { pageHeader } from './shared.js';

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
    ${pageHeader('Budgets', { month, thisMonth })}

    ${report.rows.length > 0 ? summaryCard(report.total, { month, today, thisMonth, pace, currency, money }) : intro()}

    ${report.rows.length > 0
      ? html`<section class="card">
          <header class="card-header">
            <div>
              <h2 class="card-title">Your budgets</h2>
              <p class="card-subtitle">${pace === null ? `Spending in ${monthLabel(month)}` : 'The line on each bar marks today'}</p>
            </div>
          </header>
          <ul class="budget-list">${report.rows.map((row) => budgetRow(row, { currency, pace, money }))}</ul>
        </section>`
      : ''}

    <section class="card">
      <header class="card-header">
        <div>
          <h2 class="card-title">${report.rows.length > 0 ? 'Without a budget' : 'Categories'}</h2>
          <p class="card-subtitle">Spending in ${monthLabel(month)}</p>
        </div>
        <button type="button" class="button button-secondary" id="suggest-budgets" data-action="suggest-budgets">
          ${icon('sparkle', { size: 18 })} Suggest budgets
        </button>
      </header>
      ${withoutBudget.length > 0
        ? html`<ul class="plain-list">
            ${withoutBudget.map((category) => {
              const spent = spentWithoutBudget.get(category.id) ?? 0;
              return html`<li class="unbudgeted-row">
                <span class="cat-name"><span class="cat-icon" aria-hidden="true">${category.icon}</span>${category.name}</span>
                <span class="muted">${spent > 0 ? `${money(spent)} spent` : 'Nothing spent'}</span>
                <button type="button" class="button button-small button-secondary" id="set-budget-${category.id}"
                  data-action="edit-budget" data-category="${category.id}">Set budget</button>
              </li>`;
            })}
          </ul>`
        : html`<p class="muted-note">Every category has a budget.</p>`}
    </section>`;
}

function intro() {
  return html`<section class="card callout-card">
    <h2 class="card-title">Plan your month</h2>
    <p>
      Give a category a monthly limit and Pengeflyt tracks how much of it you've used, warns you at 80%
      and tells you how much you can spend per day for the rest of the month. Not sure where to start?
      <strong>Suggest budgets</strong> looks at what you usually spend.
    </p>
  </section>`;
}

function summaryCard(total, { month, today, thisMonth, pace, currency, money }) {
  let paceNote = '';
  if (month === thisMonth) {
    const day = dayOfMonth(today);
    const days = daysInMonth(month);
    const allowance = dailyAllowance(total.remaining, month, today);
    paceNote =
      total.remaining > 0
        ? `Day ${day} of ${days}: you can spend about ${money(allowance)} a day for the rest of the month.`
        : `Day ${day} of ${days}: the budget for this month is used up.`;
  } else if (month < thisMonth) {
    paceNote = total.remaining >= 0 ? `You stayed ${money(total.remaining)} under budget.` : `You went ${money(-total.remaining)} over budget.`;
  } else {
    paceNote = "This month hasn't started yet.";
  }
  const label = monthLabel(month);
  let headline = `Left to spend in ${label}`;
  if (total.remaining < 0) headline = `Over budget in ${label}`;
  else if (month < thisMonth) headline = `Under budget in ${label}`;
  else if (month > thisMonth) headline = `Budget for ${label}`;

  return html`<section class="card budget-summary">
    <div class="budget-summary-top">
      <div>
        <p class="hero-label">${headline}</p>
        <p class="summary-value">${money(Math.abs(total.remaining))}</p>
        <p class="muted">${money(total.spent)} spent of ${money(total.limit)} budgeted</p>
      </div>
      ${statusBadge(total.level)}
    </div>
    ${budgetMeter(total, { label: 'All budgets', currency, pace })}
    <p class="pace-note">${paceNote}</p>
  </section>`;
}

function budgetRow(row, { currency, pace, money }) {
  const { name, icon: emoji } = getCategory(row.category);
  return html`<li class="budget-row">
    <div class="budget-row-head">
      <span class="cat-name"><span class="cat-icon" aria-hidden="true">${emoji}</span>${name}</span>
      <button type="button" class="link-button" id="edit-budget-${row.category}" data-action="edit-budget"
        data-category="${row.category}" aria-label="Edit budget for ${name}">Edit</button>
    </div>
    <div class="budget-row-figures">
      <span><strong>${money(row.spent)}</strong> <span class="muted">of ${money(row.limit)}</span></span>
      <span class="muted">${row.remaining >= 0 ? `${money(row.remaining)} left` : `${money(-row.remaining)} over`}</span>
    </div>
    ${budgetMeter(row, { label: `${name} budget`, currency, pace })}
    ${statusBadge(row.level)}
  </li>`;
}
