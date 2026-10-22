# Pengeflyt – personal finance tracker

**Pengeflyt** (Norwegian for "money flow") is a personal finance tracker for students. You log what comes
in and what goes out, set a monthly budget for each spending category, and the app shows where your money
actually goes: how much you saved this month, which categories you spend the most on, which budgets are
about to run out, and how much you can still spend per day for the rest of the month.

It is a web app that runs entirely in the browser. There is no account and no server, and your data never
leaves your device (it is stored in the browser's `localStorage`).

> Built for Assignment 3 in *Intro til AI* (vibe coding): the app was planned, written, tested and improved
> together with an AI coding agent. See [How AI was used](#how-ai-was-used).

## Features

**1. Transactions**
- Add income or expenses in a few seconds: amount, category (with icons), date and an optional note
- Amounts can be typed the Norwegian or the English way: `450`, `129,90`, `1 234,50`, `1,234.50`, `199,-`
- Edit or delete any transaction. Deleting can be undone (toast button or <kbd>Ctrl</kbd>/<kbd>⌘</kbd>+<kbd>Z</kbd>)
- List grouped by day with daily totals, plus filters by month, type and category and a search box
- Export the list to CSV (opens in Excel, Numbers and Google Sheets)

**2. Monthly budgets**
- Set a monthly limit per category; each one gets a progress bar that turns amber at 80 % and red when over
- A marker on each bar shows how far through the month you are, so you can see if you're spending too fast
- "You can spend about 214 kr a day for the rest of the month"
- **Suggest budgets** fills in budgets from your average spending over the last 3 months

**3. Overview dashboard**
- Net balance for the month, how much of your income you kept, and change compared with last month
- Spending by category (select a category to jump to its transactions)
- Income vs. expenses for the last 6 months as a chart, with tooltips and a table view
- Budget watch: the budgets that need attention, and the most recent transactions

**Also**
- Demo data: six months of realistic sample data for a student in Norway, one click away
- Backup and restore (JSON file), and delete everything (with undo)
- Works on phones (bottom tab bar, bottom-sheet dialogs) and on desktop (sidebar)
- Light and dark mode, follows the device or can be chosen in Settings
- Currency setting (NOK, SEK, DKK, EUR, USD, GBP)
- Keyboard: <kbd>N</kbd> adds a transaction, <kbd>Ctrl</kbd>/<kbd>⌘</kbd>+<kbd>Z</kbd> undoes the last delete

## Run it locally

You only need Python 3 (preinstalled on macOS; on Windows get it from python.org). There is nothing to install.

```bash
python3 serve.py
```

Then open **http://localhost:8000**. Click **Explore with demo data** to fill the app with sample data.

Why a server? Browsers refuse to load JavaScript modules from a page opened as a file (`file://`), so
double-clicking `index.html` only shows a message explaining how to start the server.

## Tests

The calculations, parsing, storage and export logic are covered by 68 unit tests.

- **In the browser:** start the server and open **http://localhost:8000/tests/**
- **In a macOS terminal** (uses the JavaScript engine built into macOS):
  ```bash
  /System/Library/Frameworks/JavaScriptCore.framework/Versions/Current/Helpers/jsc -m tests/cli.js
  ```

See [Testing](#testing) for what was tested by hand and the bugs that testing found.

## Publish with GitHub Pages

The app is plain static files, so GitHub Pages can host it for free:

1. Create a new repository on GitHub and push this folder to it.
2. In the repository, go to **Settings → Pages**, choose **Deploy from a branch**, pick `main` and `/ (root)`, and save.
3. After a minute the app is live at `https://<your-username>.github.io/<repository-name>/`.

## How it's built

Plain HTML, CSS and JavaScript (ES modules), with no frameworks, no build step and no dependencies.

```
index.html          page shell: navigation and the dialogs
styles.css          all styling, light/dark themes, phone layout
serve.py            tiny local web server
src/
  app.js            entry point: routing (#/budgets …), rendering, button actions
  store.js          the data (transactions, budgets, settings): validation and saving to localStorage
  finance.js        all calculations: monthly totals, spending per category, budgets, suggestions
  money.js          reading typed amounts and formatting money
  dates.js          date helpers (always local time, never UTC)
  categories.js     the built-in categories
  charts.js         the chart, category bars and budget progress bars
  dialogs.js        add/edit transaction and budget dialogs
  csv.js            CSV export
  demo.js           demo data generator
  html.js           safe HTML templates (escapes everything users type)
  icons.js, ui.js   icons, toasts, confirm dialog, downloads
  views/            one file per page: dashboard, transactions, budgets, settings
tests/              unit tests and a tiny test runner
```

Some design decisions:
- **Money is stored in øre (whole numbers)**: `1 234,50 kr` is saved as `123450`. Decimal numbers don't add up
  exactly in JavaScript (`0.1 + 0.2 = 0.30000000000000004`), but whole numbers do.
- **Dates are stored as `YYYY-MM-DD` in local time.** Converting to UTC would move a transaction added at
  23:30 in Norway to the next day.
- **Everything the user types is escaped** before it is put on the page (`src/html.js`), and CSV exports
  neutralise text that a spreadsheet could run as a formula.
- **Saved data is validated when loaded.** If it is unreadable, a copy is kept instead of being overwritten.
- **Chart colours** were checked for contrast and colour-blindness safety, and status is never shown by
  colour alone (there is always an icon and a word too).

## How AI was used

The app was built with **Claude Code** (Anthropic's AI coding agent, model Claude Opus 5.5), working directly
in this project folder. The process:

1. **Idea → plan.** Starting from the assignment text and "I want to build a personal finance tracker", the
   AI proposed the scope: three core features (transactions, budgets, overview), demo data so the app can be
   explored straight away, and a zero-install web app that can be hosted for free on GitHub Pages.
   Node.js wasn't installed on the computer, so the AI chose a set-up that needs only a browser and Python.
2. **Logic first, with tests.** The calculations (money parsing, monthly totals, budgets, suggestions),
   the data store and the CSV export were written as plain functions with unit tests, before any screens.
3. **Interface.** Pages, dialogs, chart and styling were added on top, for both desktop and phone.
4. **Testing in a real browser.** The AI ran the app in a browser and clicked through every feature,
   on desktop and phone sizes, in light and dark mode, reading the page and taking screenshots. Every bug
   it found was fixed and re-tested (list below).
5. **Improving.** Wording, layout and the demo data were adjusted based on what the screenshots showed.

## Testing

**Automated:** 68 unit tests (`tests/`) for amount parsing (Norwegian/English formats), money
formatting, dates across month and year boundaries, monthly summaries, budget levels, the daily allowance,
budget suggestions, filtering and search, saving and loading (including corrupt or full storage),
backup validation, CSV escaping and formula protection, HTML escaping, chart scales and the demo data.

**By hand in the browser** (desktop 1024 px and phone 375 px, light and dark mode):

| Tested | Result |
|---|---|
| First visit shows a welcome screen; "Explore with demo data" fills the app | ✅ |
| Add a transaction; saving without a category shows an error; `1 234,5` is read as 1 234,50 kr | ✅ |
| A note containing `<b>test</b>` is shown as text, not as HTML | ✅ |
| Edit a transaction; delete it; undo from the toast and with ⌘Z | ✅ |
| Filter by month / type / category, search across all months; focus stays in the search box while typing | ✅ |
| Selecting a category on the overview opens its transactions | ✅ |
| Chart tooltip, chart ↔ table toggle (the numbers match the overview) | ✅ |
| Budgets: edit with invalid and valid input, suggestions + undo, past/current/future months | ✅ |
| Export CSV (correct rows and signed amounts, Excel-friendly), download backup, restore it (invalid rows skipped and reported) | ✅ |
| Currency and theme settings; delete all data + undo | ✅ |
| Phone layout: no sideways scrolling, bottom tab bar, dialogs as bottom sheets | ✅ |

**Bugs found while testing and reviewing the code (all fixed):**

1. The **Delete** button showed in the *Add* dialog. CSS `display: inline-flex` on buttons overrode the HTML
   `hidden` attribute. Fixed with a global `[hidden] { display: none !important }` rule.
2. **Negative amounts rounded differently** (`-kr 1,234` in the headline but `kr 1,235 spent` below it),
   because `Math.round(-1234.5)` is `-1234` in JavaScript. Fixed by rounding halves away from zero; a test
   now guards it.
3. **Editing an amount appended to the old one** (`266` → `266300,50`). The amount is now selected when the
   edit dialog opens, so typing replaces it.
4. On phones the **add dialog was wider than the screen**: an `<input>` has a default width of about 20
   characters, which at 28 px is wider than a phone. Fixed in CSS.
5. The **budget summary** used the wrong currency and said "left to spend" for months that are already over.
6. The **local server hung at start-up** on some networks (Python's server looks up the computer's host name);
   `serve.py` skips that lookup.
7. Small visual issues: a shadow from the hidden "skip to content" link showed in the corner, and the
   "On track" badge wrapped onto two lines on phones.
8. Two unit tests first failed because `Intl` puts a non-breaking space between "kr" and the number.
   The tests now ignore which kind of space is used.

## Ideas for next steps

- Recurring transactions (rent, salary and subscriptions added automatically each month)
- Custom categories
- Savings goals ("new laptop: 4 500 of 12 000 kr")
- Import transactions from a bank's CSV export
- Install as an app on the phone and use it offline (PWA)
