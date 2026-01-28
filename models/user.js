const db = require('../db');
const crypto = require('crypto');

function generateSalt() {
  return crypto.randomBytes(16).toString('hex');
}

function hashPassword(password, salt) {
  const hash = crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512');
  return hash.toString('hex');
}

module.exports = {
  // Create a new user: expects { username, password, isAdmin }
  create: (data, callback) => {
    const { username, password, isAdmin } = data;
    const salt = generateSalt();
    const passwordHash = hashPassword(password, salt);
    const sql = 'INSERT INTO users (username, passwordHash, salt, isAdmin) VALUES (?, ?, ?, ?)';
    db.query(sql, [username, passwordHash, salt, isAdmin ? 1 : 0], (err, result) => callback(err, result));
  },

  // Get user by username
  getByUsername: (username, callback) => {
    const sql = 'SELECT userId, username, passwordHash, salt, isAdmin FROM users WHERE username = ?';
    db.query(sql, [username], (err, results) => {
      if (err) return callback(err);
      return callback(null, results && results.length ? results[0] : null);
    });
  },

  // Get user by id
  getById: (id, callback) => {
    const sql = 'SELECT userId, username, isAdmin FROM users WHERE userId = ?';
    db.query(sql, [id], (err, results) => {
      if (err) return callback(err);
      return callback(null, results && results.length ? results[0] : null);
    });
  },

  // Verify password
  verifyPassword: (userRow, password) => {
    if (!userRow || !userRow.salt || !userRow.passwordHash) return false;
    const candidate = hashPassword(password, userRow.salt);
    return crypto.timingSafeEqual(Buffer.from(candidate, 'hex'), Buffer.from(userRow.passwordHash, 'hex'));
  }
};
