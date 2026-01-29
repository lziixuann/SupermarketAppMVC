const express = require('express');
const multer = require('multer');
const path = require('path');
const SupermarketController = require('./controllers/SupermarketControllers');
const InventoryController = require('./controllers/InventoryController');
const Product = require('./models/product');
const User = require('./models/user');
const Order = require('./models/order');
const ProductRating = require('./models/productRating');
const db = require('./db');
const session = require('express-session');
const paypal = require('./services/paypal');
const nets = require('./services/nets');
const paymentEvents = require('./utils/paymentStatus');
const app = express();

// CRASH HANDLERS: Log unhandled exceptions/rejections to help diagnose unexpected exits
process.on('uncaughtException', (err) => {
  console.error('UNCAUGHT EXCEPTION', err && err.stack ? err.stack : err);
});
process.on('unhandledRejection', (reason) => {
  console.error('UNHANDLED REJECTION', reason);
});

// Set up multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, 'public', 'images'));
  },
  filename: (req, file, cb) => {
    cb(null, file.originalname);
  }
});
const upload = multer({ storage: storage });

// Set up view engine
app.set('view engine', 'ejs');
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

// Session setup
app.use(
  session({
    secret: process.env.SESSION_SECRET || 'devsecret',
    resave: false,
    saveUninitialized: false
  })
);

// Ensure refund table exists (simple, self-contained storage for refund reasons)
const ensureRefundTable = () => {
  const sql = `
    CREATE TABLE IF NOT EXISTS refund_requests (
      refundId INT AUTO_INCREMENT PRIMARY KEY,
      orderId INT NOT NULL,
      userId INT NULL,
      reason TEXT NOT NULL,
      createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uniq_order (orderId)
    )
  `;
  db.query(sql, (err) => {
    if (err) {
      console.error('Error ensuring refund_requests table:', err);
    }
  });
};
ensureRefundTable();

// Ensure product ratings table exists
const ensureProductRatingsTable = () => {
  const sql = `
    CREATE TABLE IF NOT EXISTS product_ratings (
      ratingId INT AUTO_INCREMENT PRIMARY KEY,
      productId INT NOT NULL,
      userId INT NOT NULL,
      rating INT NOT NULL,
      createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uniq_product_user (productId, userId)
    )
  `;
  db.query(sql, (err) => {
    if (err) {
      console.error('Error ensuring product_ratings table:', err);
    }
  });
};
ensureProductRatingsTable();

// Ensure feedbacks table has a rating column (optional star rating)
const ensureFeedbackRatingColumn = () => {
  const sql = 'ALTER TABLE feedbacks ADD COLUMN rating INT NULL';
  db.query(sql, (err) => {
    if (err && err.code !== 'ER_DUP_FIELDNAME') {
      console.error('Error ensuring feedback rating column:', err);
    }
  });
};
ensureFeedbackRatingColumn();

// Middleware: ensure user is admin
const ensureAdmin = (req, res, next) => {
  if (!req.session || !req.session.user || !req.session.user.isAdmin) {
    return res.status(403).send('Access denied. Admin privileges required.');
  }
  next();
};

function getOrderPaymentStatus(orderId) {
  return new Promise((resolve, reject) => {
    Order.getPaymentStatus(orderId, (err, order) => {
      if (err) return reject(err);
      resolve(order);
    });
  });
}

async function getAuthorizedOrder(orderId, req) {
  const numericOrderId = parseInt(orderId, 10);
  if (!numericOrderId) return { error: 'Invalid order id', status: 400 };

  const sessionUser = req.session && req.session.user;
  if (!sessionUser) return { error: 'You must be logged in', status: 403 };

  const order = await getOrderPaymentStatus(numericOrderId);
  if (!order) return { error: 'Order not found', status: 404 };

  const isOwner = order.userId && sessionUser.userId === order.userId;
  const isAdmin = !!sessionUser.isAdmin;
  if (!isOwner && !isAdmin) {
    return { error: 'Access denied', status: 403 };
  }

  return { order };
}

function updateOrderPaymentStatus(orderId, status, options) {
  return new Promise((resolve, reject) => {
    Order.updatePaymentStatus(orderId, status, options || {}, (err, result) => {
      if (err) return reject(err);
      const payload = paymentEvents.publish(orderId, result.paymentStatus, {
        paymentProvider: options && options.paymentProvider ? options.paymentProvider : undefined,
        paymentReference: options && options.paymentReference ? options.paymentReference : undefined
      });
      resolve({ result, payload });
    });
  });
}

function getRefundByOrderId(orderId) {
  return new Promise((resolve, reject) => {
    db.query('SELECT * FROM refund_requests WHERE orderId = ? LIMIT 1', [orderId], (err, rows) => {
      if (err) return reject(err);
      resolve(rows && rows[0] ? rows[0] : null);
    });
  });
}

