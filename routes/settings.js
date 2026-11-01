const express = require('express');
const bcrypt = require('bcryptjs');
const { pool } = require('../db');
const { requireApi, wrap } = require('../middleware');

const router = express.Router();
router.use(requireApi);

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const THEMES = ['light', 'dark', 'system'];

async function passwordOk(req, password) {
  const [rows] = await pool.query('SELECT password_hash FROM users WHERE id = ?', [req.session.userId]);
  return rows.length > 0 && bcrypt.compareSync(String(password || ''), rows[0].password_hash);
}

router.put('/theme', wrap(async (req, res) => {
  const theme = req.body.theme;
  if (!THEMES.includes(theme)) return res.status(400).json({ error: 'Choose light, dark or system.' });
  await pool.query('UPDATE users SET theme = ? WHERE id = ?', [theme, req.session.userId]);
  req.session.theme = theme;
  res.json({ ok: true });
}));

router.put('/profile', wrap(async (req, res) => {
  const name = String(req.body.name || '').trim();
  if (name.length < 2 || name.length > 60) return res.status(400).json({ error: 'Enter your name (2 to 60 characters).' });
  await pool.query('UPDATE users SET name = ? WHERE id = ?', [name, req.session.userId]);
  req.session.name = name;
  res.json({ ok: true, name });
}));

router.put('/email', wrap(async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'Enter a valid email address.' });
  if (!(await passwordOk(req, req.body.password))) return res.status(400).json({ error: 'Your password is incorrect.' });
  const [taken] = await pool.query('SELECT id FROM users WHERE email = ? AND id <> ?', [email, req.session.userId]);
  if (taken.length) return res.status(400).json({ error: 'That email is already used by another account.' });
  await pool.query('UPDATE users SET email = ? WHERE id = ?', [email, req.session.userId]);
  res.json({ ok: true });
}));

router.put('/password', wrap(async (req, res) => {
  const next = String(req.body.newPassword || '');
  if (!(await passwordOk(req, req.body.currentPassword))) return res.status(400).json({ error: 'Your current password is incorrect.' });
  if (next.length < 8) return res.status(400).json({ error: 'Use a new password of at least 8 characters.' });
  if (next === String(req.body.currentPassword)) return res.status(400).json({ error: 'The new password must be different.' });
  await pool.query('UPDATE users SET password_hash = ? WHERE id = ?', [bcrypt.hashSync(next, 12), req.session.userId]);
  res.json({ ok: true });
}));

router.put('/rate', wrap(async (req, res) => {
  const raw = String(req.body.rate == null ? '' : req.body.rate).trim();
  let rate = null;
  if (raw !== '') {
    rate = Number(raw);
    if (!Number.isFinite(rate) || rate <= 0 || rate > 100000) {
      return res.status(400).json({ error: 'Enter how many naira equal one US dollar.' });
    }
    rate = Math.round(rate * 100) / 100;
  }
  await pool.query('UPDATE users SET usd_rate = ? WHERE id = ?', [rate, req.session.userId]);
  res.json({ ok: true });
}));

router.delete('/account', wrap(async (req, res) => {
  if (!(await passwordOk(req, req.body.password))) return res.status(400).json({ error: 'Your password is incorrect.' });
  await pool.query('DELETE FROM users WHERE id = ?', [req.session.userId]);
  req.session.destroy(() => {
    res.clearCookie('ft.sid');
    res.json({ ok: true });
  });
}));

module.exports = router;