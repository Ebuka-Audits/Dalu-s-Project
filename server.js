require('dotenv').config();
const express = require('express');
const session = require('express-session');
const path = require('path');

const { init, pool } = require('./db');
const authRoutes = require('./routes/auth');
const apiRoutes = require('./routes/api');
const marketRoutes = require('./routes/market');
const featureRoutes = require('./routes/features');
const settingsRoutes = require('./routes/settings');
const { requirePage, wrap } = require('./middleware');

const app = express();
const isProd = process.env.NODE_ENV === 'production';

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
if (isProd) app.set('trust proxy', 1);

app.disable('x-powered-by');
app.use(express.json({ limit: '50kb' }));
app.use(express.urlencoded({ extended: false, limit: '50kb' }));

app.use(session({
  name: 'ft.sid',
  secret: process.env.SESSION_SECRET || 'dev-only-change-me',
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax', secure: isProd, maxAge: 1000 * 60 * 60 * 8 },
}));

app.use((req, res, next) => {
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('X-Frame-Options', 'DENY');
  res.set('Referrer-Policy', 'same-origin');
  res.locals.theme = (req.session && req.session.theme) || 'system';
  res.locals.userName = (req.session && req.session.name) || '';
  next();
});

app.use(express.static(path.join(__dirname, 'public')));
app.use('/vendor/chart.js', express.static(path.join(__dirname, 'node_modules/chart.js/dist')));

app.use(authRoutes);

app.use('/api/settings', settingsRoutes);
app.use('/api/market', marketRoutes);
app.use('/api', featureRoutes);
app.use('/api', apiRoutes);

app.get('/', (req, res) => res.render('home', { loggedIn: !!req.session.userId }));

const page = (route, view) => app.get(route, requirePage, (req, res) => res.render(view, { active: view }));
page('/dashboard', 'dashboard');
page('/transactions', 'transactions');
page('/planning', 'planning');
page('/markets', 'markets');
page('/portfolio', 'portfolio');

app.get('/settings', requirePage, wrap(async (req, res) => {
  const [rows] = await pool.query('SELECT name, email, usd_rate FROM users WHERE id = ?', [req.session.userId]);
  if (!rows.length) return res.redirect('/login');
  res.render('settings', { active: 'settings', user: rows[0] });
}));

app.use((req, res) => res.status(404).send('Page not found'));

app.use((err, req, res, next) => {
  console.error(err);
  if (req.path.startsWith('/api')) return res.status(500).json({ error: 'Server error' });
  res.status(500).send('Server error');
});

const PORT = process.env.PORT || 3000;

init()
  .then(() => app.listen(PORT, () => console.log(`Finance tracker running at http://localhost:${PORT}`)))
  .catch(err => {
    console.error('Could not connect to MySQL. Check your .env settings and that MySQL is running.\n', err.message);
    process.exit(1);
  });