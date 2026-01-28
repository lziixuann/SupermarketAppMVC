module.exports = function ensureAuth(req, res, next) {
  if (req.session && req.session.user) return next();
  // if AJAX, return 401 JSON
  if (req.xhr || req.accepts('json') === 'json') {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }
  // otherwise redirect to login page
  return res.redirect('/login');
};