const mysql = require('mysql2');
require('dotenv').config();

const db = mysql.createConnection({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASS || 'RP738964$',
  database: process.env.DB_NAME || 'c237_supermarketapp'
});

db.connect((err) => {
  if (err) {
    console.error('DB connect error', err);
    process.exit(1);
  }
  console.log('Connected to DB');

  const checkSql = `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'orders' AND COLUMN_NAME IN ('customerName','customerEmail')`;
  db.query(checkSql, [db.config.database], (err, results) => {
    if (err) {
      console.error('Error checking columns', err);
      db.end();
      process.exit(1);
    }
    const existing = results.map(r => r.COLUMN_NAME);
    const toAdd = [];
    if (!existing.includes('customerName')) toAdd.push("ADD COLUMN customerName VARCHAR(100) NULL");
    if (!existing.includes('customerEmail')) toAdd.push("ADD COLUMN customerEmail VARCHAR(255) NULL");

    if (toAdd.length === 0) {
      console.log('Columns already present.');
      db.end();
      process.exit(0);
    }

    const alterSql = `ALTER TABLE orders ${toAdd.join(', ')}`;
    console.log('Altering orders table:', alterSql);
    db.query(alterSql, (err2) => {
      if (err2) {
        console.error('Error altering orders table', err2);
        db.end();
        process.exit(1);
      }
      console.log('Successfully added missing columns to orders table.');
      db.end();
      process.exit(0);
    });
  });
});
