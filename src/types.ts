export interface Product {
  id: string;
  name: string;
  price: number;
  childPrice?: number; // 어린이/할인 가격 (선택적)
  category: 'bakery' | 'food' | 'etc';
  emoji: string;
  color?: string; // Card accent color
  imageUrl?: string;
  barcode?: string;
  isActive?: boolean;
  store_id?: string;
  discountType?: 'none' | 'regular' | 'expiry';
  discountPercent?: number;
}

export interface ClosingReport {
  id?: string;
  closed_at: string;
  cashier_name: string;
  total_sales: number;
  card_sales: number;
  transfer_sales: number;
  cash_sales: number;
  total_quantity: number;
  refund_count: number;
  refund_amount: number;
  sales_count: number;
  item_details: Record<string, number>;
  inventory_snapshot: Record<string, { stock: number; threshold: number }>;
}

export interface CartItem {
  id?: string; // CartItem 고유 키 (product.id + priceType)
  product: Product;
  quantity: number;
  priceType?: 'adult' | 'child' | 'default';
  unitPrice?: number; // 적용된 단가
  discount?: number; // 개당 할인 금액 (원 단위)
  discountQty?: number; // 할인을 적용할 수량 (개수)
  isPercent?: boolean; // 퍼센트 할인 여부
  discountPercent?: number; // 할인 퍼센트 수치 (예: 10)
  excludeFromCartDiscount?: boolean; // 전체 할인 계산에서 이 품목을 제외할지 여부
}

export interface CartDraft {
  id: string;
  savedAt: string | number;
  items: CartItem[];
  discountPercent?: number;
}

export interface CashierUser {
  id?: string;
  email: string;
  name: string;
  role: 'Owner' | 'Staff';
  store_id: string;
  is_approved?: boolean;
  can_refund?: boolean;
  can_view_reports?: boolean;
}

export type PaymentMethod = 'CARD' | 'TRANSFER';

export interface Receipt {
  id: string;
  items: CartItem[];
  total: number;
  totalQuantity: number;
  paymentMethod: PaymentMethod;
  receivedAmount: number;
  change: number;
  date: Date;
  cashierName?: string;
  isRefunded?: boolean;
  refundedAt?: string;
  refundedBy?: string;
  subtotal?: number;
  itemDiscountAmount?: number;
  cartDiscountPercent?: number;
  cartDiscountAmount?: number;
  totalDiscount?: number;
  finalTotal?: number;
}

// Extend global window object for type safety in React renderer
declare global {
  interface Window {
    electronAPI?: {
      platform: string;
      syncInventoryExcel?: (session: any) => Promise<any>;
      openExcelFile?: (type: 'bakery' | 'salepaper') => Promise<boolean>;
      getExcelPaths?: () => Promise<{ bakeryPath: string; salePaperPath: string }>;
    };
  }
}

export const normalizeCategory = (cat: string, name?: string): 'bakery' | 'food' | 'etc' => {
  if (!cat) return 'etc';
  const c = cat.trim().toLowerCase();
  
  if (name) {
    const n = name.toLowerCase();
    if (n.includes('쿠키') || n.includes('머핀') || n.includes('마들렌') || n.includes('브라우니') || n.includes('빵') || n.includes('식빵')) {
      return 'bakery';
    }
  }

  if (c === '베이커리' || c === '쿠키/제과' || c === '제과류' || c === 'bakery' || c === 'bread' || c === '빵' || c === 'pastry' || c === 'cake') return 'bakery';
  if (c === '간식및선물세트' || c === 'food' || c === '선물세트' || c === '선물' || c === 'gift' || c === '간식') return 'food';
  if (c === '기타' || c === 'etc') return 'etc';
  return 'etc';
};

/**
 * Which tab a product sits under on the sales screen. This is a display
 * grouping only — it is derived from the name and never written back, so the
 * stored category ('베이커리' | '간식및선물세트' | '기타') and every DB path
 * that uses it stay exactly as they are.
 */
export type PosGroup = 'bakery' | 'bakery_sm' | 'pastry' | 'etc';

export const getPosGroup = (name: string, cat?: string): PosGroup => {
  const n = (name || '').trim();
  // 제과 first: a 쿠키(小) should still be 제과, not 제빵(小)
  if (/쿠키|머핀|마들렌|브라우니|카스테라|카스텔라/.test(n)) return 'pastry';
  // '(小)' with the brackets, so 박스小 is not mistaken for a small loaf
  if (n.includes('(小)')) return 'bakery_sm';
  if (n.includes('빵')) return 'bakery';
  if (cat && normalizeCategory(cat, undefined) === 'bakery') return 'bakery';
  return 'etc';
};

/**
 * 봉투 is a pass-through charge, so it is never discounted — not by an item
 * discount, not by the cart-wide percentage, not by the 전체할인제외 toggle
 * being switched off. complete_sale re-checks this server side.
 */
export const isDiscountable = (product: Product): boolean => product.name.trim() !== '봉투';

export const mapCategoryToDB = (cat: 'bakery' | 'food' | 'etc'): string => {
  if (cat === 'bakery') return '베이커리';
  if (cat === 'food') return '간식및선물세트';
  return '기타';
};
