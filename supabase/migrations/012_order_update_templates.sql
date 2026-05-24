-- Transactional order-update WhatsApp templates (tokens: {name} {order} {link} {tracking})
INSERT INTO public.whatsapp_flow_templates (flow, step, label, content) VALUES
  ('order_update', 1, 'אישור הזמנה (מיד אחרי הזמנה)',
   'תודה {name}! קיבלנו את ההזמנה שלך {order} 🎉
אנחנו כבר מכינים אותה ונעדכן אותך ברגע שהיא יוצאת אלייך.
לצפייה בהזמנה: {link}'),
  ('order_update', 2, 'יצא למשלוח',
   'ההזמנה שלך {order} יצאה לדרך! 🚚
מספר מעקב: {tracking}
טיפ קטן: המצעים שלנו לא צריכים גיהוץ — ישר מהמייבש למיטה 😴')
ON CONFLICT (flow, step) DO NOTHING;
