// Oppdaterer tallene på siden når kryptokursene endrer seg, uten å tegne hele siden på nytt
// (da ville åpne nedtrekkslister lukkes og verktøytips forsvinne hvert sekund).
// Elementer merkes med data-live-* i markupen; endrede tall blinker kort grønt eller rødt.
import { findCoin } from '../accounts.js';
import { formatMoney, formatPrice } from '../money.js';
import { summarizeNetWorth } from '../networth.js';
import { changeText, gainRatioText, gainText, liveStatus, trendClass } from './shared.js';

function setLive(element, text, value = null) {
  if (!element || element.textContent === text) return;
  const previous = Number(element.dataset.value);
  element.textContent = text;
  if (value === null) return;
  element.dataset.value = value;
  if (Number.isFinite(previous) && previous !== value) {
    element.classList.remove('flash-up', 'flash-down');
    void element.offsetWidth; // start animasjonen på nytt
    element.classList.add(value > previous ? 'flash-up' : 'flash-down');
  }
}

function setTrend(element, value) {
  if (!element) return;
  element.classList.remove('is-up', 'is-down');
  const trend = trendClass(value);
  if (trend) element.classList.add(trend);
}

export function updateLiveValues(container, state, feed) {
  const currency = state.settings.currency;
  const prices = feed.prices();
  const summary = summarizeNetWorth(state.accounts, state.movements, prices);
  const money = (minor, options) => formatMoney(minor, currency, { whole: true, ...options });
  const find = (selector) => container.querySelector(selector);

  setLive(find('[data-live="total"]'), money(summary.total), summary.total);
  setLive(find('[data-live="assets"]'), money(summary.assets), summary.assets);
  if (summary.gain) {
    const gainElement = find('[data-live="gain"]');
    setLive(gainElement, money(summary.gain.amount, { sign: true }), summary.gain.amount);
    setTrend(gainElement, summary.gain.amount);
    if (summary.gain.ratio !== null) setLive(find('[data-live="gain-ratio"]'), gainRatioText(summary.gain.ratio));
  }

  for (const row of summary.rows) {
    if (row.kind !== 'crypto') continue; // bare kryptoverdier endrer seg med kursene
    const id = CSS.escape(row.account.id);
    for (const element of container.querySelectorAll(`[data-live-account="${id}"]`)) setLive(element, money(row.value), row.value);
    for (const element of container.querySelectorAll(`[data-live-gain="${id}"]`)) {
      setLive(element, gainText(row.gain, row.gainRatio, currency));
      setTrend(element, row.gain);
    }
    for (const [symbol, quantity] of Object.entries(row.holdings)) {
      const price = prices[symbol]?.price;
      if (typeof price !== 'number') continue;
      const value = Math.round(quantity * price * 100);
      setLive(find(`[data-live-holding="${id}:${CSS.escape(symbol)}"]`), money(value), value);
    }
  }

  for (const type of summary.byType) {
    const shown = type.type === 'loan' ? -type.value : type.value; // gjeld vises som negativt tall
    setLive(find(`[data-live-group="${type.type}"]`), money(shown), shown);
    if (type.share !== null) {
      setLive(find(`[data-live-share="${type.type}"]`), `${Math.round(type.share * 100)} %`);
      const bar = find(`[data-live-share-bar="${type.type}"]`);
      if (bar) bar.style.width = `${(Math.max(0, type.share) * 100).toFixed(1)}%`;
    }
  }

  for (const element of container.querySelectorAll('[data-live-price]')) {
    const symbol = element.dataset.livePrice;
    const price = prices[symbol];
    if (price && findCoin(symbol)) setLive(element, formatPrice(price.price, currency), price.price);
  }
  for (const element of container.querySelectorAll('[data-live-change]')) {
    const change = prices[element.dataset.liveChange]?.change24h;
    setLive(element, changeText(change));
    setTrend(element, change);
  }

  const { status, text, title } = liveStatus(feed);
  for (const chip of container.querySelectorAll('[data-live-status]')) {
    chip.className = `live-chip live-${status}`;
    chip.title = title;
    setLive(chip.querySelector('[data-live-status-text]'), text);
  }
}