function createRefundRequest(orderId, userId, reason) {
  return new Promise((resolve, reject) => {
    const sql = 'INSERT INTO refund_requests (orderId, userId, reason) VALUES (?, ?, ?)';
    db.query(sql, [orderId, userId || null, reason], (err, result) => {
      if (err) return reject(err);
      resolve(result);
    });
  });
}

async function attachRefundReasons(orders) {
  if (!orders || orders.length === 0) return orders;
  const ids = orders.map((o) => o.orderId).filter(Boolean);
  if (ids.length === 0) return orders;
  const placeholders = ids.map(() => '?').join(',');
  const sql = `SELECT orderId, reason, createdAt FROM refund_requests WHERE orderId IN (${placeholders})`;
  const refunds = await new Promise((resolve, reject) => {
    db.query(sql, ids, (err, rows) => (err ? reject(err) : resolve(rows || [])));
  });
  const refundMap = new Map(refunds.map((r) => [r.orderId, r]));
  orders.forEach((o) => {
    if (refundMap.has(o.orderId)) {
      o.refund = refundMap.get(o.orderId);
    }
  });
  return orders;
}

function getOrderById(orderId) {
  return new Promise((resolve, reject) => {
    Order.getById(orderId, (err, order) => {
      if (err) return reject(err);
      resolve(order || null);
    });
  });
}

function getOrderByPaymentReference(paymentReference) {
  return new Promise((resolve, reject) => {
    Order.getByPaymentReference(paymentReference, (err, order) => {
      if (err) return reject(err);
      resolve(order || null);
    });
  });
}

async function getAuthorizedOrderForMock(orderId, txn, req) {
  const sessionUser = req.session && req.session.user;

  // If the user is logged in, use the stricter authorization check.
  if (sessionUser) {
    return getAuthorizedOrder(orderId, req);
  }

  // Otherwise, allow access when the txn reference matches the order's reference.
  const numericOrderId = parseInt(orderId, 10);
  if (!numericOrderId) return { error: 'Invalid order id', status: 400 };

  const order = await getOrderPaymentStatus(numericOrderId);
  if (!order) return { error: 'Order not found', status: 404 };

  if (!txn || String(txn) !== String(order.paymentReference || '')) {
    return { error: 'Access denied', status: 403 };
  }

  return { order };
}

function sseHeaders(res) {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  if (typeof res.flushHeaders === 'function') {
    res.flushHeaders();
  }
}

function writeSse(res, data) {
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

// Home page: show all products
app.get('/', (req, res) => {
  Product.getAll((err, products) => {
    if (err) {
      console.error('Error fetching products:', err);
      return res.status(500).send('Error retrieving products');
    }

    const user = req.session && req.session.user;

    // If admin, also load feedbacks for the dashboard/tab
    if (user && user.isAdmin) {
      try {
        const Feedback = require('./models/feedback');
        Feedback.getAll((ferr, feedbacks) => {
          if (ferr) {
            console.error('Error fetching feedbacks for admin homepage:', ferr);
            // Render without feedbacks but keep admin UI
            return res.render('index', { products, user, feedbacks: [] });
          }
          return res.render('index', { products, user, feedbacks });
        });
      } catch (e) {
        console.error('Error requiring feedback model', e);
        return res.render('index', { products, user, feedbacks: [] });
      }
    }

    // Non-admin users don't need feedbacks
    return res.render('index', { products, user, feedbacks: [] });
  });
});

// Inventory / Admin routes
app.get('/inventory', (req, res) => InventoryController.list(req, res));
app.get('/admin', (req, res) => InventoryController.list(req, res));

// Shopping (user view, now public)
app.get('/shopping', (req, res) => SupermarketController.list(req, res));

// Add to cart (cart is sessionless, so this is a placeholder)
app.post('/add-to-cart/:id', (req, res) => {
  res.send('Cart functionality is now public and sessionless. Implement as needed.');
});

// Cart page (sessionless)
app.get('/cart', (req, res) => {
  res.render('cart', { cart: [], user: req.session && req.session.user });
});

// Auth routes: register/login/logout
app.get('/login', (req, res) => res.render('login', { error: null, user: req.session && req.session.user }));

app.post('/login', (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.render('login', { error: 'Missing username or password', user: null });
  }

  User.getByUsername(username, (err, user) => {
    if (err) {
      console.error('Login DB error', err);
      return res.render('login', { error: 'Internal error', user: null });
    }
    if (!user) return res.render('login', { error: 'Invalid credentials', user: null });
    const ok = User.verifyPassword(user, password);
    if (!ok) return res.render('login', { error: 'Invalid credentials', user: null });

    // successful login - store minimal user info in session
    req.session.user = { userId: user.userId, username: user.username, isAdmin: !!user.isAdmin };
    return res.redirect('/');
  });
});

app.get('/register', (req, res) => res.render('register', { error: null, user: req.session && req.session.user }));

