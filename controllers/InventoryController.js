const Product = require('../models/product');

// Inventory controller provides admin/inventory specific actions
// Methods: list, lowStock, restock, adjustQuantity, getById, create, update, delete
function wantsJson(req) {
  const accept = req.headers.accept || '';
  return req.xhr || accept.includes('application/json');
}

module.exports = {
  // List all products for inventory view
  list: (req, res) => {
    Product.getAll((err, results) => {
      if (err) {
        console.error('Inventory.list error:', err);
        return res.status(500).send('Error retrieving inventory');
      }
      if (wantsJson(req)) return res.json(results);
      return res.render('inventory', { products: results, user: req.session && req.session.user });
    });
  },

  // Get products below a threshold (low stock)
  // Query param: ?threshold=5
  lowStock: (req, res) => {
    const threshold = parseInt(req.query.threshold || '5', 10);
    Product.getAll((err, results) => {
      if (err) {
        console.error('Inventory.lowStock error:', err);
        return res.status(500).send('Error retrieving inventory');
      }
      const low = (results || []).filter(p => Number(p.quantity) < threshold);
      if (wantsJson(req)) return res.json(low);
      return res.render('inventory', { products: low, lowStockOnly: true, threshold, user: req.session && req.session.user });
    });
  },

  // Restock: increase quantity by an amount
  // POST body: { amount: number }
  restock: (req, res) => {
    const id = req.params.id;
    const amount = parseInt(req.body.amount, 10);
    if (isNaN(amount) || amount <= 0) return res.status(400).send('Invalid restock amount');

    Product.getById(id, (err, product) => {
      if (err) {
        console.error('Inventory.restock getById error:', err);
        return res.status(500).send('Error retrieving product');
      }
      if (!product) return res.status(404).send('Product not found');

      const newQty = Number(product.quantity) + amount;
      const data = { productName: product.productName, quantity: newQty, price: product.price, image: product.image };
      Product.update(id, data, (err2, result) => {
        if (err2) {
          console.error('Inventory.restock update error:', err2);
          return res.status(500).send('Error updating product quantity');
        }
        if (wantsJson(req)) return res.json({ affectedRows: result.affectedRows, newQuantity: newQty });
        return res.redirect('/inventory');
      });
    });
  },

  // Set absolute quantity for a product
  // POST body: { quantity: number }
  adjustQuantity: (req, res) => {
    const id = req.params.id;
    const quantity = parseInt(req.body.quantity, 10);
    if (isNaN(quantity) || quantity < 0) return res.status(400).send('Invalid quantity');

    Product.getById(id, (err, product) => {
      if (err) {
        console.error('Inventory.adjustQuantity getById error:', err);
        return res.status(500).send('Error retrieving product');
      }
      if (!product) return res.status(404).send('Product not found');

      const data = { productName: product.productName, quantity, price: product.price, image: product.image };
      Product.update(id, data, (err2, result) => {
        if (err2) {
          console.error('Inventory.adjustQuantity update error:', err2);
          return res.status(500).send('Error updating product quantity');
        }
        if (wantsJson(req)) return res.json({ affectedRows: result.affectedRows, newQuantity: quantity });
        return res.redirect('/inventory');
      });
    });
  },

  // Get single product by ID
  getById: (req, res) => {
    const id = req.params.id;
    Product.getById(id, (err, product) => {
      if (err) {
        console.error('Inventory.getById error:', err);
        return res.status(500).send('Error retrieving product');
      }
      if (!product) return res.status(404).send('Product not found');
      if (wantsJson(req)) return res.json(product);
      return res.render('product', { product, user: req.session && req.session.user });
    });
  },

  // Create a new product (same as Product controller create)
  create: (req, res) => {
    const productName = req.body.productName;
    const quantity = parseInt(req.body.quantity, 10);
    const price = parseFloat(req.body.price);
    const image = req.file ? req.file.filename : (req.body && req.body.currentImage) || null;

    if (!productName || isNaN(quantity) || isNaN(price)) {
      return res.status(400).send('Invalid product data.');
    }

    Product.create({ productName, quantity, price, image }, (err, result) => {
      if (err) {
        console.error('Inventory.create error:', err);
        return res.status(500).send('Error creating product');
      }
      if (wantsJson(req)) return res.status(201).json({ id: result.insertId });
      return res.redirect('/inventory');
    });
  },

  // Update product (admin)
  update: (req, res) => {
    const id = req.params.id;
    const productName = req.body.productName;
    const quantity = parseInt(req.body.quantity, 10);
    const price = parseFloat(req.body.price);
    const image = req.file ? req.file.filename : (req.body && req.body.currentImage) || null;

    if (!productName || isNaN(quantity) || isNaN(price)) {
      return res.status(400).send('Invalid product data.');
    }

    Product.update(id, { productName, quantity, price, image }, (err, result) => {
      if (err) {
        console.error('Inventory.update error:', err);
        return res.status(500).send('Error updating product');
      }
      if (wantsJson(req)) return res.json({ affectedRows: result.affectedRows });
      return res.redirect('/inventory');
    });
  },

  // Delete a product by ID
  delete: (req, res) => {
    const id = req.params.id;
    Product.delete(id, (err, result) => {
      if (err) {
        console.error('Inventory.delete error:', err);
        return res.status(500).send('Error deleting product');
      }
      if (wantsJson(req)) return res.json({ affectedRows: result.affectedRows });
      return res.redirect('/inventory');
    });
  }
};
