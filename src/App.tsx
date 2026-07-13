import React, { useState, useEffect } from 'react';
import { Product, CartItem, PaymentMethod, Receipt, CashierUser } from './types';
import POSGrid from './components/POSGrid';
import Cart from './components/Cart';
import ReceiptModal from './components/ReceiptModal';
import LoginOverlay from './components/LoginOverlay';
import ProductsView from './components/ProductsView';
import HistoryView from './components/HistoryView';
import SettingsView from './components/SettingsView';
import { RefreshCw, LogOut } from 'lucide-react';
import { supabase } from './supabase';
import { STATIC_PRODUCTS } from './productsData';
import { auditLog } from './utils/auditLogger';

const getFriendlyErrorMessage = (error: any): string => {
  if (!error) return '알 수 없는 오류가 발생했습니다.';
  const msg = error.message || String(error);
  
  if (msg.includes('재고가 부족합니다') || msg.includes('stock')) {
    return '⚠️ 재고가 부족합니다. 구매 수량을 다시 확인해 주세요.';
  }
  if (msg.includes('JWT') || msg.includes('인증') || msg.includes('invalid claims')) {
    return '⚠️ 로그인 세션이 만료되었습니다. 로그아웃 후 다시 로그인해 주세요.';
  }
  if (msg.includes('Failed to fetch') || msg.includes('NetworkError') || msg.includes('network')) {
    return '🌐 인터넷 연결이 원활하지 않거나 데이터베이스 서버와 통신할 수 없습니다. 공유기 신호 및 네트워크 환경을 확인해 주세요.';
  }
  if (msg.includes('duplicate key value') || msg.includes('order_number') || msg.includes('unique constraint') || msg.includes('idempotency')) {
    return '🔒 이미 결제 처리 중이거나 완료된 주문 번호입니다. 중복 승인이 성공적으로 예방되었습니다.';
  }
  if (msg.includes('is_active')) {
    return '⚠️ 비활성화되었거나 품절된 상품이 포함되어 있습니다. 최신 상품 상태를 확인해 주세요.';
  }
  if (msg.includes('가격 정보가 일치하지 않습니다')) {
    return '⚠️ 상품 정보(단가)가 일치하지 않습니다. 포스기를 새로고침하여 상품 정보를 업데이트해 주세요.';
  }
  if (msg.includes('permission denied') || msg.includes('row-level security') || msg.includes('policy')) {
    return '⚠️ 작업 처리 권한이 없습니다. (관리자 권한이 필요하거나 세션 인증 만료)';
  }
  return `데이터베이스 처리 중 오류가 발생했습니다.\n(${msg})`;
};

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'sales' | 'history' | 'products' | 'settings'>('sales');
  const [products, setProducts] = useState<Product[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState<boolean>(false);
  const [currentReceipt, setCurrentReceipt] = useState<Receipt | null>(null);
  
  // Custom Toast State
  const [toast, setToast] = useState<{ message: string; type: 'info' | 'success' | 'error' } | null>(null);
  const [isReceiptChecked, setIsReceiptChecked] = useState<boolean>(true);
  const [discountAmount, setDiscountAmount] = useState<number>(0);

  // Cashier Authentication States
  const [currentCashier, setCurrentCashier] = useState<CashierUser | null>(null);
  const [isSessionLoading, setIsSessionLoading] = useState<boolean>(true);
  const [activeIdempotencyKey, setActiveIdempotencyKey] = useState<string | null>(null);
  const [isCheckoutSubmitting, setIsCheckoutSubmitting] = useState<boolean>(false);

  // Check auth session on startup
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session && session.user) {
        const user = session.user;
        let displayName = user.user_metadata?.name || user.email?.split('@')[0] || '캐셔';
        if (user.email?.startsWith('rbflrbgh') && displayName === 'rbflrbgh') {
          displayName = '김규호';
        }

        const isAdmin = 
          user.user_metadata?.role === '관리자' || 
          user.email?.startsWith('admin') || 
          user.email?.startsWith('rbflrbgh') || 
          displayName === '김규호';

        setCurrentCashier({
          email: user.email || '',
          name: displayName,
          role: isAdmin ? '관리자' : '캐셔'
        });
      }
      setIsSessionLoading(false);
    }).catch(err => {
      console.error('Session loading error:', err);
      setIsSessionLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session && session.user) {
        const user = session.user;
        let displayName = user.user_metadata?.name || user.email?.split('@')[0] || '캐셔';
        if (user.email?.startsWith('rbflrbgh') && displayName === 'rbflrbgh') {
          displayName = '김규호';
        }

        const isAdmin = 
          user.user_metadata?.role === '관리자' || 
          user.email?.startsWith('admin') || 
          user.email?.startsWith('rbflrbgh') || 
          displayName === '김규호';

        setCurrentCashier({
          email: user.email || '',
          name: displayName,
          role: isAdmin ? '관리자' : '캐셔'
        });
      } else {
        setCurrentCashier(null);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  // Global Keyboard Shortcuts
  useEffect(() => {
    if (!currentCashier) return;

    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      // Focus Search input on F1
      if (e.key === 'F1') {
        e.preventDefault();
        const searchInput = document.querySelector('.search-input') as HTMLInputElement | null;
        if (searchInput) {
          searchInput.focus();
          searchInput.select();
        }
      }

      // Escape key to close payment modals
      if (e.key === 'Escape') {
        if (isPaymentModalOpen && !isCheckoutSubmitting) {
          setIsPaymentModalOpen(false);
        }
      }

      // F12 to trigger checkout
      if (e.key === 'F12') {
        if (cart.length > 0 && !isPaymentModalOpen && activeTab === 'sales') {
          e.preventDefault();
          const key = crypto.randomUUID ? crypto.randomUUID() : `SSNR-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
          setActiveIdempotencyKey(key);
          setIsPaymentModalOpen(true);
        }
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [currentCashier, cart, isPaymentModalOpen, isCheckoutSubmitting, activeTab]);

  // Auto-focus search input when activeTab is sales
  useEffect(() => {
    if (activeTab === 'sales' && currentCashier) {
      setTimeout(() => {
        const searchInput = document.querySelector('.search-input') as HTMLInputElement | null;
        if (searchInput) {
          searchInput.focus();
        }
      }, 150);
    }
  }, [activeTab, currentCashier]);

  // Fetch products from Supabase and auto-seed if database is empty
  const loadProducts = async () => {
    try {
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .order('name', { ascending: true });

      if (error) {
        throw error;
      }

      if (!data || data.length === 0) {
        console.log('Database products empty. Auto-seeding initial products...');
        const seedData = STATIC_PRODUCTS.map((p, idx) => ({
          id: `P-${idx + 1}`,
          name: p.name,
          price: 1500, // starting default price
          category: p.category,
          emoji: p.emoji,
          image_url: p.imageUrl,
          stock: 50, // default stock levels
          low_stock_threshold: 5,
          is_active: true
        }));

        const { error: seedErr } = await supabase.from('products').insert(seedData);
        if (seedErr) throw seedErr;

        setProducts(seedData.map(s => ({
          id: s.id,
          name: s.name,
          price: s.price,
          category: s.category as any,
          emoji: s.emoji,
          imageUrl: s.image_url,
          stock: s.stock,
          lowStockThreshold: s.low_stock_threshold,
          isActive: s.is_active
        })));
        showToast('📦 상품 데이터를 기본 목록으로 자동 초기화했습니다.', 'info');
      } else {
        const mapped = data.map(d => ({
          id: d.id,
          name: d.name,
          price: Number(d.price) || 0,
          category: d.category as any,
          emoji: d.emoji,
          imageUrl: d.image_url,
          stock: d.stock,
          lowStockThreshold: d.low_stock_threshold,
          isActive: d.is_active,
          barcode: d.barcode
        }));
        setProducts(mapped);
      }
    } catch (err: any) {
      console.error('Failed to load products dynamically:', err);
      showToast('⚠️ 상품 데이터를 가져오지 못했습니다. 오프라인 카탈로그로 대체합니다.', 'error');
      // Fallback
      setProducts(STATIC_PRODUCTS.map((p, idx) => ({
        id: `P-STATIC-${idx}`,
        name: p.name,
        price: 1500,
        category: p.category as any,
        emoji: p.emoji,
        imageUrl: p.imageUrl,
        stock: 10,
        lowStockThreshold: 3,
        isActive: true
      })));
    }
  };

  useEffect(() => {
    loadProducts();
  }, []);

  // Barcode scanner listener
  useEffect(() => {
    let buffer = '';
    let lastKeyTime = Date.now();

    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if user is typing in form fields
      if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'SELECT') {
        return;
      }

      const currentTime = Date.now();
      
      // Barcode scanners typically send keys very rapidly
      if (currentTime - lastKeyTime > 100) {
        buffer = '';
      }
      
      lastKeyTime = currentTime;

      if (e.key === 'Enter') {
        if (buffer.length > 2) {
          console.log('Barcode scanned:', buffer);
          const matched = products.find(p => p.barcode === buffer && p.isActive !== false);
          if (matched) {
            handleAddToCart(matched);
            showToast(`🏷️ 바코드 스캔: [${matched.name}] 추가`, 'success');
          } else {
            showToast(`⚠️ 바코드 [${buffer}]에 매칭되는 활성 상품이 없습니다.`, 'error');
          }
          buffer = '';
        }
      } else if (e.key.length === 1) {
        buffer += e.key;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [products]);

  const showToast = (message: string, type: 'info' | 'success' | 'error' = 'info') => {
    setToast({ message, type });
    setTimeout(() => {
      setToast(null);
    }, 2500);
  };

  // Add to cart
  const handleAddToCart = (product: Product) => {
    // Inventory check
    const currentStock = product.stock !== undefined ? product.stock : 999;
    const existing = cart.find((item) => item.product.id === product.id);
    const neededQty = existing ? existing.quantity + 1 : 1;

    if (currentStock < neededQty) {
      showToast(`⚠️ ${product.name}의 재고가 부족합니다. (남은 수량: ${currentStock}개)`, 'error');
      return;
    }

    setCart((prevCart) => {
      if (existing) {
        return prevCart.map((item) =>
          item.product.id === product.id
            ? { ...item, quantity: item.quantity + 1 }
            : item
        );
      }
      return [...prevCart, { product, quantity: 1 }];
    });
    showToast(`${product.name}이(가) 추가되었습니다.`, 'success');
  };

  // Increase qty
  const handleIncreaseQty = (productId: string) => {
    const product = products.find(p => p.id === productId);
    const existing = cart.find(item => item.product.id === productId);
    if (!product || !existing) return;

    const currentStock = product.stock !== undefined ? product.stock : 999;
    if (currentStock <= existing.quantity) {
      showToast(`⚠️ 재고 용량을 초과할 수 없습니다. (최대 재고: ${currentStock}개)`, 'error');
      return;
    }

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
      showToast(`${deletedItem.product.name}이(가) 취소되었습니다.`, 'info');
    }
  };

  // Set explicit quantity
  const handleSetQty = (productId: string, quantity: number) => {
    if (quantity <= 0) {
      handleRemoveFromCart(productId);
      return;
    }
    setCart((prevCart) =>
      prevCart.map((item) =>
        item.product.id === productId
          ? { ...item, quantity }
          : item
      )
    );
  };

  // Clear cart
  const handleClearCart = () => {
    if (cart.length === 0) return;
    if (window.confirm('장바구니에 담긴 모든 내역을 삭제하시겠습니까?')) {
      setCart([]);
      showToast('장바구니가 초기화되었습니다.', 'info');
    }
  };

  // Draft Save/Load
  const handleSaveDraft = () => {
    if (cart.length === 0) {
      showToast('장바구니가 비어있어 임시저장할 수 없습니다.', 'error');
      return;
    }
    localStorage.setItem('ssnr_pos_cart_draft', JSON.stringify(cart));
    showToast('🛒 장바구니가 임시저장되었습니다.', 'success');
  };

  // Load draft on mount
  useEffect(() => {
    const saved = localStorage.getItem('ssnr_pos_cart_draft');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setCart(parsed);
          showToast('💾 임시저장된 장바구니를 불러왔습니다.', 'info');
          localStorage.removeItem('ssnr_pos_cart_draft');
        }
      } catch (e) {
        console.error('Failed to parse draft cart', e);
      }
    }
  }, []);

  // Dynamic Recent Products
  const getRecentProducts = (): string[] => {
    const fallbacks = ['단팥빵', '소보로빵', '소금빵', '초코칩쿠키'];
    const activeProds = products.filter(p => p.isActive !== false).map(p => p.name);
    return activeProds.filter(name => fallbacks.includes(name)).slice(0, 4);
  };

  const handleRecentChipClick = (productName: string) => {
    const found = products.find(p => p.name === productName && p.isActive !== false);
    if (found) {
      handleAddToCart(found);
    } else {
      showToast(`상품 '${productName}'을(를) 찾을 수 없습니다.`, 'error');
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

  // Apply global discount
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

  const totalAmount = cart.reduce((sum, item) => {
    const discountSum = (item.discount || 0) * (item.discountQty || 0);
    const itemTotal = (item.product.price * item.quantity) - discountSum;
    return sum + Math.max(0, itemTotal);
  }, 0);

  // Payment process handler with database RPC complete_sale (transaction-safe)
  const handleCompletePayment = async (paymentMethod: PaymentMethod, receivedCashVal?: number, changeVal?: number) => {
    if (isCheckoutSubmitting) return;
    setIsCheckoutSubmitting(true);
    console.log('[LOG] Initiating payment checkout flow with database RPC');

    // 1. Stock Pre-check (Prevent Negative Inventory before sending request)
    for (const item of cart) {
      const currentProd = products.find(p => p.id === item.product.id);
      if (currentProd) {
        const currentStock = currentProd.stock !== undefined ? currentProd.stock : 999;
        if (currentStock < item.quantity) {
          alert(`⚠️ 결제 불가: [${item.product.name}] 상품의 재고가 부족합니다.\n(현재 재고: ${currentStock}개, 구매 수량: ${item.quantity}개)`);
          setIsCheckoutSubmitting(false);
          return;
        }
      }
    }

    const finalAmount = Math.max(0, totalAmount - discountAmount);
    
    // Fallback key if activeIdempotencyKey is somehow not set
    const finalIdempotencyKey = activeIdempotencyKey || (crypto.randomUUID ? crypto.randomUUID() : `SSNR-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`);

    try {
      // Prepare cart payload for RPC
      const cartPayload = cart.map(item => ({
        product_id: item.product.id,
        product_name: item.product.name,
        price: item.product.price,
        quantity: item.quantity,
        discount: item.discount || 0,
        discount_qty: item.discountQty || 0,
        is_percent: !!item.isPercent,
        discount_percent: item.discountPercent || 0
      }));

      // Call database transaction RPC
      const { data: rpcData, error: rpcError } = await supabase.rpc('complete_sale', {
        p_idempotency_key: finalIdempotencyKey,
        p_payment_method: paymentMethod,
        p_total_amount: finalAmount,
        p_total_quantity: cart.reduce((sum, item) => sum + item.quantity, 0),
        p_received_amount: receivedCashVal !== undefined ? receivedCashVal : finalAmount,
        p_change: changeVal !== undefined ? changeVal : 0,
        p_items: cartPayload,
        p_global_discount: discountAmount
      });

      if (rpcError) {
        throw new Error(rpcError.message);
      }

      if (!rpcData || !rpcData.success) {
        throw new Error(rpcData?.message || '결제 등록에 실패했습니다.');
      }

      const receipt: Receipt = {
        id: finalIdempotencyKey,
        items: [...cart],
        total: finalAmount,
        totalQuantity: cart.reduce((sum, item) => sum + item.quantity, 0),
        paymentMethod,
        receivedAmount: receivedCashVal !== undefined ? receivedCashVal : finalAmount,
        change: changeVal !== undefined ? changeVal : 0,
        date: new Date(),
        cashierName: currentCashier ? currentCashier.name : '시스템'
      };

      // Best-effort Sync to Google Sheets
      const webappUrl = import.meta.env.VITE_GOOGLE_SHEETS_WEBAPP_URL || "";
      if (webappUrl) {
        const itemsSummary = cart.map((item: any) => {
          if (item.discount && item.discountQty && item.discount > 0 && item.discountQty > 0) {
            const discountSum = item.discount * item.discountQty;
            return `${item.product.name} x ${item.quantity} (할인: -${discountSum.toLocaleString()}원)`;
          }
          return `${item.product.name} x ${item.quantity}`;
        }).join(', ');
        
        const payload = {
          orderId: finalIdempotencyKey,
          paymentDateTime: new Date().toLocaleString('ko-KR'),
          paymentMethod: paymentMethod === 'CARD' ? '신용카드' : '계좌이체',
          totalAmount: finalAmount,
          items: itemsSummary,
          totalQuantity: receipt.totalQuantity,
          receivedAmount: receipt.receivedAmount,
          change: receipt.change,
          cashierName: receipt.cashierName
        };

        fetch(webappUrl, {
          method: 'POST',
          mode: 'no-cors',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        }).catch(err => console.warn('Google Sheets sync fallback failed:', err));
      }

      // Log audit transaction
      auditLog({
        action: 'SALE',
        result: 'SUCCESS',
        context: {
          orderId: finalIdempotencyKey,
          amount: finalAmount,
          itemsCount: cart.length,
          method: paymentMethod
        }
      });

      showToast('💳 결제가 완료되고 재고가 정상 차감되었습니다.', 'success');
      if (isReceiptChecked) {
        setCurrentReceipt(receipt);
      }
      setIsPaymentModalOpen(false);
      setCart([]);
      setDiscountAmount(0);
      setActiveIdempotencyKey(null);
      loadProducts();

      // Auto-focus search input after checkout
      setTimeout(() => {
        const searchInput = document.querySelector('.search-input') as HTMLInputElement | null;
        if (searchInput) {
          searchInput.focus();
        }
      }, 150);
    } catch (err: any) {
      console.error('Checkout error:', err);
      
      // Log failed transaction
      auditLog({
        action: 'API_FAILURE',
        result: 'FAIL',
        context: {
          actionType: 'CHECKOUT',
          error: err.message || String(err)
        }
      });

      alert(getFriendlyErrorMessage(err));
    } finally {
      setIsCheckoutSubmitting(false);
    }
  };

  const handleLogout = async () => {
    if (window.confirm('근무를 종료하고 로그아웃 하시겠습니까?')) {
      auditLog({ action: 'LOGOUT', result: 'SUCCESS' });
      await supabase.auth.signOut();
      setCurrentCashier(null);
      showToast('👋 근무 종료 및 로그아웃 완료', 'info');
    }
  };

  // Render Premium Initial Session Spinner
  if (isSessionLoading) {
    return (
      <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#f8fafc', color: 'var(--text-secondary)' }}>
        <RefreshCw size={36} color="var(--primary)" style={{ animation: 'spin 2s linear infinite', marginBottom: '16px' }} />
        <strong style={{ fontSize: '15px', color: 'var(--text-primary)' }}>서산나래 미니 POS 부팅 중...</strong>
        <span style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>세션 환경을 확인하고 있습니다.</span>
      </div>
    );
  }

  // Force login view if not authenticated
  if (!currentCashier) {
    return (
      <LoginOverlay
        onLoginSuccess={(user) => {
          setCurrentCashier(user);
          showToast(`🔓 ${user.name} (${user.role}) 근무자 로그인 영업 개시!`, 'success');
        }}
      />
    );
  }

  return (
    <div className="app-container">
      {/* Header GNB (Preserves existing layout style) */}
      <header className="app-header">
        <div className="header-logo" onClick={() => setActiveTab('sales')} style={{ cursor: 'pointer' }}>
          <div className="header-logo-icon">P</div>
          <h1>POS</h1>
        </div>

        <div className="gnb-tabs">
          <button 
            type="button" 
            className={`gnb-tab ${activeTab === 'sales' ? 'active' : ''}`}
            onClick={() => setActiveTab('sales')}
          >
            판매
          </button>
          <button 
            type="button" 
            className={`gnb-tab ${activeTab === 'history' ? 'active' : ''}`}
            onClick={() => setActiveTab('history')}
          >
            내역
          </button>
          <button 
            type="button" 
            className={`gnb-tab ${activeTab === 'products' ? 'active' : ''}`}
            onClick={() => setActiveTab('products')}
          >
            상품
          </button>
          <button 
            type="button" 
            className={`gnb-tab ${activeTab === 'settings' ? 'active' : ''}`}
            onClick={() => setActiveTab('settings')}
          >
            설정
          </button>
        </div>

        <div 
          className="header-profile" 
          onClick={handleLogout}
          title="클릭하여 로그아웃"
        >
          <div className="profile-avatar">👤</div>
          <span>{currentCashier.name} 님 ({currentCashier.role})</span>
          <LogOut size={12} style={{ marginLeft: '6px', color: 'var(--text-muted)' }} />
        </div>
      </header>

      {/* Main Content Area switched by tabs */}
      <div className="pos-dashboard" style={{ flex: 1, overflow: 'hidden' }}>
        {activeTab === 'sales' ? (
          <>
            <div className="pos-main-panel">
              {products.length === 0 ? (
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)', gap: '12px' }}>
                  <RefreshCw size={36} style={{ animation: 'spin 2s linear infinite' }} />
                  <div>상품 카탈로그를 빌드하는 중...</div>
                </div>
              ) : (
                <POSGrid products={products.filter(p => p.isActive !== false)} onProductClick={handleAddToCart} cart={cart} />
              )}
            </div>
            
            <aside className="pos-side-panel">
              <Cart
                items={cart}
                totalAmount={totalAmount}
                discountAmount={discountAmount}
                onIncrease={handleIncreaseQty}
                onDecrease={handleDecreaseQty}
                onDelete={handleRemoveFromCart}
                onClear={handleClearCart}
                onCheckout={() => {
                  const key = crypto.randomUUID ? crypto.randomUUID() : `SSNR-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
                  setActiveIdempotencyKey(key);
                  setIsPaymentModalOpen(true);
                }}
                onViewHistory={() => setActiveTab('history')}
                historyCount={0}
                onApplyDiscount={handleApplyGlobalDiscount}
                onApplyItemDiscount={handleApplyItemDiscount}
                onSetQuantity={handleSetQty}
              />
            </aside>
          </>
        ) : activeTab === 'history' ? (
          <HistoryView 
            onSelectReceipt={(r) => setCurrentReceipt(r)}
            showToast={showToast}
          />
        ) : activeTab === 'products' ? (
          <ProductsView 
            products={products}
            onRefresh={loadProducts}
            showToast={showToast}
          />
        ) : (
          <SettingsView 
            products={products}
            currentCashier={currentCashier}
            onLogout={handleLogout}
            showToast={showToast}
            onRefreshProducts={loadProducts}
          />
        )}
      </div>

      {/* Bottom control bar (Only on Sales tab) */}
      {activeTab === 'sales' && (
        <footer className="bottom-control-bar">
          <div className="bottom-left-controls">
            <div className="receipt-toggle-label">
              <span>영수증</span>
              <label className="receipt-toggle-switch">
                <input 
                  type="checkbox" 
                  checked={isReceiptChecked} 
                  onChange={(e) => setIsReceiptChecked(e.target.checked)} 
                />
                <span className="toggle-slider"></span>
              </label>
            </div>
            <button type="button" className="btn-draft" onClick={handleSaveDraft}>
              임시저장
            </button>
          </div>

          <div className="bottom-right-recent">
            <span className="recent-label">최근 판매 상품</span>
            <div className="recent-chips">
              {getRecentProducts().map(name => (
                <button 
                  key={name}
                  type="button" 
                  className="recent-chip"
                  onClick={() => handleRecentChipClick(name)}
                >
                  {name}
                </button>
              ))}
            </div>
          </div>
        </footer>
      )}

      {/* Payment Selector Modal */}
      {isPaymentModalOpen && (
        <PaymentModal
          totalAmount={Math.max(0, totalAmount - discountAmount)}
          onClose={() => !isCheckoutSubmitting && setIsPaymentModalOpen(false)}
          onPaymentComplete={handleCompletePayment}
          isSubmitting={isCheckoutSubmitting}
        />
      )}

      {/* Receipt Details Modal */}
      {currentReceipt && (
        <ReceiptModal
          receipt={currentReceipt}
          onClose={() => setCurrentReceipt(null)}
        />
      )}

      {/* Notification Toast */}
      {toast && (
        <div className={`toast toast-${toast.type}`} style={{
          position: 'fixed',
          bottom: '24px',
          left: '50%',
          transform: 'translateX(-50%)',
          padding: '12px 24px',
          borderRadius: '24px',
          background: toast.type === 'error' ? '#ef4444' : toast.type === 'success' ? '#1a64f4' : '#334155',
          color: '#ffffff',
          fontWeight: 'bold',
          fontSize: '13.5px',
          boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
          zIndex: 2000,
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          animation: 'fadeInUp 0.3s ease-out'
        }}>
          {toast.message}
        </div>
      )}
    </div>
  );
};