app.post('/register', (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.render('register', { error: 'Missing username or password', user: null });
  }

  const isAdmin = false;
  User.getByUsername(username, (err, existing) => {
    if (err) return res.render('register', { error: 'Internal error', user: null });
    if (existing) return res.render('register', { error: 'Username already exists', user: null });

    User.create({ username, password, isAdmin }, (err2) => {
      if (err2) {
        console.error('Error creating user', err2);
        return res.render('register', { error: 'Could not create user', user: null });
      }
      return res.redirect('/login');
    });
  });
});

app.get('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/'));
});

// Real-time payment status stream (SSE)
app.get('/sse/order-status/:orderId', async (req, res) => {
  try {
    const { order, error, status } = await getAuthorizedOrder(req.params.orderId, req);
    if (error) return res.status(status).json({ error });

    sseHeaders(res);

    // Send the initial status snapshot immediately
    writeSse(res, {
      orderId: order.orderId,
      status: order.paymentStatus || 'pending',
      paymentProvider: order.paymentProvider || null,
      paymentReference: order.paymentReference || null,
      paymentStatusUpdatedAt: order.paymentStatusUpdatedAt || null,
      totalAmount: order.totalAmount
    });

    const unsubscribe = paymentEvents.subscribe(order.orderId, res);

    // Keep-alive heartbeat
    const heartbeat = setInterval(() => {
      writeSse(res, { type: 'heartbeat', ts: Date.now() });
    }, 15000);

    req.on('close', () => {
      clearInterval(heartbeat);
      unsubscribe();
    });
  } catch (err) {
    console.error('SSE order status error:', err);
    res.status(500).end();
  }
});

// Payment status snapshot (for polling / initial load)
app.get('/api/orders/:orderId/payment-status', async (req, res) => {
  try {
    const { order, error, status } = await getAuthorizedOrder(req.params.orderId, req);
    if (error) return res.status(status).json({ error });

    return res.json({
      orderId: order.orderId,
      status: order.paymentStatus || 'pending',
      paymentProvider: order.paymentProvider || null,
      paymentReference: order.paymentReference || null,
      paymentStatusUpdatedAt: order.paymentStatusUpdatedAt || null,
      totalAmount: order.totalAmount
    });
  } catch (err) {
    console.error('Get payment status error:', err);
    return res.status(500).json({ error: 'Internal error' });
  }
});

// Admin/testing: manually update payment status (supports refunds)
app.post('/api/orders/:orderId/payment-status', ensureAdmin, async (req, res) => {
  try {
    const orderId = parseInt(req.params.orderId, 10);
    if (!orderId) return res.status(400).json({ error: 'Invalid order id' });

    const { status, paymentProvider, paymentReference } = req.body || {};
    if (!status) return res.status(400).json({ error: 'status is required' });

    await updateOrderPaymentStatus(orderId, status, {
      paymentProvider: paymentProvider || null,
      paymentReference: paymentReference || null
    });

    const updated = await getOrderPaymentStatus(orderId);
    return res.json({ success: true, order: updated });
  } catch (err) {
    console.error('Admin payment status update error:', err);
    return res.status(500).json({ error: 'Internal error' });
  }
});

// Checkout routes
app.get('/checkout', (req, res) => {
  try {
    const user = req.session && req.session.user;
    if (!user) {
      return res.redirect('/login?next=/checkout');
    }
    res.render('checkout', { user });
  } catch (err) {
    console.error('Render /checkout error', err);
    res.status(500).send('Server error');
  }
});

