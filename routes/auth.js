const express = require('express');
const bcrypt = require('bcryptjs');
const { pool } = require('../db');
const { wrap } = require('../middleware');

const router = express.Router();
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const attempts = new Map();
function throttled(ip) {
  const now = Date.now();
  const rec = (attempts.get(ip) || []).filter(t => now - t < 15 * 60 * 1000);
  attempts.set(ip, rec);
  return rec.length >= 10;
}
function recordFailure(ip) {
  attempts.set(ip, [...(attempts.get(ip) || []), Date.now()]);
}

function startSession(req, res, user) {
  req.session.regenerate(err => {
    if (err) throw err;
    req.session.userId = user.id;
    req.session.name = user.name;
    res.redirect('/');
  });
}

router.get('/login', (req, res) => {
  if (req.session.userId) return res.redirect('/');
  res.render('auth', { mode: 'login', error: null, values: {} });
});

router.get('/register', (req, res) => {
  if (req.session.userId) return res.redirect('/');
  res.render('auth', { mode: 'register', error: null, values: {} });
});

router.post('/register', wrap(async (req, res) => {
  const name = String(req.body.name || '').trim();
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  const values = { name, email };
  const fail = error => res.status(400).render('auth', { mode: 'register', error, values });

  if (name.length < 2 || name.length > 60) return fail('Enter your name (2 to 60 characters).');
  if (!EMAIL_RE.test(email)) return fail('Enter a valid email address.');
  if (password.length < 8) return fail('Use a password of at least 8 characters.');

  const [existing] = await pool.query('SELECT 1 FROM users WHERE email = ?', [email]);
  if (existing.length) return fail('An account with that email already exists. Log in instead.');

  const hash = bcrypt.hashSync(password, 12);
  const [result] = await pool.query(
    'INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)', [name, email, hash]);
  startSession(req, res, { id: result.insertId, name });
}));

router.post('/login', wrap(async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  const fail = (error, code = 401) =>
    res.status(code).render('auth', { mode: 'login', error, values: { email } });

  if (throttled(req.ip)) return fail('Too many attempts. Try again in 15 minutes.', 429);

  const [rows] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);
  const user = rows[0];
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    recordFailure(req.ip);
    return fail('Email or password is incorrect.');
  }
  startSession(req, res, user);
}));

router.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('ft.sid');
    res.redirect('/login');
  });
});

module.exports = router;