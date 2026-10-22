// Cloudflare Worker for Pengeflyt: henter aksjekurser fra Yahoo Finance og sender dem videre
// med CORS-tillatelse, så appen kan bruke dem fra nettleseren (Yahoo tillater ikke det selv).
// Limes inn i Cloudflare-dashbordet – se cloudflare/README.md.
//
//   ?symbol=EQNR.OL&range=1y   kurs nå og dagskurser bakover (range: 1d, 5d, 1mo, 3mo, 6mo, 1y)
//   ?search=equinor            søk etter ticker

// Bare disse sidene får lov til å lese svarene fra nettleseren.
const ALLOWED_ORIGINS = ['https://murtaza1701.github.io', 'http://localhost:8000', 'http://127.0.0.1:8000'];
const RANGES = ['1d', '5d', '1mo', '3mo', '6mo', '1y'];
const YAHOO = 'https://query1.finance.yahoo.com';

export default {
  async fetch(request) {
    const origin = request.headers.get('Origin');
    const cors = ALLOWED_ORIGINS.includes(origin) ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' } : { Vary: 'Origin' };
    if (request.method === 'OPTIONS') return new Response(null, { headers: { ...cors, 'Access-Control-Allow-Methods': 'GET' } });
    if (request.method !== 'GET') return reply({ error: 'Bare GET er støttet.' }, 405, cors);

    const params = new URL(request.url).searchParams;
    let upstream;
    if (params.has('search')) {
      const query = params.get('search').trim().slice(0, 40);
      if (!query) return reply({ error: 'Skriv inn noe å søke etter.' }, 400, cors);
      upstream = `${YAHOO}/v1/finance/search?q=${encodeURIComponent(query)}&quotesCount=8&newsCount=0`;
    } else {
      const symbol = params.get('symbol') ?? '';
      if (!/^[A-Za-z0-9.^=-]{1,20}$/.test(symbol)) return reply({ error: 'Ugyldig ticker, f.eks. EQNR.OL.' }, 400, cors);
      const range = RANGES.includes(params.get('range')) ? params.get('range') : '1d';
      upstream = `${YAHOO}/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=1d`;
    }

    // Svar mellomlagres i 60 sekunder, så mange oppslag på kort tid ikke belaster Yahoo.
    const response = await fetch(upstream, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Pengeflyt)' },
      cf: { cacheTtl: 60, cacheEverything: true },
    });
    return new Response(response.body, {
      status: response.status,
      headers: { ...cors, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=60' },
    });
  },
};

function reply(body, status, cors) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json; charset=utf-8' } });
}
