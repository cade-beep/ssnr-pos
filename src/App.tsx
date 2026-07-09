import React, { useState, useEffect } from 'react';
import { Product, CartItem, PaymentMethod, Receipt } from './types';
import POSGrid from './components/POSGrid';
import Cart from './components/Cart';
import ReceiptModal from './components/ReceiptModal';
import LoginOverlay, { CashierUser } from './components/LoginOverlay';
import { ShoppingBag, Clock, FileSpreadsheet, RefreshCw, TrendingUp, Coins, Award } from 'lucide-react';

const App: React.FC = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [currentTime, setCurrentTime] = useState<string>('');
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState<boolean>(false);
  const [currentReceipt, setCurrentReceipt] = useState<Receipt | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [receiptsHistory, setReceiptsHistory] = useState<Receipt[]>([]);
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState<boolean>(false);
  const [discountAmount, setDiscountAmount] = useState<number>(0);

  // Cashier Authentication States
  const [cashierUsers, setCashierUsers] = useState<CashierUser[]>([]);
  const [currentCashier, setCurrentCashier] = useState<CashierUser | null>({ name: '미지정', role: '캐셔' });
  const [isCashierLoading, setIsCashierLoading] = useState<boolean>(false);
  const [cashierError, setCashierError] = useState<string>('');

  const loadCashierUsers = () => {
    setIsCashierLoading(true);
    setCashierError('');
    const webappUrl = import.meta.env.VITE_GOOGLE_SHEETS_WEBAPP_URL || "";
    
    fetch(`${webappUrl}?action=users`)
      .then((res) => {
        if (!res.ok) throw new Error('인증 서버로부터 데이터를 읽지 못했습니다.');
        return res.json();
      })
      .then((data) => {
        if (data && data.success && data.users) {
          setCashierUsers(data.users);
          setIsCashierLoading(false);
        } else {
          throw new Error(data.message || '캐셔 목록 로드 실패');
        }
      })
      .catch((err) => {
        console.error('Failed to load cashier list:', err);
        setCashierError('스프레드시트에 [캐서설정] 시트가 구성되지 않았거나 접근할 수 없습니다.');
        setIsCashierLoading(false);
      });
  };

  useEffect(() => {
    loadCashierUsers();
  }, []);

  const loadProducts = () => {
    const categoryMap: { [key: string]: string } = {
      '베이커리': 'bakery',
      '제과류': 'bakery',
      '음료': 'beverage',
      '커피': 'coffee',
      '간식및선물세트': 'food',
      '기타': 'etc'
    };

    if (window.electronAPI) {
      window.electronAPI.getProducts()
        .then((data) => {
          const mapped = data
            .filter((p: any) => p.name && p.name.trim() !== '')
            .map((p: any) => ({
              ...p,
              category: categoryMap[p.category] || p.category
            }));
          setProducts(mapped);
          showToast('구글 시트 상품 정보를 동적으로 로드했습니다. 🔄');
        })
        .catch((err) => {
          console.error('Failed to load initial products:', err);
          showToast('Unable to load products.');
        });
    } else {
      // Browser Direct Web Fallback Mode
      const webappUrl = import.meta.env.VITE_GOOGLE_SHEETS_WEBAPP_URL || "";
      fetch(`${webappUrl}?action=products`)
        .then((res) => res.json())
        .then((data) => {
          if (data && data.success && data.products) {
            const mapped = data.products
              .filter((p: any) => p.name && p.name.trim() !== '')
              .map((p: any) => ({
                ...p,
                category: categoryMap[p.category] || p.category
              }));
            setProducts(mapped);
            showToast('구글 시트 상품 정보를 동적으로 로드했습니다. 🔄');
          } else {
            console.error('API response success is false or products array missing:', data);
            showToast('Unable to load products.');
          }
        })
        .catch((err) => {
          console.error('Failed to fetch products directly in web browser:', err);
          showToast('Unable to load products.');
        });
    }
  };

  useEffect(() => {
    loadProducts();
  }, []);

  // Time ticker
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      const formatted = now.toLocaleDateString('ko-KR', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        weekday: 'short'
      }) + ' ' + now.toLocaleTimeString('ko-KR', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
      });
      setCurrentTime(formatted);
    };
    
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  const showToast = (message: string) => {
    setToastMessage(message);
    setTimeout(() => {
      setToastMessage(null);
    }, 2000);
  };

  // Add to cart
  const handleAddToCart = (product: Product) => {
    setCart((prevCart) => {
      const existing = prevCart.find((item) => item.product.id === product.id);
      if (existing) {
        return prevCart.map((item) =>
          item.product.id === product.id
            ? { ...item, quantity: item.quantity + 1 }
            : item
        );
      }
      return [...prevCart, { product, quantity: 1 }];
    });
    showToast(`${product.name}이(가) 추가되었습니다.`);
  };

  // Increase qty
  const handleIncreaseQty = (productId: string) => {
    setCart((prevCart) =>
      prevCart.map((item) =>
        item.product.id === productId
          ? { ...item, quantity: item.quantity + 1 }
          : item
      )
    );
  };

  // Decrease qty
  const handleDecreaseQty = (productId: string) => {
    setCart((prevCart) =>
      prevCart
        .map((item) => {
          if (item.product.id === productId) {
            return { ...item, quantity: item.quantity - 1 };
          }
          return item;
        })
        .filter((item) => item.quantity > 0)
    );
  };

  // Remove single item
  const handleRemoveFromCart = (productId: string) => {
    const deletedItem = cart.find((item) => item.product.id === productId);
    setCart((prevCart) => prevCart.filter((item) => item.product.id !== productId));
    if (deletedItem) {
      showToast(`${deletedItem.product.name}이(가) 취소되었습니다.`);
    }
  };

  // Clear cart
  const handleClearCart = () => {
    if (cart.length === 0) return;
    if (window.confirm('장바구니에 담긴 모든 내역을 삭제하시겠습니까?')) {
      setCart([]);
      showToast('장바구니가 초기화되었습니다.');
    }
  };

  // Apply custom item discount
  const handleApplyItemDiscount = (productId: string, amount: number, qty: number, isPercent?: boolean, percentVal?: number) => {
    setCart((prevCart) =>
      prevCart.map((item) =>
        item.product.id === productId
          ? { 
              ...item, 
              discount: Math.max(0, amount), 
              discountQty: Math.max(0, qty),
              isPercent: !!isPercent,
              discountPercent: percentVal || 0
            }
          : item
      )
    );
  };

  // Apply global discount with overlap warning guard
  const handleApplyGlobalDiscount = (amount: number) => {
    if (amount > 0 && cart.some((i) => i.discount && i.discountQty && i.discount > 0 && i.discountQty > 0)) {
      const confirmOverlap = window.confirm(
        '이미 개별 할인이 적용된 상품이 장바구니에 있습니다.\n전체 할인을 추가로 중복 적용하시겠습니까?'
      );
      if (!confirmOverlap) {
        return;
      }
    }
    setDiscountAmount(amount);
  };

  // Pricing calculations (summing up each item's max(0, normalTotal - (itemDiscount * discountQty)))
  const totalAmount = cart.reduce((sum, item) => {
    const discountSum = (item.discount || 0) * (item.discountQty || 0);
    const itemTotal = (item.product.price * item.quantity) - discountSum;
    return sum + Math.max(0, itemTotal);
  }, 0);

  // Get Device Identification Name
  const getDeviceName = () => {
    if (window.electronAPI) {
      return '메인 카운터 PC';
    }
    const ua = navigator.userAgent;
    if (/iphone/i.test(ua)) {
      return '캐셔 아이폰';
    }
    if (/ipad/i.test(ua) || (navigator.maxTouchPoints > 1 && /macintosh/i.test(ua))) {
      return '캐셔 아이패드';
    }
    if (/android/i.test(ua)) {
      if (/mobile/i.test(ua)) {
        return '캐셔 안드로이드폰';
      }
      return '캐셔 태블릿';
    }
    return '원격 PC';
  };

  // Payment process handler
  const handleCompletePayment = (paymentMethod: PaymentMethod) => {
    console.log('[LOG 1] 결제 버튼 클릭됨 (handleCompletePayment)');
    const finalAmount = Math.max(0, totalAmount - discountAmount);
    const receipt: Receipt = {
      id: `${getDeviceName()}-${Date.now().toString().slice(-4)}`,
      items: [...cart],
      total: finalAmount,
      totalQuantity: cart.reduce((sum, item) => sum + item.quantity, 0),
      paymentMethod,
      receivedAmount: finalAmount,
      change: 0,
      date: new Date()
    };
    
    setCurrentReceipt(receipt);
    setReceiptsHistory((prev) => [...prev, receipt]);
    setIsPaymentModalOpen(false);
    setCart([]);
    const savedDiscount = discountAmount;
    setDiscountAmount(0);
    
    if (window.electronAPI && window.electronAPI.saveReceipt) {
      const plainReceipt = JSON.parse(JSON.stringify(receipt));
      plainReceipt.cashierName = currentCashier ? currentCashier.name : '시스템';
      if (savedDiscount > 0) {
        plainReceipt.items.push({
          product: {
            id: 'DISCOUNT',
            name: `[할인적용: -${savedDiscount.toLocaleString()}원]`,
            price: 0,
            category: 'etc',
            emoji: '🏷️'
          },
          quantity: 1
        });
      }
      window.electronAPI.saveReceipt(plainReceipt)
        .then((res) => {
          if (res.success) {
            showToast('결제가 완료되었으며 매출이 기록되었습니다.');
          } else {
            showToast('결제 완료 (매출 엑셀 기록 실패: ' + res.error + ')');
          }
        })
        .catch((err) => {
          console.error(err);
          showToast('결제 완료 (매출 기록 오류 발생: ' + String(err.message || err) + ')');
        });
    } else {
      // Browser Direct Web Fallback Mode (doPost)
      const webappUrl = import.meta.env.VITE_GOOGLE_SHEETS_WEBAPP_URL || "";
      const plainReceipt = JSON.parse(JSON.stringify(receipt));
      if (savedDiscount > 0) {
        plainReceipt.items.push({
          product: {
            id: 'DISCOUNT',
            name: `[할인적용: -${savedDiscount.toLocaleString()}원]`,
            price: 0,
            category: 'etc',
            emoji: '🏷️'
          },
          quantity: 1
        });
      }

      const itemsSummary = plainReceipt.items.map((item: any) => {
        if (item.discount && item.discountQty && item.discount > 0 && item.discountQty > 0) {
          const discountSum = item.discount * item.discountQty;
          if (item.isPercent) {
            return `${item.product.name} x ${item.quantity} (개별할인: ${item.discountQty}개 대상 ${item.discountPercent}% 개당 -${item.discount.toLocaleString()}원, 총 -${discountSum.toLocaleString()}원)`;
          }
          return `${item.product.name} x ${item.quantity} (개별할인: ${item.discountQty}개 대상 개당 -${item.discount.toLocaleString()}원, 총 -${discountSum.toLocaleString()}원)`;
        }
        return `${item.product.name} x ${item.quantity}`;
      }).join(', ');
      
      const payload = {
        orderId: plainReceipt.id,
        paymentDateTime: new Date().toLocaleString('ko-KR'),
        paymentMethod: plainReceipt.paymentMethod === 'CARD' ? '신용카드' : '계좌이체',
        totalAmount: plainReceipt.total,
        items: itemsSummary,
        totalQuantity: plainReceipt.totalQuantity,
        receivedAmount: plainReceipt.receivedAmount,
        change: plainReceipt.change,
        cashierName: currentCashier ? currentCashier.name : '시스템'
      };

      fetch(webappUrl, {
        method: 'POST',
        mode: 'no-cors',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      })
      .then(() => {
        showToast('결제가 완료되었으며 매출이 온라인 기록되었습니다! 💾');
      })
      .catch((err) => {
        console.error('Failed to post payment directly from web browser:', err);
        showToast('결제 완료 (매출 온라인 저장 실패: 오프라인)');
      });
    }
  };

  if (!currentCashier) {
    return (
      <LoginOverlay
        users={cashierUsers}
        onLoginSuccess={(user) => {
          setCurrentCashier(user);
          showToast(`🔓 ${user.name} (${user.role}) 근무자 로그인 성공`);
        }}
        isLoading={isCashierLoading}
        errorMsg={cashierError}
        onRetry={loadCashierUsers}
      />
    );
  }

  return (
    <div className="app-container">
      {/* Header */}
      <header className="app-header">
        <div className="header-logo">
          <ShoppingBag size={22} color="#38bdf8" />
          <h1>서산나래 미니빵집</h1>
          <span className="excel-badge" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <FileSpreadsheet size={12} />
            Excel Live
          </span>
          <button 
            type="button" 
            className="btn-refresh btn-reload" 
            onClick={loadProducts}
            title="상품 목록 실시간 새로고침"
            style={{ 
              background: 'rgba(255,255,255,0.08)', 
              border: 'none', 
              borderRadius: '6px', 
              padding: '6px 12px', 
              color: 'var(--text-primary)', 
              cursor: 'pointer', 
              display: 'flex', 
              alignItems: 'center', 
              gap: '6px',
              fontSize: '12.5px',
              marginLeft: '16px',
              fontWeight: '700',
              transition: 'all 0.2s ease',
              boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
            }}
          >
            <RefreshCw size={12} />
            상품 새로고침
          </button>
        </div>
        <div className="header-right" style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div 
            className="cashier-info"
            style={{ 
              fontSize: '12.5px', 
              padding: '4px 10px', 
              background: currentCashier.role === '관리자' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(255, 255, 255, 0.08)',
              color: currentCashier.role === '관리자' ? '#34d399' : 'var(--text-primary)',
              borderRadius: '99px',
              border: currentCashier.role === '관리자' ? '1px solid rgba(16, 185, 129, 0.25)' : '1px solid rgba(255, 255, 255, 0.12)',
              fontWeight: '600',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            👤 {currentCashier.name} ({currentCashier.role})
          </div>
          <button
            type="button"
            className="btn-refresh btn-shift"
            onClick={() => {
              setCurrentCashier(null);
              showToast('👋 근무자 로그아웃 완료');
            }}
            style={{
              background: 'rgba(239, 68, 68, 0.1)',
              border: '1px solid rgba(239, 68, 68, 0.2)',
              borderRadius: '6px',
              padding: '5px 10px',
              color: '#fca5a5',
              cursor: 'pointer',
              fontSize: '12px',
              fontWeight: '700',
              transition: 'all 0.2s ease'
            }}
          >
            근무자 교대
          </button>
          <div className="header-time">
            <Clock size={13} style={{ marginRight: '6px', verticalAlign: 'middle' }} />
            {currentTime}
          </div>
        </div>
      </header>

      {/* Main POS Dashboard Grid */}
      <div className="pos-dashboard">
        <div className="pos-main-panel">
          {products.length === 0 ? (
            <div style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--text-secondary)',
              gap: '12px'
            }}>
              <FileSpreadsheet size={48} className="cart-empty-icon" style={{ opacity: 0.3 }} />
              <div>상품 정보를 불러오는 중이거나 목록이 비어있습니다.</div>
            </div>
          ) : (
            <POSGrid products={products} onProductClick={handleAddToCart} />
          )}
        </div>
        
        {/* Cart Panel */}
        <aside className="pos-side-panel">
          <Cart
            items={cart}
            totalAmount={totalAmount}
            discountAmount={discountAmount}
            onIncrease={handleIncreaseQty}
            onDecrease={handleDecreaseQty}
            onDelete={handleRemoveFromCart}
            onClear={handleClearCart}
            onCheckout={() => setIsPaymentModalOpen(true)}
            onViewHistory={() => setIsHistoryModalOpen(true)}
            historyCount={receiptsHistory.length}
            onApplyDiscount={handleApplyGlobalDiscount}
            onApplyItemDiscount={handleApplyItemDiscount}
          />
        </aside>
      </div>

      {/* Payment Selection and Change Calculator Modal */}
      {isPaymentModalOpen && (
        <PaymentModal
          totalAmount={Math.max(0, totalAmount - discountAmount)}
          onClose={() => setIsPaymentModalOpen(false)}
          onPaymentComplete={handleCompletePayment}
        />
      )}

      {/* Receipts History List Modal */}
      {isHistoryModalOpen && (
        <HistoryModal
          receipts={receiptsHistory}
          onClose={() => setIsHistoryModalOpen(false)}
          onSelectReceipt={(receipt) => {
            setCurrentReceipt(receipt);
          }}
        />
      )}

      {/* Checkout Receipt Modal */}
      {currentReceipt && (
        <ReceiptModal
          receipt={currentReceipt}
          onClose={() => setCurrentReceipt(null)}
        />
      )}

      {/* Notification Toast */}
      {toastMessage && (
        <div className="toast">
          {toastMessage}
        </div>
      )}
    </div>
  );
};

