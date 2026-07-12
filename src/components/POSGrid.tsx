import React, { useState } from 'react';
import { Product, CartItem } from '../types';
import { Search, Menu } from 'lucide-react';

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
        <div className="search-container">
          <div className="search-icon-wrapper">
            <Search size={18} />
          </div>
          <input
            type="text"
            className="search-input"
            placeholder="상품명, 바코드 검색"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
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
      <div className="products-grid-container">
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
                  boxShadow: inCart ? '0 0 0 2px rgba(26, 100, 244, 0.08)' : 'var(--shadow-sm)'
                }}
              >
                {/* Product Photo */}
                <div className="product-image-container">
                  <img
                    src={product.imageUrl || 'https://images.unsplash.com/photo-1509440159596-0249088772ff?auto=format&fit=crop&w=300&q=80'}
                    alt={product.name}
                    className="product-image"
                    loading="lazy"
                  />
                </div>

                <div className="product-info">
                  <div className="product-name">{product.name}</div>
                  <div className="product-price">{product.price.toLocaleString()}원</div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default POSGrid;