app.post('/checkout', async (req, res) => {
  try {
    const currentUser = req.session && req.session.user;
    if (!currentUser) {
      return res.status(403).json({ error: 'You must be logged in to complete checkout' });
    }

    const { cart, paymentMethod, billing } = req.body || {};
    if (!cart || !Array.isArray(cart) || cart.length === 0) {
      return res.status(400).json({ error: 'Cart is empty' });
    }

    // calculate total
    let subtotal = 0;
    cart.forEach((item) => {
      subtotal += (Number(item.price) || 0) * (Number(item.quantity) || 0);
    });
    const tax = +(subtotal * 0.07).toFixed(2);
    const total = +(subtotal + tax).toFixed(2);

    const method = String(paymentMethod || 'unknown').toLowerCase();
    const immediateSuccessMethods = new Set(['applepay', 'paynow', 'visa', 'mastercard']);
    const initialStatus = immediateSuccessMethods.has(method) ? 'successful' : 'pending';

    // Reuse pending order if same cart + method + user
    const normalizedCart = cart
      .map((i) => ({
        productId: Number(i.productId),
        quantity: Number(i.quantity),
        price: Number(i.price)
      }))
      .sort((a, b) => a.productId - b.productId);
    const signature = JSON.stringify({
      userId: currentUser.userId,
      method,
      total,
      email: billing && billing.email ? String(billing.email) : null,
      cart: normalizedCart
    });

    const pendingMeta = req.session && req.session.pendingOrder;
    if (pendingMeta && pendingMeta.signature === signature) {
      const existing = await getOrderPaymentStatus(pendingMeta.orderId);
      if (existing && String(existing.paymentStatus || '').toLowerCase() === 'pending') {
        return res.json({
          success: true,
          orderId: existing.orderId,
          total: existing.totalAmount,
          paymentStatus: existing.paymentStatus || 'pending',
          email: billing && billing.email ? String(billing.email) : null,
          invoiceUrl: null
        });
      }
      // Clear stale pending order
      req.session.pendingOrder = null;
    }

    // NETS: also reuse latest pending order by user/method within 10 minutes
    if (method === 'nets') {
      const email = billing && billing.email ? String(billing.email) : null;
      const recentPending = await new Promise((resolve, reject) => {
        const sql = `
          SELECT orderId, totalAmount, paymentStatus, customerEmail, orderDate
          FROM orders
          WHERE userId = ? AND paymentMethod = ? AND paymentStatus = 'pending'
          ORDER BY orderDate DESC
          LIMIT 1
        `;
        db.query(sql, [currentUser.userId, method], (err, rows) => {
          if (err) return reject(err);
          resolve(rows && rows[0] ? rows[0] : null);
        });
      });

      if (recentPending) {
        const ageMs = Date.now() - new Date(recentPending.orderDate).getTime();
        const withinWindow = Number.isFinite(ageMs) && ageMs <= 10 * 60 * 1000;
        const emailMatches = !email || !recentPending.customerEmail || email === recentPending.customerEmail;

        if (withinWindow && emailMatches) {
          req.session.pendingOrder = { orderId: recentPending.orderId, signature };
          return res.json({
            success: true,
            orderId: recentPending.orderId,
            total: recentPending.totalAmount,
            paymentStatus: recentPending.paymentStatus || 'pending',
            email: email,
            invoiceUrl: null
          });
        }
      }
    }

    // Create order in database
    const userId = currentUser.userId;
    const orderId = await new Promise((resolve, reject) => {
      Order.create(
        {
          userId,
          totalAmount: total,
          paymentMethod: method,
          paymentStatus: initialStatus,
          paymentProvider: method,
          customerName: billing && billing.name ? String(billing.name) : null,
          customerEmail: billing && billing.email ? String(billing.email) : null
        },
        (err, id) => {
          if (err) return reject(err);
          resolve(id);
        }
      );
    });

    // Deduct stock for each item in the cart (only after creating a new order)
    for (const item of cart) {
      // eslint-disable-next-line no-await-in-loop
      await new Promise((resolve, reject) => {
        Product.deductStock(item.productId, item.quantity, (err, result) => {
          if (err) return reject(err);
          resolve(result);
        });
      });
    }

    // Create order items
    await new Promise((resolve, reject) => {
      Order.createItems(orderId, cart, (err) => {
        if (err) return reject(err);
        resolve();
      });
    });

    paymentEvents.publish(orderId, initialStatus, {
      paymentProvider: method
    });

    // Generate invoice HTML file (optional). If generation fails, continue without blocking checkout.
    let invoiceUrl = null;
    try {
      const generateInvoice = require('./utils/generateInvoice');
      const invoiceFile = await generateInvoice(orderId);
      if (invoiceFile) invoiceUrl = '/invoices/' + invoiceFile;
    } catch (e) {
      console.error('Invoice generation failed', e);
    }

    // Store pending order in session to prevent duplicates
    if (initialStatus === 'pending') {
      req.session.pendingOrder = { orderId, signature };
    } else {
      req.session.pendingOrder = null;
    }

    return res.json({
      success: true,
      orderId,
      total,
      paymentStatus: initialStatus,
      email: billing && billing.email ? String(billing.email) : null,
      invoiceUrl
    });
  } catch (e) {
    console.error('Checkout error', e);
    return res.status(500).json({ error: 'Internal error' });
  }
});

// Checkout success page
app.get('/checkout/success', async (req, res) => {
  try {
    const { orderId, total, email } = req.query;
    if (!orderId || !total) {
      return res.status(400).send('Invalid order parameters');
    }

    let paymentStatus = null;
    try {
      const snapshot = await getOrderPaymentStatus(orderId);
      paymentStatus = snapshot ? snapshot.paymentStatus : null;
    } catch (statusErr) {
      console.error('Could not load payment status for success page:', statusErr.message);
    }

    res.render('checkoutSuccess', {
      orderId,
      total,
      email,
      paymentStatus,
      user: req.session && req.session.user
    });
  } catch (err) {
    console.error('Render /checkout/success error', err);
    res.status(500).send('Server error');
  }
});

