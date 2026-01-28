const db = require('../db');

module.exports = {
  // Create a new order
  create: (data, callback) => {
    const { userId, totalAmount, paymentMethod, customerName, customerEmail } = data;
    const sql = 'INSERT INTO orders (userId, totalAmount, paymentMethod, customerName, customerEmail, orderDate) VALUES (?, ?, ?, ?, ?, NOW())';
    db.query(sql, [userId || null, totalAmount, paymentMethod, customerName || null, customerEmail || null], (err, result) => {
      if (err) return callback(err);
      return callback(null, result.insertId);
    });
  },

  // Create order items (products in the order)
  createItems: (orderId, items, callback) => {
    if (!items || items.length === 0) return callback(null);
    
    const sql = 'INSERT INTO order_items (orderId, productId, quantity, price) VALUES ?';
    const values = items.map(item => [orderId, item.productId, item.quantity, item.price]);
    
    db.query(sql, [values], (err, result) => callback(err, result));
  },

  // Get all orders for a guest email
  getByEmail: (email, callback) => {
    const sql = `
      SELECT o.orderId, o.totalAmount, o.paymentMethod, o.orderDate,
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
      results.forEach(row => {
        if (!orders[row.orderId]) {
          orders[row.orderId] = {
            orderId: row.orderId,
            totalAmount: row.totalAmount,
            paymentMethod: row.paymentMethod,
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
      results.forEach(row => {
        if (!orders[row.orderId]) {
          orders[row.orderId] = {
            orderId: row.orderId,
            totalAmount: row.totalAmount,
            paymentMethod: row.paymentMethod,
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
      results.forEach(row => {
        if (!orders[row.orderId]) {
          orders[row.orderId] = {
            orderId: row.orderId,
            userId: row.userId,
            username: row.username || 'Guest',
            customerName: row.customerName || null,
            customerEmail: row.customerEmail || null,
            totalAmount: row.totalAmount,
            paymentMethod: row.paymentMethod,
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
        orderDate: results[0].orderDate,
        items: []
      };
      
      results.forEach(row => {
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
