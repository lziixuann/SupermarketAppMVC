const Order = require('../models/order');
const id = Number(process.argv[2] || 4);
Order.getById(id, (err, order) => {
  if (err) {
    console.error('ERROR:', err);
    process.exit(2);
  }
  if (!order) {
    console.log('NOT_FOUND');
    process.exit(0);
  }
  console.log(JSON.stringify(order, null, 2));
  process.exit(0);
});
