// Formue: alt du eier og skylder samlet, med kryptoverdier som følger markedet i sanntid.
import { ACCOUNT_TYPES, findCoin } from '../accounts.js';
import { historyTable, mountLineChart } from '../charts.js';
import { dateLabel } from '../dates.js';
import { html } from '../html.js';
import { icon, logo } from '../icons.js';
import { formatMoney, formatPrice } from '../money.js';
import { byDate, firstMovementDate, heldCoins, netWorthSeries, rangeStart, seriesChange, summarizeNetWorth } from '../networth.js';
import { updateLiveValues } from './live.js';
import { changeText, gainRatioText, gainText, holdingsText, liveChip, movementRow, pageHeader, trendClass } from './shared.js';

const RANGES = [
  ['1m', '1M'],
  ['3m', '3M'],
  ['6m', '6M'],
  ['1y', '1Å'],
  ['all', 'Alt'],
];

/** Verdien dag for dag for kontoene i perioden som er valgt. */
export function historyFor(ctx, accounts) {
  const { state, ui, today, feed } = ctx;
  const ids = new Set(accounts.map((account) => account.id));
  const movements = state.movements.filter((m) => ids.has(m.accountId));
  const first = firstMovementDate(movements);
  if (!first) return [];
  const from = rangeStart(ui.historyRange, today, first);
  return netWorthSeries(accounts, movements, { from, to: today, priceOn: (symbol, date) => feed.priceOn(symbol, date) });
}

/** Kortet med grafen, periodevalg og tabellvisning. Brukes også på kontosiden. */
export function historyCard(ctx, series, { title, subtitle, label, chartId }) {
  const { ui, state } = ctx;
  return html`<section class="card">
    <header class="card-header card-header-wrap">
      <div>
        <h2 class="card-title">${title}</h2>
        <p class="card-subtitle">${subtitle}</p>
      </div>
      <div class="header-controls">
        <div class="range-toggle" role="group" aria-label="Periode">
          ${RANGES.map(([range, text]) => html`<button type="button" id="range-${range}" data-action="history-range" data-range="${range}" aria-pressed="${ui.historyRange === range}">${text}</button>`)}
        </div>
        <div class="toggle" role="group" aria-label="Vis som">
          <button type="button" id="history-chart" data-action="history-mode" data-mode="chart" aria-pressed="${ui.historyMode === 'chart'}">${icon('bars', { size: 16 })}<span class="visually-hidden">Graf</span></button>
          <button type="button" id="history-table" data-action="history-mode" data-mode="table" aria-pressed="${ui.historyMode === 'table'}">${icon('table', { size: 16 })}<span class="visually-hidden">Tabell</span></button>
        </div>
      </div>
    </header>
    ${series.length < 2
      ? html`<p class="muted-note">Grafen fylles ut etter hvert som du registrerer endringer over flere dager.</p>`
      : ui.historyMode === 'table'
        ? historyTable(series, state.settings.currency, { label })
        : html`<div class="chart" data-chart="${chartId}"></div>`}
  </section>`;
}

