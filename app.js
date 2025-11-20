const express = require('express');
const multer = require('multer');
const path = require('path');
const SupermarketController = require('./controllers/SupermarketControllers');
const Product = require('./models/product');
const app = express();

// Set up multer for file uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, path.join(__dirname, 'public', 'images'));
    },
    filename: (req, file, cb) => {
        cb(null, file.originalname);
    }
});
const upload = multer({ storage: storage });

// Set up view engine
app.set('view engine', 'ejs');
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: false }));

// Home page
// Home page: show all products
app.get('/', (req, res) => {
    Product.getAll((err, products) => {
        if (err) {
            console.error('Error fetching products:', err);
            return res.status(500).send('Error retrieving products');
        }
        res.render('index', { products });
    });
});

// Redirect old inventory route to home
app.get('/inventory', (req, res) => {
    res.redirect('/');
});

// Shopping (user view, now public)
app.get('/shopping', (req, res) => {
    return SupermarketController.list(req, res);
});

// Add to cart (cart is sessionless, so this is a placeholder)
app.post('/add-to-cart/:id', (req, res) => {
    // You may want to implement a cart using cookies or local storage on the client side
    res.send('Cart functionality is now public and sessionless. Implement as needed.');
});

// Cart page (sessionless)
app.get('/cart', (req, res) => {
    res.render('cart', { cart: [] }); // No session cart
});

// Product details
app.get('/product/:id', (req, res) => {
    return SupermarketController.getById(req, res);
});

// Add product (public)
app.get('/addProduct', (req, res) => {
    res.render('addProduct');
});
app.post('/addProduct', upload.single('image'), (req, res) => {
    return SupermarketController.create(req, res);
});

// Update product (public)
app.get('/updateProduct/:id', (req, res) => {
    const id = req.params.id;
    Product.getById(id, (err, product) => {
        if (err) {
            console.error('Error fetching product for edit:', err);
            return res.status(500).send('Error retrieving product');
        }
        if (!product) return res.status(404).send('Product not found');
        return res.render('updateProduct', { product });
    });
});
app.post('/updateProduct/:id', upload.single('image'), (req, res) => {
    return SupermarketController.update(req, res);
});

// Delete product (public)
app.get('/deleteProduct/:id', (req, res) => {
    return SupermarketController.delete(req, res);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
