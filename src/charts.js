// Charts and other small data displays. Colors come from CSS custom properties
// (see styles.css), so light and dark mode both work.
import { getCategory } from './categories.js';
import { monthLabel } from './dates.js';
import { escapeHtml, html } from './html.js';
import { icon } from './icons.js';
import { formatCompact, formatMoney } from './money.js';

const round = (value) => Math.round(value * 100) / 100;

/** Rounds the axis maximum up to a "nice" number (1, 2, 2.5 or 5 × 10ⁿ steps) and returns the ticks. */
export function niceScale(maxValue, tickCount = 4) {
  const top = maxValue > 0 ? maxValue : 100_000; // an empty chart still gets an axis (0–1 000)
  const rough = top / tickCount;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const residual = rough / magnitude;
  const nice = residual <= 1 ? 1 : residual <= 2 ? 2 : residual <= 2.5 ? 2.5 : residual <= 5 ? 5 : 10;
  const step = nice * magnitude;
  const max = Math.ceil(top / step) * step;
  const ticks = [];
  for (let i = 0; i * step <= max; i++) ticks.push(i * step);
  return { max, step, ticks };
}

/** SVG path for a column with rounded top corners and a square base. */
function columnPath(x, y, width, height, radius = 4) {
  const r = Math.min(radius, width / 2, height);
  return (
    `M${round(x)},${round(y + height)}V${round(y + r)}A${r},${r} 0 0 1 ${round(x + r)},${round(y)}` +
    `H${round(x + width - r)}A${r},${r} 0 0 1 ${round(x + width)},${round(y + r)}V${round(y + height)}Z`
  );
}

/** Horizontal bars of spending per category; each bar links to those transactions. */
export function categoryBars(rows, { currency, month }) {
  const largest = Math.max(1, ...rows.map((row) => row.amount));
  return html`<ol class="cat-bars">
    ${rows.map((row) => {
      const category = getCategory(row.category);
      const width = (row.amount / largest) * 100;
      return html`<li>
        <a class="cat-bar" href="#/transactions?month=${month}&amp;category=${row.category}" title="Show ${category.name} transactions">
          <span class="cat-bar-label"><span class="cat-icon" aria-hidden="true">${category.icon}</span>${category.name}</span>
          <span class="cat-bar-value"><strong>${formatMoney(row.amount, currency, { whole: true })}</strong><span class="cat-bar-share">${Math.round(row.share * 100)}%</span></span>
          <span class="cat-bar-track" aria-hidden="true"><span class="cat-bar-fill" style="width: ${width.toFixed(1)}%"></span></span>
        </a>
      </li>`;
    })}
  </ol>`;
}

/** A progress bar for a budget. `pace` (0–1) draws a marker for today. */
export function budgetMeter({ spent, limit, level }, { label, currency, pace = null }) {
  const percent = Math.round((spent / limit) * 100);
  return html`<div class="meter meter-${level}" role="progressbar" aria-label="${label}" aria-valuemin="0" aria-valuemax="100"
      aria-valuenow="${Math.min(percent, 100)}"
      aria-valuetext="${formatMoney(spent, currency, { whole: true })} of ${formatMoney(limit, currency, { whole: true })} (${percent}%)">
    <span class="meter-fill" style="width: ${Math.min(percent, 100)}%"></span>
    ${pace === null ? '' : html`<span class="meter-pace" style="left: ${(pace * 100).toFixed(1)}%" title="Today"></span>`}
  </div>`;
}

const STATUS = {
  ok: ['check', 'On track'],
  warning: ['warning', 'Near the limit'],
  over: ['over', 'Over budget'],
};

/** Budget status: always an icon and a word, never color alone. */
export function statusBadge(level) {
  const [iconName, label] = STATUS[level];
  return html`<span class="status status-${level}">${icon(iconName, { size: 16 })}${label}</span>`;
}

/** The table version of the income vs. expenses chart (for screen readers and exact numbers). */
export function seriesTable(series, currency) {
  return html`<div class="table-scroll"><table class="data-table">
    <caption class="visually-hidden">Income and expenses per month</caption>
    <thead><tr><th scope="col">Month</th><th scope="col">Income</th><th scope="col">Expenses</th><th scope="col">Net</th></tr></thead>
    <tbody>
      ${series.map(
        (d) => html`<tr>
          <th scope="row">${monthLabel(d.month)}</th>
          <td>${formatMoney(d.income, currency, { whole: true })}</td>
          <td>${formatMoney(d.expense, currency, { whole: true })}</td>
          <td>${formatMoney(d.net, currency, { sign: true, whole: true })}</td>
        </tr>`,
      )}
    </tbody>
  </table></div>`;
}

/**
 * Draws grouped columns (income vs. expenses per month) into `container` as SVG,
 * sized to the container and redrawn when it resizes. Hovering or focusing a month
 * shows a tooltip with the exact numbers. Returns a cleanup function.
 */
