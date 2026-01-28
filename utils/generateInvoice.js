const fs = require('fs');
const path = require('path');
const Order = require('../models/order');

module.exports = async function generateInvoice(orderId) {
  return new Promise((resolve, reject) => {
    Order.getById(orderId, (err, order) => {
      if (err) return reject(err);
      if (!order) return reject(new Error('Order not found'));

      const invoicesDir = path.join(__dirname, '..', 'public', 'invoices');
      try {
        fs.mkdirSync(invoicesDir, { recursive: true });
      } catch (e) {
        // ignore
      }

      const filename = `invoice_${orderId}_${Date.now()}.html`;
      const filePath = path.join(invoicesDir, filename);

      // Build a simple invoice HTML
      const itemsHtml = (order.items || []).map(i => `
        <tr>
          <td style="padding:8px;border:1px solid #ddd">${i.productName || 'Item'}</td>
          <td style="padding:8px;border:1px solid #ddd;text-align:center">${i.quantity}</td>
          <td style="padding:8px;border:1px solid #ddd;text-align:right">$${(Number(i.price)||0).toFixed(2)}</td>
          <td style="padding:8px;border:1px solid #ddd;text-align:right">$${((Number(i.price)||0)*(Number(i.quantity)||0)).toFixed(2)}</td>
        </tr>
      `).join('') || '<tr><td colspan="4">No items</td></tr>';

      const total = Number(order.totalAmount || 0).toFixed(2);
      const date = new Date(order.orderDate || Date.now()).toLocaleString();

      const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>Invoice #${orderId}</title>
  <style>
    body{font-family:Arial,Helvetica,sans-serif;color:#333}
    .container{max-width:800px;margin:24px auto;padding:20px;border:1px solid #eee}
    h1{color:#2d6b35}
    table{width:100%;border-collapse:collapse;margin-top:12px}
    th{background:#f7f7f7;padding:10px;border:1px solid #ddd;text-align:left}
  </style>
</head>
<body>
  <div class="container">
    <h1>Cold Container</h1>
    <p>Invoice #: <strong>${orderId}</strong><br>
    Date: <strong>${date}</strong><br>
    ${order.userId ? `User ID: ${order.userId}` : ''}
    </p>
    <h3>Customer</h3>
    <p style="margin:0;font-weight:600">${order.customerName ? escapeHtml(order.customerName) : (order.customerEmail || 'Guest')}</p>
    ${order.customerEmail ? `<p style="margin:4px 0 0 0;color:#666;font-size:0.9rem">Email: ${escapeHtml(order.customerEmail)}</p>` : ''}

    <table>
      <thead>
        <tr>
          <th style="padding:8px;border:1px solid #ddd">Item</th>
          <th style="padding:8px;border:1px solid #ddd">Qty</th>
          <th style="padding:8px;border:1px solid #ddd;text-align:right">Unit</th>
          <th style="padding:8px;border:1px solid #ddd;text-align:right">Line Total</th>
        </tr>
      </thead>
      <tbody>
        ${itemsHtml}
      </tbody>
      <tfoot>
        <tr>
          <td colspan="3" style="padding:8px;border:1px solid #ddd;text-align:right"><strong>Total</strong></td>
          <td style="padding:8px;border:1px solid #ddd;text-align:right"><strong>$${total}</strong></td>
        </tr>
      </tfoot>
    </table>

    <p style="margin-top:18px;color:#2d6b35;font-size:1rem">${order.customerName ? `Thank you, ${escapeHtml(order.customerName)}!` : 'Thank you for shopping with Cold Container.'}</p>
  </div>
</body>
</html>`;

      // Basic HTML escaping helper
      function escapeHtml(str){ return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

      fs.writeFile(filePath, html, 'utf8', (werr) => {
        if (werr) return reject(werr);
        return resolve(filename);
      });
    });
  });
};
