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

  const sql = `
    CREATE TABLE IF NOT EXISTS feedbacks (
      feedbackId INT AUTO_INCREMENT PRIMARY KEY,
      userId INT NULL,
      email VARCHAR(255) NULL,
      message TEXT NOT NULL,
      createdAt DATETIME NOT NULL,
      FOREIGN KEY (userId) REFERENCES users(userId) ON DELETE SET NULL
    )`;

  db.query(sql, (err2) => {
    if (err2) {
      console.error('Error creating feedbacks table', err2);
      db.end();
      process.exit(1);
    }
    console.log('Feedbacks table created/verified');
    db.end();
    process.exit(0);
  });
});
