require('dotenv').config();
const express = require('express');
const session = require('express-session');
const path = require('path');
const marketRoutes = require('./routes/market');
const featureRoutes = require('./routes/features');

const { init } = require('./db');
const authRoutes = require('./routes/auth');
const apiRoutes = require('./routes/api');
const { requirePage } = require('./middleware');

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
  next();
});

app.use(express.static(path.join(__dirname, 'public')));
app.use('/vendor/chart.js', express.static(path.join(__dirname, 'node_modules/chart.js/dist')));

app.use(authRoutes);
app.use('/api/market', marketRoutes);
app.use('/api', featureRoutes);
app.use('/api', apiRoutes);
app.get('/', (req, res) => {
  res.render('home', { loggedIn: !!req.session.userId });
});

app.get('/dashboard', requirePage, (req, res) => {
  res.render('dashboard', { name: req.session.name });
});

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
    console.error('Could not connect to MySQL. Check the settings in db.js and that MySQL is running.\n', err.message);
    process.exit(1);
  });