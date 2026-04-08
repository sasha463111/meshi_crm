-- Suppliers
CREATE TABLE public.suppliers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  contact_name TEXT,
  email TEXT,
  phone TEXT,
  address TEXT,
  notes TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Profiles (extends auth.users)
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'team', 'supplier')),
  avatar_url TEXT,
  phone TEXT,
  permissions JSONB DEFAULT '{}',
  supplier_id UUID REFERENCES public.suppliers(id),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Products
CREATE TABLE public.products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shopify_product_id TEXT UNIQUE NOT NULL,
  shopify_variant_id TEXT,
  title TEXT NOT NULL,
  description TEXT,
  sku TEXT,
  barcode TEXT,
  price DECIMAL(10,2) NOT NULL,
  compare_at_price DECIMAL(10,2),
  cost_price DECIMAL(10,2),
  supplier_id UUID REFERENCES public.suppliers(id),
  category TEXT,
  tags TEXT[] DEFAULT '{}',
  images JSONB DEFAULT '[]',
  inventory_quantity INTEGER DEFAULT 0,
  weight DECIMAL(6,2),
  status TEXT DEFAULT 'active',
  shopify_data JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  last_synced_at TIMESTAMPTZ
);

-- Orders
CREATE TABLE public.orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shopify_order_id TEXT UNIQUE NOT NULL,
  shopify_order_number TEXT,
  order_date TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  fulfillment_status TEXT,
  payment_status TEXT,
  customer_name TEXT,
  customer_email TEXT,
  customer_phone TEXT,
  shipping_address JSONB,
  billing_address JSONB,
  subtotal DECIMAL(10,2),
  shipping_cost DECIMAL(10,2) DEFAULT 0,
  tax DECIMAL(10,2) DEFAULT 0,
  discount DECIMAL(10,2) DEFAULT 0,
  total DECIMAL(10,2) NOT NULL,
  currency TEXT DEFAULT 'ILS',
  notes TEXT,
  tags TEXT[] DEFAULT '{}',
  source TEXT,
  tracking_number TEXT,
  tracking_url TEXT,
  carrier TEXT,
  shipped_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  shopify_data JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  last_synced_at TIMESTAMPTZ
);

-- Order Items
CREATE TABLE public.order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  product_id UUID REFERENCES public.products(id),
  shopify_line_item_id TEXT,
  title TEXT NOT NULL,
  variant_title TEXT,
  sku TEXT,
  quantity INTEGER NOT NULL,
  unit_price DECIMAL(10,2) NOT NULL,
  total_price DECIMAL(10,2) NOT NULL,
  cost_price DECIMAL(10,2),
  supplier_id UUID REFERENCES public.suppliers(id),
  fulfillment_status TEXT DEFAULT 'unfulfilled',
  image_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Expense Categories
CREATE TABLE public.expense_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  is_per_order BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Expenses
CREATE TABLE public.expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id UUID NOT NULL REFERENCES public.expense_categories(id),
  order_id UUID REFERENCES public.orders(id),
  description TEXT NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  currency TEXT DEFAULT 'ILS',
  date DATE NOT NULL,
  is_recurring BOOLEAN DEFAULT false,
  recurrence_period TEXT,
  meta_campaign_id TEXT,
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Default Costs
CREATE TABLE public.default_costs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('fixed', 'percentage')),
  value DECIMAL(10,2) NOT NULL,
  applies_to TEXT DEFAULT 'all_orders',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Campaigns
CREATE TABLE public.campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meta_campaign_id TEXT UNIQUE NOT NULL,
  meta_adset_id TEXT,
  name TEXT NOT NULL,
  status TEXT,
  objective TEXT,
  daily_budget DECIMAL(10,2),
  lifetime_budget DECIMAL(10,2),
  start_date DATE,
  end_date DATE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  last_synced_at TIMESTAMPTZ
);

-- Campaign Insights
CREATE TABLE public.campaign_insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  impressions INTEGER DEFAULT 0,
  clicks INTEGER DEFAULT 0,
  spend DECIMAL(10,2) DEFAULT 0,
  cpc DECIMAL(10,4),
  cpm DECIMAL(10,4),
  ctr DECIMAL(6,4),
  conversions INTEGER DEFAULT 0,
  conversion_value DECIMAL(10,2) DEFAULT 0,
  roas DECIMAL(10,4),
  reach INTEGER DEFAULT 0,
  frequency DECIMAL(6,2),
  cost_per_conversion DECIMAL(10,2),
  raw_data JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(campaign_id, date)
);

-- Clarity Snapshots
CREATE TABLE public.clarity_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE NOT NULL UNIQUE,
  total_sessions INTEGER,
  total_users INTEGER,
  pages_per_session DECIMAL(6,2),
  scroll_depth DECIMAL(5,2),
  bounce_rate DECIMAL(5,2),
  rage_clicks INTEGER,
  dead_clicks INTEGER,
  quick_backs INTEGER,
  excessive_scrolling INTEGER,
  top_pages JSONB,
  device_breakdown JSONB,
  referrer_breakdown JSONB,
  raw_data JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- WhatsApp Messages
