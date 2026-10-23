// Oversikt (forsiden): formuen din, en graf over hvordan den beveger seg, og summen for hver side
// (Bank, Aksjer og fond, Krypto) så du raskt ser hvor pengene ligger.
import { SECTIONS, accountsIn } from '../accounts.js';
import { html } from '../html.js';
import { icon, logo } from '../icons.js';
import { formatMoney } from '../money.js';
import { dayChange, hasPrices, heldAssets, holdingsOverview, seriesChange, summarizeNetWorth } from '../networth.js';
import { historyChart, historyFor, mountHistory, rangeText } from './history.js';
import { updateLiveValues } from './live.js';
import { gainText, liveChip, trendClass } from './shared.js';

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
        ? html`<span class="delta-pill ${trendClass(change.amount)}">${gainText(change.amount, change.ratio, currency)}</span>
            <span class="muted">${rangeText(ui.historyRange, change, today)}</span>`
        : html`<span class="muted">Bank, sparing, aksjer, fond og krypto – minus gjeld.</span>`}
    </p>
    ${historyChart(ctx, series, { label: 'Formue', chartId: 'overview' })}
  </section>
  ${sectionTiles(ctx)}`;
}

/**
 * Én flis per side med de samme tallene som øverst på siden. Bank viser lånene under, så
 * flisene går opp i formuen: Bank + Aksjer og fond + Krypto − lån.
 */
function sectionTiles({ state, feed }) {
  const currency = state.settings.currency;
  const prices = feed.prices();
  const money = (minor) => formatMoney(minor, currency, { whole: true });
  const summaryOf = (key) => summarizeNetWorth(accountsIn(key, state.accounts), state.movements, prices);

  const bank = summaryOf('bank');
  const count = bank.rows.filter((row) => row.kind !== 'debt').length;
  let bankNote = count === 0 ? 'Ingen kontoer ennå' : `${count} ${count === 1 ? 'konto' : 'kontoer'}`;
  if (bank.debts > 0) bankNote = `Lån ${money(-bank.debts)}`;

  /** Aksjer og fond, og Krypto: verdien og endringen i dag, som følger kursene (views/live.js). */
  const marketTile = (key, iconName, dayLabel) => {
    const accounts = accountsIn(key, state.accounts);
    const summary = summaryOf(key);
    const holdings = holdingsOverview(accounts, state.movements, prices);
    const day = dayChange(holdings, summary.total);
    let note = '–';
    if (accounts.length === 0) note = 'Ingen kontoer ennå';
    else if (holdings.length > 0) {
      note = html`${dayLabel} <span class="gain ${trendClass(day.amount)}" data-live-day="${key}">${hasPrices(holdings) ? gainText(day.amount, day.ratio, currency) : '–'}</span>`;
    } else if (summary.gain) {
      note = html`Avkastning <span class="gain ${trendClass(summary.gain.amount)}">${gainText(summary.gain.amount, summary.gain.ratio, currency)}</span>`;
    }
    return sectionTile(key, iconName, { value: money(summary.total), note, live: true });
  };

  return html`<section class="section-tiles" aria-labelledby="section-tiles-title">
    <h2 class="visually-hidden" id="section-tiles-title">Formuen fordelt</h2>
    ${sectionTile('bank', 'bank', { value: money(bank.assets), note: bankNote })}
    ${marketTile('investments', 'trend', 'I dag')}
    ${marketTile('crypto', 'coins', '24 t')}
  </section>`;
}

function sectionTile(key, iconName, { value, note, live = false }) {
  return html`<a class="section-tile" href="#/${SECTIONS[key].path}">
    <span class="section-tile-head">${icon(iconName, { size: 18 })}<span>${SECTIONS[key].title}</span></span>
    <span class="section-tile-arrow" aria-hidden="true">${icon('chevron-right', { size: 16 })}</span>
    <strong class="section-tile-value" ${live ? html`data-live-section="${key}"` : ''}>${value}</strong>
    <span class="section-tile-note">${note}</span>
  </a>`;
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
