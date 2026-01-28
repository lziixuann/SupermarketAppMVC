const Order = require('../models/order');
Order.getAll((err, orders) => {
  if (err) {
    console.error('ERROR', err);
    process.exit(2);
  }
  console.log(JSON.stringify(orders, null, 2));
  process.exit(0);
});