export function mountIncomeExpenseChart(container, series, { currency, selectedMonth }) {
  container.innerHTML = '<div class="chart-plot"></div><div class="chart-tooltip" aria-hidden="true" hidden></div>';
  const plot = container.querySelector('.chart-plot');
  const tooltip = container.querySelector('.chart-tooltip');
  let layout = null;

  function draw() {
    const width = Math.max(280, Math.floor(plot.clientWidth));
    const height = 240;
    const margin = { top: 12, right: 4, bottom: 28, left: 48 };
    const plotWidth = width - margin.left - margin.right;
    const plotHeight = height - margin.top - margin.bottom;
    const { max, ticks } = niceScale(Math.max(...series.map((d) => Math.max(d.income, d.expense))));
    const base = Math.round(margin.top + plotHeight);
    const y = (value) => base - (value / max) * plotHeight;
    const band = plotWidth / series.length;
    const barWidth = Math.max(6, Math.min(24, (band * 0.62 - 2) / 2));
    layout = { width, margin, band };

    const parts = [];
    series.forEach((_, i) => {
      parts.push(`<rect class="band" data-index="${i}" x="${round(margin.left + band * i)}" y="${margin.top}" width="${round(band)}" height="${base - margin.top}"/>`);
    });
    for (const tick of ticks) {
      const ty = Math.round(y(tick)) + 0.5;
      if (tick > 0) parts.push(`<line class="gridline" x1="${margin.left}" x2="${width - margin.right}" y1="${ty}" y2="${ty}"/>`);
      parts.push(`<text class="tick" x="${margin.left - 8}" y="${ty}" text-anchor="end" dominant-baseline="middle">${escapeHtml(formatCompact(tick))}</text>`);
    }
    series.forEach((d, i) => {
      const center = margin.left + band * i + band / 2;
      // two columns per month with a 2px gap between them
      if (d.income > 0) parts.push(`<path class="bar bar-income" d="${columnPath(center - 1 - barWidth, y(d.income), barWidth, base - y(d.income))}"/>`);
      if (d.expense > 0) parts.push(`<path class="bar bar-expense" d="${columnPath(center + 1, y(d.expense), barWidth, base - y(d.expense))}"/>`);
      const selected = d.month === selectedMonth ? ' is-selected' : '';
      parts.push(`<text class="tick x-tick${selected}" x="${round(center)}" y="${height - 8}" text-anchor="middle">${escapeHtml(monthLabel(d.month, { short: true }))}</text>`);
    });
    parts.push(`<line class="baseline" x1="${margin.left}" x2="${width - margin.right}" y1="${base + 0.5}" y2="${base + 0.5}"/>`);
    series.forEach((d, i) => {
      // Invisible hit areas, a whole month wide, so the pointer doesn't have to land on a thin bar.
      const label = `${monthLabel(d.month)}: income ${formatMoney(d.income, currency, { whole: true })}, expenses ${formatMoney(d.expense, currency, { whole: true })}`;
      parts.push(`<rect class="hit" tabindex="0" role="img" aria-label="${escapeHtml(label)}" data-index="${i}" x="${round(margin.left + band * i)}" y="0" width="${round(band)}" height="${height}"/>`);
    });
    plot.innerHTML = `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="group" aria-label="Income and expenses per month">${parts.join('')}</svg>`;
  }

  function show(index) {
    const d = series[index];
    tooltip.innerHTML = String(html`
      <p class="tooltip-title">${monthLabel(d.month)}</p>
      <p class="tooltip-row"><span class="tooltip-key key-income"></span><strong>${formatMoney(d.income, currency, { whole: true })}</strong><span>Income</span></p>
      <p class="tooltip-row"><span class="tooltip-key key-expense"></span><strong>${formatMoney(d.expense, currency, { whole: true })}</strong><span>Expenses</span></p>
      <p class="tooltip-row tooltip-net"><span class="tooltip-key"></span><strong>${formatMoney(d.net, currency, { sign: true, whole: true })}</strong><span>Net</span></p>`);
    tooltip.hidden = false;
    const { width, margin, band } = layout;
    const left = margin.left + band * index;
    const tipWidth = tooltip.offsetWidth;
    let x = left + band + 4; // right of the month…
    if (x + tipWidth > width) x = left - tipWidth - 4; // …or left of it when there's no room
    tooltip.style.transform = `translate(${Math.round(Math.max(0, x))}px, ${margin.top}px)`;
    for (const el of plot.querySelectorAll('.band')) el.classList.toggle('is-active', Number(el.dataset.index) === index);
  }

  function hide() {
    tooltip.hidden = true;
    for (const el of plot.querySelectorAll('.band.is-active')) el.classList.remove('is-active');
  }

  const indexFrom = (event) => {
    const hit = event.target.closest?.('.hit');
    return hit ? Number(hit.dataset.index) : null;
  };
  container.addEventListener('pointerover', (event) => {
    const index = indexFrom(event);
    if (index !== null) show(index);
  });
  container.addEventListener('pointerleave', (event) => {
    if (event.pointerType !== 'touch') hide(); // on phones the tooltip stays until another tap
  });
  container.addEventListener('focusin', (event) => {
    const index = indexFrom(event);
    if (index !== null) show(index);
  });
  container.addEventListener('focusout', hide);

  draw();
  let lastWidth = plot.clientWidth;
  const observer = new ResizeObserver(() => {
    if (plot.clientWidth === lastWidth) return;
    lastWidth = plot.clientWidth;
    hide();
    draw();
  });
  observer.observe(plot);
  return () => observer.disconnect();
}
