const express = require('express');
const PDFDocument = require('pdfkit');
const { pool } = require('../db');
const { requireApi, wrap } = require('../middleware');
const { latestPrice } = require('./market');

const router = express.Router();
router.use(requireApi);

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const validDate = s => DATE_RE.test(s) && !Number.isNaN(Date.parse(s));

function currentMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function cleanAsset(kind, raw) {
  const id = String(raw || '').trim();
  if (kind === 'crypto') return /^[a-z0-9-]{1,60}$/.test(id) ? id : null;
  if (kind === 'stock') {
    const t = id.toUpperCase();
    return /^[A-Z.\-]{1,10}$/.test(t) ? t : null;
  }
  return null;
}

async function priceMap(items) {
  const keys = [...new Set(items.map(i => i.kind + '|' + i.asset_id))];
  const results = await Promise.allSettled(keys.map(k => {
    const [kind, id] = k.split('|');
    return latestPrice(kind, id);
  }));
  const map = new Map();
  keys.forEach((k, i) => map.set(k, results[i].status === 'fulfilled' ? results[i].value : null));
  return map;
}

// ---------- Savings goals ----------
router.get('/goals', wrap(async (req, res) => {
  const [rows] = await pool.query(
    `SELECT id, name, target_amount AS target, saved_amount AS saved, deadline
     FROM savings_goals WHERE user_id = ? ORDER BY id DESC`, [req.session.userId]);
  res.json(rows);
}));

router.post('/goals', wrap(async (req, res) => {
  const name = String(req.body.name || '').trim().slice(0, 80);
  const target = Number(req.body.target);
  const deadline = String(req.body.deadline || '');
  if (name.length < 1) return res.status(400).json({ error: 'Enter a goal name.' });
  if (!Number.isFinite(target) || target <= 0 || target > 1e11) return res.status(400).json({ error: 'Enter a target amount greater than zero.' });
  if (deadline && !validDate(deadline)) return res.status(400).json({ error: 'Enter a valid deadline.' });
  const [count] = await pool.query('SELECT COUNT(*) AS n FROM savings_goals WHERE user_id = ?', [req.session.userId]);
  if (count[0].n >= 30) return res.status(400).json({ error: 'You can have up to 30 goals.' });
  await pool.query(
    'INSERT INTO savings_goals (user_id, name, target_amount, deadline) VALUES (?, ?, ?, ?)',
    [req.session.userId, name, Math.round(target * 100) / 100, deadline || null]);
  res.status(201).json({ ok: true });
}));

router.post('/goals/:id/contribute', wrap(async (req, res) => {
  const amount = Number(req.body.amount);
  if (!Number.isFinite(amount) || amount === 0 || Math.abs(amount) > 1e11) return res.status(400).json({ error: 'Enter a valid amount.' });
  const [found] = await pool.query('SELECT id FROM savings_goals WHERE id = ? AND user_id = ?', [req.params.id, req.session.userId]);
  if (!found.length) return res.status(404).json({ error: 'Goal not found.' });
  await pool.query(
    'UPDATE savings_goals SET saved_amount = GREATEST(0, saved_amount + ?) WHERE id = ? AND user_id = ?',
    [Math.round(amount * 100) / 100, req.params.id, req.session.userId]);
  res.json({ ok: true });
}));

router.delete('/goals/:id', wrap(async (req, res) => {
  await pool.query('DELETE FROM savings_goals WHERE id = ? AND user_id = ?', [req.params.id, req.session.userId]);
  res.json({ ok: true });
}));

// ---------- Watchlist ----------
router.get('/watchlist', wrap(async (req, res) => {
  const [rows] = await pool.query(
    'SELECT id, kind, asset_id, label FROM watchlist WHERE user_id = ? ORDER BY id DESC', [req.session.userId]);
  const prices = await priceMap(rows);
  res.json(rows.map(r => ({ ...r, price: prices.get(r.kind + '|' + r.asset_id) })));
}));

