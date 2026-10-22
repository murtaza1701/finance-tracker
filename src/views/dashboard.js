// Overview page: the month at a glance.
import { budgetMeter, categoryBars, mountIncomeExpenseChart, seriesTable, statusBadge } from '../charts.js';
import { getCategory } from '../categories.js';
import { monthLabel, shiftMonth } from '../dates.js';
import { budgetReport, filterTransactions, monthlySeries, monthSummary, percentChange, spendingByCategory } from '../finance.js';
import { html } from '../html.js';
import { icon, logo } from '../icons.js';
import { formatMoney } from '../money.js';
import { pageHeader, transactionRow } from './shared.js';

export function renderDashboard({ state, ui, thisMonth }) {
  const { transactions, budgets, settings } = state;
  if (transactions.length === 0) return welcome();

  const currency = settings.currency;
  const month = ui.month;
  const previousMonth = shiftMonth(month, -1);
  const summary = monthSummary(transactions, month);
  const previous = monthSummary(transactions, previousMonth);
  const spending = spendingByCategory(transactions, month);
  const report = budgetReport(transactions, budgets, month);
  const recent = filterTransactions(transactions, { month }).slice(0, 5);
  const money = (minor, options) => formatMoney(minor, currency, { whole: true, ...options });

  return html`
    ${pageHeader('Overview', { month, thisMonth })}

    <section class="card hero" aria-labelledby="hero-label">
      <p class="hero-label" id="hero-label">Net balance · ${monthLabel(month)}</p>
      <p class="hero-value">${money(summary.net, { sign: true })}</p>
      <p class="hero-note">${netSentence(summary, money)}</p>
      <dl class="stats">
        <div class="stat">
          <dt>Income</dt>
          <dd class="stat-value">${money(summary.income)}</dd>
          <dd>${delta(summary.income, previous.income, previousMonth, true)}</dd>
        </div>
        <div class="stat">
          <dt>Expenses</dt>
          <dd class="stat-value">${money(summary.expense)}</dd>
          <dd>${delta(summary.expense, previous.expense, previousMonth, false)}</dd>
        </div>
        ${report.rows.length > 0
          ? html`<div class="stat">
              <dt>Budget used</dt>
              <dd class="stat-value">${Math.round(report.total.ratio * 100)}%</dd>
              <dd class="stat-note">of ${money(report.total.limit)}</dd>
            </div>`
          : html`<div class="stat">
              <dt>Transactions</dt>
              <dd class="stat-value">${summary.count}</dd>
              <dd class="stat-note">this month</dd>
            </div>`}
      </dl>
    </section>

    <div class="grid-2">
      <section class="card">
        <header class="card-header">
          <div>
            <h2 class="card-title">Spending by category</h2>
            <p class="card-subtitle">${monthLabel(month)} · select a category to see its transactions</p>
          </div>
        </header>
        ${spending.length > 0 ? categoryBars(spending, { currency, month }) : html`<p class="muted-note">No expenses in ${monthLabel(month)} yet.</p>`}
      </section>

      <section class="card">
        <header class="card-header">
          <div>
            <h2 class="card-title">Income vs expenses</h2>
            <p class="card-subtitle">The 6 months up to ${monthLabel(month)}</p>
          </div>
          <div class="toggle" role="group" aria-label="Show as">
            <button type="button" id="mode-chart" data-action="chart-mode" data-mode="chart" aria-pressed="${ui.chartMode === 'chart'}">${icon('bars', { size: 16 })}<span class="visually-hidden">Chart</span></button>
            <button type="button" id="mode-table" data-action="chart-mode" data-mode="table" aria-pressed="${ui.chartMode === 'table'}">${icon('table', { size: 16 })}<span class="visually-hidden">Table</span></button>
          </div>
        </header>
        <div class="legend">
          <span class="legend-item"><span class="legend-swatch swatch-income"></span>Income</span>
          <span class="legend-item"><span class="legend-swatch swatch-expense"></span>Expenses</span>
        </div>
        ${ui.chartMode === 'table'
          ? seriesTable(monthlySeries(transactions, month, 6), currency)
          : html`<div class="chart" data-chart="income-expense"></div>`}
      </section>
    </div>

    <div class="grid-2">
      <section class="card">
        <header class="card-header">
          <div>
            <h2 class="card-title">Budget watch</h2>
            <p class="card-subtitle">Budgets that need your attention</p>
          </div>
          <a class="link" href="#/budgets">All budgets</a>
        </header>
        ${budgetWatch(report, currency)}
      </section>

      <section class="card">
        <header class="card-header">
          <div>
            <h2 class="card-title">Recent transactions</h2>
            <p class="card-subtitle">${monthLabel(month)}</p>
          </div>
          <a class="link" href="#/transactions?month=${month}">See all</a>
        </header>
        ${recent.length > 0
          ? html`<ul class="tx-list">${recent.map((t) => transactionRow(t, currency))}</ul>`
          : html`<p class="muted-note">Nothing recorded in ${monthLabel(month)}.</p>`}
      </section>
    </div>`;
}

