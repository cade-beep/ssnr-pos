import React, { useState, useEffect } from 'react';
import { Product, CartItem } from '../types';
import { supabase } from '../supabase';
import { Search, Menu, X, Plus, Check, TrendingUp, Clock, Star, Sparkles } from 'lucide-react';

interface POSGridProps {
  products: Product[];
  // Card tap — toggles cart membership (add if absent, remove if already in cart).
  onProductClick: (product: Product) => void;
  // Enter-to-add from the search box — always adds/increments, mirroring
  // barcode-scan behavior; never removes on a repeat trigger.
  onQuickAdd: (product: Product) => void;
  cart?: CartItem[];
}

type CategoryFilter = 'all' | 'bakery' | 'cookies' | 'gift' | 'etc';
type SortOption = 'default' | 'price_asc' | 'price_desc';
type SmartFilter = 'all' | 'bestsellers' | 'recent' | 'favorites';

const CATEGORIES: { value: CategoryFilter; label: string }[] = [
  { value: 'bakery', label: '베이커리' },
  { value: 'cookies', label: '쿠키/제과' },
  { value: 'gift', label: '선물세트' },
  { value: 'etc', label: '기타' },
];

const FAVORITES_STORAGE_KEY = 'ssnr_pos_favorite_products';
const SALES_INSIGHT_LOOKBACK_DAYS = 30;
const SALES_INSIGHT_ROW_LIMIT = 1000;

