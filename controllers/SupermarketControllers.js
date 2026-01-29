const Product = require('../models/product');
const ProductRating = require('../models/productRating');

// Product controller for SupermarketAppMVC
// Exports methods for: list, getById, create, update, delete
// Each method receives (req, res) and uses the Product model with callbacks

function wantsJson(req) {
  const accept = req.headers.accept || '';
  return req.xhr || accept.includes('application/json');
}

module.exports = {
  // List all products
  list: (req, res) => {
    Product.getAll((err, results) => {
      if (err) {
        console.error('Error fetching products:', err);
        return res.status(500).send('Error retrieving products');
      }
      if (wantsJson(req)) return res.json(results);
      // Choose view based on route path or default
      const path = req.path || '';
      let viewName = 'products';
      if (path === '/shopping') viewName = 'shopping';
      try {
        return res.render(viewName, { products: results, user: req.session && req.session.user });
      } catch (e) {
        return res.json(results);
      }
    });
  },

  // Get single product by ID
  getById: (req, res) => {
    const id = req.params.id;
    Product.getById(id, (err, product) => {
      if (err) {
        console.error('Error fetching product:', err);
        return res.status(500).send('Error retrieving product');
      }
      if (!product) return res.status(404).send('Product not found');
      if (wantsJson(req)) return res.json(product);
      const user = req.session && req.session.user;
      ProductRating.getStats(id, (statsErr, stats) => {
        if (statsErr) console.error('Error loading rating stats:', statsErr);
        const ratingStats = stats || { avgRating: 0, ratingCount: 0 };

        if (user && user.userId) {
          ProductRating.getUserRating(id, user.userId, (userErr, userRating) => {
            if (userErr) console.error('Error loading user rating:', userErr);
            try {
              return res.render('product', {
                product,
                user,
                ratingStats,
                userRating: userRating || null,
                query: req.query || {}
              });
            } catch (e) {
              return res.json(product);
            }
          });
          return;
        }

        try {
          return res.render('product', {
            product,
            user,
            ratingStats,
            userRating: null,
            query: req.query || {}
          });
        } catch (e) {
          return res.json(product);
        }
      });
    });
  },

  // Create a new product
  // expects fields in req.body: productName, quantity, price
  // optional file upload: req.file (multer)
  create: (req, res) => {
    // Convert form values to appropriate types
    const productName = req.body.productName;
    const quantity = parseInt(req.body.quantity, 10);
    const price = parseFloat(req.body.price);
    const image = req.file ? req.file.filename : (req.body && req.body.currentImage) || null;

    // Validate the data
    if (!productName || isNaN(quantity) || isNaN(price)) {
      return res.status(400).send('Invalid product data. Please check all fields.');
    }

    Product.create({ productName, quantity, price, image }, (err, result) => {
      if (err) {
        console.error('Error creating product:', err);
        return res.status(500).send('Error creating product');
      }
      // Redirect to list page for HTML clients, return JSON for API clients
      if (wantsJson(req)) return res.status(201).json({ id: result.insertId });
      return res.redirect('/');
    });
  },

  // Update existing product by ID
  // expects params.id and fields in req.body
  update: (req, res) => {
    const id = req.params.id;
    // Convert form values to appropriate types
    const productName = req.body.productName;
    const quantity = parseInt(req.body.quantity, 10);
    const price = parseFloat(req.body.price);
    const image = req.file ? req.file.filename : (req.body && req.body.currentImage) || null;

    // Validate the data
    if (!productName || isNaN(quantity) || isNaN(price)) {
      return res.status(400).send('Invalid product data. Please check all fields.');
    }

    Product.update(id, { productName, quantity, price, image }, (err, result) => {
      if (err) {
        console.error('Error updating product:', err);
        return res.status(500).send('Error updating product');
      }
      if (wantsJson(req)) return res.json({ affectedRows: result.affectedRows });
      return res.redirect('/');
    });
  },

  // Delete a product by ID
  delete: (req, res) => {
    const id = req.params.id;
    Product.delete(id, (err, result) => {
      if (err) {
        console.error('Error deleting product:', err);
        return res.status(500).send('Error deleting product');
      }
      if (wantsJson(req)) return res.json({ affectedRows: result.affectedRows });
      return res.redirect('/');
    });
  }
};

