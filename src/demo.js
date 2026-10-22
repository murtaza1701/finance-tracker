// Realistic sample data for a student in Norway, so the app can be explored without
// typing in months of transactions. A seeded random number generator makes the
// output the same every time for the same date (which also makes it testable).
import { currentMonth, daysInMonth, shiftMonth, toISODate } from './dates.js';

const NOTES = {
  groceries: ['Weekly shop', 'Groceries', 'Dinner ingredients', 'Snacks for study group', 'Fruit & veg', 'Breakfast stuff'],
  dining: ['Lunch at the campus café', 'Pizza with friends', 'Coffee', 'Sushi night', 'Kebab after training', 'Brunch'],
  fun: ['Cinema', 'Concert ticket', 'Board game café', 'Bowling', 'Quiz night', 'Football match'],
  shopping: ['New jacket', 'Headphones', 'Running shoes', 'Birthday present', 'Bike lights', 'Phone case'],
  health: ['Pharmacy', 'Dentist check-up', 'Vitamins'],
  education: ['Printing credits', 'Notebook & pens', 'Calculator'],
  transport: ['Train ticket home', 'Taxi', 'City bike pass'],
  travel: ['Flight to Bergen', 'Weekend cabin trip', 'Hostel in Trondheim'],
  gifts: ['Birthday money', 'Gift from grandma'],
};

/** mulberry32 – a tiny, well-known pseudo-random number generator. */
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

export function generateDemoData({ today = new Date(), months = 6, seed = 298 } = {}) {
  const random = seededRandom(seed);
  const between = (min, max) => min + random() * (max - min);
  const pick = (list) => list[Math.floor(random() * list.length)];
  const randomDay = (month) => 1 + Math.floor(random() * daysInMonth(month));
  const todayIso = toISODate(today);
  const transactions = [];

  const add = (type, category, month, day, kroner, note) => {
    const date = `${month}-${String(Math.min(day, daysInMonth(month))).padStart(2, '0')}`;
    if (date > todayIso) return; // nothing in the future
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

    // Income: student loan & grant (not paid in July) and a part-time job
    if (!isJuly) add('income', 'student-support', month, 15, 13_400, 'Monthly student support');
    add('income', 'salary', month, 20, isJuly ? 21_500 : between(4_500, 7_500), isJuly ? 'Summer job' : 'Part-time job');
    if (random() < 0.35) add('income', 'gifts', month, randomDay(month), pick([300, 500, 1_000]), pick(NOTES.gifts));

    // Fixed monthly costs
    add('expense', 'housing', month, 1, 6_200, 'Rent – student housing');
    add('expense', 'transport', month, 1, 549, 'Monthly bus pass');
    add('expense', 'health', month, 3, 299, 'Gym membership');
    add('expense', 'bills', month, 5, 299, 'Phone bill');
    add('expense', 'subscriptions', month, 10, 129, 'Music streaming');
    add('expense', 'subscriptions', month, 18, 149, 'Video streaming');

    // Everyday spending: a grocery shop every 3–4 days, everything else on random days
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
    if (monthNumber === 8 || monthNumber === 1) add('expense', 'education', month, randomDay(month), between(600, 1_500), 'Textbooks');
    else if (random() < 0.3) add('expense', 'education', month, randomDay(month), between(50, 300), pick(NOTES.education));
    if (isJuly) add('expense', 'travel', month, 12, between(1_800, 3_200), pick(NOTES.travel));
  }

  // Budgets for everyday spending; fixed costs like rent are left without one.
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
