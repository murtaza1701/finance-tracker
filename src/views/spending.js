// Forbruk: måneden i et nøtteskall – inntekter, utgifter, kategorier og budsjetter.
import { budgetMeter, categoryBars, mountIncomeExpenseChart, seriesTable, statusBadge } from '../charts.js';
import { getCategory } from '../categories.js';
import { monthLabel, shiftMonth } from '../dates.js';
import { budgetReport, filterTransactions, monthlySeries, monthSummary, percentChange, spendingByCategory } from '../finance.js';
import { html } from '../html.js';
import { icon } from '../icons.js';
import { formatMoney } from '../money.js';
import { emptyState, pageHeader, transactionRow } from './shared.js';

export function renderSpending({ state, ui, thisMonth }) {
  const { transactions, budgets, settings } = state;
  const currency = settings.currency;
  const month = ui.month;

  if (transactions.length === 0) {
    return html`${pageHeader('Forbruk')}
      <section class="card">
        ${emptyState({
          emoji: '🧾',
          title: 'Ingen transaksjoner ennå',
          text: 'Registrer inntekter og utgifter for å se hvor pengene går hver måned, og sett budsjetter per kategori.',
          actions: html`
            <button type="button" class="button button-primary" data-action="add-transaction">${icon('plus', { size: 18 })} Ny transaksjon</button>
            <button type="button" class="button button-secondary" data-action="load-demo">Prøv med eksempeldata</button>`,
        })}
      </section>`;
  }

  const previousMonth = shiftMonth(month, -1);
  const summary = monthSummary(transactions, month);
  const previous = monthSummary(transactions, previousMonth);
  const spending = spendingByCategory(transactions, month);
  const report = budgetReport(transactions, budgets, month);
  const recent = filterTransactions(transactions, { month }).slice(0, 5);
  const money = (minor, options) => formatMoney(minor, currency, { whole: true, ...options });

  return html`
    ${pageHeader('Forbruk', { month, thisMonth })}

    <section class="card hero" aria-labelledby="hero-label">
      <p class="hero-label" id="hero-label">Netto · ${monthLabel(month)}</p>
      <p class="hero-value">${money(summary.net, { sign: true })}</p>
      <p class="hero-note">${netSentence(summary, money)}</p>
      <dl class="stats">
        <div class="stat">
          <dt>Inntekter</dt>
          <dd class="stat-value">${money(summary.income)}</dd>
          <dd>${delta(summary.income, previous.income, previousMonth, true)}</dd>
        </div>
        <div class="stat">
          <dt>Utgifter</dt>
          <dd class="stat-value">${money(summary.expense)}</dd>
          <dd>${delta(summary.expense, previous.expense, previousMonth, false)}</dd>
        </div>
        ${report.rows.length > 0
          ? html`<div class="stat">
              <dt>Brukt av budsjett</dt>
              <dd class="stat-value">${Math.round(report.total.ratio * 100)} %</dd>
              <dd class="stat-note">av ${money(report.total.limit)}</dd>
            </div>`
          : html`<div class="stat">
              <dt>Transaksjoner</dt>
              <dd class="stat-value">${summary.count}</dd>
              <dd class="stat-note">denne måneden</dd>
            </div>`}
      </dl>
    </section>

    <div class="grid-2">
      <section class="card">
        <header class="card-header">
          <div>
            <h2 class="card-title">Forbruk per kategori</h2>
            <p class="card-subtitle">${monthLabel(month)} · velg en kategori for å se transaksjonene</p>
          </div>
        </header>
        ${spending.length > 0 ? categoryBars(spending, { currency, month }) : html`<p class="muted-note">Ingen utgifter i ${monthLabel(month).toLowerCase()} ennå.</p>`}
      </section>

      <section class="card">
        <header class="card-header">
          <div>
            <h2 class="card-title">Inntekter og utgifter</h2>
            <p class="card-subtitle">De 6 månedene til og med ${monthLabel(month).toLowerCase()}</p>
          </div>
          <div class="toggle" role="group" aria-label="Vis som">
            <button type="button" id="mode-chart" data-action="chart-mode" data-mode="chart" aria-pressed="${ui.chartMode === 'chart'}">${icon('bars', { size: 16 })}<span class="visually-hidden">Graf</span></button>
            <button type="button" id="mode-table" data-action="chart-mode" data-mode="table" aria-pressed="${ui.chartMode === 'table'}">${icon('table', { size: 16 })}<span class="visually-hidden">Tabell</span></button>
          </div>
        </header>
        <div class="legend">
          <span class="legend-item"><span class="legend-swatch swatch-income"></span>Inntekter</span>
          <span class="legend-item"><span class="legend-swatch swatch-expense"></span>Utgifter</span>
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
            <h2 class="card-title">Budsjettvarsler</h2>
            <p class="card-subtitle">Budsjetter som trenger oppmerksomhet</p>
          </div>
          <a class="link" href="#/budsjett">Alle budsjetter</a>
        </header>
        ${budgetWatch(report, currency)}
      </section>

      <section class="card">
        <header class="card-header">
          <div>
            <h2 class="card-title">Siste transaksjoner</h2>
            <p class="card-subtitle">${monthLabel(month)}</p>
          </div>
          <a class="link" href="#/transaksjoner?month=${month}">Se alle</a>
        </header>
        ${recent.length > 0
          ? html`<ul class="tx-list">${recent.map((t) => transactionRow(t, currency))}</ul>`
          : html`<p class="muted-note">Ingenting registrert i ${monthLabel(month).toLowerCase()}.</p>`}
      </section>
    </div>`;
}