// PayPal: Create Order
app.post('/api/paypal/create-order', async (req, res) => {
  try {
    const { amount, orderId } = req.body || {};
    if (!amount) {
      return res.status(400).json({ error: 'Amount is required' });
    }
    if (!orderId) {
      return res.status(400).json({ error: 'orderId is required for tracking' });
    }

    const { order, error, status } = await getAuthorizedOrder(orderId, req);
    if (error) return res.status(status).json({ error });

    const paypalOrder = await paypal.createOrder(amount);
    if (paypalOrder && paypalOrder.id) {
      await updateOrderPaymentStatus(order.orderId, 'pending', {
        paymentProvider: 'paypal',
        paymentReference: paypalOrder.id
      });

      return res.json({ id: paypalOrder.id });
    }

    return res.status(500).json({ error: 'Failed to create PayPal order', details: paypalOrder });
  } catch (err) {
    console.error('PayPal create order error:', err);
    return res.status(500).json({ error: 'Failed to create PayPal order', message: err.message });
  }
});

// PayPal: Capture Order
app.post('/api/paypal/capture-order', async (req, res) => {
  try {
    const { orderID, orderId } = req.body || {};
    if (!orderID) {
      return res.status(400).json({ error: 'Order ID is required' });
    }
    if (!orderId) {
      return res.status(400).json({ error: 'orderId is required for tracking' });
    }

    const { order, error, status } = await getAuthorizedOrder(orderId, req);
    if (error) return res.status(status).json({ error });

    const capture = await paypal.captureOrder(orderID);
    console.log('PayPal captureOrder response:', capture);

    if (capture.status === 'COMPLETED') {
      const captureId =
        capture &&
        capture.purchase_units &&
        capture.purchase_units[0] &&
        capture.purchase_units[0].payments &&
        capture.purchase_units[0].payments.captures &&
        capture.purchase_units[0].payments.captures[0] &&
        capture.purchase_units[0].payments.captures[0].id
          ? capture.purchase_units[0].payments.captures[0].id
          : capture.id || orderID;

      await updateOrderPaymentStatus(order.orderId, 'successful', {
        paymentProvider: 'paypal',
        paymentReference: captureId
      });

      const updated = await getOrderPaymentStatus(order.orderId);
      return res.json({ success: true, capture, order: updated });
    }

    await updateOrderPaymentStatus(order.orderId, 'failed', {
      paymentProvider: 'paypal',
      paymentReference: orderID
    });

    return res.status(400).json({ error: 'Payment not completed', details: capture });
  } catch (err) {
    console.error('PayPal capture error:', err);
    return res.status(500).json({ error: 'Failed to capture PayPal order', message: err.message });
  }
});

// NETS: Generate QR Code
app.post('/api/nets/generate-qr', async (req, res) => {
  try {
    const { cartTotal, orderId } = req.body || {};
    if (!cartTotal) {
      return res.status(400).json({ error: 'Cart total is required' });
    }
    if (!orderId) {
      return res.status(400).json({ error: 'orderId is required for tracking' });
    }

    const { error, status } = await getAuthorizedOrder(orderId, req);
    if (error) return res.status(status).json({ error });

    req.isAjax = req.get('x-requested-with') === 'XMLHttpRequest';
    await nets.generateQrCode(req, res);
  } catch (err) {
    console.error('NETS QR generation error:', err);
    res.status(500).json({ error: 'Failed to generate NETS QR code', message: err.message });
  }
});

// NETS: Success callback
app.get('/nets-qr/success', (req, res) => {
  try {
    const { orderId, total, email } = req.query;
    if (!orderId || !total) {
      return res.status(400).send('Invalid transaction parameters');
    }
    res.render('netsTxnSuccessStatus', { orderId, total, email, user: req.session && req.session.user });
  } catch (err) {
    console.error('Render /nets-qr/success error', err);
    res.status(500).send('Server error');
  }
});

// NETS: Failure callback
app.get('/nets-qr/fail', (req, res) => {
  try {
    const { errorMsg, responseCode } = req.query;
    res.render('netsTxnFailStatus', {
      errorMsg: errorMsg || 'Transaction failed. Please try again.',
      responseCode: responseCode || 'N.A.',
      user: req.session && req.session.user
    });
  } catch (err) {
    console.error('Render /nets-qr/fail error', err);
    res.status(500).send('Server error');
  }
});

