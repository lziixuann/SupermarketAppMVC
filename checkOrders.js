const db = require('./db');

function q(sql, params=[]) {
  return new Promise((resolve, reject) => {
    db.query(sql, params, (err, results) => {
      if (err) return reject(err);
      resolve(results);
    });
  });
}

(async () => {
  try {
    const [dbNameRow] = await q('SELECT DATABASE() AS db');
    console.log('Connected DB:', dbNameRow.db);

    const tables = await q("SHOW TABLES LIKE 'orders'");
    if (tables.length === 0) {
      console.log("Table 'orders' not found. Run create_order_tables.sql and migrations.");
      process.exit(0);
    }

    const counts = await q('SELECT (SELECT COUNT(*) FROM orders) AS ordersCount, (SELECT COUNT(*) FROM order_items) AS itemsCount');
    console.log('Counts:', counts[0]);

    const recent = await q(`
      SELECT o.orderId, o.userId, o.customerEmail, o.totalAmount, o.paymentMethod, o.orderDate
      FROM orders o
      ORDER BY o.orderDate DESC
      LIMIT 5
    `);
    console.log('Recent orders:', recent);

    if (recent.length) {
      const oid = recent[0].orderId;
      const items = await q(`
        SELECT oi.orderItemId, oi.productId, oi.quantity, oi.price
        FROM order_items oi
        WHERE oi.orderId = ?
      `, [oid]);
      console.log(`Items for latest order #${oid}:`, items);
    }

    process.exit(0);
  } catch (e) {
    console.error('Error checking orders:', e);
    process.exit(1);
  }
})();
