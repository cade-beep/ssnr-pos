import React from 'react';
import { CartItem, BusinessState } from '../types';
import { Trash2, Plus, Minus, RotateCcw, CreditCard, History } from 'lucide-react';

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
  businessState?: BusinessState;
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
  businessState = 'CLOSED',
}) => {
  const [isDiscountModalOpen, setIsDiscountModalOpen] = React.useState(false);
  const [customDiscountText, setCustomDiscountText] = React.useState('');
  const totalQuantity = items.reduce((sum, item) => sum + item.quantity, 0);

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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Cart Header */}
      <div className="cart-header">
        <h2>
          <span>장바구니</span>
          {totalQuantity > 0 && <span className="cart-badge">{totalQuantity}</span>}
        </h2>
        {items.length > 0 && (
          <button className="clear-cart-btn" onClick={onClear}>
            <RotateCcw size={12} />
            <span>전체 비우기</span>
          </button>
        )}
      </div>

      {/* Cart Items List */}
      <div className="cart-items-list">
        {items.length === 0 ? (
          <div className="cart-empty">
            <span style={{ fontSize: '42px' }} className="cart-empty-icon">🛒</span>
            <div className="cart-empty-text">선택된 상품이 없습니다.</div>
          </div>
        ) : (
          items.map((item) => (
            <div key={item.product.id} className="cart-item">
              <div className="cart-item-details">
                <div className="cart-item-name" title={item.product.name}>{item.product.name}</div>
                <div className="cart-item-price">
                  {item.product.price.toLocaleString()}원
                </div>
              </div>
              
              <div className="cart-item-controls">
                <button
                  type="button"
                  className="quantity-btn"
                  onClick={() => onDecrease(item.product.id)}
                >
                  <Minus size={10} />
                </button>
                <span className="cart-item-quantity">{item.quantity}</span>
                <button
                  type="button"
                  className="quantity-btn"
                  onClick={() => onIncrease(item.product.id)}
                >
                  <Plus size={10} />
                </button>
              </div>

              <div className="cart-item-total" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', justifyContent: 'center' }}>
                <span style={{ textDecoration: item.discount && item.discountQty ? 'line-through' : 'none', opacity: item.discount && item.discountQty ? 0.4 : 1, fontSize: item.discount && item.discountQty ? '11px' : '14px' }}>
                  {(item.product.price * item.quantity).toLocaleString()}원
                </span>
                {item.discount && item.discountQty && item.discount > 0 && item.discountQty > 0 && (
                  <span style={{ color: '#ef4444', fontWeight: '800', fontSize: '13.5px' }}>
                    {Math.max(0, (item.product.price * item.quantity) - (item.discount * item.discountQty)).toLocaleString()}원
                  </span>
                )}
              </div>

              <button
                type="button"
                className="item-discount-badge-btn"
                onClick={() => {
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
                }}
                title="개별 품목 할인 적용"
                style={{ 
                  border: item.discount && item.discountQty && item.discount > 0 && item.discountQty > 0 
                    ? '1px solid rgba(239, 68, 68, 0.4)' 
                    : '1px solid rgba(56, 189, 248, 0.35)', 
                  background: item.discount && item.discountQty && item.discount > 0 && item.discountQty > 0 
                    ? 'rgba(239, 68, 68, 0.12)' 
                    : 'rgba(56, 189, 248, 0.08)', 
                  color: item.discount && item.discountQty && item.discount > 0 && item.discountQty > 0 
                    ? '#ef4444' 
                    : '#38bdf8',
                  borderRadius: '6px',
                  padding: '5px 10px',
                  fontSize: '11.5px',
                  fontWeight: '700',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  height: 'fit-content',
                  transition: 'all 0.15s ease',
                  whiteSpace: 'nowrap'
                }}
              >
                <span>🏷️</span>
                {item.discount && item.discountQty && item.discount > 0 && item.discountQty > 0 
                  ? (item.isPercent 
                      ? `-${(item.discount * item.discountQty).toLocaleString()}원 (${item.discountQty}개 ${item.discountPercent}% 할인)` 
                      : `-${(item.discount * item.discountQty).toLocaleString()}원 (${item.discountQty}개 개당 -${item.discount.toLocaleString()}원)`) 
                  : '할인적용'}
              </button>

              <button
                type="button"
                className="delete-item-btn"
                onClick={() => onDelete(item.product.id)}
                title="상품 삭제"
              >
                <Trash2 size={13} />
              </button>
            </div>
          ))
        )}
      </div>

      {/* Cart Summary & Footer Controls */}
      <div className="cart-footer">
        {discountAmount > 0 && (
          <div className="summary-row" style={{ color: '#ef4444', fontSize: '13.5px', marginBottom: '6px', borderBottom: '1px dashed rgba(255,255,255,0.05)', paddingBottom: '6px' }}>
            <span>할인 적용</span>
            <span style={{ fontWeight: '600' }}>-{discountAmount.toLocaleString()}원</span>
          </div>
        )}

        <div className="summary-row total" style={{ borderTop: 'none', paddingTop: 0, marginTop: 0 }}>
          <span>최종 결제 금액</span>
          <span className="total-price">{Math.max(0, totalAmount - discountAmount).toLocaleString()}원</span>
        </div>

        <div className="action-buttons" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onViewHistory}
              style={{ 
                flex: 1, 
                padding: '10px', 
                display: 'flex', 
                justifyContent: 'center', 
                alignItems: 'center', 
                gap: '6px', 
                fontSize: '13px',
                border: '1px solid var(--border-color)',
                background: 'rgba(255,255,255,0.02)',
                color: 'var(--text-secondary)'
              }}
            >
              <History size={14} />
              <span>내역 ({historyCount}건)</span>
            </button>

            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setIsDiscountModalOpen(true)}
              disabled={items.length === 0 || businessState !== 'OPENED'}
              style={{ 
                flex: 1, 
                padding: '10px', 
                display: 'flex', 
                justifyContent: 'center', 
                alignItems: 'center', 
                gap: '6px', 
                fontSize: '13px',
                border: '1px solid var(--border-color)',
                background: 'rgba(255,255,255,0.02)',
                color: 'var(--text-secondary)'
              }}
            >
              <span>🏷️</span>
              <span>할인 적용</span>
            </button>
          </div>
          
          <button
            type="button"
            className="btn btn-primary"
            onClick={onCheckout}
            disabled={items.length === 0 || businessState !== 'OPENED'}
          >
            <CreditCard size={16} />
            <span>
              {businessState === 'CLOSED' 
                ? '🌅 영업을 시작해 주세요' 
                : businessState === 'FINISHED' 
                ? '🌙 금일 영업 마감됨' 
                : '결제 및 주문하기'}
            </span>
          </button>
        </div>
      </div>

      {/* Discount Configuration Modal */}
      {isDiscountModalOpen && (
        <div className="modal-overlay" style={{ zIndex: 1200 }}>
          <div className="modal-content" style={{ maxWidth: '400px', width: '90%', padding: '24px' }}>
            <div className="modal-header" style={{ marginBottom: '18px' }}>
              <h3 style={{ fontSize: '18px', fontWeight: 'bold' }}>🏷️ 결제 할인 적용</h3>
            </div>
            
            {/* Quick Percentage Buttons */}
            <div style={{ marginBottom: '20px' }}>
              <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '8px' }}>할인율 (%) 선택</div>
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                {[5, 10, 15, 20, 30].map((pct) => (
                  <button
                    key={pct}
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => handlePercentDiscount(pct)}
                    style={{ flex: '1 0 50px', padding: '8px', fontSize: '13px' }}
                  >
                    {pct}%
                  </button>
                ))}
              </div>
            </div>

            {/* Custom Amount Form */}
            <form onSubmit={handleCustomDiscountSubmit} style={{ marginBottom: '20px' }}>
              <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '8px' }}>직접 할인액 (원) 입력</div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  type="number"
                  placeholder="예: 1000"
                  value={customDiscountText}
                  onChange={(e) => setCustomDiscountText(e.target.value)}
                  style={{
                    flex: 1,
                    padding: '10px',
                    borderRadius: '6px',
                    border: '1px solid var(--border-color)',
                    background: 'rgba(255,255,255,0.05)',
                    color: '#ffffff',
                    fontSize: '14px'
                  }}
                  min="0"
                  max={totalAmount}
                />
                <button type="submit" className="btn btn-primary" style={{ padding: '0 16px' }}>
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
                style={{ flex: 1 }}
              >
                할인 안 함
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setIsDiscountModalOpen(false)}
                style={{ flex: 1 }}
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
