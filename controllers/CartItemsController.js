// controllers/cartController.js
const CartItems = require('../models/CartItem'); // implement or adapt
const Fines = require('../models/Fine');

const CartController = {
  list(req, res) {
    const user = req.session && req.session.user;
    if (!user) {
      // No login: show an empty cart to unauthenticated users
      return res.render('cart', { cartItems: [], user: null, total: 0 });
    }
    const userId = user.userId;
    CartItems.getByUserId(userId, (err, cartItems) => {
      if (err) return res.status(500).send('Error retrieving cart');
      res.render('cart', { cartItems, user });
    });
  },

  add(req, res) {
    const user = req.session && req.session.user;
    if (!user) return res.status(401).send('Not authenticated');
    const userId = user.userId;
    const fineId = parseInt(req.body.fineId, 10);
    if (Number.isNaN(fineId)) {
      req.flash && req.flash('error', 'Invalid fine id');
      return res.redirect('/fines');
    }

    Fines.getByIds([fineId], (err, fines) => {
      if (err || !fines.length || fines[0].paid) {
        req.flash && req.flash('error', 'Cannot add paid or invalid fine');
        return res.redirect('/fines');
      }

      // optional: check if already in cart to prevent duplicates
      CartItems.getByUserId(userId, (err2, items) => {
        if (!err2 && items && items.some(ci => ci.fineId === fineId)) {
          req.flash && req.flash('info', 'Fine already in cart');
          return res.redirect('/fines');
        }

        CartItems.add(userId, fineId, (err3) => {
          if (err3) req.flash && req.flash('error', 'Could not add to cart');
          else req.flash && req.flash('success', 'Fine added to cart');
          res.redirect('/fines');
        });
      });
    });
  },

  remove(req, res) {
    const user = req.session && req.session.user;
    if (!user) return res.status(401).json({ success: false, message: 'Not authenticated' });
    const userId = user.userId;
    const fineId = parseInt(req.body.fineId, 10);
    if (Number.isNaN(fineId)) return res.status(400).json({ success: false, message: 'Invalid fine id' });

    CartItems.remove(userId, fineId, (err) => {
      const wantsJson = req.xhr || req.accepts('json') === 'json' || req.get('Content-Type') === 'application/json';
      if (wantsJson) {
        if (err) return res.status(500).json({ success: false, message: 'Could not remove from cart' });
        return res.json({ success: true, fineId });
      } else {
        if (err) req.flash && req.flash('error', 'Could not remove from cart');
        else req.flash && req.flash('success', 'Fine removed from cart');
        res.redirect('/fines');
      }
    });
  },

  clear(req, res) {
    const user = req.session && req.session.user;
    if (!user) return res.status(401).json({ success: false, message: 'Not authenticated' });
    const userId = user.userId;

    CartItems.clear(userId, (err) => {
      const wantsJson = req.xhr || req.accepts('json') === 'json' || req.get('Content-Type') === 'application/json';
      if (wantsJson) {
        if (err) return res.status(500).json({ success: false, message: 'Could not clear cart' });
        return res.json({ success: true });
      } else {
        if (err) req.flash && req.flash('error', 'Could not clear cart');
        else req.flash && req.flash('success', 'Cart cleared');
        res.redirect('/fines');
      }
    });
  }
};

module.exports = CartController;
