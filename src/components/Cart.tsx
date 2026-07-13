import React from 'react';
import { CartItem } from '../types';
import { Plus, Minus, RotateCcw, X } from 'lucide-react';

interface CartProps {
  items: CartItem[];
  totalAmount: number;
  discountAmount: number;
  onIncrease: (productId: string) => void;
  onDecrease: (productId: string) => void;
  onDelete: (productId: string) => void;
  onClear: () => void;
  onCheckout: () => void;
  onViewHistory: () => void;
  historyCount: number;
  onApplyDiscount: (amount: number) => void;
  onApplyItemDiscount: (productId: string, amount: number, qty: number, isPercent?: boolean, percentVal?: number) => void;
  onSetQuantity: (productId: string, quantity: number) => void;
}

const Cart: React.FC<CartProps> = ({
  items,
  totalAmount,
  discountAmount,
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
  const [isDiscountModalOpen, setIsDiscountModalOpen] = React.useState(false);
  const [customDiscountText, setCustomDiscountText] = React.useState('');

  // Bypass unused variable check for props not rendered in Toss UI
  if (false as boolean) {
    console.log(onViewHistory, historyCount);
  }

  const handlePercentDiscount = (percent: number) => {
    const calculated = Math.round(totalAmount * (percent / 100));
    onApplyDiscount(calculated);
    setIsDiscountModalOpen(false);
  };

  const handleCustomDiscountSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = parseInt(customDiscountText, 10);
    if (!isNaN(parsed) && parsed >= 0) {
      onApplyDiscount(Math.min(totalAmount, parsed));
    }
    setIsDiscountModalOpen(false);
  };

  const handleResetDiscount = () => {
    onApplyDiscount(0);
    setCustomDiscountText('');
    setIsDiscountModalOpen(false);
  };

  const triggerItemDiscount = (item: CartItem) => {
    const qtyInput = window.prompt(`${item.product.name} 중 할인을 적용할 수량을 입력해 주세요 (최대 ${item.quantity}개):`, String(item.discountQty || ''));
    if (qtyInput !== null) {
      let targetQty = parseInt(qtyInput, 10);
      if (isNaN(targetQty) || targetQty <= 0) targetQty = 0;
      targetQty = Math.min(item.quantity, targetQty);

      if (targetQty > 0) {
        const amtInput = window.prompt(
          `${item.product.name} 1개당 할인액을 입력해 주세요 (예: 500 또는 10%):`, 
          String(item.discount ? (item.isPercent ? `${item.discountPercent}%` : item.discount) : '')
        );
        if (amtInput !== null) {
          if (amtInput.includes('%')) {
            const percent = parseInt(amtInput.replace('%', ''), 10);
            if (!isNaN(percent) && percent >= 0) {
              const calculatedAmt = Math.round(item.product.price * (percent / 100));
              onApplyItemDiscount(item.product.id, calculatedAmt, targetQty, true, percent);
            }
          } else {
            const parsedAmt = parseInt(amtInput, 10);
            onApplyItemDiscount(item.product.id, isNaN(parsedAmt) ? 0 : parsedAmt, targetQty, false, 0);
          }
        }
      } else {
        onApplyItemDiscount(item.product.id, 0, 0, false, 0); // 할인 취소
      }
    }
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
      <div className="cart-items-list">
        {items.length === 0 ? (
          <div className="cart-empty">
            <span className="cart-empty-icon">🛒</span>
            <div className="cart-empty-text">선택된 상품이 없습니다.</div>
          </div>
        ) : (
          items.map((item) => (
            <div key={item.product.id} className="cart-item">
              <div 
                className="cart-item-details" 
                onClick={() => triggerItemDiscount(item)}
                style={{ cursor: 'pointer' }}
                title="클릭하여 품목 할인 설정"
              >
                <div className="cart-item-name">{item.product.name}</div>
                <div className="cart-item-price">
                  {item.product.price.toLocaleString()}원
                  {item.discount && item.discountQty && item.discount > 0 && item.discountQty > 0 ? (
                    <span style={{ color: '#ef4444', fontSize: '12px', marginLeft: '6px', fontWeight: 'bold' }}>
                      (🏷️ -{(item.discount * item.discountQty).toLocaleString()}원)
                    </span>
                  ) : null}
                </div>
              </div>
              
              <div className="cart-item-controls">
                <button
                  type="button"
                  className="quantity-btn"
                  onClick={() => onDecrease(item.product.id)}
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
                  style={{ cursor: 'pointer', textDecoration: 'underline dotted' }}
                  title="클릭하여 수량 직접 입력"
                >
                  {item.quantity}
                </span>
                <button
                  type="button"
                  className="quantity-btn"
                  onClick={() => onIncrease(item.product.id)}
                >
                  <Plus size={12} />
                </button>
              </div>

              <div className="cart-item-total">
                {item.discount && item.discountQty && item.discount > 0 && item.discountQty > 0 ? (
                  Math.max(0, (item.product.price * item.quantity) - (item.discount * item.discountQty)).toLocaleString()
                ) : (
                  (item.product.price * item.quantity).toLocaleString()
                )}원
              </div>

              <button
                type="button"
                className="delete-item-btn"
                onClick={() => onDelete(item.product.id)}
                title="상품 삭제"
                style={{ marginLeft: '8px' }}
              >
                <X size={16} />
              </button>
            </div>
          ))
        )}
      </div>

      {/* Cart Summary & Footer Controls */}
      <div className="cart-footer">
        <div className="summary-row">
          <span>상품 금액</span>
          <span>{totalAmount.toLocaleString()}원</span>
        </div>
        
        <div 
          className="summary-row" 
          onClick={() => items.length > 0 && setIsDiscountModalOpen(true)}
          style={{ cursor: items.length > 0 ? 'pointer' : 'default' }}
          title="클릭하여 전체 할인 설정"
        >
          <span>할인 금액</span>
          <span style={{ color: discountAmount > 0 ? '#ef4444' : 'inherit' }}>
            - {discountAmount.toLocaleString()}원
          </span>
        </div>

        <div className="summary-row total">
          <span>총 결제 금액</span>
          <span className="total-price">
            {Math.max(0, totalAmount - discountAmount).toLocaleString()}원
          </span>
        </div>

        <div className="action-buttons">
          <button
            type="button"
            className="btn btn-primary"
            onClick={onCheckout}
            disabled={items.length === 0}
          >
            결제하기
          </button>
        </div>
      </div>

      {/* Discount Configuration Modal */}
      {isDiscountModalOpen && (
        <div className="modal-overlay" style={{ zIndex: 1200 }}>
          <div className="modal-content" style={{ maxWidth: '400px', width: '90%', padding: '24px' }}>
            <div className="modal-header" style={{ marginBottom: '18px' }}>
              <h3 style={{ fontSize: '18px', fontWeight: 'bold', color: 'var(--text-primary)' }}>🏷️ 결제 할인 적용</h3>
            </div>
            
            {/* Quick Percentage Buttons */}
            <div style={{ marginBottom: '20px' }}>
              <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '8px', fontWeight: '600' }}>할인율 (%) 선택</div>
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                {[5, 10, 15, 20, 30].map((pct) => (
                  <button
                    key={pct}
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => handlePercentDiscount(pct)}
                    style={{ flex: '1 0 50px', padding: '10px', fontSize: '13.5px', borderRadius: '10px', cursor: 'pointer' }}
                  >
                    {pct}%
                  </button>
                ))}
              </div>
            </div>

            {/* Custom Amount Form */}
            <form onSubmit={handleCustomDiscountSubmit} style={{ marginBottom: '20px' }}>
              <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '8px', fontWeight: '600' }}>직접 할인액 (원) 입력</div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  type="number"
                  placeholder="예: 1000"
                  value={customDiscountText}
                  onChange={(e) => setCustomDiscountText(e.target.value)}
                  style={{
                    flex: 1,
                    padding: '12px',
                    borderRadius: '10px',
                    border: '1px solid var(--border-color)',
                    background: '#f9fafb',
                    color: 'var(--text-primary)',
                    fontSize: '14px',
                    outline: 'none'
                  }}
                  min="0"
                  max={totalAmount}
                />
                <button type="submit" className="btn btn-primary" style={{ padding: '0 20px', borderRadius: '10px', width: 'auto' }}>
                  적용
                </button>
              </div>
            </form>

            {/* Reset & Close Buttons */}
            <div style={{ display: 'flex', gap: '8px', borderTop: '1px solid var(--border-color)', paddingTop: '16px' }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={handleResetDiscount}
                style={{ flex: 1, borderRadius: '10px', padding: '12px', cursor: 'pointer' }}
              >
                할인 안 함
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setIsDiscountModalOpen(false)}
                style={{ flex: 1, borderRadius: '10px', padding: '12px', cursor: 'pointer' }}
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Cart;