export function renderNetWorth(ctx) {
  const { state, feed } = ctx;
  const { accounts, movements, settings, transactions } = state;
  if (accounts.length === 0) return welcome(transactions.length > 0);

  const currency = settings.currency;
  const prices = feed.prices();
  const summary = summarizeNetWorth(accounts, movements, prices);
  const coins = heldCoins(accounts, movements);
  const series = historyFor(ctx, accounts);
  const change = seriesChange(series);
  const money = (minor, options) => formatMoney(minor, currency, { whole: true, ...options });
  const accountsById = new Map(accounts.map((account) => [account.id, account]));
  const recent = [...movements].sort(byDate).reverse().slice(0, 6);

  return html`
    ${pageHeader('Formue', {
      actions: html`<button type="button" class="button button-secondary" id="add-account" data-action="add-account">${icon('plus', { size: 18 })} Ny konto</button>`,
    })}

    <section class="card hero" aria-labelledby="hero-label">
      <div class="hero-top">
        <p class="hero-label" id="hero-label">Nettoformue</p>
        ${coins.length > 0 ? liveChip(feed) : ''}
      </div>
      <p class="hero-value" data-live="total">${money(summary.total)}</p>
      <p class="hero-note">
        ${change
          ? html`<span class="delta ${change.amount >= 0 ? 'is-good' : 'is-bad'}">
              ${icon(change.amount >= 0 ? 'arrow-up' : 'arrow-down', { size: 14 })}${money(Math.abs(change.amount))}
            </span> siden ${dateLabel(change.from)}`
          : 'Her ser du hele formuen din samlet.'}
      </p>
      <dl class="stats">
        <div class="stat">
          <dt>Eiendeler</dt>
          <dd class="stat-value" data-live="assets">${money(summary.assets)}</dd>
          <dd class="stat-note">${accounts.length} ${accounts.length === 1 ? 'konto' : 'kontoer'}</dd>
        </div>
        ${summary.debts > 0
          ? html`<div class="stat">
              <dt>Gjeld</dt>
              <dd class="stat-value">${money(summary.debts)}</dd>
              <dd class="stat-note">trukket fra</dd>
            </div>`
          : ''}
        ${summary.gain
          ? html`<div class="stat">
              <dt>Avkastning</dt>
              <dd class="stat-value delta-value ${trendClass(summary.gain.amount)}" data-live="gain">${money(summary.gain.amount, { sign: true })}</dd>
              <dd class="stat-note" data-live="gain-ratio">${summary.gain.ratio === null ? 'på fond, aksjer og krypto' : gainRatioText(summary.gain.ratio)}</dd>
            </div>`
          : ''}
      </dl>
    </section>

    ${historyCard(ctx, series, { title: 'Utvikling', subtitle: 'Nettoformuen din over tid', label: 'Nettoformue', chartId: 'networth' })}

    <div class="grid-2">
      <section class="card">
        <header class="card-header">
          <div>
            <h2 class="card-title">Kontoer</h2>
            <p class="card-subtitle">Fordelt på type, med andel av eiendelene</p>
          </div>
        </header>
        ${accountGroups(summary, currency, money)}
      </section>

      <div class="stack">
        ${coins.length > 0 ? pricesCard(coins, prices, feed, currency) : ''}
        <section class="card">
          <header class="card-header">
            <div>
              <h2 class="card-title">Siste bevegelser</h2>
              <p class="card-subtitle">Innskudd, uttak og nye verdier</p>
            </div>
            <button type="button" class="button button-small button-secondary" id="add-movement" data-action="add-movement">${icon('plus', { size: 16 })} Registrer</button>
          </header>
          ${recent.length > 0
            ? html`<ul class="tx-list">${recent.map((m) => movementRow(m, accountsById.get(m.accountId), currency, { showAccount: true }))}</ul>`
            : html`<p class="muted-note">Ingen bevegelser ennå.</p>`}
        </section>
      </div>
    </div>`;
}

export function mountNetWorth(container, ctx) {
  const cleanups = [];
  const target = container.querySelector('[data-chart="networth"]');
  if (target) {
    const series = historyFor(ctx, ctx.state.accounts);
    cleanups.push(mountLineChart(target, series, { currency: ctx.state.settings.currency, label: 'Nettoformue' }));
  }
  cleanups.push(ctx.feed.subscribe(() => updateLiveValues(container, ctx.state, ctx.feed)));
  // Hent historiske kurser til grafen; tegn siden på nytt hvis det kom noe nytt.
  const coins = heldCoins(ctx.state.accounts, ctx.state.movements);
  if (coins.length > 0) ctx.feed.loadHistory(coins).then((changed) => changed && ctx.rerender());
  return () => cleanups.forEach((cleanup) => cleanup());
}