CREATE TABLE public.whatsapp_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  direction TEXT NOT NULL CHECK (direction IN ('outbound', 'inbound')),
  phone_number TEXT NOT NULL,
  message_type TEXT NOT NULL,
  content TEXT,
  template_name TEXT,
  template_params JSONB,
  status TEXT DEFAULT 'pending',
  order_id UUID REFERENCES public.orders(id),
  error_message TEXT,
  evolution_message_id TEXT,
  sent_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- WhatsApp Templates
CREATE TABLE public.whatsapp_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  category TEXT NOT NULL,
  content TEXT NOT NULL,
  variables TEXT[] DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Sync Logs
CREATE TABLE public.sync_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'running',
  records_processed INTEGER DEFAULT 0,
  records_created INTEGER DEFAULT 0,
  records_updated INTEGER DEFAULT 0,
  error_message TEXT,
  started_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ,
  triggered_by TEXT DEFAULT 'cron'
);

-- App Settings
CREATE TABLE public.app_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT UNIQUE NOT NULL,
  value TEXT,
  is_secret BOOLEAN DEFAULT false,
  description TEXT,
  updated_by UUID REFERENCES public.profiles(id),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Profitability View
CREATE OR REPLACE VIEW public.order_profitability AS
SELECT
  o.id AS order_id,
  o.shopify_order_number,
  o.order_date,
  o.total AS revenue,
  COALESCE(SUM(oi.cost_price * oi.quantity), 0) AS product_cost,
  COALESCE(o.shipping_cost, 0) AS shipping_cost,
  COALESCE(
    (SELECT SUM(e.amount) FROM public.expenses e WHERE e.order_id = o.id), 0
  ) AS additional_expenses,
  o.total
    - COALESCE(SUM(oi.cost_price * oi.quantity), 0)
    - COALESCE(o.shipping_cost, 0)
    - COALESCE(
        (SELECT SUM(e.amount) FROM public.expenses e WHERE e.order_id = o.id), 0
      ) AS profit
FROM public.orders o
LEFT JOIN public.order_items oi ON oi.order_id = o.id
GROUP BY o.id;

-- RLS Policies
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expense_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.default_costs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_insights ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clarity_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sync_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

-- Admin/Team can see everything
CREATE POLICY "admin_team_all" ON public.profiles FOR ALL
  USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'team'))
  );

CREATE POLICY "own_profile" ON public.profiles FOR SELECT
  USING (id = auth.uid());

-- Suppliers can only see their own orders
CREATE POLICY "supplier_orders" ON public.orders FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'team'))
    OR
    EXISTS (
      SELECT 1 FROM public.order_items oi
      JOIN public.profiles p ON p.id = auth.uid()
      WHERE oi.order_id = orders.id AND oi.supplier_id = p.supplier_id
    )
  );

-- Admin/Team full access policies for other tables
CREATE POLICY "admin_team_products" ON public.products FOR ALL
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'team')));

CREATE POLICY "admin_team_order_items" ON public.order_items FOR ALL
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'team')));

CREATE POLICY "supplier_order_items" ON public.order_items FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'supplier' AND p.supplier_id = order_items.supplier_id
    )
  );

CREATE POLICY "admin_team_suppliers" ON public.suppliers FOR ALL
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'team')));

CREATE POLICY "admin_team_expenses" ON public.expenses FOR ALL
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'team')));

CREATE POLICY "admin_team_expense_categories" ON public.expense_categories FOR ALL
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'team')));

CREATE POLICY "admin_team_default_costs" ON public.default_costs FOR ALL
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'team')));

CREATE POLICY "admin_team_campaigns" ON public.campaigns FOR ALL
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'team')));

CREATE POLICY "admin_team_campaign_insights" ON public.campaign_insights FOR ALL
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'team')));

CREATE POLICY "admin_team_clarity" ON public.clarity_snapshots FOR ALL
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'team')));

CREATE POLICY "admin_team_whatsapp_messages" ON public.whatsapp_messages FOR ALL
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'team')));

CREATE POLICY "admin_team_whatsapp_templates" ON public.whatsapp_templates FOR ALL
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'team')));

CREATE POLICY "admin_team_sync_logs" ON public.sync_logs FOR ALL
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'team')));

CREATE POLICY "admin_settings" ON public.app_settings FOR ALL
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    COALESCE(NEW.raw_user_meta_data->>'role', 'team')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Seed default expense categories
INSERT INTO public.expense_categories (name, description, is_per_order) VALUES
  ('עלות מוצר', 'עלות רכישת המוצר מהספק', true),
  ('משלוח', 'עלות משלוח ללקוח', true),
  ('אריזה', 'עלות חומרי אריזה', true),
  ('קמפיינים', 'עלויות פרסום Meta Ads', false),
  ('תפעול', 'עלויות תפעוליות כלליות', false),
  ('מנוי Shopify', 'דמי מנוי חודשי', false),
  ('עמלת סליקה', 'עמלת עיבוד תשלומים', true);
