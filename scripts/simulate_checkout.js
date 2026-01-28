const http = require('http');

const postData = JSON.stringify({
  cart: [
    { productId: 1, productName: 'Test Product', price: 1.00, quantity: 1, image: 'test.jpg' }
  ],
  paymentMethod: 'visa',
  billing: { name: 'Test Buyer', email: 'test@example.com', address: '123 Test St' }
});

const options = {
  hostname: 'localhost',
  port: 3000,
  path: '/checkout',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(postData)
  }
};

const req = http.request(options, (res) => {
  let data = '';
  console.log(`STATUS: ${res.statusCode}`);
  res.setEncoding('utf8');
  res.on('data', (chunk) => { data += chunk; });
  res.on('end', () => {
    console.log('Response body:', data);
    process.exit(0);
  });
});

req.on('error', (e) => {
  console.error('Request error:', e);
  process.exit(1);
});

req.write(postData);
req.end();
