import React, { useState } from 'react';
import { CartItem } from '../types';
import { Plus, Minus, RotateCcw, X } from 'lucide-react';
import Button from './ui/Button';
import Modal from './ui/Modal';
import { Input } from './ui/Field';

interface CartProps {
  items: CartItem[];
  totalAmount: number;
  cartDiscountPercent: number;
  cartDiscountAmount: number;
  itemDiscountAmount: number;
  onIncrease: (productId: string) => void;
  onDecrease: (productId: string) => void;
  onDelete: (productId: string) => void;
  onClear: () => void;
  onCheckout: () => void;
  onApplyDiscount: (percent: number) => void;
  onApplyItemDiscount: (productId: string, amount: number, qty: number, isPercent?: boolean, percentVal?: number) => void;
  onToggleDiscountExclusion: (productId: string) => void;
  onSetQuantity: (productId: string, quantity: number) => void;
  role: 'Owner' | 'Staff';
}

const Cart: React.FC<CartProps> = ({
  items,
  totalAmount,
  cartDiscountPercent,
  cartDiscountAmount,
  itemDiscountAmount,
  onIncrease,
  onDecrease,
  onDelete,
  onClear,
  onCheckout,
  onApplyDiscount,
  onApplyItemDiscount,
  onToggleDiscountExclusion,
  onSetQuantity,
}) => {
  // Modal Visibility States
  const [isCartDiscountOpen, setIsCartDiscountOpen] = useState(false);
  const [isItemDiscountOpen, setIsItemDiscountOpen] = useState(false);
  const [isStackingOpen, setIsStackingOpen] = useState(false);
  const [qtyModalItem, setQtyModalItem] = useState<CartItem | null>(null);
  const [qtyInputVal, setQtyInputVal] = useState<string>('1');

  // Focus Items
  const [selectedItem, setSelectedItem] = useState<CartItem | null>(null);
  const [pendingCartPercent, setPendingCartPercent] = useState<number>(0);

  // Input states
  const [customCartPercent, setCustomCartPercent] = useState('');
  const [customItemPercent, setCustomItemPercent] = useState('');

  const originalSubtotal = items.reduce((sum, item) => sum + (item.product.price * item.quantity), 0);

  // Helper to retrieve calculated unit and total discount for visual rendering
  const getItemDiscountDetails = (item: CartItem) => {
    // 1. Check explicit item-level discount override
    if (item.discountPercent !== undefined && item.discountPercent > 0) {
      const pct = Math.min(100, Math.max(0, item.discountPercent));
      const unitDiscount = Math.round(item.product.price * (pct / 100));
      return {
        unitDiscount,
        totalDiscount: unitDiscount * item.quantity,
        percent: pct,
        isPercent: true,
        discountType: item.product.discountType || 'none'
      };
    } else if (item.discount !== undefined && item.discount > 0) {
      const qty = item.discountQty ?? item.quantity;
      return {
        unitDiscount: item.discount,
        totalDiscount: item.discount * qty,
        percent: 0,
        isPercent: false,
        discountType: item.product.discountType || 'none'
      };
    }

    // 2. Fallback to product-defined discount (e.g. Expiry 30%, Regular 10%)
    if (item.product.discountPercent && item.product.discountPercent > 0) {
      const pct = item.product.discountPercent;
      const unitDiscount = Math.round(item.product.price * (pct / 100));
      return {
        unitDiscount,
        totalDiscount: unitDiscount * item.quantity,
        percent: pct,
        isPercent: true,
        discountType: item.product.discountType || (item.product.name.includes('임박') ? 'expiry' : 'regular')
      };
    }

    return {
      unitDiscount: 0,
      totalDiscount: 0,
      percent: 0,
      isPercent: false,
      discountType: item.product.discountType || 'none'
    };
  };

  // Calculate discounts separated by discount type
  const calculateDiscounts = (cartItems: CartItem[]) => {
    const normalItems: CartItem[] = [];
    const regularDiscountItems: CartItem[] = [];
    const expiryDiscountItems: CartItem[] = [];

    let regularDiscountTotal = 0;
    let expiryDiscountTotal = 0;

    cartItems.forEach(item => {
      const disc = getItemDiscountDetails(item);
      if (disc.discountType === 'expiry') {
        expiryDiscountItems.push(item);
        expiryDiscountTotal += disc.totalDiscount;
      } else if (disc.discountType === 'regular' || disc.percent === 10) {
        regularDiscountItems.push(item);
        regularDiscountTotal += disc.totalDiscount;
      } else {
        normalItems.push(item);
      }
    });

    return {
      normalItems,
      regularDiscountItems,
      expiryDiscountItems,
      regularDiscountTotal,
      expiryDiscountTotal
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

  // Direct quantity modal trigger
  const handleQuantityClick = (item: CartItem) => {
    setQtyModalItem(item);
    setQtyInputVal(String(item.quantity));
  };

  const handleQuantitySubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!qtyModalItem) return;
    const parsed = parseInt(qtyInputVal, 10);
    if (!isNaN(parsed) && parsed >= 0) {
      onSetQuantity(qtyModalItem.product.id, parsed);
    }
    setQtyModalItem(null);
  };

  // Shared content for the two percent-discount modals
  const renderPercentPicker = (
    onPick: (pct: number) => void,
    formValue: string,
    setFormValue: (v: string) => void,
    onFormSubmit: (e: React.FormEvent) => void
  ) => (
    <>
      {/* Quick Percentage Buttons */}
      <div style={{ marginBottom: '20px' }}>
        <div className="bo-label" style={{ marginBottom: '8px' }}>할인율 (%) 선택</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px' }}>
          {[5, 10, 20, 30].map((pct) => (
            <Button key={pct} variant="secondary" size="sm" onClick={() => onPick(pct)}>
              {pct}%
            </Button>
          ))}
        </div>
      </div>

      {/* Custom Percentage Form */}
      <form onSubmit={onFormSubmit} style={{ marginBottom: '20px' }}>
        <div className="bo-label" style={{ marginBottom: '8px' }}>할인율 직접 입력 (%)</div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <Input
            type="number"
            placeholder="0~100"
            value={formValue}
            onChange={(e) => setFormValue(e.target.value)}
            min="0"
            max="100"
            style={{ flex: 1 }}
          />
          <Button type="submit" variant="primary" size="md">적용</Button>
        </div>
      </form>

      {/* Reset Button */}
      <hr className="bo-divider" />
      <Button variant="secondary" size="md" fullWidth onClick={() => onPick(0)}>
        할인 적용 해제
      </Button>
    </>
  );

  return (
    <div className="cart-panel-root" style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      {/* Cart Header */}
      <div className="cart-header" style={{ flexShrink: 0 }}>
        <h2>장바구니</h2>
        {items.length > 0 && (
          <button type="button" className="clear-cart-btn" onClick={onClear}>
            <RotateCcw size={12} />
            <span>전체 삭제</span>
          </button>
        )}
      </div>

      {/* Cart Items List */}
      <div className="cart-items-list" style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '12px 16px' }}>
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
              <div key={item.product.id} className="cart-item">
                {item.product.imageUrl ? (
                  <img src={item.product.imageUrl} alt={item.product.name} className="cart-item-thumb" />
                ) : (
                  <div className="cart-item-thumb cart-item-thumb--emoji">{item.product.emoji || '🍞'}</div>
                )}
                <div className="cart-item-body">
                {/* Top Row: Name on Left, Total Price on Right */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <div className="cart-item-name">
                    {item.product.name}
                    {item.excludeFromCartDiscount && (
                      <span
                        className="bo-badge"
                        style={{ marginLeft: '6px', fontSize: '10px', fontWeight: '700', padding: '1px 6px', borderRadius: '4px', background: '#f1f5f9', color: 'var(--text-secondary)' }}
                      >
                        할인 제외
                      </span>
                    )}
                  </div>
                  <div className="cart-item-total" style={{ width: 'auto', textAlign: 'right' }}>
                    {((isDiscounted ? finalItemPrice : item.product.price) * item.quantity).toLocaleString()}원
                  </div>
                </div>

                {/* Middle Row: Unit Price & Discount Badge */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: 'var(--text-secondary)', flexWrap: 'wrap' }}>
                  {isDiscounted ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                      <span style={{ textDecoration: 'line-through', opacity: 0.5 }}>
                        {item.product.price.toLocaleString()}원
                      </span>
                      <span style={{ fontWeight: '700', color: 'var(--primary)' }}>
                        {finalItemPrice.toLocaleString()}원
                      </span>
                      {discInfo.discountType === 'expiry' ? (
                        <span
                          className="bo-badge"
                          style={{
                            fontSize: '11px',
                            fontWeight: '700',
                            padding: '2px 6px',
                            borderRadius: '4px',
                            background: '#fee2e2',
                            color: '#dc2626',
                            border: '1px solid #fca5a5'
                          }}
                        >
                          ⏰ 유통기한 임박 30% 할인
                        </span>
                      ) : discInfo.discountType === 'regular' || discInfo.percent === 10 ? (
                        <span
                          className="bo-badge"
                          style={{
                            fontSize: '11px',
                            fontWeight: '700',
                            padding: '2px 6px',
                            borderRadius: '4px',
                            background: '#fff4e6',
                            color: '#d9480f',
                            border: '1px solid #fed7aa'
                          }}
                        >
                          🏷️ 10% 할인
                        </span>
                      ) : (
                        <span className="bo-badge bo-badge--danger" style={{ fontSize: '10.5px', fontWeight: '700', padding: '1px 6px', borderRadius: '4px' }}>
                          {discInfo.percent > 0 ? `${discInfo.percent}% 할인` : `-${discInfo.unitDiscount.toLocaleString()}원 할인`}
                        </span>
                      )}
                    </div>
                  ) : (
                    <span>{item.product.price.toLocaleString()}원</span>
                  )}
                </div>

                {/* Bottom Row: Controls [-] 1 [+]   🏷 Discount   ✕ */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '6px', flexWrap: 'wrap', gap: '6px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                    {/* Quantity Controls */}
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
                        onClick={() => handleQuantityClick(item)}
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

                    {/* Dedicated Per-Item Discount Button */}
                    <button
                      type="button"
                      className={`item-discount-btn ${isDiscounted ? 'discounted' : ''}`}
                      onClick={() => openItemDiscountModal(item)}
                    >
                      <span>🏷️</span>
                      <span>{isDiscounted ? '할인 수정' : '할인'}</span>
                    </button>
                    <button
                      type="button"
                      className={`item-exclude-btn ${item.excludeFromCartDiscount ? 'active' : ''}`}
                      onClick={() => onToggleDiscountExclusion(item.product.id)}
                      title="전체 할인 적용 시 이 상품을 제외합니다"
                    >
                      <span>{item.excludeFromCartDiscount ? '✅' : '⬜'}</span>
                      <span>할인 제외</span>
                    </button>
                  </div>

                  {/* Remove button */}
                  <button
                    type="button"
                    className="delete-item-btn"
                    onClick={() => onDelete(item.product.id)}
                    title="상품 삭제"
                  >
                    <X size={16} />
                  </button>
                </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Cart Summary & Footer Controls (Fixed at bottom) */}
      <div className="cart-footer" style={{ flexShrink: 0, marginTop: 'auto', borderTop: '1px solid var(--border-color)', padding: '16px', background: '#f8fafc' }}>
        <div className="summary-row" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '13.5px', color: 'var(--text-secondary)' }}>
          <span>상품 금액</span>
          <span>{originalSubtotal.toLocaleString()}원</span>
        </div>

        {(() => {
          const discountBreakdown = calculateDiscounts(items);
          return (
            <>
              {discountBreakdown.expiryDiscountTotal > 0 && (
                <div className="summary-row" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '13.5px', color: '#dc2626', fontWeight: '600' }}>
                  <span>⏰ 임박 할인 (30%)</span>
                  <span>- {discountBreakdown.expiryDiscountTotal.toLocaleString()}원</span>
                </div>
              )}
              {discountBreakdown.regularDiscountTotal > 0 && (
                <div className="summary-row" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '13.5px', color: '#d9480f', fontWeight: '600' }}>
                  <span>🏷️ 일반 할인 (10%)</span>
                  <span>- {discountBreakdown.regularDiscountTotal.toLocaleString()}원</span>
                </div>
              )}
              {itemDiscountAmount > 0 && discountBreakdown.expiryDiscountTotal === 0 && discountBreakdown.regularDiscountTotal === 0 && (
                <div className="summary-row" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '13.5px', color: 'var(--danger)', fontWeight: '500' }}>
                  <span>품목 할인 합계</span>
                  <span>- {itemDiscountAmount.toLocaleString()}원</span>
                </div>
              )}
            </>
          );
        })()}

        <div
          className="summary-row"
          style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '14px', fontSize: '13.5px', color: cartDiscountAmount > 0 ? 'var(--danger)' : 'var(--text-secondary)', fontWeight: cartDiscountAmount > 0 ? '600' : 'normal' }}
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
          <Button
            variant="outline"
            size="md"
            fullWidth
            onClick={() => setIsCartDiscountOpen(true)}
            disabled={items.length === 0}
          >
            🏷️ 할인 적용
          </Button>
          <Button
            variant="primary"
            size="lg"
            fullWidth
            onClick={onCheckout}
            disabled={items.length === 0}
          >
            결제하기
          </Button>
        </div>
      </div>

      {/* Cart Discount Modal */}
      {isCartDiscountOpen && (
        <Modal
          title="🏷️ 전체 할인 설정"
          maxWidth={380}
          zIndex={1200}
          onClose={() => setIsCartDiscountOpen(false)}
          closeOnOverlay
        >
          {renderPercentPicker(
            requestCartDiscount,
            customCartPercent,
            setCustomCartPercent,
            handleCustomCartDiscountSubmit
          )}
        </Modal>
      )}

      {/* Item Discount Modal */}
      {isItemDiscountOpen && selectedItem && (
        <Modal
          title="🏷️ 품목 개별 할인 설정"
          description={
            <>
              <strong>{selectedItem.product.name}</strong> (정가: {selectedItem.product.price.toLocaleString()}원)
            </>
          }
          maxWidth={380}
          zIndex={1200}
          onClose={() => setIsItemDiscountOpen(false)}
          closeOnOverlay
        >
          {renderPercentPicker(
            applyItemDiscount,
            customItemPercent,
            setCustomItemPercent,
            handleCustomItemDiscountSubmit
          )}
        </Modal>
      )}

      {/* Stacking Confirmation Modal */}
      {isStackingOpen && (
        <Modal
          title="할인 중복 적용"
          description="일부 상품에 개별 할인이 이미 적용되어 있습니다. 전체 할인을 어떻게 적용할까요?"
          maxWidth={400}
          zIndex={1300}
          onClose={handleStackingCancel}
          closeOnOverlay
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <Button variant="primary" size="md" fullWidth onClick={handleStackingApplyBoth}>
              개별 할인과 함께 적용
            </Button>
            <Button variant="outline" size="md" fullWidth onClick={handleStackingReplace}>
              개별 할인 해제 후 전체 할인만 적용
            </Button>
            <Button variant="secondary" size="md" fullWidth onClick={handleStackingCancel}>
              취소
            </Button>
          </div>
        </Modal>
      )}

      {/* Quantity Change Modal */}
      {qtyModalItem && (
        <Modal
          title={`수량 변경: ${qtyModalItem.product.name}`}
          description="구매하실 수량을 직접 입력하거나 빠른 버튼을 선택해 주세요."
          maxWidth={360}
          zIndex={1250}
          onClose={() => setQtyModalItem(null)}
          closeOnOverlay
        >
          <form onSubmit={handleQuantitySubmit}>
            <div style={{ marginBottom: '16px' }}>
              <div className="bo-label" style={{ marginBottom: '8px' }}>빠른 수량 선택</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '6px' }}>
                {[1, 2, 3, 5, 10].map((qty) => (
                  <Button
                    key={qty}
                    type="button"
                    variant={qtyInputVal === String(qty) ? 'primary' : 'secondary'}
                    size="sm"
                    onClick={() => {
                      onSetQuantity(qtyModalItem.product.id, qty);
                      setQtyModalItem(null);
                    }}
                  >
                    {qty}
                  </Button>
                ))}
              </div>
            </div>

            <div style={{ marginBottom: '20px' }}>
              <div className="bo-label" style={{ marginBottom: '8px' }}>수량 직접 입력</div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <Input
                  type="number"
                  autoFocus
                  min="0"
                  max="999"
                  value={qtyInputVal}
                  onChange={(e) => setQtyInputVal(e.target.value)}
                  style={{ flex: 1, fontSize: '16px', fontWeight: '700', textAlign: 'center' }}
                />
                <Button type="submit" variant="primary" size="md">
                  적용
                </Button>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '8px' }}>
              <Button
                type="button"
                variant="outline"
                size="sm"
                fullWidth
                onClick={() => {
                  onSetQuantity(qtyModalItem.product.id, 0);
                  setQtyModalItem(null);
                }}
                style={{ color: 'var(--danger)' }}
              >
                품목 삭제 (0개)
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                fullWidth
                onClick={() => setQtyModalItem(null)}
              >
                닫기
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
};

export default Cart;
