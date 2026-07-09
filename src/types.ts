export interface Product {
  id: string;
  name: string;
  price: number;
  category: 'coffee' | 'beverage' | 'bakery' | 'food' | 'etc';
  emoji: string;
  color?: string; // Card accent color
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
  email: string;
  name: string;
  role: '관리자' | '캐셔';
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

export type BusinessState = 'CLOSED' | 'OPENED' | 'FINISHED';

export interface BusinessProductQty {
  productId: string;
  name: string;
  quantity: number;
}

export interface DailyClosingItemData {
  name: string;
  opening: number;
  sold: number;
  waste: number;
  remaining: number;
}