router.post('/watchlist', wrap(async (req, res) => {
  const kind = req.body.kind;
  const assetId = cleanAsset(kind, req.body.id);
  const label = String(req.body.label || '').trim().slice(0, 100);
  if (!assetId || !label) return res.status(400).json({ error: 'Choose an asset in the market chart first.' });
  const [count] = await pool.query('SELECT COUNT(*) AS n FROM watchlist WHERE user_id = ?', [req.session.userId]);
  if (count[0].n >= 30) return res.status(400).json({ error: 'Your watchlist is full (30 assets).' });
  await pool.query(
    `INSERT INTO watchlist (user_id, kind, asset_id, label) VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE label = VALUES(label)`,
    [req.session.userId, kind, assetId, label]);
  res.status(201).json({ ok: true });
}));

router.delete('/watchlist/:id', wrap(async (req, res) => {
  await pool.query('DELETE FROM watchlist WHERE id = ? AND user_id = ?', [req.params.id, req.session.userId]);
  res.json({ ok: true });
}));

// ---------- Portfolio ----------
router.get('/portfolio', wrap(async (req, res) => {
  const [rows] = await pool.query(
    `SELECT id, kind, asset_id, label, quantity, buy_price, buy_date
     FROM holdings WHERE user_id = ? ORDER BY buy_date DESC, id DESC`, [req.session.userId]);
  const prices = await priceMap(rows);
  res.json(rows.map(r => ({ ...r, price: prices.get(r.kind + '|' + r.asset_id) })));
}));