const POSGrid: React.FC<POSGridProps> = ({ products, onProductClick, onQuickAdd, cart = [] }) => {
  const [selectedCategory, setSelectedCategory] = useState<CategoryFilter>('all');
  const [smartFilter, setSmartFilter] = useState<SmartFilter>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [sortOption, setSortOption] = useState<SortOption>('default');

  // Best-sellers / recently-sold — derived from real order history (last 30 days), never fabricated.
  const [bestSellerIds, setBestSellerIds] = useState<string[]>([]);
  const [recentSoldIds, setRecentSoldIds] = useState<string[]>([]);

  // Favorites — local-only, per-device (same pattern as the temp-save drafts: no server round-trip needed).
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem(FAVORITES_STORAGE_KEY);
      return saved ? new Set(JSON.parse(saved)) : new Set();
    } catch {
      return new Set();
    }
  });

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const since = new Date();
        since.setDate(since.getDate() - SALES_INSIGHT_LOOKBACK_DAYS);

        const { data, error } = await supabase
          .from('orders')
          .select('payment_date_time, is_refunded, order_items(product_id, quantity)')
          .gte('payment_date_time', since.toISOString())
          .order('payment_date_time', { ascending: false })
          .limit(SALES_INSIGHT_ROW_LIMIT);

        if (error || !data || cancelled) return;

        const qtyById: Record<string, number> = {};
        const recentIds: string[] = [];
        const seenRecent = new Set<string>();

        for (const order of data as any[]) {
          if (order.is_refunded) continue;
          for (const item of order.order_items || []) {
            if (!item.product_id || item.product_id === 'DISCOUNT') continue;
            qtyById[item.product_id] = (qtyById[item.product_id] || 0) + (Number(item.quantity) || 0);
            if (!seenRecent.has(item.product_id)) {
              seenRecent.add(item.product_id);
              recentIds.push(item.product_id);
            }
          }
        }

        if (cancelled) return;

        const rankedBestSellers = Object.entries(qtyById)
          .sort((a, b) => b[1] - a[1])
          .map(([id]) => id);

        setBestSellerIds(rankedBestSellers);
        setRecentSoldIds(recentIds);
      } catch (err) {
        console.error('Failed to load sales insight for smart nav:', err);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const toggleFavorite = (e: React.MouseEvent, productId: string) => {
    e.stopPropagation();
    setFavoriteIds((prev) => {
      const next = new Set(prev);
      if (next.has(productId)) {
        next.delete(productId);
      } else {
        next.add(productId);
      }
      localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify([...next]));
      return next;
    });
  };

  const handleCardKeyDown = (e: React.KeyboardEvent, product: Product) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onProductClick(product);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (filteredProducts.length > 0) {
        onQuickAdd(filteredProducts[0]);
        setSearchTerm('');
      }
    }
  };

  const bestSellerRank = new Map(bestSellerIds.map((id, idx) => [id, idx]));
  const recentSoldRank = new Map(recentSoldIds.map((id, idx) => [id, idx]));

  const filteredProducts = products.filter(p => {
    if (searchTerm.trim() !== '') {
      const term = searchTerm.toLowerCase();
      if (!p.name.toLowerCase().includes(term)) {
        return false;
      }
    }

    if (smartFilter === 'favorites') return favoriteIds.has(p.id);
    if (smartFilter === 'bestsellers') return bestSellerRank.has(p.id);
    if (smartFilter === 'recent') return recentSoldRank.has(p.id);

    // smartFilter === 'all' -> fall through to ordinary category filtering
    if (selectedCategory === 'all') return true;
    if (selectedCategory === 'bakery') {
      return p.category === 'bakery' && p.name.includes('빵');
    }
    if (selectedCategory === 'cookies') {
      return p.category === 'bakery' && !p.name.includes('빵');
    }
    if (selectedCategory === 'gift') {
      return p.category === 'food';
    }
    if (selectedCategory === 'etc') {
      return p.category === 'etc';
    }
    return false;
  });

  if (sortOption === 'price_asc') {
    filteredProducts.sort((a, b) => a.price - b.price);
  } else if (sortOption === 'price_desc') {
    filteredProducts.sort((a, b) => b.price - a.price);
  } else if (smartFilter === 'bestsellers') {
    filteredProducts.sort((a, b) => (bestSellerRank.get(a.id) ?? 0) - (bestSellerRank.get(b.id) ?? 0));
  } else if (smartFilter === 'recent') {
    filteredProducts.sort((a, b) => (recentSoldRank.get(a.id) ?? 0) - (recentSoldRank.get(b.id) ?? 0));
  } else {
    // Default browsing order: product code ascending (P-1, P-2, ... P-10), not DB insertion order.
    filteredProducts.sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true, sensitivity: 'base' }));
  }

  const isProductInCart = (productId: string) => {
    return cart.some(item => item.product.id === productId);
  };

  const emptyStateText = {
    all: { title: '일치하는 상품이 없습니다', desc: '다른 검색어를 입력하시거나 카테고리를 확인해 주세요.' },
    bestsellers: { title: '아직 인기 상품 데이터가 없습니다', desc: '최근 30일간 판매 내역이 쌓이면 자동으로 표시됩니다.' },
    recent: { title: '최근 판매된 상품이 없습니다', desc: '최근 30일간 판매 내역이 쌓이면 자동으로 표시됩니다.' },
    favorites: { title: '즐겨찾기한 상품이 없습니다', desc: '상품 카드의 별표를 눌러 즐겨찾기에 추가해 보세요.' },
  }[smartFilter];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', height: '100%', overflow: 'hidden' }}>

      {/* Search Input and Category Button Row */}
      <div className="search-row">
        <div className="search-container" style={{ position: 'relative' }}>
          <div className="search-icon-wrapper">
            <Search size={18} />
          </div>
          <input
            type="text"
            className="search-input"
            placeholder="상품명, 바코드 검색 (F1)"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            onKeyDown={handleKeyDown}
            style={{ paddingRight: searchTerm ? '36px' : '14px' }}
          />
          {searchTerm && (
            <button
              type="button"
              onClick={() => setSearchTerm('')}
              style={{
                position: 'absolute',
                right: '12px',
                top: '50%',
                transform: 'translateY(-50%)',
                background: 'none',
                border: 'none',
                color: 'var(--text-muted)',
                cursor: 'pointer',
                padding: '4px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: '50%',
                transition: 'background 0.2s',
                outline: 'none'
              }}
              title="검색어 지우기"
            >
              <X size={14} />
            </button>
          )}
        </div>
        <button type="button" className="btn-category" onClick={() => {
          setSelectedCategory('all');
          setSmartFilter('all');
          setSearchTerm('');
        }}>
          <Menu size={16} />
          <span>카테고리</span>
        </button>
        <select
          className="sort-select"
          value={sortOption}
          onChange={(e) => setSortOption(e.target.value as SortOption)}
          title="정렬 기준"
        >
          <option value="default">기본순</option>
          <option value="price_asc">가격 낮은순</option>
          <option value="price_desc">가격 높은순</option>
        </select>
      </div>

      {/* Smart Nav + Category Chips — one row: recognition-first browsing, no extra scroll chrome */}
      <div className="category-chips">
        <button
          type="button"
          className={`category-chip smart-chip ${smartFilter === 'all' && selectedCategory === 'all' ? 'active' : ''}`}
          onClick={() => { setSmartFilter('all'); setSelectedCategory('all'); }}
        >
          전체
        </button>

        {CATEGORIES.map((cat) => (
          <button
            key={cat.value}
            type="button"
            className={`category-chip ${smartFilter === 'all' && selectedCategory === cat.value ? 'active' : ''}`}
            onClick={() => { setSmartFilter('all'); setSelectedCategory(cat.value); }}
          >
            {cat.label}
          </button>
        ))}

        <span className="chip-divider" aria-hidden="true" />

        <button
          type="button"
          className={`category-chip smart-chip ${smartFilter === 'favorites' ? 'active' : ''}`}
          onClick={() => setSmartFilter('favorites')}
        >
          <Star size={13} /> 즐겨찾기
        </button>
        <button
          type="button"
          className={`category-chip smart-chip ${smartFilter === 'recent' ? 'active' : ''}`}
          onClick={() => setSmartFilter('recent')}
        >
          <Clock size={13} /> 최근
        </button>
        <button
          type="button"
          className={`category-chip smart-chip ${smartFilter === 'bestsellers' ? 'active' : ''}`}
          onClick={() => setSmartFilter('bestsellers')}
        >
          <TrendingUp size={13} /> 인기
        </button>
        <button
          type="button"
          className="category-chip smart-chip smart-chip--reserved"
          disabled
          title="AI 추천 기능은 준비 중입니다"
        >
          <Sparkles size={13} /> AI 추천
        </button>
      </div>

      {/* Products Grid */}
      <div className="products-grid-container" style={{ display: 'flex', flexDirection: 'column' }}>
        {filteredProducts.length === 0 ? (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '80px 20px', color: 'var(--text-muted)' }}>
            <span style={{ fontSize: '48px', marginBottom: '12px' }}>
              {smartFilter === 'favorites' ? '⭐' : smartFilter === 'all' ? '🔍' : '📊'}
            </span>
            <strong style={{ fontSize: '16px', color: 'var(--text-primary)', marginBottom: '4px' }}>{emptyStateText.title}</strong>
            <span style={{ fontSize: '13px' }}>{emptyStateText.desc}</span>
          </div>
        ) : (
          <div className="products-grid">
            {filteredProducts.map((product) => {
              const inCart = isProductInCart(product.id);
              const isFavorite = favoriteIds.has(product.id);

              return (
                <div
                  key={product.id}
                  role="button"
                  tabIndex={0}
                  className={`product-card ${inCart ? 'in-cart' : ''}`}
                  onClick={() => onProductClick(product)}
                  onKeyDown={(e) => handleCardKeyDown(e, product)}
                  title={inCart ? '탭하여 장바구니에서 빼기' : '탭하여 장바구니에 담기'}
                >
                  {/* Product Photo */}
                  <div className="product-image-container">
                    <img
                      src={product.imageUrl || 'https://images.unsplash.com/photo-1509440159596-0249088772ff?auto=format&fit=crop&w=300&q=80'}
                      alt={product.name}
                      className="product-image"
                      loading="lazy"
                    />
                    <button
                      type="button"
                      className={`product-favorite-btn ${isFavorite ? 'active' : ''}`}
                      onClick={(e) => toggleFavorite(e, product.id)}
                      title={isFavorite ? '즐겨찾기 해제' : '즐겨찾기 추가'}
                    >
                      <Star size={15} fill={isFavorite ? 'currentColor' : 'none'} />
                    </button>
                  </div>

                  <div className="product-info">
                    <span className="product-name" title={product.name}>
                      {product.name}
                    </span>
                    <div className="product-price">{product.price.toLocaleString()}원</div>
                  </div>

                  {/* Add affordance — the whole card is the target; this is the recognition cue */}
                  <span className="product-add-badge" aria-hidden="true">
                    {inCart ? <Check size={20} /> : <Plus size={20} />}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default POSGrid;