/** Tegner grafen når siden er på plass (den må vite hvor bred den er). */
export function mountSpending(container, { state, ui }) {
  const target = container.querySelector('[data-chart="income-expense"]');
  if (!target) return null;
  const series = monthlySeries(state.transactions, ui.month, 6);
  return mountIncomeExpenseChart(target, series, { currency: state.settings.currency, selectedMonth: ui.month });
}

function netSentence(summary, money) {
  if (summary.count === 0) return 'Ingenting registrert denne måneden ennå.';
  if (summary.income === 0) return `Ingen inntekter registrert denne måneden, og ${money(summary.expense)} brukt.`;
  if (summary.net < 0) return `Du brukte ${money(-summary.net)} mer enn du tjente.`;
  return `Du sparte ${Math.round(summary.savingsRate * 100)} % av det du tjente.`;
}

/** "↑ 12 % mot sep." For utgifter er økning dårlig; for inntekter er økning bra. */
function delta(current, previous, previousMonth, upIsGood) {
  const change = percentChange(current, previous);
  const month = monthLabel(previousMonth, { short: true });
  if (change === null) return html`<span class="delta">Ingen data for ${month}</span>`;
  if (Math.abs(change) < 0.005) return html`<span class="delta">Som i ${month}</span>`;
  const up = change > 0;
  return html`<span class="delta ${up === upIsGood ? 'is-good' : 'is-bad'}">
    ${icon(up ? 'arrow-up' : 'arrow-down', { size: 14 })}${Math.round(Math.abs(change) * 100)} % mot ${month}
  </span>`;
}

function budgetWatch(report, currency) {
  if (report.rows.length === 0) {
    return html`<div class="callout">
      <p>Sett et månedlig budsjett for en kategori, så får du varsel her før du bruker for mye.</p>
      <a class="button button-secondary" href="#/budsjett">${icon('target', { size: 18 })} Sett opp budsjetter</a>
    </div>`;
  }
  const attention = report.rows.filter((row) => row.level !== 'ok');
  if (attention.length === 0) {
    return html`<p class="all-good">${statusBadge('ok')} Alle ${report.rows.length} budsjettene er i rute.</p>`;
  }
  return html`<ul class="watch-list">
    ${attention.slice(0, 4).map((row) => {
      const { name, icon: emoji } = getCategory(row.category);
      const left = row.remaining >= 0 ? `${formatMoney(row.remaining, currency, { whole: true })} igjen` : `${formatMoney(-row.remaining, currency, { whole: true })} over`;
      return html`<li class="watch-row">
        <div class="watch-head">
          <span class="cat-name"><span class="cat-icon" aria-hidden="true">${emoji}</span>${name}</span>
          <span class="watch-figures">${formatMoney(row.spent, currency, { whole: true })} <span class="muted">/ ${formatMoney(row.limit, currency, { whole: true })}</span></span>
        </div>
        ${budgetMeter(row, { label: `Budsjett for ${name}`, currency })}
        <div class="watch-foot">${statusBadge(row.level)}<span class="muted">${left}</span></div>
      </li>`;
    })}
  </ul>
  ${attention.length > 4 ? html`<p class="muted-note">og ${attention.length - 4} til …</p>` : ''}`;
}
