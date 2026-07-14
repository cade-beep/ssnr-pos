export interface Product {
  id: string;
  name: string;
  price: number;
  category: 'bakery' | 'food' | 'etc';
  emoji: string;
  color?: string; // Card accent color
  imageUrl?: string;
  stock?: number;
  lowStockThreshold?: number;
  barcode?: string;
  isActive?: boolean;
  store_id?: string;
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
  product: Product;
  quantity: number;
  discount?: number; // 개당 할인 금액 (원 단위)
  discountQty?: number; // 할인을 적용할 수량 (개수)
  isPercent?: boolean; // 퍼센트 할인 여부
  discountPercent?: number; // 할인 퍼센트 수치 (예: 10)
}

export interface CashierUser {
  id?: string;
  email: string;
  name: string;
  role: 'Owner' | 'Staff';
  store_id: string;
}

export interface Customer {
  id: string;
  store_id: string;
  name: string;
  phone?: string;
  email?: string;
  points: number;
  notes?: string;
  created_at?: string;
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
    electronAPI: {
      platform: string;
      getProducts: () => Promise<Product[]>;
      saveReceipt: (receipt: Receipt) => Promise<{ success: boolean; error?: string }>;
      getSales: () => Promise<any[]>;
    };
  }
}

export const normalizeCategory = (cat: string, name?: string): 'bakery' | 'food' | 'etc' => {
  if (!cat) return 'etc';
  const c = cat.trim();
  
  if (name) {
    const n = name.toLowerCase();
    if (n.includes('쿠키') || n.includes('머핀') || n.includes('마들렌') || n.includes('브라우니')) {
      return 'bakery';
    }
  }

  if (c === '베이커리' || c === '쿠키/제과' || c === 'bakery') return 'bakery';
  if (c === '간식및선물세트' || c === 'food') return 'food';
  if (c === '기타' || c === 'etc') return 'etc';
  return 'etc';
};

export const mapCategoryToDB = (cat: 'bakery' | 'food' | 'etc'): string => {
  if (cat === 'bakery') return '베이커리';
  if (cat === 'food') return '간식및선물세트';
  return '기타';
};
