// Grafen over verdien over tid: periodeknapper, tabellvisning og selve tegningen.
// Brukes på oversikten, på Bank/Aksjer og fond/Krypto og på kontosidene.
import { historyTable, mountLineChart } from '../charts.js';
import { addDays, dateLabel } from '../dates.js';
import { html } from '../html.js';
import { icon } from '../icons.js';
import { HISTORY_RANGES, firstMovementDate, netWorthSeries, rangeStart } from '../networth.js';

const RANGES = [
  ['1w', '1U'],
  ['1m', '1M'],
  ['3m', '3M'],
  ['6m', '6M'],
  ['1y', '1Å'],
  ['all', 'Alt'],
];

const RANGE_TEXT = { '1w': 'siste uke', '1m': 'siste måned', '3m': 'siste 3 måneder', '6m': 'siste 6 måneder', '1y': 'siste år' };

// Hver tegning får et nytt ctx-objekt; serien huskes per tegning, så siden og grafen regner den bare én gang.
const seriesCache = new WeakMap();

/** Verdien dag for dag for kontoene i perioden som er valgt. */
export function historyFor(ctx, accounts) {
  const key = accounts.map((account) => account.id).join();
  if (!seriesCache.has(ctx)) seriesCache.set(ctx, new Map());
  const cached = seriesCache.get(ctx);
  if (!cached.has(key)) cached.set(key, computeHistory(ctx, accounts));
  return cached.get(key);
}

function computeHistory({ state, ui, today, feed }, accounts) {
  const ids = new Set(accounts.map((account) => account.id));
  const movements = state.movements.filter((m) => ids.has(m.accountId));
  const first = firstMovementDate(movements);
  if (!first) return [];
  const from = rangeStart(ui.historyRange, today, first);
  return netWorthSeries(accounts, movements, { from, to: today, priceOn: (symbol, date) => feed.priceOn(symbol, date) });
}

/** "siste 3 måneder", eller "siden 1. okt. 2025" når historikken er kortere enn perioden. */
export function rangeText(range, change, today) {
  const days = HISTORY_RANGES[range];
  if (typeof days === 'number' && change.from === addDays(today, -days)) return RANGE_TEXT[range];
  return `siden ${dateLabel(change.from)}`;
}

/** Grafen med periodeknapper under og en knapp for å vise tallene som tabell. */
export function historyChart(ctx, series, { label, chartId }) {
  const { ui, state } = ctx;
  return html`<div class="history">
    ${series.length < 2
      ? html`<p class="muted-note history-empty">Grafen fylles ut etter hvert som du registrerer endringer over flere dager.</p>`
      : ui.historyMode === 'table'
        ? historyTable(series, state.settings.currency, { label })
        : html`<div class="chart" data-chart="${chartId}"></div>`}
    <div class="history-controls">
      <div class="range-toggle" role="group" aria-label="Periode">
        ${RANGES.map(([range, text]) => html`<button type="button" id="range-${chartId}-${range}" data-action="history-range" data-range="${range}" aria-pressed="${ui.historyRange === range}">${text}</button>`)}
      </div>
      <div class="toggle" role="group" aria-label="Vis som">
        <button type="button" id="history-chart-${chartId}" data-action="history-mode" data-mode="chart" aria-pressed="${ui.historyMode === 'chart'}">${icon('bars', { size: 16 })}<span class="visually-hidden">Graf</span></button>
        <button type="button" id="history-table-${chartId}" data-action="history-mode" data-mode="table" aria-pressed="${ui.historyMode === 'table'}">${icon('table', { size: 16 })}<span class="visually-hidden">Tabell</span></button>
      </div>
    </div>
  </div>`;
}

/** Grafen i et eget kort med overskrift (kontosidene). */
export function historyCard(ctx, series, { title, subtitle, label, chartId }) {
  return html`<section class="card">
    <header class="card-header">
      <div>
        <h2 class="card-title">${title}</h2>
        <p class="card-subtitle">${subtitle}</p>
      </div>
    </header>
    ${historyChart(ctx, series, { label, chartId })}
  </section>`;
}

/** Tegner linjegrafen når siden er på plass (den må vite hvor bred den er). Gir en opprydningsfunksjon. */
export function mountHistory(container, ctx, accounts, { chartId, label, height }) {
  const target = container.querySelector(`[data-chart="${chartId}"]`);
  if (!target) return null;
  return mountLineChart(target, historyFor(ctx, accounts), { currency: ctx.state.settings.currency, label, height });
}
