// Oversikt (forsiden): bare formuen din og en graf over hvordan den beveger seg.
import { html } from '../html.js';
import { icon, logo } from '../icons.js';
import { formatMoney, formatPercent } from '../money.js';
import { heldAssets, seriesChange, summarizeNetWorth } from '../networth.js';
import { historyChart, historyFor, mountHistory, rangeText } from './history.js';
import { updateLiveValues } from './live.js';
import { liveChip } from './shared.js';

export function renderOverview(ctx) {
  const { state, feed, ui, today } = ctx;
  if (state.accounts.length === 0) return welcome(state.transactions.length > 0);

  const currency = state.settings.currency;
  const summary = summarizeNetWorth(state.accounts, state.movements, feed.prices());
  const series = historyFor(ctx, state.accounts);
  const change = seriesChange(series);

  return html`<section class="card overview" aria-labelledby="overview-label">
    <div class="hero-top">
      <h1 class="overview-label" id="overview-label">Din formue</h1>
      ${heldAssets(state.accounts, state.movements).length > 0 ? liveChip(feed) : ''}
    </div>
    <p class="overview-value" data-live="total">${formatMoney(summary.total, currency, { whole: true })}</p>
    <p class="overview-change">
      ${change
        ? html`<span class="delta-pill ${change.amount >= 0 ? 'is-up' : 'is-down'}">
              ${icon(change.amount >= 0 ? 'arrow-up' : 'arrow-down', { size: 14 })}${formatMoney(Math.abs(change.amount), currency, { whole: true })}${change.ratio === null ? '' : ` (${formatPercent(Math.abs(change.ratio))})`}
            </span>
            <span class="muted">${rangeText(ui.historyRange, change, today)}</span>`
        : html`<span class="muted">Bank, sparing, aksjer, fond og krypto – minus gjeld.</span>`}
    </p>
    ${historyChart(ctx, series, { label: 'Formue', chartId: 'overview' })}
  </section>`;
}

export function mountOverview(container, ctx) {
  const cleanups = [mountHistory(container, ctx, ctx.state.accounts, { chartId: 'overview', label: 'Formue', height: 300 })];
  cleanups.push(ctx.feed.subscribe(() => updateLiveValues(container, ctx.state, ctx.feed)));
  // Hent historiske kurser til grafen; tegn siden på nytt hvis det kom noe nytt.
  const assets = heldAssets(ctx.state.accounts, ctx.state.movements);
  if (assets.length > 0) ctx.feed.loadHistory(assets).then((changed) => changed && ctx.rerender());
  return () => cleanups.forEach((cleanup) => cleanup?.());
}

function welcome(hasTransactions) {
  return html`<section class="welcome">
    <div class="welcome-logo">${logo(56)}</div>
    <h1>${hasTransactions ? 'Få oversikt over formuen din' : 'Velkommen til Pengeflyt'}</h1>
    <p class="welcome-lead">
      Samle bankkontoer, sparing, aksjer, fond og krypto på ett sted. Aksje- og kryptoverdiene følger
      markedet, og innskudd og uttak registrerer du med et par trykk.
    </p>
    <div class="button-row">
      <button type="button" class="button button-primary" data-action="add-account">${icon('plus', { size: 18 })} Legg til første konto</button>
      <button type="button" class="button button-secondary" data-action="load-demo">Prøv med eksempeldata</button>
    </div>
    <ul class="welcome-points">
      <li>${icon('bank')}<span><strong>Bank</strong> – kontoer, sparing og lån, med siste bevegelser</span></li>
      <li>${icon('trend')}<span><strong>Aksjer og fond</strong> – beholdning, snittkurs og avkastning</span></li>
      <li>${icon('coins')}<span><strong>Krypto</strong> – verdien følger markedet sekund for sekund</span></li>
      <li>${icon('lock')}<span><strong>Privat</strong> – dataene dine forlater aldri nettleseren</span></li>
    </ul>
  </section>`;
}
