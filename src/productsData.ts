import { Product } from './types';

export interface StaticProduct extends Product {
  imageUrl: string;
}

export const STATIC_PRODUCTS: Omit<StaticProduct, 'id' | 'price'>[] = [
  // Bakery
  {
    name: '단팥빵',
    category: 'bakery',
    emoji: '🍞',
    imageUrl: 'https://images.unsplash.com/photo-1549931319-a545dcf3bc73?auto=format&fit=crop&w=300&q=80'
  },
  {
    name: '단팥빵(小)',
    category: 'bakery',
    emoji: '🍞',
    imageUrl: 'https://images.unsplash.com/photo-1549931319-a545dcf3bc73?auto=format&fit=crop&w=300&q=80'
  },
  {
    name: '소보로빵',
    category: 'bakery',
    emoji: '🍞',
    imageUrl: 'https://images.unsplash.com/photo-1509440159596-0249088772ff?auto=format&fit=crop&w=300&q=80'
  },
  {
    name: '소보로빵(小)',
    category: 'bakery',
    emoji: '🍞',
    imageUrl: 'https://images.unsplash.com/photo-1509440159596-0249088772ff?auto=format&fit=crop&w=300&q=80'
  },
  {
    name: '소보로단팥빵',
    category: 'bakery',
    emoji: '🍞',
    imageUrl: 'https://images.unsplash.com/photo-1509440159596-0249088772ff?auto=format&fit=crop&w=300&q=80'
  },
  {
    name: '소보로단팥빵(小)',
    category: 'bakery',
    emoji: '🍞',
    imageUrl: 'https://images.unsplash.com/photo-1509440159596-0249088772ff?auto=format&fit=crop&w=300&q=80'
  },
  {
    name: '완두앙금빵',
    category: 'bakery',
    emoji: '🍞',
    imageUrl: 'https://images.unsplash.com/photo-1608686207856-001b95cf60ca?auto=format&fit=crop&w=300&q=80'
  },
  {
    name: '완두앙금빵(小)',
    category: 'bakery',
    emoji: '🍞',
    imageUrl: 'https://images.unsplash.com/photo-1608686207856-001b95cf60ca?auto=format&fit=crop&w=300&q=80'
  },
  {
    name: '크림빵',
    category: 'bakery',
    emoji: '🍞',
    imageUrl: 'https://images.unsplash.com/photo-1555507036-ab1f4038808a?auto=format&fit=crop&w=300&q=80'
  },
  {
    name: '크림빵(小)',
    category: 'bakery',
    emoji: '🍞',
    imageUrl: 'https://images.unsplash.com/photo-1555507036-ab1f4038808a?auto=format&fit=crop&w=300&q=80'
  },
  {
    name: '사과잼빵',
    category: 'bakery',
    emoji: '🍞',
    imageUrl: 'https://images.unsplash.com/photo-1555507036-ab1f4038808a?auto=format&fit=crop&w=300&q=80'
  },
  {
    name: '사과잼빵(小)',
    category: 'bakery',
    emoji: '🍞',
    imageUrl: 'https://images.unsplash.com/photo-1555507036-ab1f4038808a?auto=format&fit=crop&w=300&q=80'
  },
  {
    name: '오트밀 크림빵',
    category: 'bakery',
    emoji: '🍞',
    imageUrl: 'https://images.unsplash.com/photo-1608686207856-001b95cf60ca?auto=format&fit=crop&w=300&q=80'
  },
  {
    name: '오트밀 크림빵(小)',
    category: 'bakery',
    emoji: '🍞',
    imageUrl: 'https://images.unsplash.com/photo-1608686207856-001b95cf60ca?auto=format&fit=crop&w=300&q=80'
  },
  {
    name: '모카 크림빵',
    category: 'bakery',
    emoji: '🍞',
    imageUrl: 'https://images.unsplash.com/photo-1555507036-ab1f4038808a?auto=format&fit=crop&w=300&q=80'
  },
  {
    name: '모카 크림빵(小)',
    category: 'bakery',
    emoji: '🍞',
    imageUrl: 'https://images.unsplash.com/photo-1555507036-ab1f4038808a?auto=format&fit=crop&w=300&q=80'
  },
  {
    name: '소금빵',
    category: 'bakery',
    emoji: '🥐',
    imageUrl: 'https://images.unsplash.com/photo-1608686207856-001b95cf60ca?auto=format&fit=crop&w=300&q=80'
  },
  {
    name: '소시지빵',
    category: 'bakery',
    emoji: '🍞',
    imageUrl: 'https://images.unsplash.com/photo-1589301760014-d929f3979dbc?auto=format&fit=crop&w=300&q=80'
  },
  {
    name: '슈크림빵',
    category: 'bakery',
    emoji: '🍞',
    imageUrl: 'https://images.unsplash.com/photo-1555507036-ab1f4038808a?auto=format&fit=crop&w=300&q=80'
  },
  {
    name: '슈크림빵(小)',
    category: 'bakery',
    emoji: '🍞',
    imageUrl: 'https://images.unsplash.com/photo-1555507036-ab1f4038808a?auto=format&fit=crop&w=300&q=80'
  },
  {
    name: '초코크림빵',
    category: 'bakery',
    emoji: '🍞',
    imageUrl: 'https://images.unsplash.com/photo-1555507036-ab1f4038808a?auto=format&fit=crop&w=300&q=80'
  },
  {
    name: '초코크림빵(小)',
    category: 'bakery',
    emoji: '🍞',
    imageUrl: 'https://images.unsplash.com/photo-1555507036-ab1f4038808a?auto=format&fit=crop&w=300&q=80'
  },
  {
    name: '모닝빵',
    category: 'bakery',
    emoji: '🍞',
    imageUrl: 'https://images.unsplash.com/photo-1608686207856-001b95cf60ca?auto=format&fit=crop&w=300&q=80'
  },
  {
    name: '식빵',
    category: 'bakery',
    emoji: '🍞',
    imageUrl: 'https://images.unsplash.com/photo-1598373182133-52452f7691ef?auto=format&fit=crop&w=300&q=80'
  },
  {
    name: '밤식빵',
    category: 'bakery',
    emoji: '🍞',
    imageUrl: 'https://images.unsplash.com/photo-1509440159596-0249088772ff?auto=format&fit=crop&w=300&q=80'
  },
  {
    name: '소보로밤식빵',
    category: 'bakery',
    emoji: '🍞',
    imageUrl: 'https://images.unsplash.com/photo-1509440159596-0249088772ff?auto=format&fit=crop&w=300&q=80'
  },

  // Cookies
  {
    name: '버터링쿠키',
    category: 'bakery',
    emoji: '🍪',
    imageUrl: 'https://images.unsplash.com/photo-1499636136210-6f4ee915583e?auto=format&fit=crop&w=300&q=80'
  },
  {
    name: '초코칩쿠키',
    category: 'bakery',
    emoji: '🍪',
    imageUrl: 'https://images.unsplash.com/photo-1499636136210-6f4ee915583e?auto=format&fit=crop&w=300&q=80'
  },
  {
    name: '모카아몬드쿠키',
    category: 'bakery',
    emoji: '🍪',
    imageUrl: 'https://images.unsplash.com/photo-1499636136210-6f4ee915583e?auto=format&fit=crop&w=300&q=80'
  },
  {
    name: '오트밀쿠키',
    category: 'bakery',
    emoji: '🍪',
    imageUrl: 'https://images.unsplash.com/photo-1499636136210-6f4ee915583e?auto=format&fit=crop&w=300&q=80'
  },
  {
    name: '브라우니쿠키',
    category: 'bakery',
    emoji: '🍪',
    imageUrl: 'https://images.unsplash.com/photo-1499636136210-6f4ee915583e?auto=format&fit=crop&w=300&q=80'
  },
  {
    name: '플레인머핀',
    category: 'bakery',
    emoji: '🧁',
    imageUrl: 'https://images.unsplash.com/photo-1587314168485-3236d6710814?auto=format&fit=crop&w=300&q=80'
  },
  {
    name: '초코머핀',
    category: 'bakery',
    emoji: '🧁',
    imageUrl: 'https://images.unsplash.com/photo-1587314168485-3236d6710814?auto=format&fit=crop&w=300&q=80'
  },
  {
    name: '카스테라',
    category: 'bakery',
    emoji: '🍰',
    imageUrl: 'https://images.unsplash.com/photo-1606313564200-e75d5e30476c?auto=format&fit=crop&w=300&q=80'
  },
  {
    name: '마들렌',
    category: 'bakery',
    emoji: '🥐',
    imageUrl: 'https://images.unsplash.com/photo-1571877227200-a0d98ea607e9?auto=format&fit=crop&w=300&q=80'
  },
  {
    name: '롤케이크',
    category: 'food',
    emoji: '🥖',
    imageUrl: 'https://images.unsplash.com/photo-1606313564200-e75d5e30476c?auto=format&fit=crop&w=300&q=80'
  },

  // Gift Sets
  {
    name: '모카롤케이크',
    category: 'food',
    emoji: '🥖',
    imageUrl: 'https://images.unsplash.com/photo-1606313564200-e75d5e30476c?auto=format&fit=crop&w=300&q=80'
  },
  {
    name: '간식도시락',
    category: 'food',
    emoji: '🍱',
    imageUrl: 'https://images.unsplash.com/photo-1549465220-1a8b9238cd48?auto=format&fit=crop&w=300&q=80'
  },
  {
    name: '샌드위치단품',
    category: 'food',
    emoji: '🥪',
    imageUrl: 'https://images.unsplash.com/photo-1509722747041-616f39b57569?auto=format&fit=crop&w=300&q=80'
  },
  {
    name: '만쥬세트',
    category: 'food',
    emoji: '🍡',
    imageUrl: 'https://images.unsplash.com/photo-1549465220-1a8b9238cd48?auto=format&fit=crop&w=300&q=80'
  },
  {
    name: '동전쿠키단품',
    category: 'food',
    emoji: '🍪',
    imageUrl: 'https://images.unsplash.com/photo-1499636136210-6f4ee915583e?auto=format&fit=crop&w=300&q=80'
  },
  {
    name: '수제쿠키세트6종',
    category: 'food',
    emoji: '🍪',
    imageUrl: 'https://images.unsplash.com/photo-1549465220-1a8b9238cd48?auto=format&fit=crop&w=300&q=80'
  },
  {
    name: '수제쿠키세트3종',
    category: 'food',
    emoji: '🍪',
    imageUrl: 'https://images.unsplash.com/photo-1549465220-1a8b9238cd48?auto=format&fit=crop&w=300&q=80'
  },

  // Others
  {
    name: '박스(대)',
    category: 'etc',
    emoji: '📦',
    imageUrl: 'https://images.unsplash.com/photo-1589939705384-5185137a7f0f?auto=format&fit=crop&w=300&q=80'
  },
  {
    name: '박스(소)',
    category: 'etc',
    emoji: '📦',
    imageUrl: 'https://images.unsplash.com/photo-1589939705384-5185137a7f0f?auto=format&fit=crop&w=300&q=80'
  },
  {
    name: '봉투',
    category: 'etc',
    emoji: '🛍️',
    imageUrl: 'https://images.unsplash.com/photo-1544816155-12df9643f363?auto=format&fit=crop&w=300&q=80'
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
