const express = require('express');
const { requireApi, wrap } = require('../middleware');

const router = express.Router();
router.use(requireApi);

const RANGES = [30, 90, 180, 360];
const cache = new Map();

async function cached(key, ttlMs, loader) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < ttlMs) return hit.data;
  const data = await loader();
  if (cache.size > 500) cache.clear();
  cache.set(key, { at: Date.now(), data });
  return data;
}

async function getJson(url, headers = {}) {
  const res = await fetch(url, {
    headers: { Accept: 'application/json', ...headers },
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) {
    const err = new Error('Upstream ' + res.status);
    err.upstream = res.status;
    throw err;
  }
  return res.json();
}

function fail(res, err) {
console.error('Market data error:', err.message, err.cause ? '| cause: ' + (err.cause.code || err.cause.message) : '');  if (err.upstream === 404) return res.status(404).json({ error: 'Nothing found for that name or ticker.' });
  if (err.upstream === 429) return res.status(429).json({ error: 'Too many requests to the data provider. Wait a minute and try again.' });
  return res.status(502).json({ error: 'The market data provider is unavailable. Try again shortly.' });
}

function startDate(req) {
  const days = RANGES.includes(Number(req.query.days)) ? Number(req.query.days) : 90;
  return new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
}

// ---------- Crypto (CoinPaprika, no key) ----------
router.get('/crypto/search', wrap(async (req, res) => {
  const q = String(req.query.q || '').trim().slice(0, 40);
  if (q.length < 2) return res.status(400).json({ error: 'Type at least 2 characters.' });
  try {
    const data = await cached('cs:' + q.toLowerCase(), 10 * 60 * 1000, () =>
      getJson(`https://api.coinpaprika.com/v1/search?q=${encodeURIComponent(q)}&c=currencies&limit=8`));
    res.json((data.currencies || []).map(c => ({ id: c.id, name: c.name, symbol: c.symbol })));
  } catch (err) { fail(res, err); }
}));

router.get('/crypto/:id/history', wrap(async (req, res) => {
  const id = String(req.params.id);
  if (!/^[a-z0-9-]{1,60}$/.test(id)) return res.status(400).json({ error: 'Invalid coin.' });
  const start = startDate(req);
  try {
    const rows = await cached(`ch:${id}:${start}`, 10 * 60 * 1000, () =>
      getJson(`https://api.coinpaprika.com/v1/tickers/${id}/historical?start=${start}&interval=1d`));
    res.json(rows.map(r => ({ date: r.timestamp.slice(0, 10), price: r.price })));
  } catch (err) { fail(res, err); }
}));

// ---------- Stocks (Tiingo, needs TIINGO_KEY) ----------
router.get('/stock/:symbol/history', wrap(async (req, res) => {
  if (!process.env.TIINGO_KEY) {
    return res.status(503).json({ error: 'Stock data is not set up. Add TIINGO_KEY to your .env file.' });
  }
  const symbol = String(req.params.symbol).toUpperCase();
  if (!/^[A-Z.\-]{1,10}$/.test(symbol)) return res.status(400).json({ error: 'Enter a valid ticker, for example AAPL.' });
  const start = startDate(req);
  try {
    const rows = await cached(`sh:${symbol}:${start}`, 15 * 60 * 1000, () =>
      getJson(`https://api.tiingo.com/tiingo/daily/${symbol}/prices?startDate=${start}`,
        { Authorization: 'Token ' + process.env.TIINGO_KEY }));
    res.json(rows.map(r => ({ date: r.date.slice(0, 10), price: r.adjClose })));
  } catch (err) { fail(res, err); }
}));

// Latest price for one asset (USD). Used by watchlist and portfolio.
async function latestPrice(kind, id) {
  if (kind === 'crypto') {
    const t = await cached('cl:' + id, 5 * 60 * 1000, () =>
      getJson(`https://api.coinpaprika.com/v1/tickers/${id}`));
    const p = Number(t && t.quotes && t.quotes.USD && t.quotes.USD.price);
    if (!Number.isFinite(p)) throw new Error('No price');
    return p;
  }
  if (!process.env.TIINGO_KEY) throw new Error('No Tiingo key');
  const rows = await cached('sl:' + id, 15 * 60 * 1000, () =>
    getJson(`https://api.tiingo.com/tiingo/daily/${id}/prices`,
      { Authorization: 'Token ' + process.env.TIINGO_KEY }));
  const p = Number(rows[rows.length - 1].close);
  if (!Number.isFinite(p)) throw new Error('No price');
  return p;
}

module.exports = router;
module.exports.latestPrice = latestPrice;