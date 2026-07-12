const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = "https://bhnlwajdrlxmjjqnio.supabase.co" || "https://bhnlbfwajdrlxmjjqnio.supabase.co"; // fallback to actual URL
const actualUrl = "https://bhnlbfwajdrlxmjjqnio.supabase.co";
const supabaseAnonKey = "sb_publishable_M714oyHbLIfc6mDvNOhhww_Z-hb2_Jg";
const webappUrl = "https://script.google.com/macros/s/AKfycbyuVyDfxcye9Uyx7ZSEtMXGvSrkQNmApZ4Bt8-ae0wodGYPriFVnKIGsJAPFS7GcP748g/exec";

const supabase = createClient(actualUrl, supabaseAnonKey);

function parseKoreanDate(dateStr) {
  if (!dateStr) return new Date();
  try {
    // e.g. "2026. 7. 12. 오후 2:16:41"
    const normalized = dateStr.replace(/\./g, '-').replace(/\s+/g, ' ');
    const parts = normalized.split(' ');
    const datePart = parts.slice(0, 3).join('').replace(/-$/, ''); // "2026-7-12"
    const ampm = parts[3]; // "오후" or "오전"
    const timePart = parts[4]; // "2:16:41"
    if (!timePart) return new Date(dateStr);
    const timeParts = timePart.split(':');
    let hour = parseInt(timeParts[0], 10);
    const min = parseInt(timeParts[1], 10);
    const sec = parseInt(timeParts[2] || '0', 10);
    if (ampm === '오후' && hour < 12) {
      hour += 12;
    } else if (ampm === '오전' && hour === 12) {
      hour = 0;
    }
    const isoString = `${datePart}T${hour.toString().padStart(2, '0')}:${min.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
    return new Date(isoString);
  } catch (e) {
    console.error('Failed to parse date:', dateStr, e.message);
    return new Date(dateStr);
  }
}

async function migrate() {
  console.log('--- STARTING DATA MIGRATION ---');
  
  // 1. Fetch products to map names to IDs and prices
  console.log('Fetching products from Google Sheets...');
  let products = [];
  try {
    const res = await fetch(`${webappUrl}?action=products`);
    const data = await res.json();
    if (data && data.success) {
      products = data.products || [];
      console.log(`Loaded ${products.length} products for name-to-ID lookup.`);
    }
  } catch (e) {
    console.error('Warning: Failed to fetch products, using empty mapping.', e.message);
  }

  const productMap = {};
  products.forEach(p => {
    productMap[p.name.trim()] = { id: p.id, price: Number(p.price) || 0 };
  });

  // 2. Fetch sales history from Google Sheets
  console.log('Fetching sales history from Google Sheets...');
  let sales = [];
  try {
    const res = await fetch(`${webappUrl}?action=sales`);
    const data = await res.json();
    if (data && data.success) {
      sales = data.sales || [];
      console.log(`Loaded ${sales.length} sales records from Google Sheets.`);
    } else {
      console.error('Failed to load sales from Google Sheets response:', data);
      process.exit(1);
    }
  } catch (e) {
    console.error('Error fetching sales:', e.message);
    process.exit(1);
  }

  let migratedCount = 0;
  let skippedCount = 0;
  let errorCount = 0;

  // 3. Migrate each record sequentially
  for (let i = 0; i < sales.length; i++) {
    const sale = sales[i];
    const orderId = sale.orderId;
    
    console.log(`[${i+1}/${sales.length}] Processing order ${orderId}...`);
    
    // Check if order already exists in Supabase
    const { data: existingOrder, error: checkError } = await supabase
      .from('orders')
      .select('id')
      .eq('id', orderId)
      .maybeSingle();

    if (checkError) {
      console.error(`  Error checking existing order ${orderId}:`, checkError.message);
      errorCount++;
      continue;
    }

    if (existingOrder) {
      console.log(`  Order ${orderId} already exists in Supabase. Skipping.`);
      skippedCount++;
      continue;
    }

    // Insert order header
    const paymentDate = parseKoreanDate(sale.paymentDateTime);
    const orderPayload = {
      id: orderId,
      payment_date_time: paymentDate.toISOString(),
      payment_method: sale.paymentMethod === '신용카드' ? 'CARD' : 'TRANSFER',
      total_amount: Number(sale.totalAmount) || 0,
      total_quantity: Number(sale.totalQuantity) || 0,
      received_amount: Number(sale.receivedAmount || sale.totalAmount) || 0,
      change: Number(sale.change) || 0,
      cashier_name: sale.cashierName || '시스템'
    };

    const { error: orderInsertError } = await supabase
      .from('orders')
      .insert(orderPayload);

    if (orderInsertError) {
      console.error(`  Failed to insert order header for ${orderId}:`, orderInsertError.message);
      errorCount++;
      continue;
    }

    // Parse and insert items
    const itemsStr = sale.items || '';
    const itemParts = itemsStr.split(', ');
    const orderItemsPayload = [];

    for (const itemPart of itemParts) {
      if (!itemPart.trim()) continue;
      const match = itemPart.trim().match(/^(.+?)\s*x\s*(\d+)/);
      if (match) {
        const productName = match[1].trim();
        const quantity = parseInt(match[2], 10);
        
        let productId = 'UNKNOWN';
        let productPrice = 0;
        let discount = 0;
        let discountQty = 0;
        let isPercent = false;
        let discountPercent = 0;

        // Resolve product info if match exists
        if (productName.includes('[할인적용')) {
          productId = 'DISCOUNT';
        } else {
          const resolved = productMap[productName];
          if (resolved) {
            productId = resolved.id;
            productPrice = resolved.price;
          }
        }

        orderItemsPayload.push({
          order_id: orderId,
          product_id: productId,
          product_name: productName,
          product_price: productPrice,
          quantity: quantity,
          discount: discount,
          discount_qty: discountQty,
          is_percent: isPercent,
          discount_percent: discountPercent
        });
      }
    }

    if (orderItemsPayload.length > 0) {
      const { error: itemsInsertError } = await supabase
        .from('order_items')
        .insert(orderItemsPayload);

      if (itemsInsertError) {
        console.error(`  Failed to insert items for order ${orderId}:`, itemsInsertError.message);
        // Delete order header to preserve integrity
        await supabase.from('orders').delete().eq('id', orderId);
        errorCount++;
        continue;
      }
    }

    console.log(`  Order ${orderId} successfully migrated.`);
    migratedCount++;
  }

  console.log('\n--- MIGRATION SUMMARY REPORT ---');
  console.log(`Total Google Sheets records read: ${sales.length}`);
  console.log(`Successfully migrated:           ${migratedCount}`);
  console.log(`Skipped (already exists):        ${skippedCount}`);
  console.log(`Errors encountered:              ${errorCount}`);
  console.log('--------------------------------\n');
}

migrate();