// NETS: Webhook callback (configure NETS to call this URL)
app.all('/api/nets/webhook', async (req, res) => {
  try {
    const payload = { ...(req.query || {}), ...(req.body || {}) };
    const txnRef =
      payload.txn_retrieval_ref ||
      payload.txnRetrievalRef ||
      payload.txn_id ||
      payload.txnId ||
      payload.reference;

    if (!txnRef) {
      return res.status(400).json({ error: 'txn_retrieval_ref is required' });
    }

    const order = await getOrderByPaymentReference(txnRef);
    if (!order) {
      return res.status(404).json({ error: 'Order not found for reference' });
    }

    const responseCode = String(payload.response_code || payload.responseCode || '').trim();
    const txnStatus = String(payload.txn_status || payload.txnStatus || payload.status || '').trim().toLowerCase();

    const isSuccess =
      responseCode === '00' ||
      txnStatus === 'successful' ||
      txnStatus === 'success' ||
      txnStatus === 'completed' ||
      txnStatus === '2';

    const nextStatus = isSuccess ? 'successful' : 'failed';

    await updateOrderPaymentStatus(order.orderId, nextStatus, {
      paymentProvider: 'nets',
      paymentReference: txnRef
    });

    return res.json({ ok: true });
  } catch (err) {
    console.error('NETS webhook error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
});

// NETS: Manual confirm (fallback) to mark payment successful and redirect
app.get('/nets-qr/confirm', async (req, res) => {
  try {
    const { orderId, total, email, txn } = req.query || {};
    if (!orderId) return res.status(400).send('Invalid order id');

    const { order, error, status } = await getAuthorizedOrder(orderId, req);
    if (error) return res.status(status).send(error);

    await updateOrderPaymentStatus(order.orderId, 'successful', {
      paymentProvider: 'nets',
      paymentReference: txn || order.paymentReference || null
    });

    const emailPart = email ? `&email=${encodeURIComponent(email)}` : '';
    return res.redirect(
      `/checkout/success?orderId=${encodeURIComponent(order.orderId)}&total=${encodeURIComponent(total || order.totalAmount)}${emailPart}`
    );
  } catch (err) {
    console.error('NETS confirm error:', err);
    return res.status(500).send('Server error');
  }
});

// NETS: Local mock payment page (used by mock QR scan flow)
app.get('/nets/mock-pay', async (req, res) => {
  try {
    const { orderId, txn } = req.query || {};
    const { order, error, status } = await getAuthorizedOrderForMock(orderId, txn, req);
    if (error) return res.status(status).send(error);

    const fullOrder = await getOrderById(order.orderId);
    if (!fullOrder) return res.status(404).send('Order not found');

    return res.render('netsMockPay', {
      order: fullOrder,
      txnRetrievalRef: txn || fullOrder.paymentReference || null,
      user: req.session && req.session.user
    });
  } catch (err) {
    console.error('Render /nets/mock-pay error', err);
    return res.status(500).send('Server error');
  }
});

// NETS: Local mock payment submit -> marks order successful
app.post('/nets/mock-pay', async (req, res) => {
  try {
    const { orderId, txnRetrievalRef } = req.body || {};
    const { order, error, status } = await getAuthorizedOrderForMock(orderId, txnRetrievalRef, req);
    if (error) return res.status(status).send(error);

    const fullOrder = await getOrderById(order.orderId);
    if (!fullOrder) return res.status(404).send('Order not found');

    const reference = txnRetrievalRef || fullOrder.paymentReference || 'MOCK_NETS_SCAN';
    await updateOrderPaymentStatus(order.orderId, 'successful', {
      paymentProvider: 'nets',
      paymentReference: reference
    });

    const email = fullOrder.customerEmail ? `&email=${encodeURIComponent(fullOrder.customerEmail)}` : '';
    return res.redirect(
      `/checkout/success?orderId=${encodeURIComponent(order.orderId)}&total=${encodeURIComponent(fullOrder.totalAmount)}${email}`
    );
  } catch (err) {
    console.error('POST /nets/mock-pay error', err);
    return res.status(500).send('Server error');
  }
});

// Address Lookup: Get address from postal code
app.post('/api/lookup-address', async (req, res) => {
  try {
    const { postalCode } = req.body;

    if (!postalCode) {
      return res.status(400).json({ error: 'Postal code is required' });
    }

    // Validate postal code format (6 digits)
    if (!/^\d{6}$/.test(postalCode)) {
      return res.status(400).json({ error: 'Invalid postal code format' });
    }

    const fetch = require('node-fetch');

    // Use OneMap API (Singapore) for postal code lookup
    const response = await fetch(
      `https://www.onemap.sg/api/common/elastic/search?searchVal=${postalCode}&returnGeom=Y&getAddrDetails=Y&pageNum=1`
    );

    if (!response.ok) {
      throw new Error('Address lookup service unavailable');
    }

    const data = await response.json();

    if (!data.results || data.results.length === 0) {
      return res.status(404).json({ error: 'Postal code not found' });
    }

    // Extract address from the first result
    const result = data.results[0];
    const fullAddress = result.ADDRESS || '';

    if (!fullAddress) {
      return res.status(404).json({ error: 'Could not extract address details' });
    }

    return res.json({
      success: true,
      address: fullAddress,
      latitude: result.LATITUDE,
      longitude: result.LONGITUDE,
      postalCode: result.POSTAL_CODE
    });
  } catch (error) {
    console.error('Address lookup error:', error);
    res.status(500).json({ error: 'Error looking up address. Please try again.' });
  }
});

// Generate (or re-generate) invoice and send the invoice file directly
app.get('/invoice/:orderId', async (req, res) => {
  try {
    const orderId = parseInt(req.params.orderId, 10);
    if (!orderId) return res.status(400).send('Invalid order id');
    const generateInvoice = require('./utils/generateInvoice');
    const filename = await generateInvoice(orderId);
    if (!filename) return res.status(500).send('Invoice generation failed');
    const filePath = path.join(__dirname, 'public', 'invoices', filename);
    return res.sendFile(filePath);
  } catch (err) {
    console.error('Error generating invoice for order', req.params.orderId, err);
    return res.status(500).send('Could not generate invoice');
  }
});

// Order history page
app.get('/order-history', (req, res) => {
  try {
    const user = req.session && req.session.user;
    const email = req.query && req.query.email ? String(req.query.email) : null;

    if (user) {
      const userId = user.userId;
      // Load orders by userId and also include any guest orders that used the same email
      Order.getByUserId(userId, async (err, userOrders) => {
        if (err) {
          console.error('Error fetching order history by userId:', err);
          return res.status(500).send('Error retrieving order history');
        }

        // Try to merge orders by customerEmail matching username (useful if username is an email)
        const possibleEmail = user.username || null;
        if (!possibleEmail) {
          const withRefunds = await attachRefundReasons(userOrders || []);
          return res.render('orderHistory', { orders: withRefunds, user, query: req.query || {} });
        }

        Order.getByEmail(possibleEmail, async (err2, emailOrders) => {
          if (err2) {
            console.error('Error fetching order history by email:', err2);
            const withRefunds = await attachRefundReasons(userOrders || []);
            return res.render('orderHistory', { orders: withRefunds, user, query: req.query || {} });
          }

          // Merge orders, avoiding duplicates (by orderId)
          const map = {};
          (userOrders || []).forEach((o) => {
            map[o.orderId] = o;
          });
          (emailOrders || []).forEach((o) => {
            if (!map[o.orderId]) map[o.orderId] = o;
          });

          // Convert to array and sort by date desc
          const merged = Object.values(map).sort((a, b) => new Date(b.orderDate) - new Date(a.orderDate));
          const withRefunds = await attachRefundReasons(merged);
          return res.render('orderHistory', { orders: withRefunds, user, query: req.query || {} });
        });
      });
    } else if (email) {
      Order.getByEmail(email, async (err, orders) => {
        if (err) {
          console.error('Error fetching order history by email:', err);
          return res.status(500).send('Error retrieving order history');
        }
        const withRefunds = await attachRefundReasons(orders || []);
        return res.render('orderHistory', { orders: withRefunds, user: null, query: req.query || {} });
      });
    } else {
      return res.render('orderHistory', { orders: [], user: null, query: req.query || {} });
    }
  } catch (err) {
    console.error('Render /order-history error', err);
    res.status(500).send('Server error');
  }
});

// Customer refund request (requires reason)
app.post('/orders/:orderId/refund', async (req, res) => {
  try {
    const orderId = parseInt(req.params.orderId, 10);
    if (!orderId) return res.status(400).send('Invalid order id');

    const reason = String((req.body && req.body.reason) || '').trim();
    if (!reason || reason.length < 5) {
      return res.status(400).send('Refund reason is required (min 5 characters).');
    }

    const { order, error, status } = await getAuthorizedOrder(orderId, req);
    if (error) return res.status(status).send(error);

    const current = await getOrderPaymentStatus(orderId);
    if (!current || String(current.paymentStatus || '').toLowerCase() !== 'successful') {
      return res.status(400).send('Only successful payments can be refunded.');
    }

    const existingRefund = await getRefundByOrderId(orderId);
    if (existingRefund) {
      return res.status(400).send('A refund has already been requested for this order.');
    }

    await createRefundRequest(orderId, order.userId || null, reason);
    await updateOrderPaymentStatus(orderId, 'refunded', {
      paymentProvider: current.paymentProvider || 'refund',
      paymentReference: current.paymentReference || null
    });

    return res.redirect(`/order-history?refund=1&orderId=${encodeURIComponent(orderId)}`);
  } catch (err) {
    console.error('Refund request error:', err);
    return res.status(500).send('Server error');
  }
});

// Admin: View all orders
app.get('/admin/orders', (req, res) => {
  try {
    if (!req.session || !req.session.user || !req.session.user.isAdmin) {
      return res.status(403).send('Access denied. Admin privileges required.');
    }

    Order.getAll((err, orders) => {
      if (err) {
        console.error('Error fetching all orders:', err);
        return res.status(500).send('Error retrieving orders');
      }

      // Ensure most recent orders appear first (fallback to orderId if dates missing)
      const sortedOrders = (orders || []).slice().sort((a, b) => {
        const dateA = new Date(a.orderDate || 0).getTime();
        const dateB = new Date(b.orderDate || 0).getTime();
        if (dateA !== dateB) return dateB - dateA;
        return Number(b.orderId || 0) - Number(a.orderId || 0);
      });

      // Compute total revenue from successful orders only
      let totalRevenue = 0;
      try {
        totalRevenue = (sortedOrders || []).reduce((sum, o) => {
          if ((o.paymentStatus || '').toLowerCase() !== 'successful') return sum;
          const amt = Number(o.totalAmount || o.total || o.total_amount || 0) || 0;
          return sum + amt;
        }, 0);
        totalRevenue = Number(totalRevenue.toFixed(2));
      } catch (e) {
        console.error('Error computing total revenue', e);
        totalRevenue = 0;
      }

      res.render('adminOrders', { orders: sortedOrders, user: req.session.user, totalRevenue });
    });
  } catch (err) {
    console.error('Render /admin/orders error', err);
    res.status(500).send('Server error');
  }
});

// Admin: View feedback entries
app.get('/admin/feedbacks', ensureAdmin, (req, res) => {
  try {
    const Feedback = require('./models/feedback');
    Feedback.getAll((err, feedbacks) => {
      if (err) {
        console.error('Error fetching feedbacks:', err);
        return res.status(500).send('Error retrieving feedbacks');
      }
      return res.render('adminFeedbacks', { feedbacks, user: req.session.user });
    });
  } catch (err) {
    console.error('Render /admin/feedbacks error', err);
    res.status(500).send('Server error');
  }
});

// Feedback: render form (customers)
app.get('/feedback', (req, res) => {
  try {
    const user = req.session && req.session.user ? req.session.user : null;
    return res.render('feedback', { user });
  } catch (err) {
    console.error('Render /feedback error', err);
    return res.status(500).send('Server error');
  }
});

// Feedback: submit
app.post('/feedback', (req, res) => {
  try {
    const Feedback = require('./models/feedback');
    const userId = req.session && req.session.user ? req.session.user.userId : req.body && req.body.userId ? req.body.userId : null;
    const email = req.body && req.body.email ? String(req.body.email) : null;
    const message = req.body && req.body.message ? String(req.body.message) : null;
    if (!message) return res.status(400).send('Message is required');

    const parsedRating = req.body && req.body.rating ? parseInt(req.body.rating, 10) : null;
    const safeRating =
      parsedRating && Number.isFinite(parsedRating) && parsedRating >= 1 && parsedRating <= 5 ? parsedRating : null;

    Feedback.create({ userId, email, message, rating: safeRating }, (err) => {
      if (err) {
        console.error('Error saving feedback', err);
        return res.status(500).send('Could not save feedback');
      }
      return res.send('<p>Thanks for your feedback! <a href="/">Back to home</a></p>');
    });
  } catch (err) {
    console.error('POST /feedback error', err);
    return res.status(500).send('Server error');
  }
});

// Product details
app.get('/product/:id', (req, res) => SupermarketController.getById(req, res));

// Product rating (customers)
app.post('/product/:id/rate', async (req, res) => {
  try {
    const user = req.session && req.session.user;
    if (!user || !user.userId) {
      return res.status(403).send('You must be logged in to rate products.');
    }

    const productId = parseInt(req.params.id, 10);
    if (!productId) return res.status(400).send('Invalid product id');

    const rating = parseInt(req.body && req.body.rating, 10);
    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).send('Rating must be between 1 and 5.');
    }

    const product = await new Promise((resolve, reject) => {
      Product.getById(productId, (err, p) => (err ? reject(err) : resolve(p)));
    });
    if (!product) return res.status(404).send('Product not found');

    ProductRating.upsert(productId, user.userId, rating, (err) => {
      if (err) {
        console.error('Error saving rating:', err);
        return res.status(500).send('Could not save rating');
      }
      return res.redirect(`/product/${productId}?rated=1`);
    });
  } catch (err) {
    console.error('Rate product error:', err);
    return res.status(500).send('Server error');
  }
});

