import React, { useState } from 'react';
import { Product, CartItem } from '../types';
import { Search, Menu, X } from 'lucide-react';

interface POSGridProps {
  products: Product[];
  onProductClick: (product: Product) => void;
  cart?: CartItem[];
}

type CategoryFilter = 'all' | 'bakery' | 'cookies' | 'gift' | 'etc';

const CATEGORIES: { value: CategoryFilter; label: string }[] = [
  { value: 'all', label: '전체' },
  { value: 'bakery', label: '베이커리' },
  { value: 'cookies', label: '쿠키/제과' },
  { value: 'gift', label: '선물세트' },
  { value: 'etc', label: '기타' },
];

const POSGrid: React.FC<POSGridProps> = ({ products, onProductClick, cart = [] }) => {
  const [selectedCategory, setSelectedCategory] = useState<CategoryFilter>('all');
  const [searchTerm, setSearchTerm] = useState('');

  const filteredProducts = products.filter(p => {
    // Search Term Filter
    if (searchTerm.trim() !== '') {
      const term = searchTerm.toLowerCase();
      if (!p.name.toLowerCase().includes(term)) {
        return false;
      }
    }

    // Category Filter
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

  const isProductInCart = (productId: string) => {
    return cart.some(item => item.product.id === productId);
  };

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
          setSearchTerm('');
        }}>
          <Menu size={16} />
          <span>카테고리</span>
        </button>
      </div>

      {/* Category Tabs / Chips */}
      <div className="category-chips">
        {CATEGORIES.map((cat) => (
          <button
            key={cat.value}
            type="button"
            className={`category-chip ${selectedCategory === cat.value ? 'active' : ''}`}
            onClick={() => setSelectedCategory(cat.value)}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* Products Grid */}
      <div className="products-grid-container" style={{ display: 'flex', flexDirection: 'column' }}>
        {filteredProducts.length === 0 ? (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '80px 20px', color: 'var(--text-muted)' }}>
            <span style={{ fontSize: '48px', marginBottom: '12px' }}>🔍</span>
            <strong style={{ fontSize: '16px', color: 'var(--text-primary)', marginBottom: '4px' }}>일치하는 상품이 없습니다</strong>
            <span style={{ fontSize: '13px' }}>다른 검색어를 입력하시거나 카테고리를 확인해 주세요.</span>
          </div>
        ) : (
          <div className="products-grid">
            {filteredProducts.map((product) => {
              const inCart = isProductInCart(product.id);

              return (
                <button
                  key={product.id}
                  type="button"
                  className="product-card"
                  onClick={() => onProductClick(product)}
                  style={{
                    borderColor: inCart ? 'var(--primary)' : 'var(--border-color)',
                    boxShadow: inCart ? '0 0 0 2px rgba(26, 100, 244, 0.08)' : 'var(--shadow-sm)',
                    position: 'relative',
                    cursor: 'pointer'
                  }}
                >
                  {/* Product Photo */}
                  <div className="product-image-container" style={{ position: 'relative' }}>
                    <img
                      src={product.imageUrl || 'https://images.unsplash.com/photo-1509440159596-0249088772ff?auto=format&fit=crop&w=300&q=80'}
                      alt={product.name}
                      className="product-image"
                      loading="lazy"
                    />
                  </div>

                  <div className="product-info">
                    <div className="product-name" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span>{product.name}</span>
                      {product.emoji && <span>{product.emoji}</span>}
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '4px' }}>
                      <div className="product-price">{product.price.toLocaleString()}원</div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default POSGrid;
