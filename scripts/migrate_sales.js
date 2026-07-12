const { createClient } = require('@supabase/supabase-js');

const actualUrl = "https://bhnlbfwajdrlxmjjqnio.supabase.co";
const supabaseAnonKey = "sb_publishable_M714oyHbLIfc6mDvNOhhww_Z-hb2_Jg";
const webappUrl = "https://script.google.com/macros/s/AKfycbyuVyDfxcye9Uyx7ZSEtMXGvSrkQNmApZ4Bt8-ae0wodGYPriFVnKIGsJAPFS7GcP748g/exec";

const supabase = createClient(actualUrl, supabaseAnonKey);

function parseKoreanDate(dateStr) {
  if (!dateStr) return null;
  
  // Clean multiple spaces
  const cleaned = dateStr.replace(/\s+/g, ' ').trim();
  
  // Format check: YYYY. MM. DD. [오전/오후] HH:MM:SS
  const match = cleaned.match(/^(\d{4})\s*[\s.-]\s*(\d{1,2})\s*[\s.-]\s*(\d{1,2})\s*[\s.-]?\s*(오전|오후)?\s*(\d{1,2}):(\d{1,2}):(\d{1,2})/i);
  
  if (match) {
    const year = parseInt(match[1], 10);
    const month = parseInt(match[2], 10);
    const day = parseInt(match[3], 10);
    const ampm = match[4];
    let hour = parseInt(match[5], 10);
    const minute = parseInt(match[6], 10);
    const second = parseInt(match[7], 10);

    if (ampm === '오후' && hour < 12) {
      hour += 12;
    } else if (ampm === '오전' && hour === 12) {
      hour = 0;
    }

    const date = new Date(year, month - 1, day, hour, minute, second);
    if (!isNaN(date.getTime())) {
      return date;
    }
  }

  // Fallback to standard JS Date constructor
  const parsed = new Date(dateStr);
  if (!isNaN(parsed.getTime())) {
    return parsed;
  }
  return null;
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
      console.log(`Loaded ${sales.length} raw records from Google Sheets.`);
    } else {
      console.error('Failed to load sales from Google Sheets response:', data);
      process.exit(1);
    }
  } catch (e) {
    console.error('Error fetching sales:', e.message);
    process.exit(1);
  }

  // Clean up any previously generated temporary migrated IDs to start fresh
  console.log('Cleaning up previous generated IDs in Supabase...');
  const { error: cleanError } = await supabase
    .from('orders')
    .delete()
    .like('order_number', 'POS-MIGRATED-%');
    
  if (cleanError) {
    console.warn('Warning during cleanup of old generated IDs:', cleanError.message);
  }

  const salesTransactions = [];
  const notesAndMetadata = [];

  // 3. Classify records
  sales.forEach((sale, idx) => {
    const rawDate = sale.paymentDateTime || '';
    // Date pattern check
    const isDatePattern = /^\d{4}\s*[-.]\s*\d{1,2}\s*[-.]\s*\d{1,2}/.test(rawDate);
    const parsedDate = parseKoreanDate(rawDate);

    if (isDatePattern && parsedDate) {
      salesTransactions.push({ sale, parsedDate, originalIdx: idx });
    } else {
      notesAndMetadata.push({ sale, reason: !isDatePattern ? '날짜 패턴 불일치 (메모/마감)' : '날짜 파싱 실패', originalIdx: idx });
    }
  });

  console.log(`\nClassification Complete:`);
  console.log(`- Sales Transactions: ${salesTransactions.length} records`);
  console.log(`- Metadata/Notes:     ${notesAndMetadata.length} records`);

  let migratedCount = 0;
  let updatedCount = 0;
  let errorCount = 0;

  // 4. Migrate each valid sales transaction sequentially
  console.log('\nStarting Database Migration...');
  for (let i = 0; i < salesTransactions.length; i++) {
    const { sale, parsedDate, originalIdx } = salesTransactions[i];
    
    // Generate clean ID if blank using local time components
    let orderId = sale.orderId ? sale.orderId.trim() : "";
    let isIdNormalized = false;
    if (!orderId) {
      const pad = (n) => n.toString().padStart(2, '0');
      const localStr = `${parsedDate.getFullYear()}${pad(parsedDate.getMonth() + 1)}${pad(parsedDate.getDate())}${pad(parsedDate.getHours())}${pad(parsedDate.getMinutes())}${pad(parsedDate.getSeconds())}`;
      orderId = `POS-MIGRATED-${localStr}-${originalIdx}`;
      isIdNormalized = true;
    }
    
    console.log(`[${i+1}/${salesTransactions.length}] Processing transaction ${orderId} (Row #${originalIdx + 1})...`);
    if (isIdNormalized) {
      console.log(`  -> Generated unique ID for empty orderId field.`);
    }
    
    // Check if order already exists in Supabase by matching order_number column
    const { data: existingOrder, error: checkError } = await supabase
      .from('orders')
      .select('id')
      .eq('order_number', orderId)
      .maybeSingle();

    if (checkError) {
      console.error(`  Error checking existing order ${orderId}:`, checkError.message);
      errorCount++;
      continue;
    }

    const orderPayload = {
      order_number: orderId,
      payment_date_time: parsedDate.toISOString(),
      payment_method: sale.paymentMethod === '신용카드' ? 'CARD' : 'TRANSFER',
      total_amount: Number(sale.totalAmount) || 0,
      total_quantity: Number(sale.totalQuantity) || 0,
      received_amount: Number(sale.receivedAmount || sale.totalAmount) || 0,
      change: Number(sale.change) || 0,
      cashier_name: sale.cashierName || '시스템'
    };

    if (existingOrder) {
      console.log(`  Order ${orderId} already exists. Updating/Correcting payment_date_time.`);
      const { error: updateError } = await supabase
        .from('orders')
        .update({ payment_date_time: parsedDate.toISOString() })
        .eq('order_number', orderId);

      if (updateError) {
        console.error(`  Failed to update order ${orderId}:`, updateError.message);
        errorCount++;
      } else {
        updatedCount++;
      }
      continue;
    }

    // Insert new order header and get returned UUID
    const { data: insertedOrder, error: orderInsertError } = await supabase
      .from('orders')
      .insert(orderPayload)
      .select('id')
      .single();

    if (orderInsertError) {
      console.error(`  Failed to insert order header for ${orderId}:`, orderInsertError.message);
      errorCount++;
      continue;
    }

    const orderUUID = insertedOrder.id;

    // Parse and insert items referencing UUID
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
          order_id: orderUUID,
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
        await supabase.from('orders').delete().eq('id', orderUUID);
        errorCount++;
        continue;
      }
    }

    console.log(`  Order ${orderId} successfully migrated.`);
    migratedCount++;
  }

  // 5. Output reports
  console.log('\n--- CLASSIFIED METADATA/NOTES REPORT ---');
  if (notesAndMetadata.length === 0) {
    console.log('No metadata or note records identified.');
  } else {
    notesAndMetadata.forEach(item => {
      console.log(`[Row #${item.originalIdx + 1}]`);
      console.log(`  orderId:         "${item.sale.orderId}"`);
      console.log(`  paymentDateTime: "${item.sale.paymentDateTime}"`);
      console.log(`  items/content:   "${item.sale.items || '(empty)'}"`);
      console.log(`  Reason:          ${item.reason}`);
      console.log('--------------------------------');
    });
  }

  console.log('\n--- MIGRATION SUMMARY REPORT ---');
  console.log("Total Google Sheets records read: " + sales.length);
  console.log("Sales transactions identified:   " + salesTransactions.length);
  console.log("  - Successfully migrated:       " + migratedCount);
  console.log("  - Corrected/Updated dates:     " + updatedCount);
  console.log("  - Errors encountered:          " + errorCount);
  console.log("Metadata/Notes filtered out:     " + notesAndMetadata.length);
  console.log('--------------------------------\n');
}

migrate();
