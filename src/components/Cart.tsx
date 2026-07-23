import React, { useState } from 'react';
import { CartItem } from '../types';
import { Plus, Minus, RotateCcw, X } from 'lucide-react';
import Button from './ui/Button';
import Modal from './ui/Modal';
import { Input } from './ui/Field';
import { showPrompt } from './ui/dialogs';

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
  onSetQuantity: (productId: string, quantity: number) => void;
  role: 'Owner' | 'Manager' | 'Staff';
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
  onSetQuantity,
  role,
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

  // Direct quantity input via unified prompt dialog
  const handleQuantityClick = async (item: CartItem) => {
    const newQtyInput = await showPrompt(`[${item.product.name}] 구매 수량을 직접 입력해 주세요.`, {
      title: '수량 변경',
      defaultValue: String(item.quantity),
      inputType: 'number'
    });
    if (newQtyInput !== null) {
      const parsed = parseInt(newQtyInput, 10);
      if (!isNaN(parsed) && parsed >= 0) {
        onSetQuantity(item.product.id, parsed);
      }
    }
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
              <div key={item.product.id} className="cart-item">
                {/* Top Row: Name on Left, Total Price on Right */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <div className="cart-item-name">
                    {item.product.name}
                  </div>
                  <div className="cart-item-total" style={{ width: 'auto', textAlign: 'right' }}>
                    {((isDiscounted ? finalItemPrice : item.product.price) * item.quantity).toLocaleString()}원
                  </div>
                </div>

                {/* Middle Row: Unit Price & Discount Badge */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: 'var(--text-secondary)' }}>
                  {isDiscounted ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ textDecoration: 'line-through', opacity: 0.5 }}>
                        {item.product.price.toLocaleString()}원
                      </span>
                      <span style={{ fontWeight: '700', color: 'var(--primary)' }}>
                        {finalItemPrice.toLocaleString()}원
                      </span>
                      <span className="bo-badge bo-badge--danger" style={{ fontSize: '10.5px', fontWeight: '700', padding: '1px 6px', borderRadius: '4px' }}>
                        {discInfo.percent > 0 ? `${discInfo.percent}% 할인` : `-${discInfo.unitDiscount.toLocaleString()}원 할인`}
                      </span>
                    </div>
                  ) : (
                    <span>{item.product.price.toLocaleString()}원</span>
                  )}
                </div>

                {/* Bottom Row: Controls [-] 1 [+]   🏷 Discount   ✕ */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '2px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
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
                    {role !== 'Staff' && (
                      <button
                        type="button"
                        className={`item-discount-btn ${isDiscounted ? 'discounted' : ''}`}
                        onClick={() => openItemDiscountModal(item)}
                      >
                        <span>🏷️</span>
                        <span>{isDiscounted ? '할인 수정' : '할인'}</span>
                      </button>
                    )}
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
          <div className="summary-row" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '13.5px', color: 'var(--danger)', fontWeight: '500' }}>
            <span>품목 할인 합계</span>
            <span>- {itemDiscountAmount.toLocaleString()}원</span>
          </div>
        )}

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
          {role !== 'Staff' && (
            <Button
              variant="outline"
              size="md"
              fullWidth
              onClick={() => setIsCartDiscountOpen(true)}
              disabled={items.length === 0}
            >
              🏷️ 할인 적용
            </Button>
          )}
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
    </div>
  );
};

export default Cart;
