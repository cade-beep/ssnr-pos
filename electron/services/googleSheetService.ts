import { CONFIG } from '../config';

async function sendToGoogleSheet(payload: any): Promise<void> {
  const url = CONFIG.GOOGLE_SHEETS_WEBAPP_URL;
  if (!url || url.includes('dummy-url-please-replace-this') || url.includes('dummy')) {
    throw new Error('구글 시트 연동 URL이 설정되지 않았거나 유효하지 않습니다. 설정에서 확인해 주십시오.');
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    throw new Error(`HTTP 전송 에러 상태: ${response.status}`);
  }

  const result: any = await response.json();
  if (!result || result.success !== true) {
    throw new Error(result.error || 'Google Sheets Web App 측에서 저장 실패를 반환했습니다.');
  }
}

let cachedProducts: any[] = [];

export const googleSheetService = {
  async getProducts(forceRefresh: boolean = false): Promise<any[]> {
    if (cachedProducts.length > 0 && !forceRefresh) {
      console.log('[LOG] Returning cached products. Size:', cachedProducts.length);
      return cachedProducts;
    }
    
    const url = CONFIG.GOOGLE_SHEETS_WEBAPP_URL;
    if (!url || url.includes('dummy-url-please-replace-this') || url.includes('dummy')) {
      throw new Error('Google Sheets URL is not configured');
    }

    console.log('[LOG] Fetching products dynamically from Google Sheets...');
    const response = await fetch(url, {
      method: 'GET'
    });

    if (!response.ok) {
      throw new Error(`HTTP Error Status: ${response.status}`);
    }

    const result: any = await response.json();
    if (!result || result.success !== true) {
      throw new Error(result.message || 'Failed to fetch products from Google Sheets');
    }

    const products = result.products || [];
    cachedProducts = products.map((p: any) => ({
      id: p.id,
      name: p.name,
      price: Number(p.price) || 0,
      category: p.category,
      emoji: p.emoji || '📦'
    }));
    
    console.log(`[LOG] Loaded ${cachedProducts.length} enabled products successfully.`);
    return cachedProducts;
  },

  async getSales(): Promise<any[]> {
    const url = CONFIG.GOOGLE_SHEETS_WEBAPP_URL;
    if (!url || url.includes('dummy')) {
      throw new Error('Google Sheets Web App URL is not configured.');
    }
    const response = await fetch(`${url}?action=sales`);
    if (!response.ok) {
      throw new Error(`HTTP fetch error: ${response.status}`);
    }
    const result: any = await response.json();
    if (!result || result.success !== true) {
      throw new Error(result.message || 'Failed to fetch sales from Google Sheets');
    }
    return result.sales || [];
  },

  async appendReceipt(receipt: any): Promise<{ success: boolean; error?: string }> {
    console.log('[LOG 6] saveReceiptToExcel 진입 (구글 시트 라우팅으로 대체)\n');
    
    const itemsSummary = receipt.items.map((item: any) => {
      if (item.discount && item.discountQty && item.discount > 0 && item.discountQty > 0) {
        const discountSum = item.discount * item.discountQty;
        if (item.isPercent) {
          return `${item.product.name} x ${item.quantity} (개별할인: ${item.discountQty}개 대상 ${item.discountPercent}% 개당 -${item.discount.toLocaleString()}원, 총 -${discountSum.toLocaleString()}원)`;
        }
        return `${item.product.name} x ${item.quantity} (개별할인: ${item.discountQty}개 대상 개당 -${item.discount.toLocaleString()}원, 총 -${discountSum.toLocaleString()}원)`;
      }
      return `${item.product.name} x ${item.quantity}`;
    }).join(', ');
    const totalQty = receipt.items.reduce((sum: number, item: any) => sum + item.quantity, 0);

    const payload = {
      orderId: receipt.id,
      paymentDateTime: new Date(receipt.date).toLocaleString('ko-KR'),
      paymentMethod: receipt.paymentMethod === 'CARD' ? '신용카드' : '계좌이체',
      totalAmount: receipt.total,
      items: itemsSummary,
      totalQuantity: receipt.totalQuantity || totalQty,
      receivedAmount: receipt.receivedAmount,
      change: receipt.change,
      cashierName: receipt.cashierName || '시스템',
      purchasedItems: receipt.items.map((item: any) => {
        const itemDiscount = item.discount && item.discountQty ? item.discount * item.discountQty : 0;
        return {
          name: item.product.name,
          quantity: item.quantity,
          amount: Math.max(0, (item.product.price * item.quantity) - itemDiscount)
        };
      })
    };

    console.log('[LOG 7] 구글 시트 전송 시작\n');

    try {
      await sendToGoogleSheet(payload);
      console.log('[LOG 8] 구글 시트 append 성공\n');
      console.log('[LOG 9] 구글 시트 재조회 완료 (성공 수신)\n');
      console.log('[LOG 10] 마지막 행 데이터:');
      console.log(JSON.stringify(payload, null, 2));
      console.log('');

      return { success: true };
    } catch (err: any) {
      console.error('[LOG 7 - FAIL] 구글 시트 전송 실패:', err.message || err);
      if (err && err.stack) {
        console.error(err.stack);
      }
      return { success: false, error: err.message || 'Unknown network error' };
    }
  }
};
