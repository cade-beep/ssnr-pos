import React, { useState, useEffect, useMemo } from 'react';
import { Product, CartItem, normalizeCategory } from '../types';
import { supabase } from '../supabase';
import { Search, X, Star, Clock, TrendingUp, ArrowUpDown, LayoutGrid, Grid3X3 } from 'lucide-react';
import { matchProductSearch } from '../utils/hangul';

interface POSGridProps {
  products: Product[];
  onProductClick: (product: Product) => void;
  onQuickAdd: (product: Product) => void;
  cart?: CartItem[];
}

type SmartFilter = 'all' | 'favorites' | 'recent' | 'bestsellers';
type SortOption = 'default' | 'price_asc' | 'price_desc';
type GridDensity = 'compact' | 'comfortable';

const getCategoryLabel = (canonicalCat: string): string => {
  if (canonicalCat === 'bakery') return '빵';
  if (canonicalCat === 'food') return '선물세트';
  if (canonicalCat === 'etc') return '기타';
  if (canonicalCat === 'all' || canonicalCat === '전체') return '전체';
  return canonicalCat;
};

const CATEGORY_ORDER: Record<string, number> = {
  bakery: 1,
  food: 2,
  etc: 3
};

const FAVORITES_STORAGE_KEY = 'ssnr_pos_favorite_products';
const DENSITY_STORAGE_KEY = 'ssnr_pos_grid_density_v2';
const SALES_INSIGHT_LOOKBACK_DAYS = 30;
const SALES_INSIGHT_ROW_LIMIT = 1000;

