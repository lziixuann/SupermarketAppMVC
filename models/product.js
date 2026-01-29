const db = require('../db');

// Product model (function-based) for MVC pattern
// Exports an object with methods: getAll, getById, create, update, delete
// Each method accepts parameters and a callback(err, result)

module.exports = {
  // Get all products
  getAll: (callback) => {
    const sql = `
      SELECT p.*,
             COALESCE(r.avgRating, 0) AS avgRating,
             COALESCE(r.ratingCount, 0) AS ratingCount
      FROM products p
      LEFT JOIN (
        SELECT productId, AVG(rating) AS avgRating, COUNT(*) AS ratingCount
        FROM product_ratings
        GROUP BY productId
      ) r ON r.productId = p.productId
    `;
    db.query(sql, (err, results) => callback(err, results));
  },

  // Get a single product by ID
  getById: (productId, callback) => {
    const sql = 'SELECT * FROM products WHERE productId = ?';
    db.query(sql, [productId], (err, results) => {
      if (err) return callback(err);
      return callback(null, results && results.length ? results[0] : null);
    });
  },

  // Add a new product
  // data: { productName, quantity, price, image }
  create: (data, callback) => {
    const { productName, quantity, price, image } = data;
    const sql = 'INSERT INTO products (productName, quantity, price, image) VALUES (?, ?, ?, ?)';
    db.query(sql, [productName, quantity, price, image], (err, result) => callback(err, result));
  },

  // Update an existing product by ID
  // data: { productName, quantity, price, image }
  update: (productId, data, callback) => {
    const { productName, quantity, price, image } = data;
    const sql = 'UPDATE products SET productName = ?, quantity = ?, price = ?, image = ? WHERE productId = ?';
    db.query(sql, [productName, quantity, price, image, productId], (err, result) => callback(err, result));
  },

  // Delete a product by ID
  delete: (productId, callback) => {
    const sql = 'DELETE FROM products WHERE productId = ?';
    db.query(sql, [productId], (err, result) => callback(err, result));
  },

  // Deduct stock for a product (used at checkout)
  // productId: the product ID
  // quantityToDeduct: how many to deduct from stock
  deductStock: (productId, quantityToDeduct, callback) => {
    const sql = 'UPDATE products SET quantity = quantity - ? WHERE productId = ? AND quantity >= ?';
    db.query(sql, [quantityToDeduct, productId, quantityToDeduct], (err, result) => callback(err, result));
  }
};
