// Kontotyper, banker/plattformer og kryptovalutaer for formueoversikten.

/**
 * kind bestemmer hvordan en konto får verdien sin:
 *  - balance:    saldo du registrerer selv (bank, sparing, annet)
 *  - investment: som balance, men appen regner også ut avkastning (fond, aksjer)
 *  - crypto:     antall mynter × live kurs
 *  - debt:       gjeld, trekkes fra formuen
 */
export const ACCOUNT_TYPES = [
  { id: 'bank', name: 'Bank', icon: '🏦', kind: 'balance', example: 'Brukskonto' },
  { id: 'savings', name: 'Sparing', icon: '🐷', kind: 'balance', example: 'BSU' },
  { id: 'fund', name: 'Fond', icon: '📈', kind: 'investment', example: 'Indeksfond' },
  { id: 'stocks', name: 'Aksjer', icon: '📊', kind: 'investment', example: 'Aksjesparekonto' },
  { id: 'crypto', name: 'Krypto', icon: '🪙', kind: 'crypto', example: 'Firi' },
  { id: 'other', name: 'Annet', icon: '💼', kind: 'balance', example: 'Kontanter' },
  { id: 'loan', name: 'Gjeld', icon: '🧾', kind: 'debt', example: 'Studielån' },
];

const typesById = new Map(ACCOUNT_TYPES.map((type) => [type.id, type]));

export function findAccountType(id) {
  return typesById.get(id) ?? null;
}

export function accountKind(account) {
  return findAccountType(account?.type)?.kind ?? 'balance';
}

/** Navnet på en bevegelse i lister, f.eks. "Innskudd" eller "Nedbetaling". */
export function movementLabel(kind, kindOfAccount) {
  if (kindOfAccount === 'debt') return { opening: 'Startsaldo', deposit: 'Lånte mer', withdrawal: 'Nedbetaling', value: 'Ny saldo' }[kind];
  const value = kindOfAccount === 'investment' ? 'Ny verdi' : 'Ny saldo';
  return { opening: 'Startsaldo', deposit: 'Innskudd', withdrawal: 'Uttak', value, buy: 'Kjøp', sell: 'Salg' }[kind];
}

/** Teksten på knappen for å registrere en bevegelse, f.eks. "Sett inn" eller "Nedbetal". */
export function actionLabel(kind, kindOfAccount) {
  if (kindOfAccount === 'debt') return { deposit: 'Lån mer', withdrawal: 'Nedbetal', value: 'Ny saldo' }[kind];
  const value = kindOfAccount === 'investment' ? 'Ny verdi' : 'Ny saldo';
  return { deposit: 'Sett inn', withdrawal: 'Ta ut', value, buy: 'Kjøp', sell: 'Selg' }[kind];
}

/** Forslag i feltet "Bank eller plattform". */
export const INSTITUTIONS = [
  'DNB', 'SpareBank 1', 'Nordea', 'Handelsbanken', 'Sbanken', 'Danske Bank', 'Storebrand', 'Bulder Bank',
  'Nordnet', 'KRON', 'Firi', 'Binance', 'Revolut', 'Lånekassen',
];

/**
 * Kryptovalutaer appen kan hente kurser for.
 * gecko: id hos CoinGecko (kurs i kroner), binance: handelspar for live-kurs i sanntid.
 */
export const COINS = [
  { symbol: 'BTC', name: 'Bitcoin', gecko: 'bitcoin', binance: 'BTCUSDT' },
  { symbol: 'ETH', name: 'Ethereum', gecko: 'ethereum', binance: 'ETHUSDT' },
  { symbol: 'SOL', name: 'Solana', gecko: 'solana', binance: 'SOLUSDT' },
  { symbol: 'XRP', name: 'XRP', gecko: 'ripple', binance: 'XRPUSDT' },
  { symbol: 'ADA', name: 'Cardano', gecko: 'cardano', binance: 'ADAUSDT' },
  { symbol: 'DOGE', name: 'Dogecoin', gecko: 'dogecoin', binance: 'DOGEUSDT' },
  { symbol: 'BNB', name: 'BNB', gecko: 'binancecoin', binance: 'BNBUSDT' },
  { symbol: 'LTC', name: 'Litecoin', gecko: 'litecoin', binance: 'LTCUSDT' },
  { symbol: 'DOT', name: 'Polkadot', gecko: 'polkadot', binance: 'DOTUSDT' },
  { symbol: 'LINK', name: 'Chainlink', gecko: 'chainlink', binance: 'LINKUSDT' },
  { symbol: 'AVAX', name: 'Avalanche', gecko: 'avalanche-2', binance: 'AVAXUSDT' },
  { symbol: 'POL', name: 'Polygon', gecko: 'polygon-ecosystem-token', binance: 'POLUSDT' },
  { symbol: 'USDC', name: 'USD Coin', gecko: 'usd-coin', binance: null },
  { symbol: 'USDT', name: 'Tether', gecko: 'tether', binance: null },
];

const coinsBySymbol = new Map(COINS.map((coin) => [coin.symbol, coin]));

export function findCoin(symbol) {
  return coinsBySymbol.get(symbol) ?? null;
}