const POSGrid: React.FC<POSGridProps> = ({ products, onProductClick, onQuickAdd, cart = [] }) => {
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [smartFilter, setSmartFilter] = useState<SmartFilter>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [sortOption, setSortOption] = useState<SortOption>('default');
  const [density, setDensity] = useState<GridDensity>(() => {
    try {
      const saved = localStorage.getItem(DENSITY_STORAGE_KEY);
      return (saved === 'comfortable' || saved === 'compact') ? saved : 'comfortable';
    } catch {
      return 'comfortable';
    }
  });

  const productCategories = useMemo(() => {
    const canonicalSet = new Set<string>();
    for (const p of products) {
      const canonical = normalizeCategory(p.category, p.name);
      if (canonical) {
        canonicalSet.add(canonical);
      }
    }

    return Array.from(canonicalSet).sort((a, b) => {
      const orderA = CATEGORY_ORDER[a] ?? 99;
      const orderB = CATEGORY_ORDER[b] ?? 99;
      if (orderA !== orderB) return orderA - orderB;
      return a.localeCompare(b, 'ko');
    });
  }, [products]);

  useEffect(() => {
    if (
      selectedCategory !== 'all' &&
      selectedCategory !== '전체' &&
      !productCategories.includes(selectedCategory)
    ) {
      setSelectedCategory('all');
    }
  }, [selectedCategory, productCategories]);

  const handleToggleDensity = (mode: GridDensity) => {
    setDensity(mode);
    try {
      localStorage.setItem(DENSITY_STORAGE_KEY, mode);
    } catch (e) {
      console.error(e);
    }
  };

  const [bestSellerIds, setBestSellerIds] = useState<string[]>([]);
  const [recentSoldIds, setRecentSoldIds] = useState<string[]>([]);

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
        console.error('Failed to load sales insight:', err);
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
    if (e.key === ' ' || e.key === 'Spacebar') {
      e.preventDefault();
      onProductClick(product);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      onProductClick(product);
    }
  };

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (filteredProducts.length > 0) {
        onQuickAdd(filteredProducts[0]);
        setSearchTerm('');
      }
    }
  };

  const bestSellerRank = useMemo(
    () => new Map(bestSellerIds.map((id, idx) => [id, idx])),
    [bestSellerIds]
  );

  const recentSoldRank = useMemo(
    () => new Map(recentSoldIds.map((id, idx) => [id, idx])),
    [recentSoldIds]
  );

  const cartQuantityMap = useMemo(() => {
    const quantityMap = new Map<string, number>();
    for (const item of cart) {
      if (!item?.product?.id) continue;
      const productId = item.product.id;
      const previousQuantity = quantityMap.get(productId) ?? 0;
      quantityMap.set(productId, previousQuantity + (item.quantity || 0));
    }
    return quantityMap;
  }, [cart]);

  const filteredProducts = useMemo(() => {
    const list = products.filter((p) => {
      if (searchTerm.trim() !== '') {
        if (!matchProductSearch(p, searchTerm)) {
          return false;
        }
      }

      if (smartFilter === 'favorites') return favoriteIds.has(p.id);
      if (smartFilter === 'bestsellers') return bestSellerRank.has(p.id);
      if (smartFilter === 'recent') return recentSoldRank.has(p.id);

      if (selectedCategory === 'all' || selectedCategory === '전체') return true;
      return normalizeCategory(p.category, p.name) === selectedCategory;
    });

    if (sortOption === 'price_asc') {
      list.sort((a, b) => a.price - b.price);
    } else if (sortOption === 'price_desc') {
      list.sort((a, b) => b.price - a.price);
    } else if (smartFilter === 'bestsellers') {
      list.sort((a, b) => (bestSellerRank.get(a.id) ?? 0) - (bestSellerRank.get(b.id) ?? 0));
    } else if (smartFilter === 'recent') {
      list.sort((a, b) => (recentSoldRank.get(a.id) ?? 0) - (recentSoldRank.get(b.id) ?? 0));
    } else {
      list.sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true, sensitivity: 'base' }));
    }

    return list;
  }, [
    products,
    searchTerm,
    smartFilter,
    selectedCategory,
    favoriteIds,
    bestSellerRank,
    recentSoldRank,
    sortOption
  ]);

  return (
    <div className="sales-workspace">
      <header className="sales-header">
        <div className="sales-title-box">
          <h1 className="sales-title">새 주문</h1>
          <span className="sales-status-tag">판매 대기</span>
        </div>

        <div className="search-bar-wrap">
          <div className="search-bar-icon" aria-hidden="true">
            <Search size={19} />
          </div>
          <input
            type="text"
            className="search-bar-input"
            placeholder="상품명 · 바코드 검색  |  F1"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            onKeyDown={handleSearchKeyDown}
            aria-label="상품명 또는 바코드 검색"
          />
          {searchTerm && (
            <button
              type="button"
              className="search-bar-clear"
              onClick={() => setSearchTerm('')}
              title="검색어 지우기"
              aria-label="검색어 초기화"
            >
              <X size={15} />
            </button>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {/* Density Toggle (기본 3열 vs 작게 4열) */}
          <div className="density-toggle-group" role="group" aria-label="카드 크기 보기 전환">
            <button
              type="button"
              className={`density-btn ${density === 'comfortable' ? 'active' : ''}`}
              onClick={() => handleToggleDensity('comfortable')}
              title="기본 보기 (3열)"
              aria-label="기본 보기 (3열)"
            >
              <LayoutGrid size={16} />
              <span>기본</span>
            </button>
            <button
              type="button"
              className={`density-btn ${density === 'compact' ? 'active' : ''}`}
              onClick={() => handleToggleDensity('compact')}
              title="작게 보기 (4열)"
              aria-label="작게 보기 (4열)"
            >
              <Grid3X3 size={16} />
              <span>작게</span>
            </button>
          </div>

          <div className="sales-sort-wrap">
            <ArrowUpDown size={15} className="sort-icon" aria-hidden="true" />
            <select
              className="sales-sort-select"
              value={sortOption}
              onChange={(e) => setSortOption(e.target.value as SortOption)}
              aria-label="상품 정렬 기준"
            >
              <option value="default">기본순</option>
              <option value="price_asc">낮은 가격순</option>
              <option value="price_desc">높은 가격순</option>
            </select>
          </div>
        </div>
      </header>

      <nav className="category-bar" aria-label="상품 카테고리 및 필터">
        <div className="category-group main-cats">
          <button
            type="button"
            className={`cat-btn ${smartFilter === 'all' && (selectedCategory === 'all' || selectedCategory === '전체') ? 'selected' : ''}`}
            onClick={() => {
              setSmartFilter('all');
              setSelectedCategory('all');
            }}
            aria-pressed={smartFilter === 'all' && (selectedCategory === 'all' || selectedCategory === '전체')}
          >
            전체
          </button>
          {productCategories.map((cat) => {
            const isSelected = smartFilter === 'all' && selectedCategory === cat;
            return (
              <button
                key={cat}
                type="button"
                className={`cat-btn ${isSelected ? 'selected' : ''}`}
                onClick={() => {
                  setSmartFilter('all');
                  setSelectedCategory(cat);
                }}
                aria-pressed={isSelected}
              >
                {getCategoryLabel(cat)}
              </button>
            );
          })}
        </div>

        <div className="category-divider" aria-hidden="true" />

        <div className="category-group quick-filters">
          <button
            type="button"
            className={`cat-btn quick-btn ${smartFilter === 'favorites' ? 'selected' : ''}`}
            onClick={() => setSmartFilter('favorites')}
            aria-pressed={smartFilter === 'favorites'}
          >
            <Star size={14} />
            <span>즐겨찾기</span>
          </button>
          <button
            type="button"
            className={`cat-btn quick-btn ${smartFilter === 'recent' ? 'selected' : ''}`}
            onClick={() => setSmartFilter('recent')}
            aria-pressed={smartFilter === 'recent'}
          >
            <Clock size={14} />
            <span>최근</span>
          </button>
          <button
            type="button"
            className={`cat-btn quick-btn ${smartFilter === 'bestsellers' ? 'selected' : ''}`}
            onClick={() => setSmartFilter('bestsellers')}
            aria-pressed={smartFilter === 'bestsellers'}
          >
            <TrendingUp size={14} />
            <span>인기</span>
          </button>
        </div>
      </nav>

      <main className="product-grid-scroll">
        {filteredProducts.length === 0 ? (
          <div className="product-empty-state">
            <span className="empty-icon">🔍</span>
            <p className="empty-title">일치하는 상품이 없습니다</p>
            <p className="empty-desc">다른 상품명, 초성(예: ㄷㅍ) 또는 바코드를 입력해 주세요.</p>
          </div>
        ) : (
          <div className={`product-grid ${density}`}>
            {filteredProducts.map((product) => {
              const cartQty = cartQuantityMap.get(product.id) ?? 0;
              const inCart = cartQty > 0;
              const isFavorite = favoriteIds.has(product.id);

              return (
                <div
                  key={product.id}
                  role="button"
                  tabIndex={0}
                  className={`product-card ${inCart ? 'in-cart' : ''} ${density}`}
                  onClick={() => onProductClick(product)}
                  onKeyDown={(e) => handleCardKeyDown(e, product)}
                  aria-label={`${product.name}, 가격 ${product.price.toLocaleString()}원${inCart ? `, 장바구니 ${cartQty}개 담김` : ''}`}
                >
                  <button
                    type="button"
                    className={`card-favorite-btn ${isFavorite ? 'active' : ''}`}
                    onClick={(e) => toggleFavorite(e, product.id)}
                    title={isFavorite ? '즐겨찾기 해제' : '즐겨찾기 추가'}
                    aria-label={isFavorite ? `${product.name} 즐겨찾기 해제` : `${product.name} 즐겨찾기 추가`}
                  >
                    <Star size={15} fill={isFavorite ? '#F59E0B' : 'none'} stroke={isFavorite ? '#F59E0B' : 'currentColor'} />
                  </button>

                  <div className="card-image-wrap">
                    {product.imageUrl ? (
                      <img
                        src={product.imageUrl}
                        alt=""
                        className="card-image"
                        loading="lazy"
                      />
                    ) : (
                      <div className="card-image-emoji">
                        {product.emoji || '🍞'}
                      </div>
                    )}
                  </div>

                  <div className="card-body">
                    <div className="card-name-row">
                      <span className="card-name" title={product.name}>
                        {product.name}
                      </span>
                      {inCart && (
                        <span
                          className="card-qty-badge"
                          aria-label={`장바구니 수량 ${cartQty}개`}
                        >
                          {cartQty}
                        </span>
                      )}
                    </div>
                    <div className="card-price-row">
                      <span className="card-price">
                        {product.price.toLocaleString()}<span className="currency-unit">원</span>
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
};

export default POSGrid;
