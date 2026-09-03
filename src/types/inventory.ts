export interface InventoryItem {
  id: string;
  name: string;
  category: '제빵류' | '제과류' | '동전쿠키' | '기타';
  unitPrice: number;
  discount10Price?: number;
  discount30Price?: number;
  dispatchQty: number; // 출고 수량
  remainingQty: number; // 남은 재고 수량
  soldQty: number; // 판매 수량 (출고 - 남은수량)
  subtotal: number; // 판매 금액 (판매수량 * 단가)
}

export interface InventoryCheckSession {
  storeName: '서산나래' | '복지관';
  dateStr: string; // e.g., '2026-09-03'
  timeStr: string; // e.g., '15:00'
  displayDateStr: string; // e.g., '2026/9/3(15:00)~'
  round: number; // 차수 (1, 2, ...)
  items: InventoryItem[];
  cardPayment: number; // 카드결제 합계
  cashPayment: number; // 현금/계좌이체 합계
  discount30Payment: number; // 30%할인 판매액
  totalPayment: number; // 총 판매액 (카드 + 현금 + 30%할인)
  totalInventoryAmount: number; // 남은 재고 금액
  notes: string; // 비고 (특이사항)
}

export interface ExcelSyncResult {
  success: boolean;
  message: string;
  timestamp: string;
  updatedFiles?: {
    bakerySalesStatus: string;
    salePaper: string;
  };
  details?: {
    blockIndex?: number;
    sheetName?: string;
  };
}
