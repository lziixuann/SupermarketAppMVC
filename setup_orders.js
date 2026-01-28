const mysql = require('mysql2');
require('dotenv').config();

const db = mysql.createConnection({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASS || 'RP738964$',
  database: process.env.DB_NAME || 'c237_supermarketapp'
});

console.log('Setting up orders tables...');

db.connect((err) => {
  if (err) {
    console.error('Error connecting to MySQL:', err);
    process.exit(1);
  }
  console.log('Connected to MySQL database');

  // Create orders table
  const createOrdersTable = `
  CREATE TABLE IF NOT EXISTS orders (
    orderId INT AUTO_INCREMENT PRIMARY KEY,
    userId INT NULL,
    totalAmount DECIMAL(10, 2) NOT NULL,
    paymentMethod VARCHAR(50),
    paymentStatus VARCHAR(20) NOT NULL DEFAULT 'pending',
    paymentProvider VARCHAR(50) NULL,
    paymentReference VARCHAR(100) NULL,
    paymentStatusUpdatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    customerName VARCHAR(100) NULL,
    customerEmail VARCHAR(255) NULL,
    orderDate DATETIME NOT NULL,
    FOREIGN KEY (userId) REFERENCES users(userId) ON DELETE SET NULL
  )`;

  // Create order_items table
  const createOrderItemsTable = `
  CREATE TABLE IF NOT EXISTS order_items (
    orderItemId INT AUTO_INCREMENT PRIMARY KEY,
    orderId INT NOT NULL,
    productId INT NOT NULL,
    quantity INT NOT NULL,
    price DECIMAL(10, 2) NOT NULL,
    FOREIGN KEY (orderId) REFERENCES orders(orderId) ON DELETE CASCADE,
    FOREIGN KEY (productId) REFERENCES products(productId) ON DELETE CASCADE
  )`;

  db.query(createOrdersTable, (err) => {
    if (err) {
      console.error('Error creating orders table:', err);
      db.end();
      process.exit(1);
    }
    console.log('Orders table created/verified');

    db.query(createOrderItemsTable, (err2) => {
      if (err2) {
        console.error('Error creating order_items table:', err2);
        db.end();
        process.exit(1);
      }
      console.log('Order_items table created/verified');

      console.log('\nAll tables are ready! You can now process orders.');
      db.end();
      process.exit(0);
    });
  });
});