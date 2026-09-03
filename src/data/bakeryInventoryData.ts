import { InventoryItem } from '../types/inventory';

export interface BakeryProductDef {
  id: string;
  name: string;
  category: '제빵류' | '제과류' | '동전쿠키' | '기타';
  unitPrice: number;
  discount10Price: number;
  discount30Price: number;
}

// Exactly matching 43 items in '미니빵집 판매현황.xlsx' Sheet 1 & Sheet 3
export const BAKERY_PRODUCTS: BakeryProductDef[] = [
  // 제빵류 (1~16)
  { id: 'b-01', name: '소보로빵', category: '제빵류', unitPrice: 1500, discount10Price: 1350, discount30Price: 1050 },
  { id: 'b-02', name: '단팥빵', category: '제빵류', unitPrice: 1500, discount10Price: 1350, discount30Price: 1050 },
  { id: 'b-03', name: '크림빵', category: '제빵류', unitPrice: 1500, discount10Price: 1350, discount30Price: 1050 },
  { id: 'b-04', name: '소보로단팥빵', category: '제빵류', unitPrice: 1600, discount10Price: 1440, discount30Price: 1120 },
  { id: 'b-05', name: '완두앙금빵', category: '제빵류', unitPrice: 1500, discount10Price: 1350, discount30Price: 1050 },
  { id: 'b-06', name: '오트밀 크림빵', category: '제빵류', unitPrice: 1600, discount10Price: 1440, discount30Price: 1120 },
  { id: 'b-07', name: '사과잼빵', category: '제빵류', unitPrice: 1500, discount10Price: 1350, discount30Price: 1050 },
  { id: 'b-08', name: '슈크림빵', category: '제빵류', unitPrice: 1600, discount10Price: 1440, discount30Price: 1120 },
  { id: 'b-09', name: '초코크림빵', category: '제빵류', unitPrice: 1600, discount10Price: 1440, discount30Price: 1120 },
  { id: 'b-10', name: '모카 크림빵', category: '제빵류', unitPrice: 1600, discount10Price: 1440, discount30Price: 1120 },
  { id: 'b-11', name: '소시지빵', category: '제빵류', unitPrice: 1800, discount10Price: 1620, discount30Price: 1260 },
  { id: 'b-12', name: '모닝빵', category: '제빵류', unitPrice: 3000, discount10Price: 2700, discount30Price: 2100 },
  { id: 'b-13', name: '식빵', category: '제빵류', unitPrice: 3500, discount10Price: 3150, discount30Price: 2450 },
  { id: 'b-14', name: '밤식빵', category: '제빵류', unitPrice: 3800, discount10Price: 3420, discount30Price: 2660 },
  { id: 'b-15', name: '소보로밤식빵', category: '제빵류', unitPrice: 4300, discount10Price: 3870, discount30Price: 3010 },
  { id: 'b-16', name: '소금빵', category: '제빵류', unitPrice: 2500, discount10Price: 2250, discount30Price: 1750 },

  // 제과류 (17~25)
  { id: 'c-01', name: '카스텔라', category: '제과류', unitPrice: 1700, discount10Price: 1530, discount30Price: 1190 },
  { id: 'c-02', name: '버터링쿠키(2개입)', category: '제과류', unitPrice: 1200, discount10Price: 1080, discount30Price: 840 },
  { id: 'c-03', name: '초코칩쿠키', category: '제과류', unitPrice: 1200, discount10Price: 1080, discount30Price: 840 },
  { id: 'c-04', name: '모카아몬드쿠키', category: '제과류', unitPrice: 1200, discount10Price: 1080, discount30Price: 840 },
  { id: 'c-05', name: '오트밀쿠키', category: '제과류', unitPrice: 1500, discount10Price: 1350, discount30Price: 1050 },
  { id: 'c-06', name: '브라우니쿠키', category: '제과류', unitPrice: 1200, discount10Price: 1080, discount30Price: 840 },
  { id: 'c-07', name: '플레인머핀', category: '제과류', unitPrice: 1500, discount10Price: 1350, discount30Price: 1050 },
  { id: 'c-08', name: '초코머핀', category: '제과류', unitPrice: 1800, discount10Price: 1620, discount30Price: 1260 },
  { id: 'c-09', name: '마들렌(2개입)', category: '제과류', unitPrice: 1500, discount10Price: 1350, discount30Price: 1050 },

  // 기타/디저트 (26~28)
  { id: 'd-01', name: '롤케이크', category: '기타', unitPrice: 12000, discount10Price: 10800, discount30Price: 8400 },
  { id: 'd-02', name: '모카롤케이크', category: '기타', unitPrice: 15000, discount10Price: 13500, discount30Price: 10500 },
  { id: 'd-03', name: '샌드위치단품', category: '기타', unitPrice: 3800, discount10Price: 3420, discount30Price: 2660 },

  // 동전쿠키류 (29~35)
  { id: 'k-01', name: '황치즈쿠키', category: '동전쿠키', unitPrice: 4000, discount10Price: 3600, discount30Price: 2800 },
  { id: 'k-02', name: '크랜베리쿠키', category: '동전쿠키', unitPrice: 4000, discount10Price: 3600, discount30Price: 2800 },
  { id: 'k-03', name: '초코쿠키', category: '동전쿠키', unitPrice: 4000, discount10Price: 3600, discount30Price: 2800 },
  { id: 'k-04', name: '모카쿠키', category: '동전쿠키', unitPrice: 4000, discount10Price: 3600, discount30Price: 2800 },
  { id: 'k-05', name: '버터쿠키', category: '동전쿠키', unitPrice: 4000, discount10Price: 3600, discount30Price: 2800 },
  { id: 'k-06', name: '녹차쿠키', category: '동전쿠키', unitPrice: 4000, discount10Price: 3600, discount30Price: 2800 },
  { id: 'k-07', name: '모둠쿠키', category: '동전쿠키', unitPrice: 4500, discount10Price: 4050, discount30Price: 3150 },

  // 기타 특수 품목 (36~43)
  { id: 'e-01', name: '만쥬세트', category: '기타', unitPrice: 25000, discount10Price: 22500, discount30Price: 17500 },
  { id: 'e-02', name: '초코마들렌(1개입)', category: '제과류', unitPrice: 800, discount10Price: 720, discount30Price: 560 },
  { id: 'e-03', name: '상투과자', category: '제과류', unitPrice: 3000, discount10Price: 2700, discount30Price: 2100 },
  { id: 'e-04', name: '공갈빵', category: '제빵류', unitPrice: 1600, discount10Price: 1440, discount30Price: 1120 },
  { id: 'e-05', name: '크로와상(1개)', category: '제빵류', unitPrice: 800, discount10Price: 720, discount30Price: 560 },
  { id: 'e-06', name: '크로와상(10개입)', category: '제빵류', unitPrice: 7000, discount10Price: 6300, discount30Price: 4900 },
  { id: 'e-07', name: '구운호떡', category: '제빵류', unitPrice: 1600, discount10Price: 1440, discount30Price: 1120 },
  { id: 'e-08', name: '미니만쥬', category: '기타', unitPrice: 1200, discount10Price: 1080, discount30Price: 840 },
];

export function createInitialInventoryItems(): InventoryItem[] {
  return BAKERY_PRODUCTS.map((prod) => ({
    id: prod.id,
    name: prod.name,
    category: prod.category,
    unitPrice: prod.unitPrice,
    discount10Price: prod.discount10Price,
    discount30Price: prod.discount30Price,
    dispatchQty: 0,
    remainingQty: 0,
    soldQty: 0,
    subtotal: 0,
  }));
}
