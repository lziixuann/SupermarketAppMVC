-- SQL script to create order tracking tables for purchase history

-- Create orders table
CREATE TABLE IF NOT EXISTS orders (
    orderId INT AUTO_INCREMENT PRIMARY KEY,
    userId INT NULL,
    totalAmount DECIMAL(10, 2) NOT NULL,
    paymentMethod VARCHAR(50) NOT NULL,
    orderDate DATETIME NOT NULL,
    FOREIGN KEY (userId) REFERENCES users(userId) ON DELETE SET NULL
);

-- Create order_items table (stores individual products in each order)
CREATE TABLE IF NOT EXISTS order_items (
    orderItemId INT AUTO_INCREMENT PRIMARY KEY,
    orderId INT NOT NULL,
    productId INT NOT NULL,
    quantity INT NOT NULL,
    price DECIMAL(10, 2) NOT NULL,
    FOREIGN KEY (orderId) REFERENCES orders(orderId) ON DELETE CASCADE,
    FOREIGN KEY (productId) REFERENCES products(productId) ON DELETE CASCADE
);

-- Create indexes for better query performance
CREATE INDEX idx_orders_userId ON orders(userId);
CREATE INDEX idx_orders_orderDate ON orders(orderDate);
CREATE INDEX idx_order_items_orderId ON order_items(orderId);
CREATE INDEX idx_order_items_productId ON order_items(productId);

-- Display tables structure
DESCRIBE orders;
DESCRIBE order_items;
