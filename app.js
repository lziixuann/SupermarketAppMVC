const express = require('express');
const multer = require('multer');
const path = require('path');
const SupermarketController = require('./controllers/SupermarketControllers');
const InventoryController = require('./controllers/InventoryController');
const Product = require('./models/product');
const User = require('./models/user');
const session = require('express-session');
const app = express();

// CRASH HANDLERS: Log unhandled exceptions/rejections to help diagnose unexpected exits
process.on('uncaughtException', (err) => {
    console.error('UNCAUGHT EXCEPTION', err && err.stack ? err.stack : err);
});
process.on('unhandledRejection', (reason, p) => {
    console.error('UNHANDLED REJECTION', reason);
});

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
// parse JSON bodies for AJAX checkout
app.use(express.json());
// parse JSON bodies for API endpoints (like checkout)

// Session setup
app.use(session({
    secret: process.env.SESSION_SECRET || 'devsecret',
    resave: false,
    saveUninitialized: false
}));

// Middleware: ensure user is admin
const ensureAdmin = (req, res, next) => {
    if (!req.session || !req.session.user || !req.session.user.isAdmin) {
        return res.status(403).send('Access denied. Admin privileges required.');
    }
    next();
};

// Home page
// Home page: show all products
app.get('/', (req, res) => {
    Product.getAll((err, products) => {
        if (err) {
            console.error('Error fetching products:', err);
            return res.status(500).send('Error retrieving products');
        }

        const user = req.session && req.session.user;

        // If admin, also load feedbacks for the dashboard/tab
        if (user && user.isAdmin) {
            try {
                const Feedback = require('./models/feedback');
                Feedback.getAll((ferr, feedbacks) => {
                    if (ferr) {
                        console.error('Error fetching feedbacks for admin homepage:', ferr);
                        // Render without feedbacks but keep admin UI
                        return res.render('index', { products, user, feedbacks: [] });
                    }
                    return res.render('index', { products, user, feedbacks });
                });
            } catch (e) {
                console.error('Error requiring feedback model', e);
                return res.render('index', { products, user, feedbacks: [] });
            }
        } else {
            // Non-admin users don't need feedbacks
            return res.render('index', { products, user, feedbacks: [] });
        }
    });
});

// Inventory / Admin routes
// Admin inventory list (protected). Uses InventoryController
app.get('/inventory', (req, res) => {
    return InventoryController.list(req, res);
});

// Admin alias
app.get('/admin', (req, res) => {
    return InventoryController.list(req, res);
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
    res.render('cart', { cart: [], user: req.session && req.session.user }); // No session cart
});

// Auth routes: register/login/logout
app.get('/login', (req, res) => {
    return res.render('login', { error: null, user: req.session && req.session.user });
});

app.post('/login', (req, res) => {
    const { username, password } = req.body || {};
    if (!username || !password) return res.render('login', { error: 'Missing username or password', user: null });
    User.getByUsername(username, (err, user) => {
        if (err) {
            console.error('Login DB error', err);
            return res.render('login', { error: 'Internal error', user: null });
        }
        if (!user) return res.render('login', { error: 'Invalid credentials', user: null });
        const ok = User.verifyPassword(user, password);
        if (!ok) return res.render('login', { error: 'Invalid credentials', user: null });
    // successful login - store minimal user info in session
    req.session.user = { userId: user.userId, username: user.username, isAdmin: !!user.isAdmin };
    // Redirect all users to homepage after login
    return res.redirect('/');
    });
});

app.get('/register', (req, res) => {
    return res.render('register', { error: null, user: req.session && req.session.user });
});

app.post('/register', (req, res) => {
    const { username, password } = req.body || {};
    if (!username || !password) return res.render('register', { error: 'Missing username or password', user: null });
    // All new users are non-admin
    const isAdmin = false;
    User.getByUsername(username, (err, existing) => {
        if (err) return res.render('register', { error: 'Internal error', user: null });
        if (existing) return res.render('register', { error: 'Username already exists', user: null });
        User.create({ username, password, isAdmin }, (err2) => {
            if (err2) {
                console.error('Error creating user', err2);
                return res.render('register', { error: 'Could not create user', user: null });
            }
            return res.redirect('/login');
        });
    });
});

app.get('/logout', (req, res) => {
    req.session.destroy(() => res.redirect('/'));
});

// Checkout routes
app.get('/checkout', (req, res) => {
    try {
        // Require users to be logged in before allowing access to the payment/checkout page
        const user = req.session && req.session.user;
        if (!user) {
            // Redirect guests to login and preserve intended destination
            return res.redirect('/login?next=/checkout');
        }
        res.render('checkout', { user });
    } catch (err) {
        console.error('Render /checkout error', err);
        res.status(500).send('Server error');
    }
});