router.post('/portfolio', wrap(async (req, res) => {
  const kind = req.body.kind;
  const assetId = cleanAsset(kind, req.body.id);
  const label = String(req.body.label || '').trim().slice(0, 100);
  const quantity = Number(req.body.quantity);
  const buyPrice = Number(req.body.buy_price);
  const buyDate = String(req.body.buy_date || '');
  if (!assetId || !label) return res.status(400).json({ error: 'Choose an asset in the market chart first.' });
  if (!Number.isFinite(quantity) || quantity <= 0 || quantity > 1e12) return res.status(400).json({ error: 'Enter a quantity greater than zero.' });
  if (!Number.isFinite(buyPrice) || buyPrice <= 0 || buyPrice > 1e12) return res.status(400).json({ error: 'Enter the price you paid per unit.' });
  if (!validDate(buyDate)) return res.status(400).json({ error: 'Enter a valid purchase date.' });
  const [count] = await pool.query('SELECT COUNT(*) AS n FROM holdings WHERE user_id = ?', [req.session.userId]);
  if (count[0].n >= 100) return res.status(400).json({ error: 'You can record up to 100 holdings.' });
  await pool.query(
    'INSERT INTO holdings (user_id, kind, asset_id, label, quantity, buy_price, buy_date) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [req.session.userId, kind, assetId, label, quantity, buyPrice, buyDate]);
  res.status(201).json({ ok: true });
}));

router.delete('/portfolio/:id', wrap(async (req, res) => {
  await pool.query('DELETE FROM holdings WHERE id = ? AND user_id = ?', [req.params.id, req.session.userId]);
  res.json({ ok: true });
}));

// ---------- Physical assets ----------
// ---------- Physical assets ----------
const ASSET_CATEGORIES = ['Land', 'Building', 'Business', 'Vehicle', 'Equipment', 'Farm', 'Other'];

function validateAsset(body) {
  const category = String(body.category || '');
  const name = String(body.name || '').trim().slice(0, 80);
  const cost = Number(body.purchase_value);
  const rawCurrent = body.current_value;
  const current = rawCurrent === '' || rawCurrent == null ? cost : Number(rawCurrent);
  const rawIncome = body.monthly_income;
  const income = rawIncome === '' || rawIncome == null ? 0 : Number(rawIncome);
  const date = String(body.acquired_date || '');
  const note = String(body.note || '').trim().slice(0, 200);

  if (!ASSET_CATEGORIES.includes(category)) return { error: 'Choose a valid asset type.' };
  if (!name) return { error: 'Enter a name for the asset.' };
  if (!Number.isFinite(cost) || cost < 0 || cost > 1e13) return { error: 'Enter what you paid. Use 0 if it was a gift or inheritance.' };
  if (!Number.isFinite(current) || current < 0 || current > 1e13) return { error: 'Enter a valid current value.' };
  if (!Number.isFinite(income) || income < 0 || income > 1e12) return { error: 'Enter a valid monthly income, or leave it empty.' };
  if (!validDate(date)) return { error: 'Enter a valid date.' };
  const r = n => Math.round(n * 100) / 100;
  return { value: { category, name, purchase_value: r(cost), current_value: r(current), monthly_income: r(income), acquired_date: date, note } };
}

router.get('/assets', wrap(async (req, res) => {
  const [rows] = await pool.query(
    `SELECT id, category, name, purchase_value, current_value, monthly_income, acquired_date, note
     FROM physical_assets WHERE user_id = ? ORDER BY acquired_date DESC, id DESC`, [req.session.userId]);
  res.json({ categories: ASSET_CATEGORIES, assets: rows });
}));

router.post('/assets', wrap(async (req, res) => {
  const { error, value } = validateAsset(req.body);
  if (error) return res.status(400).json({ error });
  const [count] = await pool.query('SELECT COUNT(*) AS n FROM physical_assets WHERE user_id = ?', [req.session.userId]);
  if (count[0].n >= 100) return res.status(400).json({ error: 'You can record up to 100 assets.' });
  await pool.query(
    `INSERT INTO physical_assets (user_id, category, name, purchase_value, current_value, monthly_income, acquired_date, note)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [req.session.userId, value.category, value.name, value.purchase_value, value.current_value, value.monthly_income, value.acquired_date, value.note]);
  res.status(201).json({ ok: true });
}));

router.put('/assets/:id', wrap(async (req, res) => {
  const { error, value } = validateAsset(req.body);
  if (error) return res.status(400).json({ error });
  const [found] = await pool.query('SELECT id FROM physical_assets WHERE id = ? AND user_id = ?', [req.params.id, req.session.userId]);
  if (!found.length) return res.status(404).json({ error: 'Asset not found.' });
  await pool.query(
    `UPDATE physical_assets SET category = ?, name = ?, purchase_value = ?, current_value = ?, monthly_income = ?, acquired_date = ?, note = ?
     WHERE id = ? AND user_id = ?`,
    [value.category, value.name, value.purchase_value, value.current_value, value.monthly_income, value.acquired_date, value.note, req.params.id, req.session.userId]);
  res.json({ ok: true });
}));

router.delete('/assets/:id', wrap(async (req, res) => {
  await pool.query('DELETE FROM physical_assets WHERE id = ? AND user_id = ?', [req.params.id, req.session.userId]);
  res.json({ ok: true });
}));

// ---------- Net worth ----------
router.get('/networth', wrap(async (req, res) => {
  const uid = req.session.userId;
  const [[bal]] = await pool.query(
    `SELECT COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE -amount END), 0) AS v
     FROM transactions WHERE user_id = ?`, [uid]);
  const [[ast]] = await pool.query(
    'SELECT COALESCE(SUM(current_value), 0) AS v, COALESCE(SUM(monthly_income), 0) AS inc FROM physical_assets WHERE user_id = ?', [uid]);
  const [[usr]] = await pool.query('SELECT usd_rate FROM users WHERE id = ?', [uid]);
  const [holdings] = await pool.query('SELECT kind, asset_id, quantity FROM holdings WHERE user_id = ?', [uid]);

  const prices = await priceMap(holdings);
  let usdValue = 0, unpriced = 0;
  for (const h of holdings) {
    const p = prices.get(h.kind + '|' + h.asset_id);
    if (p == null) unpriced++; else usdValue += Number(h.quantity) * p;
  }

  const rate = usr && usr.usd_rate ? Number(usr.usd_rate) : null;
  const investments = holdings.length === 0 ? 0 : (rate ? usdValue * rate : null);
  const cash = Number(bal.v);
  const assets = Number(ast.v);

  res.json({
    cash, assets, investments, rate, unpriced,
    holdings: holdings.length,
    needsRate: holdings.length > 0 && !rate,
    monthlyIncome: Number(ast.inc),
    total: cash + assets + (investments || 0),
  });
}));

// ---------- PDF report ----------
const money = n => 'NGN ' + Number(n).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const INK = '#12261f', GREY = '#555555', GREEN = '#17744f', RED = '#c4432b';

function ensure(doc, h) {
  if (doc.y + h > doc.page.height - doc.page.margins.bottom) doc.addPage();
}
function heading(doc, text) {
  ensure(doc, 50);
  doc.moveDown(0.8);
  doc.font('Helvetica-Bold').fontSize(13).fillColor(INK).text(text, doc.page.margins.left, doc.y);
  doc.moveDown(0.3);
}
function row(doc, cols, opts = {}) {
  ensure(doc, 18);
  const y = doc.y;
  doc.font(opts.bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(9.5).fillColor(opts.color || '#222222');
  cols.forEach(c => doc.text(String(c.text), c.x, y, { width: c.w, align: c.align || 'left', lineBreak: false, ellipsis: true }));
  doc.y = y + 16;
  doc.x = doc.page.margins.left;
}
function empty(doc, text) {
  doc.font('Helvetica-Oblique').fontSize(9.5).fillColor(GREY).text(text, doc.page.margins.left, doc.y);
}

router.get('/report.pdf', wrap(async (req, res) => {
  const [assets] = await pool.query(
    'SELECT category, name, purchase_value, current_value FROM physical_assets WHERE user_id = ? ORDER BY id', [uid]
);
  const uid = req.session.userId;
  const month = MONTH_RE.test(String(req.query.month || '')) ? String(req.query.month) : currentMonth();
  const [y, m] = month.split('-').map(Number);
  const monthName = new Date(y, m - 1, 1).toLocaleString('en-GB', { month: 'long', year: 'numeric' });

  const [[bal]] = await pool.query(
    `SELECT COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE -amount END), 0) AS v
     FROM transactions WHERE user_id = ?`, [uid]);
  const [totals] = await pool.query(
    `SELECT type, COALESCE(SUM(amount), 0) AS total FROM transactions
     WHERE user_id = ? AND DATE_FORMAT(date, '%Y-%m') = ? GROUP BY type`, [uid, month]);
  const income = Number((totals.find(t => t.type === 'income') || {}).total || 0);
  const expense = Number((totals.find(t => t.type === 'expense') || {}).total || 0);

  const [byCategory] = await pool.query(
    `SELECT category, SUM(amount) AS total FROM transactions
     WHERE user_id = ? AND type = 'expense' AND DATE_FORMAT(date, '%Y-%m') = ?
     GROUP BY category ORDER BY total DESC`, [uid, month]);
  const spent = Object.fromEntries(byCategory.map(c => [c.category, Number(c.total)]));

  const [budgets] = await pool.query(
    'SELECT category, monthly_limit FROM budgets WHERE user_id = ? ORDER BY category', [uid]);
  const [txs] = await pool.query(
    `SELECT date, type, category, amount, note FROM transactions
     WHERE user_id = ? AND DATE_FORMAT(date, '%Y-%m') = ? ORDER BY date, id LIMIT 1000`, [uid, month]);
  const [goals] = await pool.query(
    'SELECT name, target_amount, saved_amount, deadline FROM savings_goals WHERE user_id = ? ORDER BY id', [uid]);

  const doc = new PDFDocument({ size: 'A4', margin: 50 });
  res.set({
    'Content-Type': 'application/pdf',
    'Content-Disposition': `attachment; filename="ledgerly-report-${month}.pdf"`,
  });
  doc.pipe(res);

  const L = doc.page.margins.left;
  doc.font('Helvetica-Bold').fontSize(22).fillColor(INK).text('Ledgerly', L, 50);
  doc.font('Helvetica').fontSize(11).fillColor(GREY)
     .text(`Monthly report: ${monthName}`, L, doc.y)
     .text(`Prepared for ${req.session.name}  |  Generated ${new Date().toLocaleDateString('en-GB')}`, L, doc.y);

  heading(doc, 'Summary');
  const kv = (label, value, color) => row(doc, [
    { text: label, x: 50, w: 250 }, { text: value, x: 300, w: 245, align: 'right' }], { color });
  kv('Income this month', money(income), GREEN);
  kv('Spending this month', money(expense), RED);
  kv('Net for the month', money(income - expense), income - expense >= 0 ? GREEN : RED);
  kv('Total balance (all time)', money(bal.v));

  heading(doc, 'Spending by category');
  if (!byCategory.length) empty(doc, 'No spending recorded this month.');
  else {
    row(doc, [{ text: 'Category', x: 50, w: 200 }, { text: 'Amount', x: 250, w: 180, align: 'right' }, { text: 'Share', x: 440, w: 105, align: 'right' }], { bold: true });
    byCategory.forEach(c => row(doc, [
      { text: c.category, x: 50, w: 200 },
      { text: money(c.total), x: 250, w: 180, align: 'right' },
      { text: expense ? ((Number(c.total) / expense) * 100).toFixed(1) + '%' : '0%', x: 440, w: 105, align: 'right' },
    ]));
  }

  heading(doc, 'Budgets');
  if (!budgets.length) empty(doc, 'No budgets set.');
  else {
    row(doc, [{ text: 'Category', x: 50, w: 140 }, { text: 'Spent', x: 190, w: 110, align: 'right' }, { text: 'Limit', x: 300, w: 110, align: 'right' }, { text: 'Status', x: 420, w: 125, align: 'right' }], { bold: true });
    budgets.forEach(b => {
      const s = spent[b.category] || 0;
      const lim = Number(b.monthly_limit);
      const status = s > lim ? 'Over budget' : s >= lim * 0.8 ? '80% or more used' : 'On track';
      row(doc, [
        { text: b.category, x: 50, w: 140 },
        { text: money(s), x: 190, w: 110, align: 'right' },
        { text: money(lim), x: 300, w: 110, align: 'right' },
        { text: status, x: 420, w: 125, align: 'right' },
      ], { color: s > lim ? RED : '#222222' });
    });
  }

  heading(doc, 'Savings goals');
  if (!goals.length) empty(doc, 'No savings goals yet.');
  else {
    row(doc, [{ text: 'Goal', x: 50, w: 180 }, { text: 'Saved', x: 230, w: 110, align: 'right' }, { text: 'Target', x: 340, w: 110, align: 'right' }, { text: 'Progress', x: 460, w: 85, align: 'right' }], { bold: true });
    goals.forEach(g => {
      const pct = Math.min(100, Math.round((Number(g.saved_amount) / Number(g.target_amount)) * 100));
      row(doc, [
        { text: g.name, x: 50, w: 180 },
        { text: money(g.saved_amount), x: 230, w: 110, align: 'right' },
        { text: money(g.target_amount), x: 340, w: 110, align: 'right' },
        { text: pct + '%', x: 460, w: 85, align: 'right' },
      ]);
    });
  }

    heading(doc, 'Physical assets');
  if (!assets.length) empty(doc, 'No physical assets recorded.');
  else {
    row(doc, [{ text: 'Asset', x: 50, w: 165 }, { text: 'Type', x: 220, w: 75 }, { text: 'Cost', x: 300, w: 115, align: 'right' }, { text: 'Current value', x: 420, w: 125, align: 'right' }], { bold: true });
    let totalCost = 0, totalValue = 0;
    assets.forEach(a => {
      totalCost += Number(a.purchase_value);
      totalValue += Number(a.current_value);
      row(doc, [
        { text: a.name, x: 50, w: 165 }, { text: a.category, x: 220, w: 75 },
        { text: money(a.purchase_value), x: 300, w: 115, align: 'right' },
        { text: money(a.current_value), x: 420, w: 125, align: 'right' },
      ]);
    });
    row(doc, [
      { text: 'Total', x: 50, w: 165 },
      { text: money(totalCost), x: 300, w: 115, align: 'right' },
      { text: money(totalValue), x: 420, w: 125, align: 'right' },
    ], { bold: true });
  }

  heading(doc, 'Transactions');
  if (!txs.length) empty(doc, 'No transactions this month.');
  else {
    row(doc, [{ text: 'Date', x: 50, w: 60 }, { text: 'Category', x: 115, w: 110 }, { text: 'Note', x: 230, w: 160 }, { text: 'Amount', x: 395, w: 150, align: 'right' }], { bold: true });
    txs.forEach(t => row(doc, [
      { text: t.date, x: 50, w: 60 },
      { text: t.category, x: 115, w: 110 },
      { text: t.note || '', x: 230, w: 160 },
      { text: (t.type === 'expense' ? '-' : '+') + money(t.amount), x: 395, w: 150, align: 'right' },
    ], { color: t.type === 'expense' ? RED : GREEN }));
  }

  doc.moveDown(1.5);
  doc.font('Helvetica').fontSize(8).fillColor(GREY)
     .text('Generated by Ledgerly. For personal record keeping only.', L, doc.y);
  doc.end();
}));

module.exports = router;