/** Draws the chart once the page is in place (it needs to know its width). */
export function mountDashboard(container, { state, ui }) {
  const target = container.querySelector('[data-chart="income-expense"]');
  if (!target) return null;
  const series = monthlySeries(state.transactions, ui.month, 6);
  return mountIncomeExpenseChart(target, series, { currency: state.settings.currency, selectedMonth: ui.month });
}

function netSentence(summary, money) {
  if (summary.count === 0) return 'Nothing recorded this month yet.';
  if (summary.income === 0) return `No income recorded this month, and ${money(summary.expense)} spent.`;
  if (summary.net < 0) return `You spent ${money(-summary.net)} more than you earned.`;
  return `You kept ${Math.round(summary.savingsRate * 100)}% of what you earned.`;
}

/** "↑ 12% vs Sep". For expenses, going up is bad; for income, going up is good. */
function delta(current, previous, previousMonth, upIsGood) {
  const change = percentChange(current, previous);
  const vs = `vs ${monthLabel(previousMonth, { short: true })}`;
  if (change === null) return html`<span class="delta">No data for ${monthLabel(previousMonth, { short: true })}</span>`;
  if (Math.abs(change) < 0.005) return html`<span class="delta">Same as ${monthLabel(previousMonth, { short: true })}</span>`;
  const up = change > 0;
  return html`<span class="delta ${up === upIsGood ? 'is-good' : 'is-bad'}">
    ${icon(up ? 'arrow-up' : 'arrow-down', { size: 14 })}${Math.round(Math.abs(change) * 100)}% ${vs}
  </span>`;
}

function budgetWatch(report, currency) {
  if (report.rows.length === 0) {
    return html`<div class="callout">
      <p>Set a monthly budget for a category and you'll be warned here before you overspend.</p>
      <a class="button button-secondary" href="#/budgets">${icon('target', { size: 18 })} Set up budgets</a>
    </div>`;
  }
  const attention = report.rows.filter((row) => row.level !== 'ok');
  if (attention.length === 0) {
    return html`<p class="all-good">${statusBadge('ok')} All ${report.rows.length} budgets are on track.</p>`;
  }
  return html`<ul class="watch-list">
    ${attention.slice(0, 4).map((row) => {
      const { name, icon: emoji } = getCategory(row.category);
      const left = row.remaining >= 0 ? `${formatMoney(row.remaining, currency, { whole: true })} left` : `${formatMoney(-row.remaining, currency, { whole: true })} over`;
      return html`<li class="watch-row">
        <div class="watch-head">
          <span class="cat-name"><span class="cat-icon" aria-hidden="true">${emoji}</span>${name}</span>
          <span class="watch-figures">${formatMoney(row.spent, currency, { whole: true })} <span class="muted">/ ${formatMoney(row.limit, currency, { whole: true })}</span></span>
        </div>
        ${budgetMeter(row, { label: `${name} budget`, currency })}
        <div class="watch-foot">${statusBadge(row.level)}<span class="muted">${left}</span></div>
      </li>`;
    })}
  </ul>
  ${attention.length > 4 ? html`<p class="muted-note">and ${attention.length - 4} more…</p>` : ''}`;
}

function welcome() {
  return html`<section class="welcome">
    <div class="welcome-logo">${logo(56)}</div>
    <h1>Welcome to Pengeflyt</h1>
    <p class="welcome-lead">
      See where your money flows. Log income and expenses in seconds, set a budget for each category
      and follow your spending month by month.
    </p>
    <div class="button-row">
      <button type="button" class="button button-primary" data-action="add-transaction">${icon('plus', { size: 18 })} Add your first transaction</button>
      <button type="button" class="button button-secondary" data-action="load-demo">Explore with demo data</button>
    </div>
    <ul class="welcome-points">
      <li>${icon('list')}<span><strong>Track</strong> every krone that comes in and goes out</span></li>
      <li>${icon('target')}<span><strong>Budget</strong> per category, with warnings before you overspend</span></li>
      <li>${icon('bars')}<span><strong>Understand</strong> your habits with clear charts</span></li>
      <li>${icon('lock')}<span><strong>Private</strong> – your data never leaves this browser</span></li>
    </ul>
  </section>`;
}