// PaymentModal Subcomponent
interface PaymentModalProps {
  totalAmount: number;
  onClose: () => void;
  onPaymentComplete: (method: PaymentMethod, receivedCash?: number, change?: number) => void;
  isSubmitting?: boolean;
}

const PaymentModal: React.FC<PaymentModalProps> = ({ totalAmount, onClose, onPaymentComplete, isSubmitting = false }) => {
  const [method, setMethod] = useState<PaymentMethod>('CARD');
  const [receivedCash, setReceivedCash] = useState<string>('');
  const [change, setChange] = useState<number>(0);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    onPaymentComplete(method, Number(receivedCash) || totalAmount, change);
  };

  useEffect(() => {
    const cashVal = Number(receivedCash) || 0;
    if (cashVal >= totalAmount) {
      setChange(cashVal - totalAmount);
    } else {
      setChange(0);
    }
  }, [receivedCash, totalAmount]);

  return (
    <div className="modal-overlay">
      <form className="modal-content" onSubmit={handleSubmit}>
        <div className="modal-body">
          <div className="modal-title">결제 처리</div>
          
          <div className="payment-selector" style={{ pointerEvents: isSubmitting ? 'none' : 'auto' }}>
            <button 
              type="button"
              className={`payment-option ${method === 'CARD' ? 'selected' : ''}`}
              onClick={() => setMethod('CARD')}
              disabled={isSubmitting}
            >
              <span style={{ fontSize: '24px' }}>💳</span>
              <span className="payment-option-title">신용카드</span>
            </button>
            <button 
              type="button"
              className={`payment-option ${method === 'TRANSFER' ? 'selected' : ''}`}
              onClick={() => setMethod('TRANSFER')}
              disabled={isSubmitting}
            >
              <span style={{ fontSize: '24px' }}>🏦</span>
              <span className="payment-option-title">계좌이체</span>
            </button>
          </div>

          <div style={{ 
            background: '#f9fafb', 
            borderRadius: 'var(--radius-md)', 
            padding: '24px 16px', 
            textAlign: 'center',
            marginBottom: '24px',
            border: '1px solid var(--border-color)',
            color: 'var(--text-secondary)'
          }}>
            {method === 'TRANSFER' ? (
              <>
                <p style={{ fontSize: '14px', marginBottom: '8px', color: 'var(--text-secondary)' }}>아래 계좌로 송금을 확인한 뒤 완료해 주세요.</p>
                <div style={{ margin: '12px 0', padding: '12px', background: '#ffffff', border: '1px solid var(--border-color)', borderRadius: '8px', fontSize: '15px', color: 'var(--text-primary)', fontWeight: '700' }}>
                  농협 351-8770-93 예금주: 서산나래
                </div>
              </>
            ) : (
              <p style={{ fontSize: '14px', marginBottom: '8px', color: 'var(--text-secondary)' }}>카드 단말기 결제를 진행합니다.</p>
            )}

            <h3 style={{ color: 'var(--text-primary)', fontSize: '24px', fontWeight: '800' }}>
              {totalAmount.toLocaleString()}원
            </h3>

            {/* Change Calculator for Cash/Transfer payments */}
            {method === 'TRANSFER' && (
              <div style={{ marginTop: '16px', borderTop: '1px solid var(--border-color)', paddingTop: '16px', display: 'flex', flexDirection: 'column', gap: '8px', textAlign: 'left' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <label style={{ fontSize: '13px', color: 'var(--text-secondary)', fontWeight: '700' }}>받은 금액 (원)</label>
                  <input 
                    type="number" 
                    value={receivedCash} 
                    onChange={e => setReceivedCash(e.target.value)} 
                    placeholder="예: 20000"
                    disabled={isSubmitting}
                    style={{ padding: '8px 12px', width: '130px', border: '1px solid var(--border-color)', borderRadius: '6px', fontSize: '14px', textAlign: 'right' }} 
                  />
                </div>
                {Number(receivedCash) > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', fontWeight: 'bold' }}>
                    <span>거스름돈</span>
                    <span style={{ color: 'var(--primary)', fontSize: '15px' }}>{change.toLocaleString()}원</span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="modal-footer">
          <button type="button" className="btn btn-secondary" style={{ flex: 1 }} onClick={onClose} disabled={isSubmitting}>취소</button>
          <button 
            type="submit" 
            className="btn btn-primary" 
            style={{ flex: 2 }}
            disabled={isSubmitting}
          >
            {isSubmitting ? '결제 처리 중...' : '결제 완료'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default App;
