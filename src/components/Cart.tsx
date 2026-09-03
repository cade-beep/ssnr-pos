import React, { useState } from 'react';
import { CartItem, CartDraft, Product, isDiscountable } from '../types';
import { Plus, Minus, Undo2, X, MoreHorizontal, Tag, Save, FileText, Trash2, Zap, CreditCard, RotateCcw } from 'lucide-react';
import Button from './ui/Button';
import Modal from './ui/Modal';
import { Input } from './ui/Field';

interface CartProps {
  items: CartItem[];
  totalAmount: number;
  cartDiscountPercent: number;
  cartDiscountAmount: number;
  itemDiscountAmount: number;
  onIncrease: (itemKeyOrProductId: string) => void;
  onDecrease: (itemKeyOrProductId: string) => void;
  onDelete: (itemKeyOrProductId: string) => void;
  onClear: () => void;
  onCheckout: () => void;
  onApplyDiscount: (percent: number) => void;
  onApplyItemDiscount: (productId: string, amount: number, qty: number, isPercent?: boolean, percentVal?: number) => void;
  onToggleDiscountExclusion?: (productId: string) => void;
  onSetQuantity: (itemKeyOrProductId: string, quantity: number) => void;
  onUndo?: () => void;
  canUndo?: boolean;
  drafts?: CartDraft[];
  onSaveDraft?: () => void;
  onLoadDraft?: (draftId: string) => void;
  onRemoveDraft?: (draftId: string) => void;
  products?: Product[];
  onQuickAdd?: (product: Product) => void;
  role: 'Owner' | 'Staff';
  onResetPanelWidth?: () => void;
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
  onToggleDiscountExclusion: _onToggleDiscountExclusion,
  onSetQuantity,
  onUndo,
  canUndo = false,
  drafts = [],
  onSaveDraft,
  onLoadDraft,
  onRemoveDraft,
  products = [],
  onQuickAdd,
  onResetPanelWidth,
}) => {
  // Modal Visibility States
  const [isCartDiscountOpen, setIsCartDiscountOpen] = useState(false);
  const [isItemDiscountOpen, setIsItemDiscountOpen] = useState(false);
  const [isMoreMenuOpen, setIsMoreMenuOpen] = useState(false);
  const [isDraftsModalOpen, setIsDraftsModalOpen] = useState(false);
  const [isOrderMemoOpen, setIsOrderMemoOpen] = useState(false);
  const [orderMemo, setOrderMemo] = useState('');
  const [qtyModalItem, setQtyModalItem] = useState<CartItem | null>(null);
  const [qtyInputVal, setQtyInputVal] = useState<string>('1');

  // Item Discount Focus
  const [selectedItem, setSelectedItem] = useState<CartItem | null>(null);
  const [customCartPercent, setCustomCartPercent] = useState('');
  const [customItemPercent, setCustomItemPercent] = useState('');

  const originalSubtotal = items.reduce(
    (sum, item) => sum + ((item.unitPrice || item.product.price) * item.quantity),
    0
  );

  const totalItemTypes = items.length;
  const totalItemQuantity = items.reduce((sum, item) => sum + item.quantity, 0);

  // Helper to retrieve calculated discount info
  const getItemDiscountDetails = (item: CartItem) => {
    const basePrice = item.unitPrice || item.product.price;
    if (item.discountPercent !== undefined && item.discountPercent > 0) {
      const pct = Math.min(100, Math.max(0, item.discountPercent));
      const unitDiscount = Math.round(basePrice * (pct / 100));
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

    if (item.product.discountPercent && item.product.discountPercent > 0) {
      const pct = item.product.discountPercent;
      const unitDiscount = Math.round(basePrice * (pct / 100));
      return {
        unitDiscount,
        totalDiscount: unitDiscount * item.quantity,
        percent: pct,
        isPercent: true,
        discountType: item.product.discountType || 'regular'
      };
    }

    return { unitDiscount: 0, totalDiscount: 0, percent: 0, isPercent: false, discountType: 'none' };
  };

  const handleOpenQtyModal = (item: CartItem) => {
    setQtyModalItem(item);
    setQtyInputVal(String(item.quantity));
  };

  const handleApplyQtyModal = () => {
    if (!qtyModalItem) return;
    const itemKey = qtyModalItem.id || `${qtyModalItem.product.id}_${qtyModalItem.priceType || 'default'}`;
    const parsed = parseInt(qtyInputVal, 10);
    if (!isNaN(parsed) && parsed > 0) {
      onSetQuantity(itemKey, parsed);
    } else if (parsed === 0) {
      onDelete(itemKey);
    }
    setQtyModalItem(null);
  };

  const openItemDiscountModal = (item: CartItem) => {
    setSelectedItem(item);
    const existing = getItemDiscountDetails(item);
    setCustomItemPercent(existing.percent > 0 ? String(existing.percent) : '');
    setIsItemDiscountOpen(true);
  };

  return (
    <aside className="order-panel" aria-label="주문 및 결제 콘솔">
      {/* 1. Order Header */}
      <header className="order-header">
        <div className="order-header-info">
          <div className="order-header-title-row">
            <h2 className="order-title">새 주문</h2>
            {orderMemo && <span className="order-memo-badge" title={orderMemo}>📝 메모</span>}
          </div>
          <p className="order-subtitle">
            상품 {totalItemTypes}종 · 총 {totalItemQuantity}개
          </p>
        </div>

        <div className="order-header-actions">
          {canUndo && onUndo && (
            <button
              type="button"
              className="order-undo-btn"
              onClick={onUndo}
              title="직전 변경 되돌리기 (Ctrl+Z)"
              aria-label="되돌리기"
            >
              <Undo2 size={14} />
              <span>되돌리기</span>
            </button>
          )}

          <button
            type="button"
            className="order-more-btn"
            onClick={() => setIsMoreMenuOpen(true)}
            title="주문 추가 메뉴"
            aria-label="주문 추가 옵션 메뉴 열기"
          >
            <MoreHorizontal size={18} />
          </button>
        </div>
      </header>

      {/* 2. Order Items Scroll List */}
      <main className="order-items-scroll">
        {items.length === 0 ? (
          <div className="order-empty">
            <span className="order-empty-icon" aria-hidden="true">🛒</span>
            <p className="order-empty-title">선택된 상품이 없습니다</p>
            <p className="order-empty-desc">왼쪽 상품 카드를 클릭하여 주문을 추가하세요.</p>

            {products.length > 0 && onQuickAdd && (
              <div className="quick-recommend-box">
                <div className="quick-recommend-title">
                  <Zap size={13} className="quick-zap-icon" />
                  <span>자주 찾는 인기 상품 빠른 추가</span>
                </div>
                <div className="quick-recommend-chips">
                  {products.slice(0, 6).map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      className="quick-recommend-chip"
                      onClick={() => onQuickAdd(p)}
                      title={`${p.name} (${p.price.toLocaleString()}원) 바로 담기`}
                    >
                      <span className="quick-chip-emoji">{p.emoji || '🍞'}</span>
                      <span className="quick-chip-name">{p.name}</span>
                      <span className="quick-chip-price">{p.price.toLocaleString()}원</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="order-items-list">
            {items.map((item) => {
              const itemKey = item.id || `${item.product.id}_${item.priceType || 'default'}`;
              const itemUnitPrice = item.unitPrice || item.product.price;
              const discInfo = getItemDiscountDetails(item);
              const isDiscounted = discInfo.totalDiscount > 0;
              const finalItemPrice = itemUnitPrice - discInfo.unitDiscount;
              const lineTotal = (isDiscounted ? finalItemPrice : itemUnitPrice) * item.quantity;

              return (
                <article key={itemKey} className="order-item-row">
                  {/* Top: Name on Left, Total Amount on Right */}
                  <div className="order-item-top">
                    <span className="order-item-name" title={item.product.name}>
                      {item.product.name}
                    </span>
                    <span className="order-item-line-total">
                      {lineTotal.toLocaleString()}원
                    </span>
                  </div>

                  {/* Middle: Subtitle Info (Price Type, Unit Price, Discount Badge) */}
                  <div className="order-item-sub">
                    {item.priceType && item.priceType !== 'default' && (
                      <span className="order-badge price-type-badge">
                        {item.priceType === 'child' ? '어린이' : '성인'}
                      </span>
                    )}
                    <span className="order-unit-price">
                      단가 {itemUnitPrice.toLocaleString()}원
                    </span>
                    {isDiscounted && (
                      <span className="order-badge discount-badge">
                        -{discInfo.unitDiscount.toLocaleString()}원
                      </span>
                    )}
                    {!isDiscountable(item.product) ? (
                      <span className="order-badge neutral-badge">
                        할인 불가
                      </span>
                    ) : item.excludeFromCartDiscount && (
                      <span className="order-badge neutral-badge">
                        전체할인제외
                      </span>
                    )}
                  </div>

                  {/* Bottom: Quantity Controls Group [-] Qty [+] & Action Buttons */}
                  <div className="order-item-bottom">
                    <div className="order-qty-control" role="group" aria-label="수량 조절">
                      <button
                        type="button"
                        className="qty-btn minus"
                        onClick={() => onDecrease(itemKey)}
                        title="수량 1 감소"
                        aria-label={`${item.product.name} 수량 1 감소`}
                      >
                        <Minus size={14} />
                      </button>
                      <button
                        type="button"
                        className="qty-value-btn"
                        onClick={() => handleOpenQtyModal(item)}
                        title="클릭하여 수량 직접 입력"
                        aria-label={`현재 수량 ${item.quantity}개, 클릭하여 변경`}
                      >
                        {item.quantity}
                      </button>
                      <button
                        type="button"
                        className="qty-btn plus"
                        onClick={() => onIncrease(itemKey)}
                        title="수량 1 증가"
                        aria-label={`${item.product.name} 수량 1 증가`}
                      >
                        <Plus size={14} />
                      </button>
                    </div>

                    <div className="order-item-actions">
                      <button
                        type="button"
                        className={`item-action-tag-btn ${isDiscounted ? 'active' : ''}`}
                        onClick={() => openItemDiscountModal(item)}
                        disabled={!isDiscountable(item.product)}
                        title={isDiscountable(item.product) ? '개별 품목 할인 설정' : `${item.product.name}은(는) 할인 대상이 아닙니다`}
                      >
                        <Tag size={13} />
                        <span>{isDiscounted ? '할인중' : '할인'}</span>
                      </button>

                      <button
                        type="button"
                        className="item-action-delete-btn"
                        onClick={() => onDelete(itemKey)}
                        title="품목 삭제"
                        aria-label={`${item.product.name} 삭제`}
                      >
                        <X size={16} />
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </main>

      {/* 3. Order Summary Section */}
      <section className="order-summary-box" aria-label="주문 금액 요약">
        <div className="summary-line">
          <span className="summary-label">상품 금액</span>
          <span className="summary-value">{originalSubtotal.toLocaleString()}원</span>
        </div>

        <div
          className="summary-line clickable"
          onClick={() => setIsCartDiscountOpen(true)}
          title="클릭하여 전체 할인 설정"
          role="button"
          tabIndex={0}
        >
          <span className="summary-label">할인</span>
          <span className={`summary-value ${cartDiscountAmount + itemDiscountAmount > 0 ? 'has-discount' : 'no-discount'}`}>
            {cartDiscountAmount + itemDiscountAmount > 0
              ? `- ${(cartDiscountAmount + itemDiscountAmount).toLocaleString()}원`
              : '할인 없음'}
          </span>
        </div>

        <div className="summary-divider" aria-hidden="true" />

        <div className="summary-total-line">
          <span className="total-label">결제 금액</span>
          <span className="total-value">{totalAmount.toLocaleString()}원</span>
        </div>
      </section>

      {/* 4. Bottom Order Actions (Fixed) */}
      <footer className="order-actions-footer">
        <div className="sub-actions-row">
          <button
            type="button"
            className="sub-action-btn"
            onClick={() => setIsCartDiscountOpen(true)}
            disabled={items.length === 0}
          >
            <Tag size={15} />
            <span>할인</span>
          </button>

          <button
            type="button"
            className="sub-action-btn"
            onClick={() => {
              if (drafts.length > 0 && items.length === 0) {
                setIsDraftsModalOpen(true);
              } else if (onSaveDraft) {
                onSaveDraft();
              }
            }}
          >
            <Save size={15} />
            <span>임시 저장{drafts.length > 0 ? ` (${drafts.length})` : ''}</span>
          </button>
        </div>

        <button
          type="button"
          className={`main-checkout-btn ${items.length > 0 ? 'active-ready' : ''}`}
          onClick={onCheckout}
          disabled={items.length === 0}
          aria-label={totalAmount > 0 ? `${totalAmount.toLocaleString()}원 결제하기` : '결제하기'}
        >
          <CreditCard size={20} className="checkout-icon" />
          <span>{totalAmount > 0 ? `${totalAmount.toLocaleString()}원 결제하기` : '결제하기'}</span>
        </button>
      </footer>

      {/* --- Modals & Popovers --- */}

      {/* 1. More Menu Modal */}
      {isMoreMenuOpen && (
        <Modal
          title="주문 옵션"
          maxWidth={360}
          onClose={() => setIsMoreMenuOpen(false)}
          closeOnOverlay
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <Button
              variant="outline"
              size="md"
              fullWidth
              onClick={() => {
                setIsMoreMenuOpen(false);
                setIsOrderMemoOpen(true);
              }}
            >
              <FileText size={16} />
              <span>주문 메모 {orderMemo ? '(작성됨)' : '추가'}</span>
            </Button>

            {drafts.length > 0 && (
              <Button
                variant="outline"
                size="md"
                fullWidth
                onClick={() => {
                  setIsMoreMenuOpen(false);
                  setIsDraftsModalOpen(true);
                }}
              >
                <Save size={16} />
                <span>임시저장 목록 확인 ({drafts.length}건)</span>
              </Button>
            )}

            {onResetPanelWidth && (
              <Button
                variant="outline"
                size="md"
                fullWidth
                onClick={() => {
                  setIsMoreMenuOpen(false);
                  onResetPanelWidth();
                }}
                title="주문 패널 너비 초기화 (420px)"
                aria-label="주문 패널 너비 초기화"
              >
                <RotateCcw size={16} />
                <span>주문 패널 너비 초기화 (420px)</span>
              </Button>
            )}

            {items.length > 0 && (
              <Button
                variant="outline"
                size="md"
                fullWidth
                style={{ color: 'var(--danger)', borderColor: 'var(--danger-border)' }}
                onClick={() => {
                  setIsMoreMenuOpen(false);
                  onClear();
                }}
              >
                <Trash2 size={16} />
                <span>전체 주문 삭제</span>
              </Button>
            )}
          </div>
        </Modal>
      )}

      {/* 2. Order Memo Modal */}
      {isOrderMemoOpen && (
        <Modal
          title="📝 주문 메모"
          maxWidth={380}
          onClose={() => setIsOrderMemoOpen(false)}
          closeOnOverlay
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <textarea
              className="order-memo-textarea"
              placeholder="예: 포장 요청, 컷팅 요청, 견과류 알레르기 등"
              value={orderMemo}
              onChange={(e) => setOrderMemo(e.target.value)}
              rows={4}
              style={{
                width: '100%',
                padding: '10px 12px',
                borderRadius: '8px',
                border: '1px solid var(--border-color)',
                fontSize: '14px',
                fontFamily: 'inherit',
                resize: 'none',
                outline: 'none'
              }}
            />
            <div style={{ display: 'flex', gap: '8px' }}>
              <Button variant="secondary" size="md" fullWidth onClick={() => { setOrderMemo(''); setIsOrderMemoOpen(false); }}>
                초기화
              </Button>
              <Button variant="primary" size="md" fullWidth onClick={() => setIsOrderMemoOpen(false)}>
                저장
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* 3. Drafts List Modal */}
      {isDraftsModalOpen && (
        <Modal
          title={`💾 임시저장 주문 목록 (${drafts.length}건)`}
          maxWidth={440}
          onClose={() => setIsDraftsModalOpen(false)}
          closeOnOverlay
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '360px', overflowY: 'auto' }}>
            {drafts.length === 0 ? (
              <p style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '24px 0' }}>저장된 임시 주문이 없습니다.</p>
            ) : (
              drafts.map((d, idx) => {
                const draftSum = d.items.reduce((s: number, i: CartItem) => s + (i.product.price * i.quantity), 0);
                return (
                  <div
                    key={d.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '12px 14px',
                      borderRadius: '8px',
                      border: '1px solid var(--border-color)',
                      background: 'var(--bg-secondary)'
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: '700', fontSize: '14.5px' }}>
                        임시 주문 #{idx + 1} ({d.items.length}종)
                      </div>
                      <div style={{ fontSize: '12.5px', color: 'var(--text-muted)', marginTop: '2px' }}>
                        {d.savedAt ? new Date(d.savedAt).toLocaleTimeString() : ''} · {draftSum.toLocaleString()}원
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={() => {
                          if (onLoadDraft) onLoadDraft(d.id);
                          setIsDraftsModalOpen(false);
                        }}
                      >
                        불러오기
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        style={{ color: 'var(--danger)' }}
                        onClick={() => {
                          if (onRemoveDraft) onRemoveDraft(d.id);
                        }}
                      >
                        삭제
                      </Button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </Modal>
      )}

      {/* 4. Cart-Wide Discount Modal */}
      {isCartDiscountOpen && (
        <Modal
          title="🏷️ 전체 할인 설정"
          maxWidth={380}
          onClose={() => setIsCartDiscountOpen(false)}
          closeOnOverlay
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px' }}>
              {[5, 10, 15, 20].map((pct) => (
                <button
                  key={pct}
                  type="button"
                  className={`cat-btn ${cartDiscountPercent === pct ? 'selected' : ''}`}
                  style={{ height: '44px', fontWeight: '700' }}
                  onClick={() => {
                    onApplyDiscount(pct);
                    setIsCartDiscountOpen(false);
                  }}
                >
                  {pct}%
                </button>
              ))}
            </div>

            <div style={{ display: 'flex', gap: '8px' }}>
              <Input
                type="number"
                placeholder="직접 입력 (%)"
                value={customCartPercent}
                onChange={(e) => setCustomCartPercent(e.target.value)}
                autoFocus
              />
              <Button
                variant="primary"
                size="md"
                onClick={() => {
                  const val = parseInt(customCartPercent, 10);
                  if (!isNaN(val) && val >= 0 && val <= 100) {
                    onApplyDiscount(val);
                    setIsCartDiscountOpen(false);
                  }
                }}
              >
                적용
              </Button>
            </div>

            {cartDiscountPercent > 0 && (
              <Button
                variant="secondary"
                size="md"
                fullWidth
                onClick={() => {
                  onApplyDiscount(0);
                  setIsCartDiscountOpen(false);
                }}
              >
                할인 해제 (0%)
              </Button>
            )}
          </div>
        </Modal>
      )}

      {/* 5. Item-Level Discount Modal */}
      {isItemDiscountOpen && selectedItem && (
        <Modal
          title={`🏷️ ${selectedItem.product.name} 할인`}
          maxWidth={380}
          onClose={() => setIsItemDiscountOpen(false)}
          closeOnOverlay
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px' }}>
              {[5, 10, 20, 30].map((pct) => (
                <button
                  key={pct}
                  type="button"
                  className="cat-btn"
                  style={{ height: '44px', fontWeight: '700' }}
                  onClick={() => {
                    onApplyItemDiscount(selectedItem.product.id, 0, selectedItem.quantity, true, pct);
                    setIsItemDiscountOpen(false);
                  }}
                >
                  {pct}%
                </button>
              ))}
            </div>

            <div style={{ display: 'flex', gap: '8px' }}>
              <Input
                type="number"
                placeholder="직접 입력 (%)"
                value={customItemPercent}
                onChange={(e) => setCustomItemPercent(e.target.value)}
                autoFocus
              />
              <Button
                variant="primary"
                size="md"
                onClick={() => {
                  const val = parseInt(customItemPercent, 10);
                  if (!isNaN(val) && val >= 0 && val <= 100) {
                    onApplyItemDiscount(selectedItem.product.id, 0, selectedItem.quantity, true, val);
                    setIsItemDiscountOpen(false);
                  }
                }}
              >
                적용
              </Button>
            </div>

            <Button
              variant="secondary"
              size="md"
              fullWidth
              onClick={() => {
                onApplyItemDiscount(selectedItem.product.id, 0, selectedItem.quantity, false, 0);
                setIsItemDiscountOpen(false);
              }}
            >
              품목 할인 해제
            </Button>
          </div>
        </Modal>
      )}

      {/* 6. Quantity Direct Input Modal */}
      {qtyModalItem && (
        <Modal
          title={`🔢 ${qtyModalItem.product.name} 수량 변경`}
          maxWidth={360}
          onClose={() => setQtyModalItem(null)}
          closeOnOverlay
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '6px' }}>
              {[1, 2, 3, 5, 10].map((n) => (
                <button
                  key={n}
                  type="button"
                  className="cat-btn"
                  style={{ height: '44px', fontWeight: '700' }}
                  onClick={() => setQtyInputVal(String(n))}
                >
                  {n}
                </button>
              ))}
            </div>

            <Input
              type="number"
              value={qtyInputVal}
              onChange={(e) => setQtyInputVal(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleApplyQtyModal()}
              autoFocus
            />

            <div style={{ display: 'flex', gap: '8px' }}>
              <Button
                variant="secondary"
                size="md"
                fullWidth
                style={{ color: 'var(--danger)' }}
                onClick={() => {
                  const itemKey = qtyModalItem.id || `${qtyModalItem.product.id}_${qtyModalItem.priceType || 'default'}`;
                  onDelete(itemKey);
                  setQtyModalItem(null);
                }}
              >
                삭제
              </Button>
              <Button variant="primary" size="md" fullWidth onClick={handleApplyQtyModal}>
                확인
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </aside>
  );
};

export default Cart;