function accountGroups(summary, currency, money) {
  const groups = ACCOUNT_TYPES.map((type) => ({ type, rows: summary.rows.filter((row) => row.account.type === type.id) })).filter(
    (group) => group.rows.length > 0,
  );
  return html`${groups.map(({ type, rows }) => {
    const total = summary.byType.find((entry) => entry.type === type.id);
    const isDebt = type.id === 'loan';
    return html`<div class="account-group">
      <div class="account-group-head">
        <span class="cat-name"><span class="cat-icon" aria-hidden="true">${type.icon}</span>${type.name}</span>
        <span class="group-total">
          <strong data-live-group="${type.id}">${isDebt ? money(-total.value) : money(total.value)}</strong>
          ${total.share !== null ? html`<span class="cat-bar-share" data-live-share="${type.id}">${Math.round(total.share * 100)} %</span>` : ''}
        </span>
      </div>
      ${total.share !== null
        ? html`<span class="share-track" aria-hidden="true"><span class="share-fill" data-live-share-bar="${type.id}" style="width: ${(Math.max(0, total.share) * 100).toFixed(1)}%"></span></span>`
        : ''}
      <ul class="account-list">
        ${rows.map((row) => {
          const { account, kind } = row;
          const sub = [account.institution, kind === 'crypto' ? holdingsText(row.holdings) : null].filter(Boolean).join(' · ');
          return html`<li>
            <a class="account-row" href="#/konto?id=${account.id}">
              <span class="account-main">
                <span class="account-name">${account.name}</span>
                ${sub ? html`<span class="account-sub">${sub}</span>` : ''}
              </span>
              <span class="account-figures">
                <strong data-live-account="${account.id}">${kind === 'debt' ? money(-row.value) : money(row.value)}</strong>
                ${row.gain !== null
                  ? html`<span class="gain ${trendClass(row.gain)}" data-live-gain="${account.id}">${gainText(row.gain, row.gainRatio, currency)}</span>`
                  : ''}
              </span>
            </a>
          </li>`;
        })}
      </ul>
    </div>`;
  })}`;
}

function pricesCard(coins, prices, feed, currency) {
  return html`<section class="card">
    <header class="card-header">
      <div>
        <h2 class="card-title">Kurser</h2>
        <p class="card-subtitle">Myntene du eier · endring siste døgn</p>
      </div>
      ${liveChip(feed)}
    </header>
    <ul class="price-list">
      ${coins.map((symbol) => {
        const price = prices[symbol];
        return html`<li class="price-row">
          <span class="coin-badge" aria-hidden="true">${symbol}</span>
          <span class="coin-name">${findCoin(symbol).name}<span class="visually-hidden"> (${symbol})</span></span>
          <span class="coin-price" data-live-price="${symbol}">${price ? formatPrice(price.price, currency) : '–'}</span>
          <span class="change ${trendClass(price?.change24h)}" data-live-change="${symbol}">${changeText(price?.change24h)}</span>
        </li>`;
      })}
    </ul>
    <p class="chart-note">Kurser fra Binance (sanntid) og CoinGecko. Bare kursene hentes – hva du eier, sendes aldri noe sted.</p>
  </section>`;
}

function welcome(hasTransactions) {
  return html`<section class="welcome">
    <div class="welcome-logo">${logo(56)}</div>
    <h1>${hasTransactions ? 'Få oversikt over formuen din' : 'Velkommen til Pengeflyt'}</h1>
    <p class="welcome-lead">
      Samle bankkontoer, sparing, fond, aksjer og krypto på ett sted. Kryptoverdiene følger markedet i sanntid,
      og innskudd og uttak registrerer du med et par trykk.
    </p>
    <div class="button-row">
      <button type="button" class="button button-primary" data-action="add-account">${icon('plus', { size: 18 })} Legg til første konto</button>
      <button type="button" class="button button-secondary" data-action="load-demo">Prøv med eksempeldata</button>
    </div>
    <ul class="welcome-points">
      <li>${icon('wallet')}<span><strong>Alt på ett sted</strong> – bank, sparing, fond, aksjer, krypto og gjeld</span></li>
      <li>${icon('bars')}<span><strong>Live kryptokurser</strong> – verdien følger markedet sekund for sekund</span></li>
      <li>${icon('swap')}<span><strong>Innskudd og uttak</strong> – også overføringer mellom kontoene dine</span></li>
      <li>${icon('lock')}<span><strong>Privat</strong> – dataene dine forlater aldri nettleseren</span></li>
    </ul>
  </section>`;
}
