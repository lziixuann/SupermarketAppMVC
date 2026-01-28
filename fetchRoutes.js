const http = require('http');
http.get('http://localhost:3000/__routes', (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    console.log('STATUS', res.statusCode);
    console.log('BODY', data);
  });
}).on('error', (e) => {
  console.error('ERR', e.message);
});
