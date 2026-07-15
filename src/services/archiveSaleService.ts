import { Receipt } from '../types';

function buildItemsSummary(receipt: Receipt): string {
  let summary = receipt.items
    .map((item) => {
      if (item.product.id === 'DISCOUNT') return '';
      const unitDiscount = item.discount || 0;
      if (unitDiscount > 0) {
        if (item.isPercent) {
          const totalDiscount = unitDiscount * item.quantity;
          return `${item.product.name} x ${item.quantity} (개별할인: ${item.quantity}개 대상 ${item.discountPercent}% 개당 -${unitDiscount.toLocaleString()}원, 총 -${totalDiscount.toLocaleString()}원)`;
        }
        const discountQty = item.discountQty || 0;
        const totalDiscount = unitDiscount * discountQty;
        return `${item.product.name} x ${item.quantity} (개별할인: ${discountQty}개 대상 개당 -${unitDiscount.toLocaleString()}원, 총 -${totalDiscount.toLocaleString()}원)`;
      }
      return `${item.product.name} x ${item.quantity}`;
    })
    .filter(Boolean)
    .join(', ');

  if (receipt.cartDiscountAmount && receipt.cartDiscountAmount > 0) {
    summary += `, [전체 할인: ${receipt.cartDiscountPercent}% -${receipt.cartDiscountAmount.toLocaleString()}원]`;
  }

  return summary;
}

/**
 * Archives a completed sale to Google Sheets for record-keeping only.
 * Supabase is already the source of truth by the time this is called —
 * this call is fire-and-forget and must never affect checkout success.
 */
export async function archiveSale(receipt: Receipt): Promise<void> {
  const webappUrl = import.meta.env.VITE_GOOGLE_SHEETS_WEBAPP_URL || '';
  if (!webappUrl) return;

  try {
    const payload = {
      orderId: receipt.id,
      paymentDateTime: receipt.date.toLocaleString('ko-KR'),
      paymentMethod: receipt.paymentMethod === 'CARD' ? '신용카드' : '계좌이체',
      totalAmount: receipt.total,
      items: buildItemsSummary(receipt),
      totalQuantity: receipt.totalQuantity,
      receivedAmount: receipt.receivedAmount,
      change: receipt.change,
      cashierName: receipt.cashierName
    };

    await fetch(webappUrl, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
  } catch (err) {
    console.warn('[archiveSaleService] Google Sheets 아카이브 실패 (매출 저장에는 영향 없음):', err);
  }
}
