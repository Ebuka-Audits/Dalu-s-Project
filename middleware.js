function requirePage(req, res, next) {
  if (req.session.userId) return next();
  res.redirect('/login');
}

function requireApi(req, res, next) {
  if (req.session.userId) return next();
  res.status(401).json({ error: 'Please log in' });
}

// lets async route handlers send errors to the error middleware
const wrap = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

module.exports = { requirePage, requireApi, wrap };