// Add product (admin only)
app.get('/addProduct', ensureAdmin, (req, res) => res.render('addProduct', { user: req.session.user }));
app.post('/addProduct', ensureAdmin, upload.single('image'), (req, res) => SupermarketController.create(req, res));

// Update product (admin only)
app.get('/updateProduct/:id', ensureAdmin, (req, res) => {
  const id = req.params.id;
  Product.getById(id, (err, product) => {
    if (err) {
      console.error('Error fetching product for edit:', err);
      return res.status(500).send('Error retrieving product');
    }
    if (!product) return res.status(404).send('Product not found');
    return res.render('updateProduct', { product, user: req.session.user });
  });
});
app.post('/updateProduct/:id', ensureAdmin, upload.single('image'), (req, res) => SupermarketController.update(req, res));

// Delete product (admin only)
app.get('/deleteProduct/:id', ensureAdmin, (req, res) => SupermarketController.delete(req, res));

const PORT = process.env.PORT || 3000;

// Debug: list registered routes (temporary)
app.get('/__routes', (req, res) => {
  try {
    const routes = [];
    app._router.stack.forEach((mw) => {
      if (mw.route && mw.route.path) {
        const methods = Object.keys(mw.route.methods).join(',').toUpperCase();
        routes.push({ path: mw.route.path, methods });
      }
    });
    res.json({ routes });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