app.post('/checkout', async (req, res) => {
    // In a real app you'd validate the cart server-side and process payment with a gateway
    const Order = require('./models/order');
    try {
        // Enforce authenticated users only for checkout POSTs
        const currentUser = req.session && req.session.user;
        if (!currentUser) {
            return res.status(403).json({ error: 'You must be logged in to complete checkout' });
        }
        const { cart, paymentMethod, billing } = req.body || {};
        if (!cart || !Array.isArray(cart) || cart.length === 0) {
            return res.status(400).json({ error: 'Cart is empty' });
        }

        // calculate total
        let subtotal = 0;
        cart.forEach(item => { subtotal += (Number(item.price) || 0) * (Number(item.quantity) || 0); });
        const tax = +(subtotal * 0.07).toFixed(2);
        const total = +(subtotal + tax).toFixed(2);

        // Deduct stock for each item in the cart
        for (const item of cart) {
            await new Promise((resolve, reject) => {
                Product.deductStock(item.productId, item.quantity, (err, result) => {
                    if (err) return reject(err);
                    resolve(result);
                });
            });
        }

        // Create order in database
        const userId = req.session && req.session.user ? req.session.user.userId : null;
        const orderId = await new Promise((resolve, reject) => {
            Order.create({
                userId,
                totalAmount: total,
                paymentMethod: paymentMethod || 'unknown',
                customerName: billing && billing.name ? String(billing.name) : null,
                customerEmail: billing && billing.email ? String(billing.email) : null
            }, (err, id) => {
                if (err) return reject(err);
                resolve(id);
            });
        });

        // Create order items
        await new Promise((resolve, reject) => {
            Order.createItems(orderId, cart, (err) => {
                if (err) return reject(err);
                resolve();
            });
        });

        // Generate invoice HTML file (optional). If generation fails, continue without blocking checkout.
        let invoiceUrl = null;
        try {
            const generateInvoice = require('./utils/generateInvoice');
            const invoiceFile = await generateInvoice(orderId);
            if (invoiceFile) invoiceUrl = '/invoices/' + invoiceFile;
        } catch (e) {
            console.error('Invoice generation failed', e);
        }

        // Respond with success and order info (include email for guest lookup and invoice URL)
        return res.json({ success: true, orderId, total, email: billing && billing.email ? String(billing.email) : null, invoiceUrl });
    } catch (e) {
        console.error('Checkout error', e);
        return res.status(500).json({ error: 'Internal error' });
    }
});

// Checkout success page
app.get('/checkout/success', (req, res) => {
    try {
        const { orderId, total, email } = req.query;
        if (!orderId || !total) {
            return res.status(400).send('Invalid order parameters');
        }
        res.render('checkoutSuccess', { orderId, total, email, user: req.session && req.session.user });
    } catch (err) {
        console.error('Render /checkout/success error', err);
        res.status(500).send('Server error');
    }
});

// Generate (or re-generate) invoice and send the invoice file directly
app.get('/invoice/:orderId', async (req, res) => {
    try {
        const orderId = parseInt(req.params.orderId, 10);
        if (!orderId) return res.status(400).send('Invalid order id');
        const generateInvoice = require('./utils/generateInvoice');
        const filename = await generateInvoice(orderId);
        if (!filename) return res.status(500).send('Invoice generation failed');
        const filePath = path.join(__dirname, 'public', 'invoices', filename);
        return res.sendFile(filePath);
    } catch (err) {
        console.error('Error generating invoice for order', req.params.orderId, err);
        return res.status(500).send('Could not generate invoice');
    }
});

// Order history page
app.get('/order-history', (req, res) => {
    const Order = require('./models/order');
    try {
        const user = req.session && req.session.user;
        const email = (req.query && req.query.email) ? String(req.query.email) : null;

        if (user) {
            const userId = user.userId;
            // Load orders by userId and also include any guest orders that used the same email
            Order.getByUserId(userId, (err, userOrders) => {
                if (err) {
                    console.error('Error fetching order history by userId:', err);
                    return res.status(500).send('Error retrieving order history');
                }

                // Try to merge orders by customerEmail matching username (useful if username is an email)
                const possibleEmail = user.username || null;
                if (!possibleEmail) {
                    return res.render('orderHistory', { orders: userOrders, user });
                }

                Order.getByEmail(possibleEmail, (err2, emailOrders) => {
                    if (err2) {
                        console.error('Error fetching order history by email:', err2);
                        // fallback to userOrders only
                        return res.render('orderHistory', { orders: userOrders, user });
                    }

                    // Merge orders, avoiding duplicates (by orderId)
                    const map = {};
                    (userOrders || []).forEach(o => { map[o.orderId] = o; });
                    (emailOrders || []).forEach(o => { if (!map[o.orderId]) map[o.orderId] = o; });

                    // Convert to array and sort by date desc
                    const merged = Object.values(map).sort((a,b) => new Date(b.orderDate) - new Date(a.orderDate));
                    return res.render('orderHistory', { orders: merged, user });
                });
            });
        } else if (email) {
            Order.getByEmail(email, (err, orders) => {
                if (err) {
                    console.error('Error fetching order history by email:', err);
                    return res.status(500).send('Error retrieving order history');
                }
                // Render without user session
                return res.render('orderHistory', { orders, user: null });
            });
        } else {
            // Not logged in and no email provided - show empty history page with guidance
            return res.render('orderHistory', { orders: [], user: null });
        }
    } catch (err) {
        console.error('Render /order-history error', err);
        res.status(500).send('Server error');
    }
});

