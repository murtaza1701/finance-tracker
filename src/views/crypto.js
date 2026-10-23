// Krypto: total verdi i sanntid, endring siste døgn, dine eiendeler og markedet –
// bygd opp som en kryptobørs.
import { COINS, accountsIn, findCoin } from '../accounts.js';
import { html } from '../html.js';
import { icon } from '../icons.js';
import { formatMoney, formatPrice, formatQuantity } from '../money.js';
import { dayChange, heldAssets, holdingsOverview, summarizeNetWorth } from '../networth.js';
import { historyChart, historyFor, mountHistory } from './history.js';
import { updateLiveValues } from './live.js';
import { accountRows, changeText, coinIcon, emptyState, gainText, liveChip, newAccountButton, pageHeader, quickAction, trendClass } from './shared.js';

export function renderCrypto(ctx) {
  const { state, feed } = ctx;
  const currency = state.settings.currency;
  const accounts = accountsIn('crypto', state.accounts);
  const prices = feed.prices();
  const header = pageHeader('Krypto', { actions: liveChip(feed) });

  if (accounts.length === 0) {
    return html`${header}
      <section class="card">
        ${emptyState({
          emoji: '🪙',
          title: 'Ingen kryptokonto ennå',
          text: 'Legg til kontoen din hos Firi, Binance eller en annen børs, og registrer hva du eier. Verdien følger markedet i sanntid.',
          actions: html`<button type="button" class="button button-primary" data-action="add-account" data-type="crypto">${icon('plus', { size: 18 })} Legg til kryptokonto</button>`,
        })}
      </section>
      ${marketsCard(prices, currency)}`;
  }

  const summary = summarizeNetWorth(accounts, state.movements, prices);
  const holdings = holdingsOverview(accounts, state.movements, prices);
  const day = dayChange(holdings, summary.total);
  const series = historyFor(ctx, accounts);

  return html`${header}
    <section class="card wallet">
      <p class="hero-label">Total verdi</p>
      <p class="hero-value" data-live-section="crypto">${formatMoney(summary.total, currency, { whole: true })}</p>
      <p class="wallet-change">
        <span class="delta-pill ${trendClass(day.amount)}" data-live-day="crypto">${gainText(day.amount, day.ratio, currency)}</span>
        <span class="muted">siste 24 timer</span>
      </p>
      <div class="quick-actions">
        ${quickAction('plus', 'Kjøp', { action: 'section-move', data: { section: 'crypto', kind: 'buy' } })}
        ${quickAction('minus', 'Selg', { action: 'section-move', data: { section: 'crypto', kind: 'sell' } })}
      </div>
      ${historyChart(ctx, series, { label: 'Krypto', chartId: 'crypto' })}
    </section>

    <section class="card list-card">
      <header class="card-header">
        <div>
          <h2 class="card-title">Dine eiendeler</h2>
          <p class="card-subtitle">Avkastning totalt:
            <span class="gain ${trendClass(summary.gain.amount)}" data-live-sectiongain="crypto">${gainText(summary.gain.amount, summary.gain.ratio, currency)}</span>
          </p>
        </div>
      </header>
      ${holdings.length > 0
        ? html`<ul class="asset-list">${holdings.map((h) => assetRow(h, currency))}</ul>`
        : html`<p class="muted-note">Ingen mynter ennå. Trykk «Kjøp» for å registrere et kjøp.</p>`}
    </section>

    ${marketsCard(prices, currency)}

    <section class="card list-card">
      <header class="card-header">
        <h2 class="card-title">Kontoer</h2>
        ${newAccountButton('crypto')}
      </header>
      ${accountRows(summary.rows, currency)}
    </section>`;
}

export function mountCrypto(container, ctx) {
  const accounts = accountsIn('crypto', ctx.state.accounts);
  const cleanups = [mountHistory(container, ctx, accounts, { chartId: 'crypto', label: 'Krypto' })];
  cleanups.push(ctx.feed.subscribe(() => updateLiveValues(container, ctx.state, ctx.feed)));
  const assets = heldAssets(accounts, ctx.state.movements);
  if (assets.length > 0) ctx.feed.loadHistory(assets).then((changed) => changed && ctx.rerender());
  return () => cleanups.forEach((cleanup) => cleanup?.());
}

function assetRow(h, currency) {
  return html`<li>
    <a class="asset-row" href="#/konto?id=${h.accountIds[0]}">
      ${coinIcon(h.asset)}
      <span class="asset-main">
        <span class="asset-name">${findCoin(h.asset)?.name ?? h.asset}</span>
        <span class="asset-sub">${formatQuantity(h.quantity)} ${h.asset}</span>
      </span>
      <span class="asset-figures">
        <strong data-live-hvalue="${h.key}">${h.value === null ? '–' : formatMoney(h.value, currency, { whole: true })}</strong>
        <span class="change ${trendClass(h.change24h)}" data-live-change="${h.key}">${changeText(h.change24h)}</span>
      </span>
    </a>
  </li>`;
}

/** Alle myntene appen kjenner, med live kurs og en kjøpsknapp (som markedslisten på en børs). */
function marketsCard(prices, currency) {
  return html`<section class="card list-card">
    <header class="card-header">
      <div>
        <h2 class="card-title">Markeder</h2>
        <p class="card-subtitle">Kurser i sanntid · endring siste 24 timer</p>
      </div>
    </header>
    <ul class="asset-list">
      ${COINS.map((coin) => {
        const price = prices[coin.symbol];
        return html`<li class="market-row">
          ${coinIcon(coin.symbol)}
          <span class="asset-main">
            <span class="asset-name">${coin.name}</span>
            <span class="asset-sub">${coin.symbol}</span>
          </span>
          <span class="asset-figures">
            <strong data-live-price="${coin.symbol}">${price ? formatPrice(price.price, currency) : '–'}</strong>
            <span class="change ${trendClass(price?.change24h)}" data-live-change="${coin.symbol}">${changeText(price?.change24h)}</span>
          </span>
          <button type="button" class="button button-small button-secondary" data-action="buy-coin" data-asset="${coin.symbol}"
            aria-label="Kjøp ${coin.name}">Kjøp</button>
        </li>`;
      })}
    </ul>
  </section>`;
}
