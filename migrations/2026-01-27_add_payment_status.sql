-- Add payment status tracking fields to orders table
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS paymentStatus VARCHAR(20) NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS paymentProvider VARCHAR(50) NULL,
  ADD COLUMN IF NOT EXISTS paymentReference VARCHAR(100) NULL,
  ADD COLUMN IF NOT EXISTS paymentStatusUpdatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE INDEX IF NOT EXISTS idx_orders_paymentStatus ON orders(paymentStatus);
CREATE INDEX IF NOT EXISTS idx_orders_paymentReference ON orders(paymentReference);