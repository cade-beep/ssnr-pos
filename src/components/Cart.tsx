import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { CartItem } from '../types';
import { Plus, Minus, RotateCcw, X } from 'lucide-react';

interface CartProps {
  items: CartItem[];
  totalAmount: number;
  discountAmount: number;
  cartDiscountPercent: number;
  cartDiscountAmount: number;
  itemDiscountAmount: number;
  onIncrease: (productId: string) => void;
  onDecrease: (productId: string) => void;
  onDelete: (productId: string) => void;
  onClear: () => void;
  onCheckout: () => void;
  onViewHistory: () => void;
  historyCount: number;
  onApplyDiscount: (percent: number) => void;
  onApplyItemDiscount: (productId: string, amount: number, qty: number, isPercent?: boolean, percentVal?: number) => void;
  onSetQuantity: (productId: string, quantity: number) => void;
}

const Cart: React.FC<CartProps> = ({
  items,
  totalAmount,
  discountAmount,
  cartDiscountPercent,
  cartDiscountAmount,
  itemDiscountAmount,
  onIncrease,
  onDecrease,
  onDelete,
  onClear,
  onCheckout,
  onViewHistory,
  historyCount,
  onApplyDiscount,
  onApplyItemDiscount,
  onSetQuantity,
}) => {
  // Modal Visibility States
  const [isCartDiscountOpen, setIsCartDiscountOpen] = useState(false);
  const [isItemDiscountOpen, setIsItemDiscountOpen] = useState(false);
  const [isStackingOpen, setIsStackingOpen] = useState(false);

  // Focus Items
  const [selectedItem, setSelectedItem] = useState<CartItem | null>(null);
  const [pendingCartPercent, setPendingCartPercent] = useState<number>(0);

  // Input states
  const [customCartPercent, setCustomCartPercent] = useState('');
  const [customItemPercent, setCustomItemPercent] = useState('');

  // ESC key listener to close active modals
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsCartDiscountOpen(false);
        setIsItemDiscountOpen(false);
        setIsStackingOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Bypass unused variable check for props not rendered in Toss UI
  if (false as boolean) {
    console.log(onViewHistory, historyCount, discountAmount);
  }

  const originalSubtotal = items.reduce((sum, item) => sum + (item.product.price * item.quantity), 0);

  // Helper to retrieve calculated unit and total discount for visual rendering
  const getItemDiscountDetails = (item: CartItem) => {
    if (item.discountPercent && item.discountPercent > 0) {
      const pct = Math.min(100, Math.max(0, item.discountPercent));
      const unitDiscount = Math.round(item.product.price * (pct / 100));
      return {
        unitDiscount,
        totalDiscount: unitDiscount * item.quantity,
        percent: pct,
        isPercent: true
      };
    } else if (item.discount && item.discount > 0) {
      const qty = item.discountQty ?? item.quantity;
      return {
        unitDiscount: item.discount,
        totalDiscount: item.discount * qty,
        percent: 0,
        isPercent: false
      };
    }
    return {
      unitDiscount: 0,
      totalDiscount: 0,
      percent: 0,
      isPercent: false
    };
  };

  // Cart-wide discount handler
  const requestCartDiscount = (percent: number) => {
    const cleanPercent = Math.min(100, Math.max(0, percent));
    setIsCartDiscountOpen(false);

    // Check if any cart item already has an item discount
    const hasItemDiscount = items.some(item => {
      const info = getItemDiscountDetails(item);
      return info.totalDiscount > 0;
    });

    if (cleanPercent > 0 && hasItemDiscount) {
      setPendingCartPercent(cleanPercent);
      setIsStackingOpen(true);
    } else {
      onApplyDiscount(cleanPercent);
    }
  };

  const handleCustomCartDiscountSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = parseInt(customCartPercent, 10);
    if (!isNaN(parsed) && parsed >= 0 && parsed <= 100) {
      requestCartDiscount(parsed);
    }
    setCustomCartPercent('');
  };

  // Stacking Modal Actions
  const handleStackingApplyBoth = () => {
    onApplyDiscount(pendingCartPercent);
    setIsStackingOpen(false);
  };

  const handleStackingReplace = () => {
    // Clear all individual item discounts
    items.forEach(item => {
      onApplyItemDiscount(item.product.id, 0, 0, false, 0);
    });
    onApplyDiscount(pendingCartPercent);
    setIsStackingOpen(false);
  };

  const handleStackingCancel = () => {
    setIsStackingOpen(false);
  };

  // Item discount handlers
  const openItemDiscountModal = (item: CartItem) => {
    setSelectedItem(item);
    setCustomItemPercent('');
    setIsItemDiscountOpen(true);
  };

  const applyItemDiscount = (percent: number) => {
    if (!selectedItem) return;
    const cleanPercent = Math.min(100, Math.max(0, percent));
    if (cleanPercent > 0) {
      const calculatedAmt = Math.round(selectedItem.product.price * (cleanPercent / 100));
      onApplyItemDiscount(selectedItem.product.id, calculatedAmt, selectedItem.quantity, true, cleanPercent);
    } else {
      onApplyItemDiscount(selectedItem.product.id, 0, 0, false, 0);
    }
    setIsItemDiscountOpen(false);
    setSelectedItem(null);
  };

  const handleCustomItemDiscountSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = parseInt(customItemPercent, 10);
    if (!isNaN(parsed) && parsed >= 0 && parsed <= 100) {
      applyItemDiscount(parsed);
    }
    setCustomItemPercent('');
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Cart Header */}
      <div className="cart-header">
        <h2>장바구니</h2>
        {items.length > 0 && (
          <button type="button" className="clear-cart-btn" onClick={onClear}>
            <RotateCcw size={12} />
            <span>전체 삭제</span>
          </button>
        )}
      </div>

      {/* Cart Items List */}
      <div className="cart-items-list" style={{ flex: 1, overflowY: 'auto', padding: '12px 16px' }}>
        {items.length === 0 ? (
          <div className="cart-empty">
            <span className="cart-empty-icon">🛒</span>
            <div className="cart-empty-text">선택된 상품이 없습니다.</div>
          </div>
        ) : (
          items.map((item) => {
            const discInfo = getItemDiscountDetails(item);
            const isDiscounted = discInfo.totalDiscount > 0;
            const finalItemPrice = item.product.price - discInfo.unitDiscount;

            return (
              <div key={item.product.id} className="cart-item" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid var(--border-color)' }}>
                <div 
                  className="cart-item-details" 
                  onClick={() => openItemDiscountModal(item)}
                  style={{ cursor: 'pointer', flex: 1, paddingRight: '8px' }}
                  title="클릭하여 품목 할인 설정"
                >
                  <div className="cart-item-name" style={{ fontWeight: '600', fontSize: '14.5px', color: 'var(--text-primary)', marginBottom: '4px' }}>{item.product.name}</div>
                  <div className="cart-item-price" style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                    {isDiscounted ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{ textDecoration: 'line-through', opacity: 0.5 }}>
                            {item.product.price.toLocaleString()}원
                          </span>
                          <span style={{ color: '#ef4444', fontWeight: '800', fontSize: '11px' }}>
                            {discInfo.percent > 0 ? `${discInfo.percent}% OFF` : '할인 적용'}
                          </span>
                        </div>
                        <span style={{ fontWeight: '700', color: 'var(--primary)', fontSize: '13.5px' }}>
                          {finalItemPrice.toLocaleString()}원
                        </span>
                      </div>
                    ) : (
                      <span>{item.product.price.toLocaleString()}원</span>
                    )}
                  </div>
                </div>
                
                <div className="cart-item-controls" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <button
                    type="button"
                    className="quantity-btn"
                    onClick={() => onDecrease(item.product.id)}
                    style={{ width: '28px', height: '28px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
                  >
                    <Minus size={12} />
                  </button>
                  <span 
                    className="cart-item-quantity"
                    onClick={() => {
                      const newQtyInput = window.prompt(`[${item.product.name}] 구매 수량을 변경해 주세요 (직접 입력):`, String(item.quantity));
                      if (newQtyInput !== null) {
                        const parsed = parseInt(newQtyInput, 10);
                        if (!isNaN(parsed) && parsed >= 0) {
                          onSetQuantity(item.product.id, parsed);
                        }
                      }
                    }}
                    style={{ cursor: 'pointer', textDecoration: 'underline dotted', minWidth: '20px', textAlign: 'center', fontSize: '14px', fontWeight: '600' }}
                    title="클릭하여 수량 직접 입력"
                  >
                    {item.quantity}
                  </span>
                  <button
                    type="button"
                    className="quantity-btn"
                    onClick={() => onIncrease(item.product.id)}
                    style={{ width: '28px', height: '28px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
                  >
                    <Plus size={12} />
                  </button>
                </div>

                <div className="cart-item-total" style={{ fontWeight: '700', fontSize: '15px', minWidth: '70px', textAlign: 'right', color: 'var(--text-primary)' }}>
                  {((isDiscounted ? finalItemPrice : item.product.price) * item.quantity).toLocaleString()}원
                </div>

                <button
                  type="button"
                  className="delete-item-btn"
                  onClick={() => onDelete(item.product.id)}
                  title="상품 삭제"
                  style={{ marginLeft: '12px', border: 'none', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer' }}
                >
                  <X size={16} />
                </button>
              </div>
            );
          })
        )}
      </div>

      {/* Cart Summary & Footer Controls */}
      <div className="cart-footer" style={{ borderTop: '1px solid var(--border-color)', padding: '16px', background: '#f8fafc' }}>
        <div className="summary-row" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '13.5px', color: 'var(--text-secondary)' }}>
          <span>상품 금액</span>
          <span>{originalSubtotal.toLocaleString()}원</span>
        </div>
        
        {itemDiscountAmount > 0 && (
          <div className="summary-row" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '13.5px', color: '#ef4444', fontWeight: '500' }}>
            <span>품목 할인 합계</span>
            <span>- {itemDiscountAmount.toLocaleString()}원</span>
          </div>
        )}

        <div 
          className="summary-row" 
          style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '14px', fontSize: '13.5px', color: cartDiscountAmount > 0 ? '#ef4444' : 'var(--text-secondary)', fontWeight: cartDiscountAmount > 0 ? '600' : 'normal' }}
        >
          <span>전체 할인</span>
          <span>
            {cartDiscountAmount > 0 
              ? `${cartDiscountPercent}% 할인 적용` 
              : '할인 없음'}
          </span>
        </div>

        <div className="summary-row total" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px dashed #cbd5e1', paddingTop: '14px', marginBottom: '16px' }}>
          <span style={{ fontWeight: '700', fontSize: '15.5px', color: 'var(--text-primary)' }}>총 결제 금액</span>
          <span className="total-price" style={{ fontWeight: '800', fontSize: '24px', color: 'var(--primary)' }}>
            {totalAmount.toLocaleString()}원
          </span>
        </div>

        <div className="action-buttons">
          <button
            type="button"
            className="btn-discount"
            onClick={() => setIsCartDiscountOpen(true)}
            disabled={items.length === 0}
          >
            🏷️ 할인 적용
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={onCheckout}
            disabled={items.length === 0}
            style={{ width: '100%', height: '52px', borderRadius: '12px', fontSize: '16px', fontWeight: '700', border: 'none', background: 'var(--primary)', color: '#ffffff', cursor: items.length === 0 ? 'not-allowed' : 'pointer' }}
          >
            결제하기
          </button>
        </div>
      </div>

      {/* Cart Discount Modal */}
      {isCartDiscountOpen && createPortal(
        <div 
          className="modal-overlay" 
          onClick={() => setIsCartDiscountOpen(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1200 }}
        >
          <div 
            className="modal-content" 
            onClick={(e) => e.stopPropagation()}
            style={{ background: '#ffffff', borderRadius: '20px', maxWidth: '380px', width: '90%', padding: '24px', boxShadow: '0 10px 25px rgba(0,0,0,0.1)' }}
          >
            <div className="modal-header" style={{ marginBottom: '18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ fontSize: '17px', fontWeight: '800', color: 'var(--text-primary)' }}>🏷️ 전체 할인 설정</h3>
              <button type="button" onClick={() => setIsCartDiscountOpen(false)} style={{ border: 'none', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer' }}>
                <X size={18} />
              </button>
            </div>
            
            {/* Quick Percentage Buttons */}
            <div style={{ marginBottom: '20px' }}>
              <div style={{ fontSize: '12.5px', color: 'var(--text-secondary)', marginBottom: '8px', fontWeight: '600' }}>할인율 (%) 선택</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px' }}>
                {[5, 10, 20, 30].map((pct) => (
                  <button
                    key={pct}
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => requestCartDiscount(pct)}
                    style={{ padding: '10px 0', fontSize: '13.5px', borderRadius: '10px', cursor: 'pointer', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', fontWeight: '600', color: 'var(--text-primary)' }}
                  >
                    {pct}%
                  </button>
                ))}
              </div>
            </div>

            {/* Custom Percentage Form */}
            <form onSubmit={handleCustomCartDiscountSubmit} style={{ marginBottom: '20px' }}>
              <div style={{ fontSize: '12.5px', color: 'var(--text-secondary)', marginBottom: '8px', fontWeight: '600' }}>할인율 직접 입력 (%)</div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  type="number"
                  placeholder="0~100"
                  value={customCartPercent}
                  onChange={(e) => setCustomCartPercent(e.target.value)}
                  style={{
                    flex: 1,
                    padding: '12px',
                    borderRadius: '10px',
                    border: '1px solid var(--border-color)',
                    background: 'var(--bg-primary)',
                    color: 'var(--text-primary)',
                    fontSize: '14px',
                    outline: 'none'
                  }}
                  min="0"
                  max="100"
                />
                <button type="submit" className="btn btn-primary" style={{ padding: '0 20px', borderRadius: '10px', width: 'auto', background: 'var(--primary)', border: 'none', color: '#ffffff', fontWeight: '600', cursor: 'pointer' }}>
                  적용
                </button>
              </div>
            </form>

            {/* Reset Button */}
            <div style={{ display: 'flex', gap: '8px', borderTop: '1px solid var(--border-color)', paddingTop: '16px' }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => requestCartDiscount(0)}
                style={{ flex: 1, borderRadius: '10px', padding: '12px', cursor: 'pointer', background: '#f1f5f9', border: 'none', fontWeight: '600', color: '#64748b' }}
              >
                할인 적용 해제
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Item Discount Modal */}
      {isItemDiscountOpen && selectedItem && createPortal(
        <div 
          className="modal-overlay" 
          onClick={() => setIsItemDiscountOpen(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1200 }}
        >
          <div 
            className="modal-content" 
            onClick={(e) => e.stopPropagation()}
            style={{ background: '#ffffff', borderRadius: '20px', maxWidth: '380px', width: '90%', padding: '24px', boxShadow: '0 10px 25px rgba(0,0,0,0.1)' }}
          >
            <div className="modal-header" style={{ marginBottom: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ fontSize: '17px', fontWeight: '800', color: 'var(--text-primary)' }}>🏷️ 품목 개별 할인 설정</h3>
              <button type="button" onClick={() => setIsItemDiscountOpen(false)} style={{ border: 'none', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer' }}>
                <X size={18} />
              </button>
            </div>
            
            <div style={{ fontSize: '13.5px', color: 'var(--text-secondary)', marginBottom: '18px' }}>
              <strong>{selectedItem.product.name}</strong> (정가: {selectedItem.product.price.toLocaleString()}원)
            </div>

            {/* Quick Percentage Buttons */}
            <div style={{ marginBottom: '20px' }}>
              <div style={{ fontSize: '12.5px', color: 'var(--text-secondary)', marginBottom: '8px', fontWeight: '600' }}>할인율 (%) 선택</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px' }}>
                {[5, 10, 20, 30].map((pct) => (
                  <button
                    key={pct}
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => applyItemDiscount(pct)}
                    style={{ padding: '10px 0', fontSize: '13.5px', borderRadius: '10px', cursor: 'pointer', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', fontWeight: '600', color: 'var(--text-primary)' }}
                  >
                    {pct}%
                  </button>
                ))}
              </div>
            </div>

            {/* Custom Percentage Form */}
            <form onSubmit={handleCustomItemDiscountSubmit} style={{ marginBottom: '20px' }}>
              <div style={{ fontSize: '12.5px', color: 'var(--text-secondary)', marginBottom: '8px', fontWeight: '600' }}>할인율 직접 입력 (%)</div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  type="number"
                  placeholder="0~100"
                  value={customItemPercent}
                  onChange={(e) => setCustomItemPercent(e.target.value)}
                  style={{
                    flex: 1,
                    padding: '12px',
                    borderRadius: '10px',
                    border: '1px solid var(--border-color)',
                    background: 'var(--bg-primary)',
                    color: 'var(--text-primary)',
                    fontSize: '14px',
                    outline: 'none'
                  }}
                  min="0"
                  max="100"
                />
                <button type="submit" className="btn btn-primary" style={{ padding: '0 20px', borderRadius: '10px', width: 'auto', background: 'var(--primary)', border: 'none', color: '#ffffff', fontWeight: '600', cursor: 'pointer' }}>
                  적용
                </button>
              </div>
            </form>

            {/* Reset Button */}
            <div style={{ display: 'flex', gap: '8px', borderTop: '1px solid var(--border-color)', paddingTop: '16px' }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => applyItemDiscount(0)}
                style={{ flex: 1, borderRadius: '10px', padding: '12px', cursor: 'pointer', background: '#f1f5f9', border: 'none', fontWeight: '600', color: '#64748b' }}
              >
                할인 적용 해제
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Stacking Confirmation Modal */}
      {isStackingOpen && createPortal(
        <div 
          className="modal-overlay" 
          onClick={() => setIsStackingOpen(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1300 }}
        >
          <div 
            className="modal-content" 
            onClick={(e) => e.stopPropagation()}
            style={{ background: '#ffffff', borderRadius: '20px', maxWidth: '400px', width: '90%', padding: '24px', boxShadow: '0 10px 25px rgba(0,0,0,0.2)' }}
          >
            <div className="modal-header" style={{ marginBottom: '14px' }}>
              <h3 style={{ fontSize: '17px', fontWeight: '800', color: 'var(--text-primary)' }}>Apply additional discount?</h3>
            </div>
            
            <div style={{ fontSize: '13.5px', color: 'var(--text-secondary)', lineHeight: '1.5', marginBottom: '22px' }}>
              Some products already have individual discounts. How would you like to apply the cart discount?
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <button
                type="button"
                onClick={handleStackingApplyBoth}
                style={{ width: '100%', height: '48px', borderRadius: '12px', fontSize: '14px', fontWeight: '700', border: 'none', background: 'var(--primary)', color: '#ffffff', cursor: 'pointer' }}
              >
                Apply Both
              </button>
              <button
                type="button"
                onClick={handleStackingReplace}
                style={{ width: '100%', height: '48px', borderRadius: '12px', fontSize: '14px', fontWeight: '700', border: '1px solid #cbd5e1', background: '#ffffff', color: 'var(--text-primary)', cursor: 'pointer' }}
              >
                Replace Item Discounts
              </button>
              <button
                type="button"
                onClick={handleStackingCancel}
                style={{ width: '100%', height: '48px', borderRadius: '12px', fontSize: '14px', fontWeight: '600', border: 'none', background: '#f1f5f9', color: '#64748b', cursor: 'pointer' }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

export default Cart;
