-- Drop existing tables to recreate with UUID primary key
DROP TABLE IF EXISTS order_items CASCADE;
DROP TABLE IF EXISTS orders CASCADE;

-- Create orders table with UUID PK and human-readable order_number
CREATE TABLE orders (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  order_number VARCHAR(255) NOT NULL UNIQUE,
  payment_date_time TIMESTAMP WITH TIME ZONE NOT NULL,
  payment_method VARCHAR(50) NOT NULL,
  total_amount NUMERIC NOT NULL,
  total_quantity INTEGER NOT NULL,
  received_amount NUMERIC NOT NULL,
  change NUMERIC NOT NULL,
  cashier_name VARCHAR(255) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Create order_items table referencing orders(id) via UUID
CREATE TABLE order_items (
  id BIGSERIAL PRIMARY KEY,
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id VARCHAR(255) NOT NULL,
  product_name VARCHAR(255) NOT NULL,
  product_price NUMERIC NOT NULL,
  quantity INTEGER NOT NULL,
  discount NUMERIC DEFAULT 0,
  discount_qty INTEGER DEFAULT 0,
  is_percent BOOLEAN DEFAULT false,
  discount_percent NUMERIC DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;

-- Create policies for public access (allow anonymous inserts and selects)
CREATE POLICY "Allow public insert to orders" ON orders FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public select from orders" ON orders FOR SELECT USING (true);

CREATE POLICY "Allow public insert to order_items" ON order_items FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public select from order_items" ON order_items FOR SELECT USING (true);
