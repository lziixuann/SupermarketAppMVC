-- Migration to add customer name/email to orders and index for lookups
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS customerName VARCHAR(100) NULL,
  ADD COLUMN IF NOT EXISTS customerEmail VARCHAR(255) NULL;

CREATE INDEX IF NOT EXISTS idx_orders_customerEmail ON orders(customerEmail);
