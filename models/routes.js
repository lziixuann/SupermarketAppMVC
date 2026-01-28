const express = require('express');
const router = express.Router();
const CartController = require('../controllers/cartController');
const ensureAuth = require('../middleware/ensureAuth'); // see next section

router.get('/', ensureAuth, CartController.list);
router.post('/add', ensureAuth, CartController.add);
router.post('/remove', ensureAuth, CartController.remove);
router.post('/clear', ensureAuth, CartController.clear);

module.exports = router;