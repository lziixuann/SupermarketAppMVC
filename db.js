const mysql = require('mysql2');
require('dotenv').config(); // Load variables from .env

const db = mysql.createConnection({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASS || 'RP738964$',     // replace default only if you want local fallback
  database: process.env.DB_NAME || 'c237_supermarketapp'
});

db.connect((err) => {
  if (err) {
    console.error('Error connecting to MySQL:', err);
    return;
  }
  console.log('Connected to MySQL database');
});

module.exports = db;
