export type UserRole = 'admin' | 'team' | 'supplier'

export interface Profile {
  id: string
  email: string
  full_name: string
  role: UserRole
  avatar_url: string | null
  phone: string | null
  permissions: Record<string, boolean>
  supplier_id: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface Supplier {
  id: string
  name: string
  contact_name: string | null
  email: string | null
  phone: string | null
  address: string | null
  notes: string | null
  access_token: string
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface Product {
  id: string
  shopify_product_id: string
  shopify_variant_id: string | null
  title: string
  description: string | null
  sku: string | null
  barcode: string | null
  price: number
  compare_at_price: number | null
  cost_price: number | null
  supplier_id: string | null
  category: string | null
  tags: string[]
  images: { url: string; alt: string }[]
  inventory_quantity: number
  weight: number | null
  status: string
  shopify_data: Record<string, unknown> | null
  created_at: string
  updated_at: string
  last_synced_at: string | null
}

export interface Order {
  id: string
  shopify_order_id: string
  shopify_order_number: string | null
  order_date: string
  status: string
  fulfillment_status: string | null
  payment_status: string | null
  customer_name: string | null
  customer_email: string | null
  customer_phone: string | null
  shipping_address: Record<string, unknown> | null
  billing_address: Record<string, unknown> | null
  subtotal: number | null
  shipping_cost: number
  tax: number
  discount: number
  total: number
  currency: string
  notes: string | null
  tags: string[]
  source: string | null
  tracking_number: string | null
  tracking_url: string | null
  carrier: string | null
  shipped_at: string | null
  delivered_at: string | null
  cancelled_at: string | null
  shopify_data: Record<string, unknown> | null
  created_at: string
  updated_at: string
  last_synced_at: string | null
}

export interface OrderItem {
  id: string
  order_id: string
  product_id: string | null
  shopify_line_item_id: string | null
  title: string
  variant_title: string | null
  sku: string | null
  quantity: number
  unit_price: number
  total_price: number
  cost_price: number | null
  supplier_id: string | null
  fulfillment_status: string
  internal_status: string
  image_url: string | null
  created_at: string
}

export interface ExpenseCategory {
  id: string
  name: string
  description: string | null
  is_per_order: boolean
  created_at: string
}

export interface Expense {
  id: string
  category_id: string
  order_id: string | null
  description: string
  amount: number
  currency: string
  date: string
  is_recurring: boolean
  recurrence_period: string | null
  meta_campaign_id: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface Campaign {
  id: string
  meta_campaign_id: string
  meta_adset_id: string | null
  name: string
  status: string | null
  objective: string | null
  daily_budget: number | null
  lifetime_budget: number | null
  start_date: string | null
  end_date: string | null
  created_at: string
  updated_at: string
  last_synced_at: string | null
}

export interface CampaignInsight {
  id: string
  campaign_id: string
  date: string
  impressions: number
  clicks: number
  spend: number
  cpc: number | null
  cpm: number | null
  ctr: number | null
  conversions: number
  conversion_value: number
  roas: number | null
  reach: number
  frequency: number | null
  cost_per_conversion: number | null
  raw_data: Record<string, unknown> | null
  created_at: string
}

export interface ClaritySnapshot {
  id: string
  date: string
  total_sessions: number | null
  total_users: number | null
  pages_per_session: number | null
  scroll_depth: number | null
  bounce_rate: number | null
  rage_clicks: number | null
  dead_clicks: number | null
  quick_backs: number | null
  excessive_scrolling: number | null
  top_pages: Record<string, unknown> | null
  device_breakdown: Record<string, unknown> | null
  referrer_breakdown: Record<string, unknown> | null
  raw_data: Record<string, unknown> | null
  created_at: string
}

export interface WhatsAppMessage {
  id: string
  direction: 'outbound' | 'inbound'
  phone_number: string
  message_type: string
  content: string | null
  template_name: string | null
  template_params: Record<string, unknown> | null
  status: string
  order_id: string | null
  error_message: string | null
  evolution_message_id: string | null
  sent_at: string | null
  delivered_at: string | null
  read_at: string | null
  created_at: string
}

export interface WhatsAppTemplate {
  id: string
  name: string
  category: string
  content: string
  variables: string[]
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface SyncLog {
  id: string
  source: string
  status: string
  records_processed: number
  records_created: number
  records_updated: number
  error_message: string | null
  started_at: string
  completed_at: string | null
  triggered_by: string
}

export interface OrderProfitability {
  order_id: string
  shopify_order_number: string | null
  order_date: string
  revenue: number
  product_cost: number
  shipping_cost: number
  additional_expenses: number
  profit: number
}