// PaymentModal Subcomponent
interface PaymentModalProps {
  totalAmount: number;
  onClose: () => void;
  onPaymentComplete: (method: PaymentMethod) => void;
}

const PaymentModal: React.FC<PaymentModalProps> = ({ totalAmount, onClose, onPaymentComplete }) => {
  const [method, setMethod] = useState<PaymentMethod>('CARD');
  
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onPaymentComplete(method);
  };

  return (
    <div className="modal-overlay">
      <form className="modal-content" onSubmit={handleSubmit}>
        <div className="modal-body">
          <div className="modal-title">결제 처리</div>
          
          <div className="payment-selector">
            <button 
              type="button"
              className={`payment-option ${method === 'CARD' ? 'selected' : ''}`}
              onClick={() => setMethod('CARD')}
            >
              <span style={{ fontSize: '24px' }}>💳</span>
              <span className="payment-option-title">신용카드</span>
            </button>
            <button 
              type="button"
              className={`payment-option ${method === 'TRANSFER' ? 'selected' : ''}`}
              onClick={() => setMethod('TRANSFER')}
            >
              <span style={{ fontSize: '24px' }}>🏦</span>
              <span className="payment-option-title">계좌이체</span>
            </button>
          </div>

          {method === 'TRANSFER' ? (
            <div style={{ 
              background: 'rgba(0,0,0,0.15)', 
              borderRadius: 'var(--radius-md)', 
              padding: '24px 16px', 
              textAlign: 'center',
              marginBottom: '24px',
              border: '1px solid var(--border-color)',
              color: 'var(--text-secondary)'
            }}>
              <p style={{ fontSize: '14px', marginBottom: '8px' }}>아래 계좌로 송금을 확인한 뒤 완료해 주세요.</p>
              <div style={{ margin: '12px 0', padding: '12px', background: 'rgba(255,255,255,0.05)', borderRadius: '6px', fontSize: '15px', color: 'var(--text-primary)', fontWeight: '700' }}>
                농협 351-8770-93 예금주: 서산나래
              </div>
              <h3 style={{ color: 'var(--text-primary)', fontSize: '22px', fontWeight: '800' }}>
                {totalAmount.toLocaleString()}원
              </h3>
            </div>
          ) : (
            <div style={{ 
              background: 'rgba(0,0,0,0.15)', 
              borderRadius: 'var(--radius-md)', 
              padding: '24px 16px', 
              textAlign: 'center',
              marginBottom: '24px',
              border: '1px solid var(--border-color)',
              color: 'var(--text-secondary)'
            }}>
              <p style={{ fontSize: '14px', marginBottom: '8px' }}>카드 단말기 결제를 대기합니다.</p>
              <h3 style={{ color: 'var(--text-primary)', fontSize: '22px', fontWeight: '800' }}>
                {totalAmount.toLocaleString()}원
              </h3>
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button type="button" className="btn btn-secondary" style={{ flex: 1 }} onClick={onClose}>취소</button>
          <button 
            type="submit" 
            className="btn btn-primary" 
            style={{ flex: 2 }}
          >
            결제 완료
          </button>
        </div>
      </form>
    </div>
  );
};

export default App;

interface HistoryModalProps {
  receipts: Receipt[];
  onClose: () => void;
  onSelectReceipt: (receipt: Receipt) => void;
}

const HistoryModal: React.FC<HistoryModalProps> = ({ receipts, onClose, onSelectReceipt }) => {
  const [salesSource, setSalesSource] = useState<'local' | 'sheets'>('local');
  const [sheetsSales, setSheetsSales] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadSheetsSales = () => {
    setIsLoading(true);
    setErrorMessage(null);
    if (window.electronAPI && window.electronAPI.getSales) {
      window.electronAPI.getSales()
        .then((data) => {
          setSheetsSales(data);
          setIsLoading(false);
        })
        .catch((err) => {
          console.error(err);
          setErrorMessage('구글 시트 매출 로드에 실패했습니다.');
          setIsLoading(false);
        });
    } else {
      // Browser Direct Web Fallback Mode
      const webappUrl = import.meta.env.VITE_GOOGLE_SHEETS_WEBAPP_URL || "";
      fetch(`${webappUrl}?action=sales`)
        .then((res) => res.json())
        .then((data) => {
          if (data && data.success && data.sales) {
            setSheetsSales(data.sales);
          } else {
            setErrorMessage('구글 시트 매출 배열이 비어있습니다.');
          }
          setIsLoading(false);
        })
        .catch((err) => {
          console.error(err);
          setErrorMessage('인터넷 연결을 확인해 주십시오.');
          setIsLoading(false);
        });
    }
  };

  useEffect(() => {
    if (salesSource === 'sheets') {
      loadSheetsSales();
    }
  }, [salesSource]);

  // 오늘 날짜 문자열 감지기 ('2026. 7. 8.' 등)
  const todayStr = new Date().toLocaleDateString('ko-KR');

  // 소스 맵 변환
  const activeList = salesSource === 'local'
    ? receipts.map(r => ({
        orderId: r.id,
        paymentDateTime: new Date(r.date).toLocaleString('ko-KR'),
        paymentMethod: r.paymentMethod === 'CARD' ? '신용카드' : '계좌이체',
        totalAmount: r.total,
        items: r.items.map(i => `${i.product.name} x ${i.quantity}`).join(', '),
        totalQuantity: r.totalQuantity,
        receivedAmount: r.receivedAmount,
        change: r.change,
        rawReceipt: r
      }))
    : sheetsSales;

  // 오늘 매출 필터링
  const todaySales = activeList.filter(s => {
    if (!s.paymentDateTime) return false;
    const formatted = s.paymentDateTime.trim();
    // '2026. 7. 8.' 혹은 '2026-07-08' 유사 포맷 대응
    return formatted.includes(todayStr.slice(0, 10).trim());
  });

  // 오늘 정산 통계 집계
  const summary = todaySales.reduce((acc, curr) => {
    acc.total += curr.totalAmount;
    if (curr.paymentMethod === '신용카드') {
      acc.cardCount += 1;
      acc.cardAmount += curr.totalAmount;
    } else {
      acc.transferCount += 1;
      acc.transferAmount += curr.totalAmount;
    }

    if (curr.items) {
      const itemsArr = curr.items.split(', ');
      itemsArr.forEach((itemStr: string) => {
        const parts = itemStr.split(' x ');
        const name = parts[0];
        const qty = Number(parts[1]) || 1;
        if (name && !name.includes('[할인적용')) {
          acc.itemStats[name] = (acc.itemStats[name] || 0) + qty;
        }
      });
    }
    return acc;
  }, {
    total: 0,
    cardCount: 0,
    cardAmount: 0,
    transferCount: 0,
    transferAmount: 0,
    itemStats: {} as { [key: string]: number }
  });

  const topItems = (Object.entries(summary.itemStats) as [string, number][])
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);

  const handleSelectSheetReceipt = (s: any) => {
    if (s.rawReceipt) {
      onSelectReceipt(s.rawReceipt);
      return;
    }

    const parsedItems = (s.items || "").split(', ').map((itemStr: string) => {
      const parts = itemStr.split(' x ');
      const name = parts[0];
      const qty = Number(parts[1]) || 1;
      return {
        product: {
          id: name.includes('[할인적용') ? 'DISCOUNT' : 'GS',
          name,
          price: 0,
          category: 'etc' as const,
          emoji: name.includes('[할인적용') ? '🏷️' : '🍞'
        },
        quantity: qty
      };
    });

    const parsed: Receipt = {
      id: s.orderId,
      items: parsedItems,
      total: s.totalAmount,
      totalQuantity: s.totalQuantity,
      paymentMethod: s.paymentMethod === '신용카드' ? 'CARD' : 'TRANSFER',
      receivedAmount: s.receivedAmount || s.totalAmount,
      change: s.change || 0,
      date: new Date()
    };
    onSelectReceipt(parsed);
  };

  return (
    <div className="modal-overlay" style={{ zIndex: 1000 }}>
      <div className="modal-content" style={{ maxWidth: '680px', width: '95%' }}>
        <div className="modal-body">
          <div className="modal-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <span>실시간 매출 및 마감 정산 📊</span>
            <span style={{ fontSize: '13px', color: 'var(--text-secondary)', fontWeight: 'normal' }}>
              총 {activeList.length}건 내역 확보
            </span>
          </div>

          {/* 소스 스위치 탭 */}
          <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
            <button 
              type="button" 
              onClick={() => setSalesSource('local')}
              style={{
                flex: 1,
                padding: '10px',
                borderRadius: '6px',
                border: '1px solid var(--border-color)',
                background: salesSource === 'local' ? 'rgba(56,189,248,0.1)' : 'transparent',
                color: salesSource === 'local' ? '#38bdf8' : 'var(--text-secondary)',
                fontWeight: 'bold',
                cursor: 'pointer',
                fontSize: '13px',
                transition: 'all 0.2s ease'
              }}
            >
              💻 최근 판매 이력 (로컬)
            </button>
            <button 
              type="button" 
              onClick={() => setSalesSource('sheets')}
              style={{
                flex: 1,
                padding: '10px',
                borderRadius: '6px',
                border: '1px solid var(--border-color)',
                background: salesSource === 'sheets' ? 'rgba(56,189,248,0.1)' : 'transparent',
                color: salesSource === 'sheets' ? '#38bdf8' : 'var(--text-secondary)',
                fontWeight: 'bold',
                cursor: 'pointer',
                fontSize: '13px',
                transition: 'all 0.2s ease'
              }}
            >
              ☁️ 구글 시트 실시간 연동 정산
            </button>
          </div>

          {/* 정산 요약 대시보드 카드 */}
          {todaySales.length > 0 ? (
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: '12px',
              marginBottom: '16px'
            }}>
              <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: '12px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <span style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <Coins size={12} color="#fbbf24" /> 오늘 총 매출액
                </span>
                <span style={{ fontSize: '18px', fontWeight: '800', color: 'var(--text-primary)' }}>
                  {summary.total.toLocaleString()}원
                </span>
                <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                  오늘 {todaySales.length}건 기입됨
                </span>
              </div>
              <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: '12px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <span style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <TrendingUp size={12} color="#38bdf8" /> 결제 수단 분류
                </span>
                <span style={{ fontSize: '11.5px', color: 'var(--text-primary)', fontWeight: '700' }}>
                  💳 카드: {summary.cardCount}건 ({summary.cardAmount.toLocaleString()}원)
                </span>
                <span style={{ fontSize: '11.5px', color: 'var(--text-primary)', fontWeight: '700' }}>
                  🏦 이체: {summary.transferCount}건 ({summary.transferAmount.toLocaleString()}원)
                </span>
              </div>
              <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: '12px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <span style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <Award size={12} color="#34d399" /> 실시간 인기 빵 TOP 3
                </span>
                {topItems.length === 0 ? (
                  <span style={{ fontSize: '11.5px', color: 'var(--text-secondary)' }}>집계 데이터 없음</span>
                ) : (
                  topItems.map(([name, qty], idx) => (
                    <span key={name} style={{ fontSize: '11px', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: '700' }}>
                      {idx + 1}. {name} ({qty}개)
                    </span>
                  ))
                )}
              </div>
            </div>
          ) : (
            salesSource === 'sheets' && !isLoading && (
              <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px dashed var(--border-color)', borderRadius: 'var(--radius-md)', padding: '16px', textAlign: 'center', fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '16px' }}>
                오늘 날짜({todayStr})의 정산 내역이 구글 시트에 아직 기록되지 않았습니다.
              </div>
            )
          )}

          {/* 매출 목록 컨테이너 */}
          <div style={{ maxHeight: '280px', overflowY: 'auto', margin: '8px 0', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)' }}>
            {isLoading ? (
              <div style={{ padding: '40px 16px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                <RefreshCw size={24} className="cart-empty-icon" style={{ animation: 'spin 2s linear infinite', marginBottom: '8px' }} />
                <div>구글 스프레드시트 매출 데이터를 가져오는 중...</div>
              </div>
            ) : errorMessage ? (
              <div style={{ padding: '40px 16px', textAlign: 'center', color: '#ef4444' }}>
                {errorMessage}
              </div>
            ) : activeList.length === 0 ? (
              <div style={{ padding: '40px 16px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                기록된 매출 내역이 존재하지 않습니다.
              </div>
            ) : (
              activeList.slice().reverse().map((s, idx) => (
                <div 
                  key={s.orderId || idx} 
                  style={{ 
                    display: 'flex', 
                    justifyContent: 'space-between', 
                    alignItems: 'center', 
                    padding: '12px 16px', 
                    borderBottom: '1px solid var(--border-color)',
                    background: 'rgba(255,255,255,0.01)'
                  }}
                >
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: 1, marginRight: '16px', overflow: 'hidden' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontWeight: '800', fontSize: '14.5px', color: 'var(--text-primary)' }}>
                        {s.paymentDateTime}
                      </span>
                      <span style={{ 
                        fontSize: '11px', 
                        padding: '2px 6px', 
                        borderRadius: '4px', 
                        background: s.paymentMethod === '신용카드' ? 'rgba(56,189,248,0.1)' : 'rgba(46,204,182,0.1)',
                        color: s.paymentMethod === '신용카드' ? '#38bdf8' : '#2ec4b6',
                        fontWeight: '700'
                      }}>
                        {s.paymentMethod}
                      </span>
                    </div>
                    <span style={{ fontSize: '12px', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={s.items}>
                      {s.items}
                    </span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <span style={{ fontWeight: '800', fontSize: '15.5px', color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>
                      {s.totalAmount.toLocaleString()}원
                    </span>
                    <button 
                      type="button" 
                      className="btn btn-secondary" 
                      style={{ padding: '6px 12px', fontSize: '12px', whiteSpace: 'nowrap' }}
                      onClick={() => handleSelectSheetReceipt(s)}
                    >
                      상세보기
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="modal-footer" style={{ gap: '8px' }}>
          {salesSource === 'sheets' && (
            <button type="button" className="btn btn-secondary" style={{ flex: 1 }} onClick={loadSheetsSales}>
              🔄 실시간 동기화
            </button>
          )}
          <button type="button" className="btn btn-primary" style={{ flex: 2 }} onClick={onClose}>
            닫기
          </button>
        </div>
      </div>
    </div>
  );
};
