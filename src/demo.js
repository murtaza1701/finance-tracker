// Realistiske eksempeldata for en student i Norge, så appen kan prøves uten å taste inn
// måneder med data. En tilfeldighetsgenerator med fast startverdi gir de samme dataene
// hver gang for samme dato (det gjør dem også testbare).
import { currentMonth, daysInMonth, shiftMonth, toISODate } from './dates.js';

const NOTES = {
  groceries: ['Ukeshandel', 'Dagligvarer', 'Middagsingredienser', 'Snacks til kollokviet', 'Frukt og grønt', 'Frokostvarer'],
  dining: ['Lunsj i kantina', 'Pizza med venner', 'Kaffe', 'Sushikveld', 'Kebab etter trening', 'Brunsj'],
  fun: ['Kino', 'Konsertbillett', 'Brettspillkafé', 'Bowling', 'Quiz', 'Fotballkamp'],
  shopping: ['Ny jakke', 'Hodetelefoner', 'Løpesko', 'Bursdagsgave', 'Sykkellys', 'Mobildeksel'],
  health: ['Apotek', 'Tannlege', 'Vitaminer'],
  education: ['Utskrift', 'Notatbok og penner', 'Kalkulator'],
  transport: ['Togbillett hjem', 'Taxi', 'Bysykkel'],
  travel: ['Fly til Bergen', 'Hyttetur', 'Hostell i Trondheim'],
  gifts: ['Bursdagspenger', 'Gave fra bestemor'],
};

// Brukes bare hvis kursene ikke kunne hentes (f.eks. uten nett).
const FALLBACK_PRICES = { BTC: 760_000, ETH: 22_500, SOL: 1_400, USDT: 9.4 };

/** mulberry32 – en liten, kjent tilfeldighetsgenerator. */
function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Eksempeldata for begge delene av appen: transaksjoner og budsjetter (forbruk, 6 måneder)
 * og kontoer med bevegelser (formue, 12 måneder). priceOn(symbol, dato) gir historiske
 * kryptokurser, så kjøpene får realistiske antall.
 */
export function generateDemoData({ today = new Date(), months = 6, seed = 298, priceOn = null } = {}) {
  return { ...generateSpending({ today, months, seed }), ...generateNetWorth({ today, seed: seed + 1, priceOn }) };
}

function generateSpending({ today, months, seed }) {
  const random = seededRandom(seed);
  const between = (min, max) => min + random() * (max - min);
  const pick = (list) => list[Math.floor(random() * list.length)];
  const randomDay = (month) => 1 + Math.floor(random() * daysInMonth(month));
  const todayIso = toISODate(today);
  const transactions = [];

  const add = (type, category, month, day, kroner, note) => {
    const date = `${month}-${String(Math.min(day, daysInMonth(month))).padStart(2, '0')}`;
    if (date > todayIso) return; // ingenting i fremtiden
    transactions.push({
      id: `demo-${String(transactions.length + 1).padStart(3, '0')}`,
      type,
      category,
      date,
      note,
      amount: Math.round(kroner) * 100,
      createdAt: `${date}T12:00:00.000Z`,
    });
  };

  for (let i = months - 1; i >= 0; i--) {
    const month = shiftMonth(currentMonth(today), -i);
    const monthNumber = Number(month.slice(5));
    const isJuly = monthNumber === 7;

    // Inntekter: studielån og stipend (ikke i juli) og en deltidsjobb
    if (!isJuly) add('income', 'student-support', month, 15, 13_400, 'Månedlig studiestøtte');
    add('income', 'salary', month, 20, isJuly ? 21_500 : between(4_500, 7_500), isJuly ? 'Sommerjobb' : 'Deltidsjobb');
    if (random() < 0.35) add('income', 'gifts', month, randomDay(month), pick([300, 500, 1_000]), pick(NOTES.gifts));

    // Faste utgifter hver måned
    add('expense', 'housing', month, 1, 6_200, 'Husleie – studentbolig');
    add('expense', 'transport', month, 1, 549, 'Månedskort buss');
    add('expense', 'health', month, 3, 299, 'Treningssenter');
    add('expense', 'bills', month, 5, 299, 'Mobilregning');
    add('expense', 'subscriptions', month, 10, 129, 'Musikkstrømming');
    add('expense', 'subscriptions', month, 18, 149, 'Filmstrømming');

    // Daglig forbruk: dagligvarer hver 3.–4. dag, resten på tilfeldige dager
    for (let day = 1 + Math.floor(random() * 3); day <= daysInMonth(month); day += 3 + Math.floor(random() * 2)) {
      add('expense', 'groceries', month, day, between(120, 560), pick(NOTES.groceries));
    }
    const meals = 3 + Math.floor(random() * 5);
    for (let n = 0; n < meals; n++) add('expense', 'dining', month, randomDay(month), between(65, 380), pick(NOTES.dining));
    const outings = 1 + Math.floor(random() * 3);
    for (let n = 0; n < outings; n++) add('expense', 'fun', month, randomDay(month), between(120, 480), pick(NOTES.fun));
    if (random() < 0.7) add('expense', 'shopping', month, randomDay(month), between(199, 1_400), pick(NOTES.shopping));
    if (random() < 0.4) add('expense', 'health', month, randomDay(month), between(80, 650), pick(NOTES.health));
    if (random() < 0.3) add('expense', 'transport', month, randomDay(month), between(150, 900), pick(NOTES.transport));
    if (monthNumber === 8 || monthNumber === 1) add('expense', 'education', month, randomDay(month), between(600, 1_500), 'Lærebøker');
    else if (random() < 0.3) add('expense', 'education', month, randomDay(month), between(50, 300), pick(NOTES.education));
    if (isJuly) add('expense', 'travel', month, 12, between(1_800, 3_200), pick(NOTES.travel));
  }

  // Budsjetter for daglig forbruk; faste utgifter som husleie får ikke budsjett.
  const kr = (value) => value * 100;
  const budgets = {
    groceries: kr(3_200),
    dining: kr(1_100),
    transport: kr(700),
    fun: kr(900),
    shopping: kr(800),
    health: kr(400),
  };
  return { transactions, budgets };
}

