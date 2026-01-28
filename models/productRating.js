const db = require('../db');

module.exports = {
  getStats: (productId, callback) => {
    const sql = `
      SELECT AVG(rating) AS avgRating, COUNT(*) AS ratingCount
      FROM product_ratings
      WHERE productId = ?
    `;
    db.query(sql, [productId], (err, results) => {
      if (err) return callback(err);
      const row = results && results[0] ? results[0] : { avgRating: 0, ratingCount: 0 };
      return callback(null, row);
    });
  },

  getUserRating: (productId, userId, callback) => {
    const sql = `
      SELECT rating
      FROM product_ratings
      WHERE productId = ? AND userId = ?
      LIMIT 1
    `;
    db.query(sql, [productId, userId], (err, results) => {
      if (err) return callback(err);
      if (!results || results.length === 0) return callback(null, null);
      return callback(null, results[0].rating);
    });
  },

  upsert: (productId, userId, rating, callback) => {
    const sql = `
      INSERT INTO product_ratings (productId, userId, rating, createdAt, updatedAt)
      VALUES (?, ?, ?, NOW(), NOW())
      ON DUPLICATE KEY UPDATE rating = VALUES(rating), updatedAt = NOW()
    `;
    db.query(sql, [productId, userId, rating], (err, result) => callback(err, result));
  }
};

