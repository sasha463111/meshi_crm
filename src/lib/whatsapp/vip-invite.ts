/**
 * Post-order WhatsApp invite to the VIP customer group.
 * Sent ~2 minutes after order is created so the order-confirmation lands first.
 * De-duplicated via the `whatsapp_messages` table (one VIP invite per phone, ever).
 */
import { sendWhatsAppMessage } from './client'
import { createAdminClient } from '@/lib/supabase/admin'

const VIP_INVITE_URL = 'https://chat.whatsapp.com/BgPaqoUGRSM1kQKxPyQ8wk'

export function buildVipInviteMessage(customerName?: string): string {
  const name = (customerName || '').trim().split(' ')[0]
  const greeting = name ? `היי ${name}! 🤍` : 'היי! 🤍'

  return `${greeting}

תודה שקנית במשי טקסטיל! ההזמנה התקבלה ואנחנו כבר מטפלים בה בקפידה.

🤫 *משהו ביננו לבין עצמנו* — יש לנו קבוצת WhatsApp סודית רק ללקוחות שלנו.
שם מפרסמים:
🎁 קופונים סודיים בלעדיים (לא יוצאים בשום מקום אחר)
🔥 מבצעי השקה ראשונים — לפני כולם
🆕 מוצרים חדשים — גישה מוקדמת
💰 הנחות שמורות רק לחברי הקבוצה

זה לא ספאם — שולחים רק כשבאמת יש מבצע שווה. שקט, ענייני, ובלי טרחה.

👇 *קישור להצטרפות (לחיצה אחת):*
${VIP_INVITE_URL}

ברוכים הבאים למשפחה,
צוות משי טקסטיל 🤍`
}

/**
 * Send VIP invite, but only if this phone hasn't received one before.
 * Safe to call multiple times — the de-dup check prevents duplicates.
 */
export async function sendVipInviteOnce(
  phone: string,
  customerName?: string,
): Promise<{ sent: boolean; reason?: string }> {
  if (!phone) return { sent: false, reason: 'no_phone' }

  const supabase = createAdminClient()

  // Check if we already sent a VIP invite to this phone
  const { data: existing } = await supabase
    .from('whatsapp_messages')
    .select('id')
    .eq('phone_number', phone)
    .eq('template_name', 'vip_invite')
    .limit(1)
    .maybeSingle()

  if (existing) return { sent: false, reason: 'already_sent' }

  const text = buildVipInviteMessage(customerName)

  try {
    await sendWhatsAppMessage(phone, text)
    await supabase.from('whatsapp_messages').insert({
      direction: 'outbound',
      phone_number: phone,
      message_type: 'text',
      template_name: 'vip_invite',
      content: text,
      status: 'sent',
      sent_at: new Date().toISOString(),
    })
    return { sent: true }
  } catch (err) {
    await supabase.from('whatsapp_messages').insert({
      direction: 'outbound',
      phone_number: phone,
      message_type: 'text',
      template_name: 'vip_invite',
      content: text,
      status: 'failed',
      error_message: err instanceof Error ? err.message : 'unknown',
    })
    return { sent: false, reason: 'send_failed' }
  }
}
