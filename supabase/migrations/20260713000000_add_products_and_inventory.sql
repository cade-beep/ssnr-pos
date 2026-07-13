-- Migration to support Products, Inventory and Business Close reports

-- 1. Create products table
CREATE TABLE IF NOT EXISTS products (
  id VARCHAR(255) PRIMARY KEY,
  name VARCHAR(255) NOT NULL UNIQUE,
  price NUMERIC NOT NULL,
  category VARCHAR(50) NOT NULL, -- 'coffee' | 'beverage' | 'bakery' | 'food' | 'etc'
  emoji VARCHAR(50) NOT NULL,
  image_url TEXT,
  stock INTEGER DEFAULT 0 NOT NULL,
  low_stock_threshold INTEGER DEFAULT 5 NOT NULL,
  is_active BOOLEAN DEFAULT true NOT NULL,
  barcode VARCHAR(255),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Add refund columns to orders table if they don't exist
ALTER TABLE orders ADD COLUMN IF NOT EXISTS is_refunded BOOLEAN DEFAULT false NOT NULL;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS refunded_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS refunded_by VARCHAR(255);

-- 3. Create closing_reports table
CREATE TABLE IF NOT EXISTS closing_reports (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  closed_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  cashier_name VARCHAR(255) NOT NULL,
  total_sales NUMERIC NOT NULL,
  card_sales NUMERIC NOT NULL,
  transfer_sales NUMERIC NOT NULL,
  cash_sales NUMERIC DEFAULT 0 NOT NULL,
  total_quantity INTEGER NOT NULL,
  refund_count INTEGER DEFAULT 0 NOT NULL,
  refund_amount NUMERIC DEFAULT 0 NOT NULL,
  sales_count INTEGER NOT NULL,
  item_details JSONB NOT NULL, -- JSON storing details of item sales quantities
  inventory_snapshot JSONB NOT NULL -- JSON storing snapshots of current stock levels
);

-- 4. Enable RLS
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE closing_reports ENABLE ROW LEVEL SECURITY;

-- 5. Create policies for public access (allow anonymous/public operations for simplified setup)
CREATE POLICY "Allow public select from products" ON products FOR SELECT USING (true);
CREATE POLICY "Allow public all to products" ON products FOR ALL TO public USING (true) WITH CHECK (true);

CREATE POLICY "Allow public select from closing_reports" ON closing_reports FOR SELECT USING (true);
CREATE POLICY "Allow public insert to closing_reports" ON closing_reports FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow public update to orders" ON orders FOR UPDATE USING (true) WITH CHECK (true);
