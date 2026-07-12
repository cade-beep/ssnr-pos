import React, { useState } from 'react';
import { Product, CartItem } from '../types';

interface POSGridProps {
  products: Product[];
  onProductClick: (product: Product) => void;
  cart?: CartItem[];
}

type CategoryFilter = 'bakery' | 'cookies' | 'gift' | 'etc';

const CATEGORIES: { value: CategoryFilter; label: string }[] = [
  { value: 'bakery', label: 'Bakery' },
  { value: 'cookies', label: 'Cookies' },
  { value: 'gift', label: 'Gift Sets' },
  { value: 'etc', label: 'Others' },
];

const POSGrid: React.FC<POSGridProps> = ({ products, onProductClick, cart = [] }) => {
  const [selectedCategory, setSelectedCategory] = useState<CategoryFilter>('bakery');

  const filteredProducts = products.filter(p => {
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

  const getCategoryLabel = (category: string, name: string) => {
    if (category === 'bakery' && name.includes('빵')) return 'Bakery';
    if (category === 'bakery' && !name.includes('빵')) return 'Cookie';
    if (category === 'food') return 'Gift Set';
    return 'Other';
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', height: '100%', overflow: 'hidden' }}>
      {/* Category Tabs */}
      <div className="category-tabs">
        {CATEGORIES.map((cat) => (
          <button
            key={cat.value}
            type="button"
            className={`category-tab ${selectedCategory === cat.value ? 'active' : ''}`}
            onClick={() => setSelectedCategory(cat.value)}
          >
            <span>{cat.label}</span>
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
                  boxShadow: inCart ? '0 0 0 2px var(--primary-glow), var(--shadow-md)' : 'var(--shadow-sm)',
                  background: inCart ? '#f8faff' : 'var(--bg-card)'
                }}
              >
                {/* Product Photo Container */}
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
                  <span className="product-category-label">
                    {getCategoryLabel(product.category, product.name)}
                  </span>
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
