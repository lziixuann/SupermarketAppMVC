const db = require('./db');

db.query('SELECT productId, productName, quantity, price FROM products LIMIT 50', (err, results) => {
  if (err) {
    console.error('Query error:', err);
    process.exit(1);
  }
  console.log('Products rows fetched:', results.length);
  console.table(results);
  process.exit(0);
});
