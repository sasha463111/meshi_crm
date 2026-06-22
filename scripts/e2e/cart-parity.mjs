#!/usr/bin/env node
/**
 * E2E Cart Parity Test
 * --------------------
 * Compares Shopify Storefront Cart cost (post-discount, post-shipping) vs
 * naive line-item sum to detect drift between marketing copy and reality.
 *
 * Run: node scripts/e2e/cart-parity.mjs
 * Exit code: 0 if all pass, 1 if any mismatch
 */
const SF='75snke-n1.myshopify.com', T='9923e9ffabbab7f7182c114a40e8bda3'
const FREE_SHIP=399, SHIP_RATE=38, TOLERANCE=0.50

async function sf(q,v){
  const r = await fetch(`https://${SF}/api/2025-07/graphql.json`,{method:'POST',headers:{'Content-Type':'application/json','X-Shopify-Storefront-Access-Token':T},body:JSON.stringify({query:q,variables:v})})
  return r.json()
}

async function testCart({name, lines, expected}) {
  const c = await sf(`mutation($input:CartInput!){cartCreate(input:$input){
    cart{
      id checkoutUrl
      cost{subtotalAmount{amount} totalAmount{amount}}
      lines(first:30){edges{node{quantity cost{totalAmount{amount}} merchandise{... on ProductVariant{price{amount} title}}}}}
      discountAllocations{... on CartAutomaticDiscountAllocation{title discountedAmount{amount}}}
      deliveryGroups(first:3){edges{node{deliveryOptions{title estimatedCost{amount}}}}}
    }
    userErrors{message}
  }}`, {input:{lines, buyerIdentity:{countryCode:'IL', deliveryAddressPreferences:[{deliveryAddress:{firstName:'T',lastName:'T',address1:'X',city:'TLV',zip:'6100000',country:'IL',phone:'+972501234567'}}]}}})

  const cart = c.data?.cartCreate?.cart
  if(!cart){
    return {name, status:'FAIL', error: c.data?.cartCreate?.userErrors || c.errors}
  }
  const subtotal = parseFloat(cart.cost.subtotalAmount.amount)
  const shipCost = parseFloat(cart.deliveryGroups?.edges?.[0]?.node?.deliveryOptions?.[0]?.estimatedCost?.amount || '0')
  const total = parseFloat(cart.cost.totalAmount.amount)
  const expSubtotal = expected.subtotal
  const expShip = subtotal >= FREE_SHIP ? 0 : SHIP_RATE
  const expTotal = expSubtotal + expShip

  const subDelta = Math.abs(subtotal - expSubtotal)
  const shipDelta = Math.abs(shipCost - expShip)
  const totalDelta = Math.abs(total - expTotal)
  const passes = subDelta < TOLERANCE && shipDelta < TOLERANCE
  return {
    name, status: passes ? 'PASS' : 'FAIL',
    subtotal, expSubtotal, subDelta,
    shipping: shipCost, expShipping: expShip, shipDelta,
    total, expTotal, totalDelta,
    discounts: cart.discountAllocations.map(d=>`${d.title} -₪${d.discountedAmount.amount}`).join(' | ') || '(none)',
    checkoutUrl: cart.checkoutUrl
  }
}

// Resolve variant IDs
const HANDLES = {
  towel: 'מגבת-רחצה-כבדה-500-גרם-100-כותנה-מצרית',
  bundle8: 'מארז-8-מגבות-פרימיום-חיסכון-של-261',
  satinWhite: 'satin-bedsheet-white',
  satinNavy: 'satin-bedsheet-grey',
  satinSage: 'satin-bedsheet-sage',
  satinRose: 'satin-bedsheet-rose',
}
const ids = {}
for(const [k,h] of Object.entries(HANDLES)){
  const q = await sf(`{productByHandle(handle:"${h}"){variants(first:3){edges{node{id selectedOptions{value}}}}}}`)
  ids[k] = q.data.productByHandle?.variants.edges[0]?.node.id
  if(!ids[k]) console.error(`WARN: ${h} not found`)
}

