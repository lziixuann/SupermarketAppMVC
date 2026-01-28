const ejs = require('ejs');
const fs = require('fs');
try {
  const tpl = fs.readFileSync('views/index.ejs', 'utf8');
  ejs.render(tpl, { products: [], user: {}, feedbacks: [] });
  console.log('EJS render ok (no syntax error)');
} catch (e) {
  console.error('RENDER ERR', e && e.message);
  process.exit(2);
}
