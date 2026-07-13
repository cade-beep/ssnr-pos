import { Product } from './types';

export interface StaticProduct extends Product {
  imageUrl: string;
}

export const STATIC_PRODUCTS: Omit<StaticProduct, 'id'>[] = [

  // BAKERY
  {
    name: '단팥빵',
    category: 'bakery',
    emoji: '🍞',
    price: 1800,
    imageUrl: '/images/p-1.png'
  },
  {
    name: '단팥빵(小)',
    category: 'bakery',
    emoji: '🍞',
    price: 1000,
    imageUrl: '/images/p-2.png'
  },
  {
    name: '소보로빵',
    category: 'bakery',
    emoji: '🍞',
    price: 1800,
    imageUrl: '/images/p-3.png'
  },
  {
    name: '소보로빵(小)',
    category: 'bakery',
    emoji: '🍞',
    price: 1000,
    imageUrl: '/images/p-4.png'
  },
  {
    name: '소보로단팥빵',
    category: 'bakery',
    emoji: '🍞',
    price: 2000,
    imageUrl: '/images/p-5.png'
  },
  {
    name: '소보로단팥빵(小)',
    category: 'bakery',
    emoji: '🍞',
    price: 1200,
    imageUrl: '/images/p-6.png'
  },
  {
    name: '완두앙금빵',
    category: 'bakery',
    emoji: '🍞',
    price: 1800,
    imageUrl: '/images/p-7.png'
  },
  {
    name: '완두앙금빵(小)',
    category: 'bakery',
    emoji: '🍞',
    price: 1000,
    imageUrl: '/images/p-8.png'
  },
  {
    name: '크림빵',
    category: 'bakery',
    emoji: '🍞',
    price: 1800,
    imageUrl: '/images/p-9.png'
  },
  {
    name: '크림빵(小)',
    category: 'bakery',
    emoji: '🍞',
    price: 1000,
    imageUrl: '/images/p-10.png'
  },
  {
    name: '사과잼빵',
    category: 'bakery',
    emoji: '🍞',
    price: 1800,
    imageUrl: '/images/p-11.png'
  },
  {
    name: '사과잼빵(小)',
    category: 'bakery',
    emoji: '🍞',
    price: 1000,
    imageUrl: '/images/p-12.png'
  },
  {
    name: '오트밀 크림빵',
    category: 'bakery',
    emoji: '🍞',
    price: 2000,
    imageUrl: '/images/p-13.png'
  },
  {
    name: '오트밀 크림빵(小)',
    category: 'bakery',
    emoji: '🍞',
    price: 1200,
    imageUrl: '/images/p-14.png'
  },
  {
    name: '모카 크림빵',
    category: 'bakery',
    emoji: '🍞',
    price: 2000,
    imageUrl: '/images/p-15.png'
  },
  {
    name: '모카 크림빵(小)',
    category: 'bakery',
    emoji: '🍞',
    price: 1200,
    imageUrl: '/images/p-16.png'
  },
  {
    name: '소금빵',
    category: 'bakery',
    emoji: '🥐',
    price: 2500,
    imageUrl: '/images/p-17.png'
  },
  {
    name: '소시지빵',
    category: 'bakery',
    emoji: '🍞',
    price: 2800,
    imageUrl: '/images/p-18.png'
  },
  {
    name: '슈크림빵',
    category: 'bakery',
    emoji: '🍞',
    price: 1800,
    imageUrl: '/images/p-19.png'
  },
  {
    name: '슈크림빵(小)',
    category: 'bakery',
    emoji: '🍞',
    price: 1000,
    imageUrl: '/images/p-20.png'
  },
  {
    name: '초코크림빵',
    category: 'bakery',
    emoji: '🍞',
    price: 1800,
    imageUrl: '/images/p-21.png'
  },
  {
    name: '초코크림빵(小)',
    category: 'bakery',
    emoji: '🍞',
    price: 1000,
    imageUrl: '/images/p-22.png'
  },
  {
    name: '모닝빵',
    category: 'bakery',
    emoji: '🍞',
    price: 3000,
    imageUrl: '/images/p-23.png'
  },
  {
    name: '식빵',
    category: 'bakery',
    emoji: '🍞',
    price: 3500,
    imageUrl: '/images/p-24.png'
  },
  {
    name: '밤식빵',
    category: 'bakery',
    emoji: '🍞',
    price: 4500,
    imageUrl: '/images/p-25.png'
  },
  {
    name: '소보로밤식빵',
    category: 'bakery',
    emoji: '🍞',
    price: 4800,
    imageUrl: '/images/p-26.png'
  },
  {
    name: '버터링쿠키(2개입)',
    category: 'bakery',
    emoji: '🍪',
    price: 2500,
    imageUrl: '/images/p-27.png'
  },
  {
    name: '버터링쿠키(1개입)',
    category: 'bakery',
    emoji: '🍪',
    price: 1300,
    imageUrl: '/images/p-28.png'
  },
  {
    name: '초코칩쿠키',
    category: 'bakery',
    emoji: '🍪',
    price: 1500,
    imageUrl: '/images/p-29.png'
  },
  {
    name: '모카아몬드쿠키',
    category: 'bakery',
    emoji: '🍪',
    price: 1500,
    imageUrl: '/images/p-30.png'
  },
  {
    name: '오트밀쿠키',
    category: 'bakery',
    emoji: '🍪',
    price: 1500,
    imageUrl: '/images/p-31.png'
  },
  {
    name: '브라우니쿠키',
    category: 'bakery',
    emoji: '🍪',
    price: 1800,
    imageUrl: '/images/p-32.png'
  },
  {
    name: '플레인머핀',
    category: 'bakery',
    emoji: '🧁',
    price: 2000,
    imageUrl: '/images/p-33.png'
  },
  {
    name: '초코머핀',
    category: 'bakery',
    emoji: '🧁',
    price: 2000,
    imageUrl: '/images/p-34.png'
  },
  {
    name: '카스테라',
    category: 'bakery',
    emoji: '🍰',
    price: 3500,
    imageUrl: '/images/p-35.png'
  },
  {
    name: '마들렌(2개입)',
    category: 'bakery',
    emoji: '🥐',
    price: 2200,
    imageUrl: '/images/p-36.png'
  },
  {
    name: '마들렌(1개입)',
    category: 'bakery',
    emoji: '🥐',
    price: 1200,
    imageUrl: '/images/p-37.png'
  },

  // FOOD
  {
    name: '롤케이크',
    category: 'food',
    emoji: '🥖',
    price: 12000,
    imageUrl: '/images/p-38.png'
  },
  {
    name: '모카롤케이크',
    category: 'food',
    emoji: '🥖',
    price: 12000,
    imageUrl: '/images/p-39.png'
  },
  {
    name: '간식도시락',
    category: 'food',
    emoji: '🍱',
    price: 6000,
    imageUrl: '/images/p-35.png'
  },
  {
    name: '샌드위치단품',
    category: 'food',
    emoji: '🥪',
    price: 4000,
    imageUrl: '/images/p-24.png'
  },
  {
    name: '만쥬세트',
    category: 'food',
    emoji: '🍡',
    price: 8000,
    imageUrl: '/images/p-42.png'
  },
  {
    name: '동전쿠키단품(녹차)',
    category: 'food',
    emoji: '🍪',
    price: 1200,
    imageUrl: '/images/p-43.png'
  },
  {
    name: '동전쿠키단품(초코)',
    category: 'food',
    emoji: '🍪',
    price: 1200,
    imageUrl: '/images/p-44.png'
  },
  {
    name: '동전쿠키단품(버터)',
    category: 'food',
    emoji: '🍪',
    price: 1200,
    imageUrl: '/images/p-45.png'
  },
  {
    name: '동전쿠키단품(크렌베리)',
    category: 'food',
    emoji: '🍪',
    price: 1200,
    imageUrl: '/images/p-46.png'
  },
  {
    name: '동전쿠키단품(모카아몬드)',
    category: 'food',
    emoji: '🍪',
    price: 1200,
    imageUrl: '/images/p-47.png'
  },
  {
    name: '동전쿠키단품(황치즈)',
    category: 'food',
    emoji: '🍪',
    price: 1200,
    imageUrl: '/images/p-27.png'
  },
  {
    name: '동전쿠키단품(모둠)',
    category: 'food',
    emoji: '🍪',
    price: 1500,
    imageUrl: '/images/p-32.png'
  },
  {
    name: '수제쿠키세트6종',
    category: 'food',
    emoji: '🍪',
    price: 10000,
    imageUrl: '/images/p-32.png'
  },
  {
    name: '수제쿠키세트3종',
    category: 'food',
    emoji: '🍪',
    price: 5000,
    imageUrl: '/images/p-32.png'
  },

  // ETC
  {
    name: '박스大',
    category: 'etc',
    emoji: '📦',
    price: 1000,
    imageUrl: '/images/p-52.png'
  },
  {
    name: '박스小',
    category: 'etc',
    emoji: '📦',
    price: 500,
    imageUrl: '/images/p-53.png'
  },
  {
    name: '봉투',
    category: 'etc',
    emoji: '🛍️',
    price: 100,
    imageUrl: '/images/p-54.png'
  },
  {
    name: '1원',
    category: 'etc',
    emoji: '🪙',
    price: 1,
    imageUrl: '/images/p-55.png'
  },
  {
    name: '10원',
    category: 'etc',
    emoji: '🪙',
    price: 10,
    imageUrl: '/images/p-56.png'
  },
  {
    name: '100원',
    category: 'etc',
    emoji: '🪙',
    price: 100,
    imageUrl: '/images/p-37.png'
  },
  {
    name: '1,000원',
    category: 'etc',
    emoji: '💵',
    price: 1000,
    imageUrl: '/images/p-37.png'
  },
  {
    name: '10,000원',
    category: 'etc',
    emoji: '💵',
    price: 10000,
    imageUrl: '/images/p-37.png'
  },
  {
    name: '100,000원',
    category: 'etc',
    emoji: '💵',
    price: 100000,
    imageUrl: '/images/p-37.png'
  }
];

export const getCleanStaticName = (rawName: string): string => {
  const name = rawName.trim();
  if (name.startsWith('버터링쿠키')) return '버터링쿠키';
  if (name.startsWith('마들렌')) return '마들렌';
  if (name.startsWith('동전쿠키단품')) return '동전쿠키단품';
  if (name === '박스大') return '박스(대)';
  if (name === '박스소' || name === '박스小') return '박스(소)';
  return name;
};