// Test matrix
const tests = [
  // === Single products (no discount) ===
  { name: '1 towel — no promo', lines: [{merchandiseId: ids.towel, quantity: 1}], expected: {subtotal: 60} },
  { name: '2 towels — no promo', lines: [{merchandiseId: ids.towel, quantity: 2}], expected: {subtotal: 120} },

  // === 3-for-99 promo (45% off ≥3 of single towel) ===
  { name: '3 towels = ₪99', lines: [{merchandiseId: ids.towel, quantity: 3}], expected: {subtotal: 99} },
  { name: '4 towels = ₪132 (4×60×0.55)', lines: [{merchandiseId: ids.towel, quantity: 4}], expected: {subtotal: 132} },
  { name: '5 towels = ₪165', lines: [{merchandiseId: ids.towel, quantity: 5}], expected: {subtotal: 165} },
  { name: '6 towels = ₪198', lines: [{merchandiseId: ids.towel, quantity: 6}], expected: {subtotal: 198} },
  { name: '10 towels = ₪330', lines: [{merchandiseId: ids.towel, quantity: 10}], expected: {subtotal: 330} },

  // === Bundle 8-pack ===
  { name: 'Bundle 8 = ₪219', lines: [{merchandiseId: ids.bundle8, quantity: 1}], expected: {subtotal: 219} },
  { name: '2× bundle = ₪438 (free ship)', lines: [{merchandiseId: ids.bundle8, quantity: 2}], expected: {subtotal: 438} },

  // === Single bedsheet (below promo threshold) ===
  { name: '1 satin = ₪79', lines: [{merchandiseId: ids.satinWhite, quantity: 1}], expected: {subtotal: 79} },
  { name: '2 satin = ₪158', lines: [{merchandiseId: ids.satinWhite, quantity: 2}], expected: {subtotal: 158} },

  // === 3-for-219 satin promo (7.595% off ≥3 from bedsheets collection) ===
  { name: '3 satin same color = ₪219', lines: [{merchandiseId: ids.satinWhite, quantity: 3}], expected: {subtotal: 219} },
  { name: '3 satin mixed colors = ₪219', lines: [
    {merchandiseId: ids.satinWhite, quantity: 1},
    {merchandiseId: ids.satinNavy, quantity: 1},
    {merchandiseId: ids.satinSage, quantity: 1}
  ], expected: {subtotal: 219} },
  { name: '4 satin = ₪292', lines: [{merchandiseId: ids.satinWhite, quantity: 4}], expected: {subtotal: 292} },
  { name: '5 satin = ₪365', lines: [{merchandiseId: ids.satinWhite, quantity: 5}], expected: {subtotal: 365} },
  { name: '6 satin = ₪438 (free ship)', lines: [{merchandiseId: ids.satinWhite, quantity: 6}], expected: {subtotal: 438} },

  // === Mixed carts ===
  { name: 'Bundle + 3 towels (each promo separate)', lines: [
    {merchandiseId: ids.bundle8, quantity: 1},
    {merchandiseId: ids.towel, quantity: 3}
  ], expected: {subtotal: 219 + 99} },
  { name: '3 satin + 1 towel', lines: [
    {merchandiseId: ids.satinWhite, quantity: 3},
    {merchandiseId: ids.towel, quantity: 1}
  ], expected: {subtotal: 219 + 60} },
  { name: '3 satin + 3 towels (both promos)', lines: [
    {merchandiseId: ids.satinWhite, quantity: 3},
    {merchandiseId: ids.towel, quantity: 3}
  ], expected: {subtotal: 219 + 99} },

  // === Free shipping boundary (₪399) ===
  { name: 'Below threshold gets ₪38 ship', lines: [{merchandiseId: ids.towel, quantity: 1}], expected: {subtotal: 60} },
  { name: '5 satin (₪365) = paid ship', lines: [{merchandiseId: ids.satinWhite, quantity: 5}], expected: {subtotal: 365} },
  { name: '6 satin (₪438) = FREE ship', lines: [{merchandiseId: ids.satinWhite, quantity: 6}], expected: {subtotal: 438} },
]

console.log('═══════════════════════════════════════════════════════════════')
console.log('🧪 E2E CART PARITY TEST — Shopify Cart API vs Expected')
console.log('═══════════════════════════════════════════════════════════════\n')

let passes = 0, fails = 0
const failed = []
for(const t of tests){
  const r = await testCart(t)
  const icon = r.status === 'PASS' ? '✅' : '❌'
  console.log(`${icon} ${r.name}`)
  if(r.error){ console.log(`   ERROR:`, r.error) }
  else if(r.status === 'FAIL'){
    console.log(`   Subtotal: ₪${r.subtotal} (expected ₪${r.expSubtotal}, delta ₪${r.subDelta.toFixed(2)})`)
    console.log(`   Shipping: ₪${r.shipping} (expected ₪${r.expShipping})`)
    console.log(`   Discounts: ${r.discounts}`)
    console.log(`   Checkout: ${r.checkoutUrl}`)
    failed.push(r)
  } else {
    console.log(`   ₪${r.subtotal} + ₪${r.shipping} ship = ₪${r.total} | ${r.discounts}`)
  }
  r.status === 'PASS' ? passes++ : fails++
}

console.log('\n═══════════════════════════════════════════════════════════════')
console.log(`RESULTS: ${passes} pass · ${fails} fail · ${passes+fails} total`)
console.log('═══════════════════════════════════════════════════════════════')

if(fails > 0){
  console.log('\n❌ FAILURES:')
  for(const f of failed) console.log(`  - ${f.name}: got ₪${f.subtotal}, expected ₪${f.expSubtotal}`)
  process.exit(1)
}
process.exit(0)
