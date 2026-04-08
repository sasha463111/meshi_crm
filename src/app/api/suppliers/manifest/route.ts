import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET(request: NextRequest) {
  const orderId = request.nextUrl.searchParams.get('orderId')
  if (!orderId) {
    return NextResponse.json({ error: 'Missing orderId' }, { status: 400 })
  }

  const supabase = createAdminClient()

  const { data: order } = await supabase
    .from('orders')
    .select('*')
    .eq('id', orderId)
    .single()

  const { data: items } = await supabase
    .from('order_items')
    .select('*')
    .eq('order_id', orderId)

  if (!order) {
    return NextResponse.json({ error: 'Order not found' }, { status: 404 })
  }

  // Also get product images from products table for items that have product_id
  const productIds = (items || []).map(i => i.product_id).filter(Boolean)
  let productImages: Record<string, string> = {}

  if (productIds.length > 0) {
    const { data: products } = await supabase
      .from('products')
      .select('id, images')
      .in('id', productIds)

    products?.forEach(p => {
      const imgs = p.images as { url: string; alt: string }[] | null
      if (imgs?.[0]?.url) {
        productImages[p.id] = imgs[0].url
      }
    })
  }

  const address = order.shipping_address as Record<string, string> | null

  const html = `
<!DOCTYPE html>
<html dir="rtl" lang="he">
<head>
  <meta charset="UTF-8">
  <title>תעודת משלוח - ${order.shopify_order_number}</title>
  <style>
    body { font-family: Arial, sans-serif; padding: 40px; direction: rtl; color: #333; }
    h1 { text-align: center; margin-bottom: 5px; font-size: 28px; }
    h2 { text-align: center; color: #888; font-weight: normal; margin-bottom: 30px; font-size: 16px; }
    .info { display: flex; justify-content: space-between; margin-bottom: 25px; gap: 20px; }
    .info-box { border: 1px solid #ddd; padding: 15px; border-radius: 8px; flex: 1; }
    .info-box h3 { margin-top: 0; font-size: 14px; color: #555; border-bottom: 1px solid #eee; padding-bottom: 8px; }
    .info-box p { margin: 5px 0; font-size: 14px; }
    .items { margin-top: 20px; }
    .item { display: flex; align-items: center; border: 1px solid #e0e0e0; border-radius: 8px; padding: 12px; margin-bottom: 10px; gap: 15px; page-break-inside: avoid; }
    .item-img { width: 90px; height: 90px; border-radius: 6px; object-fit: cover; border: 1px solid #eee; flex-shrink: 0; }
    .item-img-placeholder { width: 90px; height: 90px; border-radius: 6px; background: #f5f5f5; display: flex; align-items: center; justify-content: center; color: #ccc; font-size: 12px; flex-shrink: 0; border: 1px solid #eee; }
    .item-details { flex: 1; }
    .item-title { font-weight: bold; font-size: 15px; margin-bottom: 4px; }
    .item-variant { color: #666; font-size: 13px; }
    .item-sku { color: #999; font-size: 12px; direction: ltr; text-align: right; }
    .item-meta { display: flex; gap: 20px; margin-top: 6px; font-size: 13px; }
    .item-meta span { background: #f5f5f5; padding: 3px 10px; border-radius: 4px; }
    .item-price { text-align: left; flex-shrink: 0; min-width: 80px; }
    .item-price .total { font-weight: bold; font-size: 16px; }
    .item-price .unit { color: #999; font-size: 12px; }
    .summary { margin-top: 20px; text-align: left; border-top: 2px solid #333; padding-top: 10px; }
    .summary .row { display: flex; justify-content: space-between; padding: 4px 0; font-size: 14px; }
    .summary .total-row { font-weight: bold; font-size: 18px; border-top: 1px solid #ddd; padding-top: 8px; margin-top: 4px; }
    .footer { margin-top: 50px; text-align: center; color: #aaa; font-size: 12px; border-top: 1px solid #eee; padding-top: 15px; }
    @media print {
      body { padding: 15px; }
      .item { break-inside: avoid; }
    }
  </style>
</head>
<body>
  <h1>תעודת משלוח</h1>
  <h2>הזמנה מספר ${order.shopify_order_number} | ${new Date(order.order_date).toLocaleDateString('he-IL')}</h2>

  <div class="info">
    <div class="info-box">
      <h3>פרטי הלקוח</h3>
      <p><strong>${order.customer_name || ''}</strong></p>
      ${address ? `
        <p>${address.address1 || ''}</p>
        <p>${address.city || ''} ${address.zip || ''}</p>
        ${address.phone ? `<p dir="ltr" style="text-align:right">${address.phone}</p>` : ''}
      ` : ''}
    </div>
    <div class="info-box">
      <h3>פרטי משלוח</h3>
      <p>תאריך הדפסה: ${new Date().toLocaleDateString('he-IL')}</p>
      ${order.tracking_number ? `<p>מספר מעקב: <strong>${order.tracking_number}</strong></p>` : ''}
      ${order.carrier ? `<p>חברת שילוח: ${order.carrier}</p>` : ''}
      <p>סטטוס: ${order.fulfillment_status || 'ממתין'}</p>
    </div>
  </div>

  <div class="items">
    <h3 style="font-size:16px; margin-bottom:12px;">פריטים (${(items || []).reduce((sum, i) => sum + i.quantity, 0)} יחידות)</h3>
    ${(items || []).map(item => {
      const imgUrl = item.image_url || (item.product_id ? productImages[item.product_id] : null)
      return `
      <div class="item">
        ${imgUrl
          ? `<img class="item-img" src="${imgUrl}" alt="${item.title}" crossorigin="anonymous" />`
          : `<div class="item-img-placeholder">אין תמונה</div>`
        }
        <div class="item-details">
          <div class="item-title">${item.title}</div>
          ${item.variant_title ? `<div class="item-variant">${item.variant_title}</div>` : ''}
          ${item.sku ? `<div class="item-sku">SKU: ${item.sku}</div>` : ''}
          <div class="item-meta">
            <span>כמות: <strong>${item.quantity}</strong></span>
          </div>
        </div>
        <div class="item-price">
          <div class="total">₪${Number(item.total_price).toFixed(2)}</div>
          <div class="unit">${item.quantity} × ₪${Number(item.unit_price).toFixed(2)}</div>
        </div>
      </div>`
    }).join('')}
  </div>

  <div class="summary">
    <div class="row">
      <span>סכום ביניים</span>
      <span>₪${Number(order.subtotal || order.total).toFixed(2)}</span>
    </div>
    ${Number(order.shipping_cost) > 0 ? `
    <div class="row">
      <span>משלוח</span>
      <span>₪${Number(order.shipping_cost).toFixed(2)}</span>
    </div>` : ''}
    ${Number(order.discount) > 0 ? `
    <div class="row">
      <span>הנחה</span>
      <span>-₪${Number(order.discount).toFixed(2)}</span>
    </div>` : ''}
    <div class="row total-row">
      <span>סה"כ</span>
      <span>₪${Number(order.total).toFixed(2)}</span>
    </div>
  </div>

  <div class="footer">
    <p>משי הום - טקסטיל ביתי איכותי | meshitextile.co.il</p>
  </div>

  <script>window.onload = function() { window.print(); }</script>
</body>
</html>`

  return new NextResponse(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
    },
  })
}
