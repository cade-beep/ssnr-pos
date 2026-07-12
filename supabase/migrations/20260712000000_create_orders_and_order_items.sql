-- Create orders table
CREATE TABLE IF NOT EXISTS orders (
  id VARCHAR(255) PRIMARY KEY,
  payment_date_time TIMESTAMP WITH TIME ZONE NOT NULL,
  payment_method VARCHAR(50) NOT NULL,
  total_amount NUMERIC NOT NULL,
  total_quantity INTEGER NOT NULL,
  received_amount NUMERIC NOT NULL,
  change NUMERIC NOT NULL,
  cashier_name VARCHAR(255) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Create order_items table
CREATE TABLE IF NOT EXISTS order_items (
  id BIGSERIAL PRIMARY KEY,
  order_id VARCHAR(255) NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
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
