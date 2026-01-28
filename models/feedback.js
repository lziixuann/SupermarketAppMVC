const db = require('../db');

module.exports = {
  // Create a new feedback entry
  // data: { userId, email, message }
  create: (data, callback) => {
    const { userId, email, message } = data;
    const sql = 'INSERT INTO feedbacks (userId, email, message, createdAt) VALUES (?, ?, ?, NOW())';
    db.query(sql, [userId || null, email || null, message || null], (err, result) => callback(err, result));
  },

  // List feedback entries (admin)
  getAll: (callback) => {
    const sql = `SELECT f.feedbackId, f.userId, f.email, f.message, f.createdAt, u.username
                 FROM feedbacks f
                 LEFT JOIN users u ON f.userId = u.userId
                 ORDER BY f.createdAt DESC`;
    db.query(sql, (err, results) => callback(err, results));
  }
};
