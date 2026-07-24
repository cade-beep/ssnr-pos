CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.orders (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  order_number VARCHAR(255) NOT NULL UNIQUE,
  payment_date_time TIMESTAMP WITH TIME ZONE NOT NULL,
  payment_method VARCHAR(50) NOT NULL,
  total_amount NUMERIC NOT NULL,
  total_quantity INTEGER NOT NULL,
  received_amount NUMERIC NOT NULL,
  change NUMERIC NOT NULL,
  cashier_name VARCHAR(255) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  is_refunded BOOLEAN DEFAULT false NOT NULL,
  refunded_at TIMESTAMP WITH TIME ZONE,
  refunded_by VARCHAR(255),
  store_id VARCHAR(255) NOT NULL DEFAULT 'ssnr-pos-9877',
  subtotal NUMERIC DEFAULT 0 NOT NULL,
  item_discount_amount NUMERIC DEFAULT 0 NOT NULL,
  cart_discount_percent NUMERIC DEFAULT 0 NOT NULL,
  cart_discount_amount NUMERIC DEFAULT 0 NOT NULL,
  total_discount NUMERIC DEFAULT 0 NOT NULL,
  final_total NUMERIC DEFAULT 0 NOT NULL
);

CREATE TABLE IF NOT EXISTS public.products (
  id VARCHAR(255) PRIMARY KEY,
  name VARCHAR(255) NOT NULL UNIQUE,
  price NUMERIC NOT NULL CHECK (price >= 0),
  category VARCHAR(50) NOT NULL,
  emoji VARCHAR(50) NOT NULL DEFAULT '🍞',
  image_url TEXT,
  stock INTEGER DEFAULT 0 NOT NULL CHECK (stock >= 0),
  low_stock_threshold INTEGER DEFAULT 5 NOT NULL CHECK (low_stock_threshold >= 0),
  is_active BOOLEAN DEFAULT true NOT NULL,
  barcode VARCHAR(255),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  store_id VARCHAR(255) NOT NULL DEFAULT 'ssnr-pos-9877'
);

CREATE UNIQUE INDEX IF NOT EXISTS products_barcode_unique_idx
  ON public.products (barcode)
  WHERE barcode IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.user_roles (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role VARCHAR(50) NOT NULL DEFAULT 'Staff' CHECK (role IN ('Owner', 'Manager', 'Staff')),
  store_id VARCHAR(255) NOT NULL DEFAULT 'ssnr-pos-9877'
);

ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS store_id VARCHAR(255) NOT NULL DEFAULT 'ssnr-pos-9877';
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS subtotal NUMERIC DEFAULT 0 NOT NULL;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS item_discount_amount NUMERIC DEFAULT 0 NOT NULL;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS cart_discount_percent NUMERIC DEFAULT 0 NOT NULL;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS cart_discount_amount NUMERIC DEFAULT 0 NOT NULL;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS total_discount NUMERIC DEFAULT 0 NOT NULL;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS final_total NUMERIC DEFAULT 0 NOT NULL;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS store_id VARCHAR(255) NOT NULL DEFAULT 'ssnr-pos-9877';
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS stock INTEGER DEFAULT 0 NOT NULL;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS low_stock_threshold INTEGER DEFAULT 5 NOT NULL;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true NOT NULL;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS barcode VARCHAR(255);
ALTER TABLE public.user_roles ADD COLUMN IF NOT EXISTS store_id VARCHAR(255) NOT NULL DEFAULT 'ssnr-pos-9877';

CREATE OR REPLACE FUNCTION public.get_user_role(p_user_id UUID)
RETURNS VARCHAR(50)
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT COALESCE((SELECT role FROM public.user_roles WHERE user_id = p_user_id), 'Staff');
$$;

CREATE OR REPLACE FUNCTION public.get_user_store_id()
RETURNS VARCHAR(255)
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT COALESCE((SELECT store_id FROM public.user_roles WHERE user_id = auth.uid()), 'ssnr-pos-9877');
$$;

ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS products_compat_select ON public.products;
CREATE POLICY products_compat_select ON public.products
  FOR SELECT TO authenticated
  USING (store_id = COALESCE(public.get_user_store_id(), 'ssnr-pos-9877'));

DROP POLICY IF EXISTS products_compat_owner_write ON public.products;
CREATE POLICY products_compat_owner_write ON public.products
  FOR ALL TO authenticated
  USING (public.get_user_role(auth.uid()) IN ('Owner', 'Manager'))
  WITH CHECK (store_id = COALESCE(public.get_user_store_id(), 'ssnr-pos-9877'));

DROP POLICY IF EXISTS orders_compat_select ON public.orders;
CREATE POLICY orders_compat_select ON public.orders
  FOR SELECT TO authenticated
  USING (store_id = COALESCE(public.get_user_store_id(), 'ssnr-pos-9877'));

DROP POLICY IF EXISTS user_roles_compat_select ON public.user_roles;
CREATE POLICY user_roles_compat_select ON public.user_roles
  FOR SELECT TO authenticated
  USING (store_id = COALESCE(public.get_user_store_id(), 'ssnr-pos-9877'));

-- PostgREST keeps a schema cache. Reload it after restoring the relations.
NOTIFY pgrst, 'reload schema';
