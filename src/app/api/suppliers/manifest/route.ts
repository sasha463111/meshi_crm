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

  // Generate simple HTML manifest that can be printed as PDF
  const address = order.shipping_address as Record<string, string> | null

  const html = `
<!DOCTYPE html>
<html dir="rtl" lang="he">
<head>
  <meta charset="UTF-8">
  <title>תעודת משלוח - ${order.shopify_order_number}</title>
  <style>
    body { font-family: Arial, sans-serif; padding: 40px; direction: rtl; }
    h1 { text-align: center; margin-bottom: 30px; }
    .info { display: flex; justify-content: space-between; margin-bottom: 20px; }
    .info-box { border: 1px solid #ddd; padding: 15px; border-radius: 8px; width: 45%; }
    table { width: 100%; border-collapse: collapse; margin-top: 20px; }
    th, td { border: 1px solid #ddd; padding: 10px; text-align: right; }
    th { background: #f5f5f5; }
    .footer { margin-top: 40px; text-align: center; color: #888; }
    @media print { body { padding: 20px; } }
  </style>
</head>
<body>
  <h1>תעודת משלוח</h1>
  <h2 style="text-align:center;color:#666;">הזמנה מספר ${order.shopify_order_number}</h2>

  <div class="info">
    <div class="info-box">
      <h3>פרטי הלקוח</h3>
      <p><strong>${order.customer_name || ''}</strong></p>
      ${address ? `
        <p>${address.address1 || ''}</p>
        <p>${address.city || ''} ${address.zip || ''}</p>
        <p>${address.phone || ''}</p>
      ` : ''}
    </div>
    <div class="info-box">
      <h3>פרטי משלוח</h3>
      <p>תאריך: ${new Date().toLocaleDateString('he-IL')}</p>
      ${order.tracking_number ? `<p>מספר מעקב: ${order.tracking_number}</p>` : ''}
      ${order.carrier ? `<p>חברת שילוח: ${order.carrier}</p>` : ''}
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th>מוצר</th>
        <th>SKU</th>
        <th>כמות</th>
        <th>מחיר יחידה</th>
        <th>סה"כ</th>
      </tr>
    </thead>
    <tbody>
      ${(items || []).map(item => `
        <tr>
          <td>${item.title}${item.variant_title ? ` - ${item.variant_title}` : ''}</td>
          <td>${item.sku || '-'}</td>
          <td>${item.quantity}</td>
          <td>₪${Number(item.unit_price).toFixed(2)}</td>
          <td>₪${Number(item.total_price).toFixed(2)}</td>
        </tr>
      `).join('')}
    </tbody>
  </table>

  <div class="footer">
    <p>משי הום - טקסטיל ביתי איכותי</p>
    <p>meshitextile.co.il</p>
  </div>
</body>
</html>`

  return new NextResponse(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
    },
  })
}
