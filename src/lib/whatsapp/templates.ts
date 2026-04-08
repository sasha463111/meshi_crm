export function fillTemplate(template: string, variables: Record<string, string>): string {
  let result = template
  for (const [key, value] of Object.entries(variables)) {
    result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value)
  }
  return result
}

export const DEFAULT_TEMPLATES = {
  order_confirmation: {
    name: 'order_confirmation',
    category: 'order',
    content: `שלום {{customer_name}}! 🎉

ההזמנה שלך מספר {{order_number}} התקבלה בהצלחה!

סכום: {{total}}

תודה שקנית ממשי הום! 🏠`,
    variables: ['customer_name', 'order_number', 'total'],
  },
  shipping_update: {
    name: 'shipping_update',
    category: 'shipping',
    content: `שלום {{customer_name}}! 📦

ההזמנה שלך מספר {{order_number}} נשלחה!

מספר מעקב: {{tracking_number}}
חברת שילוח: {{carrier}}

ניתן לעקוב אחרי המשלוח כאן: {{tracking_url}}`,
    variables: ['customer_name', 'order_number', 'tracking_number', 'carrier', 'tracking_url'],
  },
  delivery_confirmation: {
    name: 'delivery_confirmation',
    category: 'delivery',
    content: `שלום {{customer_name}}! ✅

ההזמנה שלך מספר {{order_number}} נמסרה בהצלחה!

נשמח לשמוע מה דעתך על המוצרים 😊

תודה שבחרת במשי הום! 💜`,
    variables: ['customer_name', 'order_number'],
  },
}
