import React, { useState } from 'react';
import { Product } from '../types';

interface POSGridProps {
  products: Product[];
  stocks: { [productId: string]: number };
  onProductClick: (product: Product) => void;
}

type CategoryFilter = 'bakery' | 'confectionery' | 'gift' | 'etc';

const CATEGORIES: { value: CategoryFilter; label: string; emoji: string }[] = [
  { value: 'bakery', label: '베이커리', emoji: '🍞' },
  { value: 'confectionery', label: '제과류', emoji: '🍪' },
  { value: 'gift', label: '간식/선물', emoji: '🎁' },
  { value: 'etc', label: '기타', emoji: '🏷️' },
];

const POSGrid: React.FC<POSGridProps> = ({ products, stocks, onProductClick }) => {
  const [selectedCategory, setSelectedCategory] = useState<CategoryFilter>('bakery');

  const filteredProducts = products.filter(p => {
    if (selectedCategory === 'bakery') {
      return p.category === 'bakery' && p.name.includes('빵');
    }
    if (selectedCategory === 'confectionery') {
      return p.category === 'bakery' && (
        p.name.includes('쿠키') || 
        p.name.includes('머핀') || 
        p.name.includes('카스테라') || 
        p.name.includes('마들렌')
      );
    }
    if (selectedCategory === 'gift') {
      return p.category === 'food';
    }
    if (selectedCategory === 'etc') {
      return p.category === 'etc';
    }
    return false;
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', height: '100%', overflow: 'hidden' }}>
      {/* Category Tabs */}
      <div className="category-tabs">
        {CATEGORIES.map((cat) => (
          <button
            key={cat.value}
            className={`category-tab ${selectedCategory === cat.value ? 'active' : ''}`}
            onClick={() => setSelectedCategory(cat.value)}
          >
            <span>{cat.emoji}</span>
            <span>{cat.label}</span>
          </button>
        ))}
      </div>

      {/* Products Grid */}
      <div className="products-grid-container">
        <div className="products-grid">
          {filteredProducts.map((product) => {
            const stock = stocks[product.id] ?? 0;
            const isOutOfStock = stock <= 0;
            const isLowStock = stock <= 5;
            
            let stockColor = 'var(--text-secondary)';
            if (isOutOfStock) {
              stockColor = '#ef4444'; // Red
            } else if (isLowStock) {
              stockColor = '#f59e0b'; // Orange
            }

            return (
              <button
                key={product.id}
                className="product-card"
                onClick={() => !isOutOfStock && onProductClick(product)}
                disabled={isOutOfStock}
                style={{ 
                  '--accent-color': product.color,
                  opacity: isOutOfStock ? 0.5 : 1,
                  cursor: isOutOfStock ? 'not-allowed' : 'pointer'
                } as React.CSSProperties}
              >
                <div className="product-emoji">{product.emoji}</div>
                <div className="product-info">
                  <div className="product-name">{product.name}</div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                    <div className="product-price">{product.price.toLocaleString()}원</div>
                    <div style={{ fontSize: '11px', fontWeight: 'bold', color: stockColor, whiteSpace: 'nowrap' }}>
                      재고 {stock}개
                    </div>
                  </div>
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