function generateNetWorth({ today, seed, priceOn }) {
  const random = seededRandom(seed);
  const between = (min, max) => min + random() * (max - min);
  const todayIso = toISODate(today);
  const start = shiftMonth(currentMonth(today), -12);
  const kr = (value) => Math.round(value) * 100;
  const dayOf = (month, day) => `${month}-${String(Math.min(day, daysInMonth(month))).padStart(2, '0')}`;
  const price = (symbol, date) => priceOn?.(symbol, date) ?? FALLBACK_PRICES[symbol];
  const accounts = [];
  const movements = [];

  const account = (name, type, institution) => {
    const created = { id: `demo-konto-${accounts.length + 1}`, name, type, institution, createdAt: `${dayOf(start, 1)}T09:00:00.000Z` };
    accounts.push(created);
    return created;
  };
  const move = (target, kind, date, fields) => {
    if (date > todayIso) return; // ingenting i fremtiden
    movements.push({
      id: `demo-bev-${String(movements.length + 1).padStart(3, '0')}`,
      accountId: target.id,
      kind,
      date,
      note: '',
      createdAt: `${date}T12:00:00.000Z`,
      ...fields,
    });
  };
  const buy = (target, symbol, date, kroner, note) => {
    const quantity = Math.round((kroner / price(symbol, date)) * 1e8) / 1e8;
    move(target, 'buy', date, { asset: symbol, quantity, amount: kr(kroner), note });
  };

  const bank = account('Brukskonto', 'bank', 'DNB');
  const bsu = account('BSU', 'savings', 'DNB');
  const fund = account('Globalt indeksfond', 'fund', 'Nordnet');
  const stocks = account('Aksjesparekonto', 'stocks', 'Nordnet');
  const firi = account('Firi', 'crypto', 'Firi');
  const binance = account('Binance', 'crypto', 'Binance');
  const loan = account('Studielån', 'loan', 'Lånekassen');

  const first = dayOf(start, 1);
  move(bank, 'opening', first, { amount: kr(9_400), note: 'Startsaldo' });
  move(bsu, 'opening', first, { amount: kr(41_000), note: 'Startsaldo' });
  move(fund, 'opening', first, { amount: kr(18_600), invested: kr(16_500), note: 'Startsaldo' });
  move(loan, 'opening', first, { amount: kr(72_000), note: 'Startsaldo' });
  let bsuValue = 41_000;
  let fundValue = 18_600;
  let stockValue = 7_000;
  let loanValue = 72_000;

  for (let i = 0; i <= 12; i++) {
    const month = shiftMonth(start, i);
    const monthNumber = Number(month.slice(5));

    if (i > 0) move(bank, 'value', dayOf(month, 25), { amount: kr(between(5_500, 16_000)), note: 'Saldo fra nettbanken' });

    move(bsu, 'deposit', dayOf(month, 20), { amount: kr(2_000), note: 'Fast BSU-sparing' });
    bsuValue += 2_000;
    if (monthNumber === 12) {
      bsuValue = Math.round(bsuValue * 1.045);
      move(bsu, 'value', dayOf(month, 31), { amount: kr(bsuValue), note: 'Renter for året' });
    }

    move(fund, 'deposit', dayOf(month, 5), { amount: kr(1_000), note: 'Fast fondssparing' });
    fundValue += 1_000;
    if (i % 3 === 2) {
      fundValue = Math.round(fundValue * (1 + between(-0.04, 0.07)));
      move(fund, 'value', dayOf(month, 28), { amount: kr(fundValue), note: 'Verdi fra Nordnet' });
    }

    if (i === 2) move(stocks, 'opening', dayOf(month, 8), { amount: kr(stockValue), note: 'Kjøpte Equinor og DNB' });
    if (i > 2 && i % 2 === 0) {
      stockValue = Math.round(stockValue * (1 + between(-0.09, 0.09)));
      move(stocks, 'value', dayOf(month, 26), { amount: kr(stockValue), note: 'Verdi fra Nordnet' });
    }

    // Fast månedlig kjøp av krypto på Firi
    buy(firi, 'BTC', dayOf(month, 10), 500, 'Spareavtale');
    buy(firi, 'ETH', dayOf(month, 10), 300, 'Spareavtale');

    if (i === 7) buy(binance, 'USDT', dayOf(month, 3), 480, 'Satte inn USDT');
    if (i === 9) buy(binance, 'SOL', dayOf(month, 14), 1_500, 'Kjøpte SOL');

    // Studielånet øker ved hvert semester
    if (monthNumber === 1 || monthNumber === 8) {
      loanValue += 17_500;
      move(loan, 'value', dayOf(month, 15), { amount: kr(loanValue), note: 'Nytt semester' });
    }
  }

  return { accounts, movements };
}
