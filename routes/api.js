const express = require('express');
const { pool } = require('../db');
const categories = require('../categories');
const { requireApi, wrap } = require('../middleware');

const router = express.Router();
router.use(requireApi);

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function currentMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function monthParam(req) {
  const m = String(req.query.month || '');
  return MONTH_RE.test(m) ? m : currentMonth();
}

function validateTransaction(body) {
  const type = body.type;
  const category = String(body.category || '');
  const amount = Number(body.amount);
  const note = String(body.note || '').trim().slice(0, 200);
  const date = String(body.date || '');

  if (type !== 'income' && type !== 'expense') return { error: 'Choose income or expense.' };
  if (!categories[type].includes(category)) return { error: 'Choose a valid category.' };
  if (!Number.isFinite(amount) || amount <= 0 || amount > 1e11) return { error: 'Enter an amount greater than zero.' };
  if (!DATE_RE.test(date) || Number.isNaN(Date.parse(date))) return { error: 'Enter a valid date.' };
  return { value: { type, category, amount: Math.round(amount * 100) / 100, note, date } };
}

router.get('/categories', (req, res) => res.json(categories));

// ---------- Transactions ----------
router.get('/transactions', wrap(async (req, res) => {
  const month = monthParam(req);
  const type = req.query.type;
  const q = String(req.query.q || '').trim();

  let sql = `SELECT id, type, category, amount, note, date FROM transactions
             WHERE user_id = ? AND DATE_FORMAT(date, '%Y-%m') = ?`;
  const params = [req.session.userId, month];
  if (type === 'income' || type === 'expense') { sql += ' AND type = ?'; params.push(type); }
  if (q) { sql += ' AND (note LIKE ? OR category LIKE ?)'; params.push(`%${q}%`, `%${q}%`); }
  sql += ' ORDER BY date DESC, id DESC';

  const [rows] = await pool.query(sql, params);
  res.json(rows);
}));

router.post('/transactions', wrap(async (req, res) => {
  const { error, value } = validateTransaction(req.body);
  if (error) return res.status(400).json({ error });
  const [result] = await pool.query(
    'INSERT INTO transactions (user_id, type, category, amount, note, date) VALUES (?, ?, ?, ?, ?, ?)',
    [req.session.userId, value.type, value.category, value.amount, value.note, value.date]);
  res.status(201).json({ id: result.insertId, ...value });
}));

router.put('/transactions/:id', wrap(async (req, res) => {
  const { error, value } = validateTransaction(req.body);
  if (error) return res.status(400).json({ error });
  const [result] = await pool.query(
    'UPDATE transactions SET type = ?, category = ?, amount = ?, note = ?, date = ? WHERE id = ? AND user_id = ?',
    [value.type, value.category, value.amount, value.note, value.date, req.params.id, req.session.userId]);
  if (!result.affectedRows) return res.status(404).json({ error: 'Transaction not found.' });
  res.json({ id: Number(req.params.id), ...value });
}));

router.delete('/transactions/:id', wrap(async (req, res) => {
  const [result] = await pool.query(
    'DELETE FROM transactions WHERE id = ? AND user_id = ?', [req.params.id, req.session.userId]);
  if (!result.affectedRows) return res.status(404).json({ error: 'Transaction not found.' });
  res.json({ ok: true });
}));

// ---------- Budgets ----------
router.put('/budgets', wrap(async (req, res) => {
  const category = String(req.body.category || '');
  const limit = Number(req.body.limit);
  if (!categories.expense.includes(category)) return res.status(400).json({ error: 'Choose an expense category.' });
  if (!Number.isFinite(limit) || limit < 0 || limit > 1e11) return res.status(400).json({ error: 'Enter a valid limit.' });

  if (limit === 0) {
    await pool.query('DELETE FROM budgets WHERE user_id = ? AND category = ?', [req.session.userId, category]);
  } else {
    await pool.query(
      `INSERT INTO budgets (user_id, category, monthly_limit) VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE monthly_limit = VALUES(monthly_limit)`,
      [req.session.userId, category, limit]);
  }
  res.json({ ok: true });
}));

// ---------- Dashboard summary ----------
router.get('/summary', wrap(async (req, res) => {
  const uid = req.session.userId;
  const month = monthParam(req);

  const [[bal]] = await pool.query(
    `SELECT COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE -amount END), 0) AS v
     FROM transactions WHERE user_id = ?`, [uid]);

  const [totals] = await pool.query(
    `SELECT type, COALESCE(SUM(amount), 0) AS total FROM transactions
     WHERE user_id = ? AND DATE_FORMAT(date, '%Y-%m') = ? GROUP BY type`, [uid, month]);
  const income = (totals.find(t => t.type === 'income') || {}).total || 0;
  const expense = (totals.find(t => t.type === 'expense') || {}).total || 0;

  const [byCategory] = await pool.query(
    `SELECT category, SUM(amount) AS total FROM transactions
     WHERE user_id = ? AND type = 'expense' AND DATE_FORMAT(date, '%Y-%m') = ?
     GROUP BY category ORDER BY total DESC`, [uid, month]);

  const [y, m] = month.split('-').map(Number);
  const months = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(y, m - 1 - i, 1);
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  const [rows] = await pool.query(
    `SELECT DATE_FORMAT(date, '%Y-%m') AS month, type, SUM(amount) AS total FROM transactions
     WHERE user_id = ? AND DATE_FORMAT(date, '%Y-%m') BETWEEN ? AND ?
     GROUP BY month, type`, [uid, months[0], months[5]]);
  const series = months.map(mo => ({
    month: mo,
    income: (rows.find(r => r.month === mo && r.type === 'income') || {}).total || 0,
    expense: (rows.find(r => r.month === mo && r.type === 'expense') || {}).total || 0,
  }));

  const spentMap = Object.fromEntries(byCategory.map(c => [c.category, c.total]));
  const [budgetRows] = await pool.query(
    'SELECT category, monthly_limit FROM budgets WHERE user_id = ? ORDER BY category', [uid]);
  const budgets = budgetRows.map(b => ({
    category: b.category, limit: b.monthly_limit, spent: spentMap[b.category] || 0,
  }));

  res.json({ month, balance: bal.v, income, expense, byCategory, series, budgets });
}));

// ---------- CSV export ----------
function csvCell(v) {
  let s = String(v ?? '');
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return `"${s.replace(/"/g, '""')}"`;
}

router.get('/export.csv', wrap(async (req, res) => {
  const [rows] = await pool.query(
    'SELECT date, type, category, amount, note FROM transactions WHERE user_id = ? ORDER BY date, id',
    [req.session.userId]);
  const lines = ['Date,Type,Category,Amount (NGN),Note',
    ...rows.map(r => [r.date, r.type, r.category, Number(r.amount).toFixed(2), r.note].map(csvCell).join(','))];
  res.set('Content-Type', 'text/csv; charset=utf-8');
  res.set('Content-Disposition', 'attachment; filename="transactions.csv"');
  res.send(lines.join('\n'));
}));

module.exports = router;