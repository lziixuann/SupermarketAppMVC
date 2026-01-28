const db = require('../db');
const { normalizeStatus } = require('../utils/paymentStatus');

module.exports = {
  // Create a new order
  create: (data, callback) => {
    const {
      userId,
      totalAmount,
      paymentMethod,
      customerName,
      customerEmail,
      paymentStatus,
      paymentProvider,
      paymentReference
    } = data;

    const initialStatus = normalizeStatus(paymentStatus || 'pending');
    const provider = paymentProvider || paymentMethod || null;

    const sql = `
      INSERT INTO orders (
        userId,
        totalAmount,
        paymentMethod,
        paymentStatus,
        paymentProvider,
        paymentReference,
        paymentStatusUpdatedAt,
        customerName,
        customerEmail,
        orderDate
      ) VALUES (?, ?, ?, ?, ?, ?, NOW(), ?, ?, NOW())
    `;

    db.query(
      sql,
      [
        userId || null,
        totalAmount,
        paymentMethod,
        initialStatus,
        provider,
        paymentReference || null,
        customerName || null,
        customerEmail || null
      ],
      (err, result) => {
        if (err) return callback(err);
        return callback(null, result.insertId);
      }
    );
  },

  // Create order items (products in the order)
  createItems: (orderId, items, callback) => {
    if (!items || items.length === 0) return callback(null);

    const sql = 'INSERT INTO order_items (orderId, productId, quantity, price) VALUES ?';
    const values = items.map((item) => [orderId, item.productId, item.quantity, item.price]);

    db.query(sql, [values], (err, result) => callback(err, result));
  },

  // Update payment status for an order
  updatePaymentStatus: (orderId, status, options, callback) => {
    const opts = options || {};
    const nextStatus = normalizeStatus(status);
    const provider = Object.prototype.hasOwnProperty.call(opts, 'paymentProvider') ? opts.paymentProvider : null;
    const reference = Object.prototype.hasOwnProperty.call(opts, 'paymentReference') ? opts.paymentReference : null;

    const sql = `
      UPDATE orders
      SET paymentStatus = ?,
          paymentStatusUpdatedAt = NOW(),
          paymentProvider = COALESCE(?, paymentProvider),
          paymentReference = COALESCE(?, paymentReference)
      WHERE orderId = ?
    `;

    db.query(sql, [nextStatus, provider, reference, orderId], (err, result) => {
      if (err) return callback(err);
      return callback(null, { affectedRows: result.affectedRows, paymentStatus: nextStatus });
    });
  },

  // Get payment status for a single order
  getPaymentStatus: (orderId, callback) => {
    const sql = `
      SELECT orderId, userId, totalAmount, paymentMethod,
             paymentStatus, paymentProvider, paymentReference, paymentStatusUpdatedAt
      FROM orders
      WHERE orderId = ?
      LIMIT 1
    `;

    db.query(sql, [orderId], (err, results) => {
      if (err) return callback(err);
      if (!results || results.length === 0) return callback(null, null);
      return callback(null, results[0]);
    });
  },

  // Get all orders for a guest email
  getByEmail: (email, callback) => {
    const sql = `
      SELECT o.orderId, o.totalAmount, o.paymentMethod, o.orderDate,
             o.paymentStatus, o.paymentProvider, o.paymentReference, o.paymentStatusUpdatedAt,
             o.customerName, o.customerEmail,
             oi.orderItemId, oi.productId, oi.quantity, oi.price,
             p.productName, p.image
      FROM orders o
      LEFT JOIN order_items oi ON o.orderId = oi.orderId
      LEFT JOIN products p ON oi.productId = p.productId
      WHERE o.customerEmail = ?
      ORDER BY o.orderDate DESC
    `;
    db.query(sql, [email], (err, results) => {
      if (err) return callback(err);
      const orders = {};
      results.forEach((row) => {
        if (!orders[row.orderId]) {
          orders[row.orderId] = {
            orderId: row.orderId,
            totalAmount: row.totalAmount,
            paymentMethod: row.paymentMethod,
            paymentStatus: row.paymentStatus,
            paymentProvider: row.paymentProvider,
            paymentReference: row.paymentReference,
            paymentStatusUpdatedAt: row.paymentStatusUpdatedAt,
            orderDate: row.orderDate,
            customerName: row.customerName || null,
            customerEmail: row.customerEmail || null,
            items: []
          };
        }
        if (row.orderItemId) {
          orders[row.orderId].items.push({
            orderItemId: row.orderItemId,
            productId: row.productId,
            productName: row.productName,
            image: row.image,
            quantity: row.quantity,
            price: row.price
          });
        }
      });
      return callback(null, Object.values(orders));
    });
  },

  // Get all orders for a user
  getByUserId: (userId, callback) => {
    const sql = `
      SELECT o.orderId, o.totalAmount, o.paymentMethod, o.orderDate,
             o.paymentStatus, o.paymentProvider, o.paymentReference, o.paymentStatusUpdatedAt,
             o.customerName, o.customerEmail,
             oi.orderItemId, oi.productId, oi.quantity, oi.price,
             p.productName, p.image
      FROM orders o
      LEFT JOIN order_items oi ON o.orderId = oi.orderId
      LEFT JOIN products p ON oi.productId = p.productId
      WHERE o.userId = ?
      ORDER BY o.orderDate DESC
    `;
    db.query(sql, [userId], (err, results) => {
      if (err) return callback(err);

      // Group items by order
      const orders = {};
      results.forEach((row) => {
        if (!orders[row.orderId]) {
          orders[row.orderId] = {
            orderId: row.orderId,
            totalAmount: row.totalAmount,
            paymentMethod: row.paymentMethod,
            paymentStatus: row.paymentStatus,
            paymentProvider: row.paymentProvider,
            paymentReference: row.paymentReference,
            paymentStatusUpdatedAt: row.paymentStatusUpdatedAt,
            orderDate: row.orderDate,
            customerName: row.customerName || null,
            customerEmail: row.customerEmail || null,
            items: []
          };
        }
        if (row.orderItemId) {
          orders[row.orderId].items.push({
            orderItemId: row.orderItemId,
            productId: row.productId,
            productName: row.productName,
            image: row.image,
            quantity: row.quantity,
            price: row.price
          });
        }
      });

      return callback(null, Object.values(orders));
    });
  },

  // Get all orders (for admin)
  getAll: (callback) => {
    const sql = `
      SELECT o.orderId, o.userId, o.totalAmount, o.paymentMethod, o.orderDate,
             o.paymentStatus, o.paymentProvider, o.paymentReference, o.paymentStatusUpdatedAt,
             u.username,
             o.customerName, o.customerEmail,
             oi.orderItemId, oi.productId, oi.quantity, oi.price,
             p.productName, p.image
      FROM orders o
      LEFT JOIN users u ON o.userId = u.userId
      LEFT JOIN order_items oi ON o.orderId = oi.orderId
      LEFT JOIN products p ON oi.productId = p.productId
      ORDER BY o.orderDate DESC
    `;
    db.query(sql, [], (err, results) => {
      if (err) return callback(err);

      // Group items by order
      const orders = {};
      results.forEach((row) => {
        if (!orders[row.orderId]) {
          orders[row.orderId] = {
            orderId: row.orderId,
            userId: row.userId,
            username: row.username || 'Guest',
            customerName: row.customerName || null,
            customerEmail: row.customerEmail || null,
            totalAmount: row.totalAmount,
            paymentMethod: row.paymentMethod,
            paymentStatus: row.paymentStatus,
            paymentProvider: row.paymentProvider,
            paymentReference: row.paymentReference,
            paymentStatusUpdatedAt: row.paymentStatusUpdatedAt,
            orderDate: row.orderDate,
            items: []
          };
        }
        if (row.orderItemId) {
          orders[row.orderId].items.push({
            orderItemId: row.orderItemId,
            productId: row.productId,
            productName: row.productName,
            image: row.image,
            quantity: row.quantity,
            price: row.price
          });
        }
      });

      return callback(null, Object.values(orders));
    });
  },

  // Get a single order by ID
  getById: (orderId, callback) => {
    const sql = `
      SELECT o.orderId, o.userId, o.totalAmount, o.paymentMethod, o.orderDate,
             o.paymentStatus, o.paymentProvider, o.paymentReference, o.paymentStatusUpdatedAt,
             o.customerName, o.customerEmail,
             oi.orderItemId, oi.productId, oi.quantity, oi.price,
             p.productName, p.image
      FROM orders o
      LEFT JOIN order_items oi ON o.orderId = oi.orderId
      LEFT JOIN products p ON oi.productId = p.productId
      WHERE o.orderId = ?
    `;
    db.query(sql, [orderId], (err, results) => {
      if (err) return callback(err);
      if (!results || results.length === 0) return callback(null, null);

      const order = {
        orderId: results[0].orderId,
        userId: results[0].userId,
        customerName: results[0].customerName || null,
        customerEmail: results[0].customerEmail || null,
        totalAmount: results[0].totalAmount,
        paymentMethod: results[0].paymentMethod,
        paymentStatus: results[0].paymentStatus,
        paymentProvider: results[0].paymentProvider,
        paymentReference: results[0].paymentReference,
        paymentStatusUpdatedAt: results[0].paymentStatusUpdatedAt,
        orderDate: results[0].orderDate,
        items: []
      };

      results.forEach((row) => {
        if (row.orderItemId) {
          order.items.push({
            orderItemId: row.orderItemId,
            productId: row.productId,
            productName: row.productName,
            image: row.image,
            quantity: row.quantity,
            price: row.price
          });
        }
      });

      return callback(null, order);
    });
  }
};