const Feedback = require('../models/feedback');

Feedback.create({ userId: null, email: 'test@example.com', message: 'This is a test feedback from CLI' }, (err, res) => {
  if (err) {
    console.error('FEEDBACK ERR', err);
    process.exit(2);
  }
  console.log('OK', res && res.insertId);
  process.exit(0);
});
