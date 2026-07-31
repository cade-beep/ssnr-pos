export interface OfflineSalePayload {
  id: string;
  store_id: string;
  items: Array<{
    product_id: string;
    quantity: number;
    unit_price: number;
    discount_amount: number;
  }>;
  payment_method: string;
  received_cash: number;
  change_amount: number;
  cart_discount_percent: number;
  cart_discount_amount: number;
  item_discount_amount: number;
  total_discount: number;
  final_total: number;
  created_at: string;
}

const OFFLINE_QUEUE_KEY = 'ssnr_pos_offline_sales_queue';

export function getOfflineSales(): OfflineSalePayload[] {
  try {
    const raw = localStorage.getItem(OFFLINE_QUEUE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (err) {
    console.error('Failed to read offline sales queue:', err);
    return [];
  }
}

export function saveOfflineSale(sale: OfflineSalePayload): void {
  try {
    const queue = getOfflineSales();
    queue.push(sale);
    localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue));
    console.log(`📥 Saved offline sale transaction (Total queue: ${queue.length})`);
  } catch (err) {
    console.error('Failed to save offline sale transaction:', err);
  }
}

export function removeOfflineSale(saleId: string): void {
  try {
    const queue = getOfflineSales();
    const filtered = queue.filter(s => s.id !== saleId);
    localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(filtered));
  } catch (err) {
    console.error('Failed to remove synced sale from queue:', err);
  }
}

export function clearOfflineQueue(): void {
  localStorage.removeItem(OFFLINE_QUEUE_KEY);
}

export async function syncOfflineSales(
  completeSaleFn: (sale: OfflineSalePayload) => Promise<boolean>
): Promise<number> {
  const queue = getOfflineSales();
  if (queue.length === 0) return 0;

  console.log(`🔄 Attempting to sync ${queue.length} offline sale(s)...`);
  let syncedCount = 0;

  for (const sale of queue) {
    try {
      const success = await completeSaleFn(sale);
      if (success) {
        removeOfflineSale(sale.id);
        syncedCount++;
      }
    } catch (err) {
      console.warn(`Sync failed for offline sale ${sale.id}:`, err);
    }
  }

  console.log(`✅ Synced ${syncedCount} of ${queue.length} offline sale(s) to database.`);
  return syncedCount;
}

export function initOfflineQueueSync(
  completeSaleFn: (sale: OfflineSalePayload) => Promise<boolean>,
  onSyncComplete?: (count: number) => void
): () => void {
  const handleOnline = async () => {
    console.log('🌐 Network online event detected. Initiating offline sales auto-sync...');
    const count = await syncOfflineSales(completeSaleFn);
    if (count > 0 && onSyncComplete) {
      onSyncComplete(count);
    }
  };

  window.addEventListener('online', handleOnline);

  // Initial check on load
  if (navigator.onLine) {
    syncOfflineSales(completeSaleFn).then(count => {
      if (count > 0 && onSyncComplete) {
        onSyncComplete(count);
      }
    });
  }

  return () => {
    window.removeEventListener('online', handleOnline);
  };
}