// Admin: View all orders
app.get('/admin/orders', (req, res) => {
    const Order = require('./models/order');
    try {
        // Check if user is admin
        if (!req.session || !req.session.user || !req.session.user.isAdmin) {
            return res.status(403).send('Access denied. Admin privileges required.');
        }

        Order.getAll((err, orders) => {
            if (err) {
                console.error('Error fetching all orders:', err);
                return res.status(500).send('Error retrieving orders');
            }
            // Compute total revenue from all orders
            let totalRevenue = 0;
            try {
                totalRevenue = orders.reduce((sum, o) => {
                    const amt = Number(o.totalAmount || o.total || o.total_amount || 0) || 0;
                    return sum + amt;
                }, 0);
                totalRevenue = Number(totalRevenue.toFixed(2));
            } catch (e) {
                console.error('Error computing total revenue', e);
                totalRevenue = 0;
            }

            res.render('adminOrders', { orders, user: req.session.user, totalRevenue });
        });
    } catch (err) {
        console.error('Render /admin/orders error', err);
        res.status(500).send('Server error');
    }
});

// Admin: View feedback entries
app.get('/admin/feedbacks', ensureAdmin, (req, res) => {
    const Feedback = require('./models/feedback');
    try {
        Feedback.getAll((err, feedbacks) => {
            if (err) {
                console.error('Error fetching feedbacks:', err);
                return res.status(500).send('Error retrieving feedbacks');
            }
            return res.render('adminFeedbacks', { feedbacks, user: req.session.user });
        });
    } catch (err) {
        console.error('Render /admin/feedbacks error', err);
        res.status(500).send('Server error');
    }
});

// Feedback: render form (customers)
app.get('/feedback', (req, res) => {
    try {
        const user = req.session && req.session.user ? req.session.user : null;
        return res.render('feedback', { user });
    } catch (err) {
        console.error('Render /feedback error', err);
        return res.status(500).send('Server error');
    }
});

// Feedback: submit
app.post('/feedback', (req, res) => {
    try {
        const Feedback = require('./models/feedback');
        const userId = req.session && req.session.user ? req.session.user.userId : (req.body && req.body.userId ? req.body.userId : null);
        const email = req.body && req.body.email ? String(req.body.email) : null;
        const message = req.body && req.body.message ? String(req.body.message) : null;
        if (!message) return res.status(400).send('Message is required');

        Feedback.create({ userId, email, message }, (err) => {
            if (err) {
                console.error('Error saving feedback', err);
                return res.status(500).send('Could not save feedback');
            }
            return res.send('<p>Thanks for your feedback! <a href="/">Back to home</a></p>');
        });
    } catch (err) {
        console.error('POST /feedback error', err);
        return res.status(500).send('Server error');
    }
});

// Product details
app.get('/product/:id', (req, res) => {
    return SupermarketController.getById(req, res);
});

// Add product (admin only)
app.get('/addProduct', ensureAdmin, (req, res) => {
    return res.render('addProduct', { user: req.session.user });
});
app.post('/addProduct', ensureAdmin, upload.single('image'), (req, res) => {
    return SupermarketController.create(req, res);
});

// Update product (admin only)
app.get('/updateProduct/:id', ensureAdmin, (req, res) => {
    const id = req.params.id;
    Product.getById(id, (err, product) => {
        if (err) {
            console.error('Error fetching product for edit:', err);
            return res.status(500).send('Error retrieving product');
        }
        if (!product) return res.status(404).send('Product not found');
        return res.render('updateProduct', { product, user: req.session.user });
    });
});
app.post('/updateProduct/:id', ensureAdmin, upload.single('image'), (req, res) => {
    return SupermarketController.update(req, res);
});

// Delete product (admin only)
app.get('/deleteProduct/:id', ensureAdmin, (req, res) => {
    return SupermarketController.delete(req, res);
});

// Cart routes: inline or missing module. The app already defines basic cart handlers above
// so we don't require an external './routes/cart' module which doesn't exist in this repo.
// If you later add a routes/cart.js, re-enable mounting here.

const PORT = process.env.PORT || 3000;
// Debug: list registered routes (temporary)
app.get('/__routes', (req, res) => {
    try {
        const routes = [];
        app._router.stack.forEach(mw => {
            if (mw.route && mw.route.path) {
                const methods = Object.keys(mw.route.methods).join(',').toUpperCase();
                routes.push({ path: mw.route.path, methods });
            }
        });
        res.json({ routes });
    } catch (e) {
        res.status(500).json({ error: String(e) });
    }
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
