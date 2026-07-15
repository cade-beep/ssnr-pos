import React, { useState, useEffect } from 'react';
import { Product, CartItem, PaymentMethod, Receipt, CashierUser, normalizeCategory, mapCategoryToDB } from './types';
import POSGrid from './components/POSGrid';
import Cart from './components/Cart';
import ReceiptModal from './components/ReceiptModal';
import LoginOverlay from './components/LoginOverlay';
import ProductsView from './components/ProductsView';
import HistoryView from './components/HistoryView';
import SettingsView from './components/SettingsView';
import CustomersView from './components/CustomersView';
import EmployeesView from './components/EmployeesView';
import Logo from './components/Logo';
import { RefreshCw, LogOut } from 'lucide-react';
import { supabase } from './supabase';
import { STATIC_PRODUCTS } from './productsData';
import { auditLog } from './utils/auditLogger';
import { withTimeout } from './utils/asyncHelper';

const getFriendlyErrorMessage = (error: any): string => {
  if (!error) return '알 수 없는 오류가 발생했습니다.';
  const msg = error.message || String(error);
  
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
  const [activeTab, setActiveTab] = useState<'sales' | 'history' | 'products' | 'customers' | 'employees' | 'settings'>('sales');
  const [products, setProducts] = useState<Product[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState<boolean>(false);
  const [currentReceipt, setCurrentReceipt] = useState<Receipt | null>(null);
  
  // Custom Toast State
  const [toast, setToast] = useState<{ message: string; type: 'info' | 'success' | 'error' } | null>(null);
  const [isReceiptChecked, setIsReceiptChecked] = useState<boolean>(true);
  const [cartDiscountPercent, setCartDiscountPercent] = useState<number>(0);

  // Cashier Authentication States
  const [currentCashier, setCurrentCashier] = useState<CashierUser | null>(null);
  const [isSessionLoading, setIsSessionLoading] = useState<boolean>(true);
  const [activeIdempotencyKey, setActiveIdempotencyKey] = useState<string | null>(null);
  const [isCheckoutSubmitting, setIsCheckoutSubmitting] = useState<boolean>(false);

  // Helper to fetch user role and store_id from the database
  const fetchUserRoleAndStore = async (user: any): Promise<CashierUser> => {
    let displayName = user.user_metadata?.name || user.email?.split('@')[0] || '캐셔';
    if (user.email?.startsWith('rbflrbgh') && displayName === 'rbflrbgh') {
      displayName = '김규호';
    }

    try {
      const { data, error } = await supabase
        .from('user_roles')
        .select('role, store_id')
        .eq('user_id', user.id)
        .single();

      if (error || !data) {
        // Fallback for legacy admin
        const isAdmin = 
          user.user_metadata?.role === '관리자' || 
          user.email?.startsWith('admin') || 
          user.email?.startsWith('rbflrbgh') || 
          displayName === '김규호';

        return {
          id: user.id,
          email: user.email || '',
          name: displayName,
          role: isAdmin ? 'Owner' : 'Staff',
          store_id: '00000000-0000-0000-0000-000000000000'
        };
      }

      return {
        id: user.id,
        email: user.email || '',
        name: displayName,
        role: data.role as 'Owner' | 'Manager' | 'Staff',
        store_id: data.store_id
      };
    } catch (err) {
      console.error('Failed to load user role and store_id from db:', err);
      return {
        id: user.id,
        email: user.email || '',
        name: displayName,
        role: 'Staff',
        store_id: '00000000-0000-0000-0000-000000000000'
      };
    }
  };

  // Check auth session on startup
  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session && session.user) {
        const cashierObj = await fetchUserRoleAndStore(session.user);
        setCurrentCashier(cashierObj);
        loadProducts(); // Load products using authenticated session headers
      }
      setIsSessionLoading(false);
    }).catch(err => {
      console.error('Session loading error:', err);
      setIsSessionLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (session && session.user) {
        const cashierObj = await fetchUserRoleAndStore(session.user);
        setCurrentCashier(cashierObj);
        loadProducts(); // Refresh products on login
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
  async function loadProducts() {
    try {
      const { data, error } = await withTimeout(
        supabase
          .from('products')
          .select('*')
          .order('name', { ascending: true })
      );

      if (error) {
        throw error;
      }

      if (!data || (data as any[]).length === 0) {
        console.log('Database products empty. Auto-seeding initial products...');
        const seedData = STATIC_PRODUCTS.map((p, idx) => ({
          id: `P-${idx + 1}`,
          name: p.name,
          price: p.price || 1500, // starting default price
          category: mapCategoryToDB(p.category),
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
          category: normalizeCategory(s.category, s.name),
          emoji: s.emoji,
          imageUrl: s.image_url,
          isActive: s.is_active
        })));
        showToast('📦 상품 데이터를 기본 목록으로 자동 초기화했습니다.', 'info');
      } else {
        const mapped = (data as any[]).map((d: any) => ({
          id: d.id,
          name: d.name,
          price: Number(d.price) || 0,
          category: normalizeCategory(d.category, d.name),
          emoji: d.emoji,
          imageUrl: d.image_url,
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
    showToast(`${product.name}이(가) 추가되었습니다.`, 'success');
  };

  // Increase qty
  const handleIncreaseQty = (productId: string) => {
    const product = products.find(p => p.id === productId);
    const existing = cart.find(item => item.product.id === productId);
    if (!product || !existing) return;

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

  // Helper to safely calculate item discount details
  const getItemDiscountInfo = (item: CartItem) => {
    if (item.discountPercent && item.discountPercent > 0) {
      const pct = Math.min(100, Math.max(0, item.discountPercent));
      const unitDiscount = Math.round(item.product.price * (pct / 100));
      return {
        unitDiscount,
        totalDiscount: unitDiscount * item.quantity,
        discountPercent: pct,
        isPercent: true
      };
    } else if (item.discount && item.discount > 0) {
      const discountQty = item.discountQty ?? item.quantity;
      return {
        unitDiscount: item.discount,
        totalDiscount: item.discount * discountQty,
        discountPercent: 0,
        isPercent: false
      };
    }
    return {
      unitDiscount: 0,
      totalDiscount: 0,
      discountPercent: 0,
      isPercent: false
    };
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

  // Apply global discount percent
  const handleApplyGlobalDiscount = (percent: number) => {
    setCartDiscountPercent(Math.min(100, Math.max(0, percent)));
  };

  const safeNumber = (val: number): number => {
    if (isNaN(val) || !isFinite(val)) return 0;
    return val;
  };

  const originalSubtotal = safeNumber(cart.reduce((sum, item) => sum + (item.product.price * item.quantity), 0));
  const totalItemDiscount = safeNumber(cart.reduce((sum, item) => sum + getItemDiscountInfo(item).totalDiscount, 0));
  const subtotalAfterItemDiscounts = Math.max(0, originalSubtotal - totalItemDiscount);
  const cartDiscountAmount = safeNumber(Math.round(subtotalAfterItemDiscounts * (Math.min(100, Math.max(0, cartDiscountPercent)) / 100)));
  const totalDiscount = safeNumber(totalItemDiscount + cartDiscountAmount);
  const finalTotal = Math.max(0, subtotalAfterItemDiscounts - cartDiscountAmount);

  // Payment process handler with database RPC complete_sale (transaction-safe)
  const handleCompletePayment = async (paymentMethod: PaymentMethod, receivedCashVal?: number, changeVal?: number) => {
    if (isCheckoutSubmitting) return;
    setIsCheckoutSubmitting(true);

    // Fallback key if activeIdempotencyKey is somehow not set
    const finalIdempotencyKey = activeIdempotencyKey || (crypto.randomUUID ? crypto.randomUUID() : `SSNR-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`);

    try {
      // Prepare cart payload for RPC
      const cartPayload = cart.map(item => {
        const info = getItemDiscountInfo(item);
        return {
          product_id: item.product.id,
          product_name: item.product.name,
          price: item.product.price,
          quantity: item.quantity,
          discount: info.unitDiscount,
          discount_qty: info.isPercent ? item.quantity : (item.discountQty || 0),
          is_percent: info.isPercent,
          discount_percent: info.discountPercent
        };
      });

      if (cartDiscountAmount > 0) {
        cartPayload.push({
          product_id: 'DISCOUNT',
          product_name: `[할인적용] 전체 할인 (${cartDiscountPercent}%)`,
          price: -cartDiscountAmount,
          quantity: 1,
          discount: 0,
          discount_qty: 0,
          is_percent: false,
          discount_percent: 0
        });
      }

      // Call database transaction RPC
      const { data: rpcData, error: rpcError } = (await withTimeout(
        supabase.rpc('complete_sale', {
          p_idempotency_key: finalIdempotencyKey,
          p_payment_method: paymentMethod,
          p_total_amount: finalTotal,
          p_total_quantity: cart.reduce((sum, item) => sum + item.quantity, 0),
          p_received_amount: receivedCashVal !== undefined ? receivedCashVal : finalTotal,
          p_change: changeVal !== undefined ? changeVal : 0,
          p_items: cartPayload,
          p_global_discount: cartDiscountAmount,
          p_subtotal: originalSubtotal,
          p_item_discount_amount: totalItemDiscount,
          p_cart_discount_percent: cartDiscountPercent,
          p_cart_discount_amount: cartDiscountAmount,
          p_total_discount: totalDiscount,
          p_final_total: finalTotal
        }),
        12000
      )) as any;

      if (rpcError) {
        throw new Error(rpcError.message);
      }

      if (!rpcData || !rpcData.success) {
        throw new Error(rpcData?.message || '결제 등록에 실패했습니다.');
      }

      const receiptItems = cart.map(item => {
        const info = getItemDiscountInfo(item);
        return {
          ...item,
          discount: info.unitDiscount,
          discountQty: info.isPercent ? item.quantity : (item.discountQty || 0),
          isPercent: info.isPercent,
          discountPercent: info.discountPercent
        };
      });
      if (cartDiscountAmount > 0) {
        receiptItems.push({
          product: {
            id: 'DISCOUNT',
            name: `[할인적용] 전체 할인 (${cartDiscountPercent}%)`,
            price: -cartDiscountAmount,
            category: 'etc',
            emoji: '🏷️'
          },
          quantity: 1,
          discount: 0,
          discountQty: 0,
          isPercent: false,
          discountPercent: 0
        });
      }

      const receipt: Receipt = {
        id: finalIdempotencyKey,
        items: receiptItems,
        total: finalTotal,
        totalQuantity: cart.reduce((sum, item) => sum + item.quantity, 0),
        paymentMethod,
        receivedAmount: receivedCashVal !== undefined ? receivedCashVal : finalTotal,
        change: changeVal !== undefined ? changeVal : 0,
        date: new Date(),
        cashierName: currentCashier ? currentCashier.name : '시스템',
        subtotal: originalSubtotal,
        itemDiscountAmount: totalItemDiscount,
        cartDiscountPercent,
        cartDiscountAmount,
        totalDiscount,
        finalTotal
      };

      // Best-effort Sync to Google Sheets
      const webappUrl = import.meta.env.VITE_GOOGLE_SHEETS_WEBAPP_URL || "";
      if (webappUrl) {
        let itemsSummary = cart.map((item: any) => {
          const info = getItemDiscountInfo(item);
          if (info.totalDiscount > 0) {
            if (info.isPercent) {
              return `${item.product.name} x ${item.quantity} (개별할인: ${item.quantity}개 대상 ${info.discountPercent}% 개당 -${info.unitDiscount.toLocaleString()}원, 총 -${info.totalDiscount.toLocaleString()}원)`;
            }
            return `${item.product.name} x ${item.quantity} (개별할인: ${item.discountQty}개 대상 개당 -${info.unitDiscount.toLocaleString()}원, 총 -${info.totalDiscount.toLocaleString()}원)`;
          }
          return `${item.product.name} x ${item.quantity}`;
        }).join(', ');
        
        if (cartDiscountAmount > 0) {
          itemsSummary += `, [전체 할인: ${cartDiscountPercent}% -${cartDiscountAmount.toLocaleString()}원]`;
        }
        
        const payload = {
          orderId: finalIdempotencyKey,
          paymentDateTime: new Date().toLocaleString('ko-KR'),
          paymentMethod: paymentMethod === 'CARD' ? '신용카드' : '계좌이체',
          totalAmount: finalTotal,
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
          amount: finalTotal,
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
      setCartDiscountPercent(0);
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
          <div className="header-logo-icon"><Logo size={15} /></div>
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

          {currentCashier.role !== 'Staff' && (
            <button 
              type="button" 
              className={`gnb-tab ${activeTab === 'customers' ? 'active' : ''}`}
              onClick={() => setActiveTab('customers')}
            >
              고객
            </button>
          )}
          {currentCashier.role === 'Owner' && (
            <button 
              type="button" 
              className={`gnb-tab ${activeTab === 'employees' ? 'active' : ''}`}
              onClick={() => setActiveTab('employees')}
            >
              직원
            </button>
          )}

          {currentCashier.role !== 'Staff' && (
            <button 
              type="button" 
              className={`gnb-tab ${activeTab === 'settings' ? 'active' : ''}`}
              onClick={() => setActiveTab('settings')}
            >
              설정
            </button>
          )}
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
                <div className="products-grid">
                  {[1, 2, 3, 4, 5, 6, 7, 8].map(n => (
                    <div key={n} className="product-card" style={{ pointerEvents: 'none', border: '1px solid var(--border-color)', background: 'var(--bg-secondary)', width: '100%' }}>
                      <div className="product-image-container skeleton" style={{ width: '100%', height: '100px', marginBottom: '12px' }} />
                      <div className="product-info" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <div className="skeleton" style={{ width: '70%', height: '16px', borderRadius: '4px' }} />
                        <div className="skeleton" style={{ width: '40%', height: '14px', borderRadius: '4px' }} />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <POSGrid products={products.filter(p => p.isActive !== false)} onProductClick={handleAddToCart} cart={cart} />
              )}
            </div>
            
            <aside className="pos-side-panel">
              <Cart
                items={cart}
                totalAmount={finalTotal}
                cartDiscountPercent={cartDiscountPercent}
                cartDiscountAmount={cartDiscountAmount}
                itemDiscountAmount={totalItemDiscount}
                onIncrease={handleIncreaseQty}
                onDecrease={handleDecreaseQty}
                onDelete={handleRemoveFromCart}
                onClear={handleClearCart}
                onCheckout={() => {
                  const key = crypto.randomUUID ? crypto.randomUUID() : `SSNR-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
                  setActiveIdempotencyKey(key);
                  setIsPaymentModalOpen(true);
                }}
                onApplyDiscount={handleApplyGlobalDiscount}
                onApplyItemDiscount={handleApplyItemDiscount}
                onSetQuantity={handleSetQty}
                role={currentCashier.role}
              />
            </aside>
          </>
        ) : activeTab === 'history' ? (
          <HistoryView 
            onSelectReceipt={(r) => setCurrentReceipt(r)}
            showToast={showToast}
            role={currentCashier.role}
          />
        ) : activeTab === 'products' ? (
          <ProductsView 
            products={products}
            onRefresh={loadProducts}
            showToast={showToast}
            role={currentCashier.role}
          />

        ) : activeTab === 'customers' ? (
          <CustomersView
            role={currentCashier.role}
            showToast={showToast}
          />
        ) : activeTab === 'employees' ? (
          <EmployeesView
            role={currentCashier.role}
            storeId={currentCashier.store_id}
            currentUserId={currentCashier.id}
            showToast={showToast}
          />

        ) : (
          <SettingsView 
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
          subtotal={originalSubtotal}
          discount={totalDiscount}
          totalAmount={finalTotal}
          cartDiscountPercent={cartDiscountPercent}
          cartDiscountAmount={cartDiscountAmount}
          itemDiscountAmount={totalItemDiscount}
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
        <div className={`toast toast-${toast.type}`}>
          <span>{toast.type === 'success' ? '✅' : toast.type === 'error' ? '⚠️' : 'ℹ️'}</span>
          <span>{toast.message}</span>
        </div>
      )}
    </div>
  );
};

// PaymentModal Subcomponent
interface PaymentModalProps {
  subtotal: number;
  discount: number;
  totalAmount: number;
  cartDiscountPercent: number;
  cartDiscountAmount: number;
  itemDiscountAmount: number;
  onClose: () => void;
  onPaymentComplete: (method: PaymentMethod, receivedCash?: number, change?: number) => void;
  isSubmitting?: boolean;
}

const PaymentModal: React.FC<PaymentModalProps> = ({ 
  subtotal, 
  discount, 
  totalAmount, 
  cartDiscountPercent, 
  cartDiscountAmount, 
  itemDiscountAmount, 
  onClose, 
  onPaymentComplete, 
  isSubmitting = false 
}) => {
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

  // Discard any entered received-amount/change when switching payment methods,
  // so a stale TRANSFER value can't be submitted under a CARD payment.
  useEffect(() => {
    setReceivedCash('');
  }, [method]);

  useEffect(() => {
    const handleModalKeyDown = (e: KeyboardEvent) => {
      if (isSubmitting) return;

      if (e.key === '1' || e.key === 'F5') {
        e.preventDefault();
        setMethod('CARD');
      } else if (e.key === '2' || e.key === 'F6') {
        e.preventDefault();
        setMethod('TRANSFER');
      }
    };
    window.addEventListener('keydown', handleModalKeyDown);
    return () => window.removeEventListener('keydown', handleModalKeyDown);
  }, [isSubmitting]);

  return (
    <div className="bo-modal-overlay">
      <form className="bo-modal" style={{ maxWidth: '440px' }} onSubmit={handleSubmit}>
        <div className="bo-modal-header">
          <div className="bo-modal-title">결제 처리</div>
          <div className="bo-modal-desc">결제 수단을 선택하고 결제액을 확인합니다.</div>
        </div>

        <div className="bo-modal-body" style={{ paddingBottom: '10px' }}>
          <div className="bo-payment-selector" style={{ pointerEvents: isSubmitting ? 'none' : 'auto' }}>
            <button 
              type="button"
              className={`bo-payment-option ${method === 'CARD' ? 'selected' : ''}`}
              onClick={() => setMethod('CARD')}
              disabled={isSubmitting}
            >
              <span style={{ fontSize: '24px' }}>💳</span>
              <span className="bo-payment-option-title">신용카드</span>
            </button>
            <button 
              type="button"
              className={`bo-payment-option ${method === 'TRANSFER' ? 'selected' : ''}`}
              onClick={() => setMethod('TRANSFER')}
              disabled={isSubmitting}
            >
              <span style={{ fontSize: '24px' }}>🏦</span>
              <span className="bo-payment-option-title">계좌이체</span>
            </button>
          </div>

          <div style={{ 
            background: '#f8fafc', 
            borderRadius: '12px', 
            padding: '20px 16px', 
            textAlign: 'center',
            marginBottom: '16px',
            border: '1px solid var(--border-color)',
            color: 'var(--text-secondary)'
          }}>
            {method === 'TRANSFER' ? (
              <>
                <p style={{ fontSize: '13.5px', marginBottom: '8px', color: 'var(--text-secondary)' }}>아래 계좌로 송금을 확인한 뒤 완료해 주세요.</p>
                <div style={{ margin: '8px 0 12px 0', padding: '12px', background: '#ffffff', border: '1px solid var(--border-color)', borderRadius: '8px', fontSize: '14.5px', color: 'var(--text-primary)', fontWeight: '700' }}>
                  농협 351-8770-93 예금주: 서산나래
                </div>
              </>
            ) : (
              <p style={{ fontSize: '13.5px', marginBottom: '8px', color: 'var(--text-secondary)' }}>카드 단말기 결제를 진행합니다.</p>
            )}

            {/* Subtotal & Discount Breakdown */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '13.5px', paddingBottom: '12px', marginBottom: '12px', borderBottom: '1px dashed #e2e8f0', textAlign: 'left' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-secondary)' }}>
                <span>상품 합계</span>
                <span>{subtotal.toLocaleString()}원</span>
              </div>
              {itemDiscountAmount > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', color: '#ef4444' }}>
                  <span>품목 할인 합계</span>
                  <span>-{itemDiscountAmount.toLocaleString()}원</span>
                </div>
              )}
              {cartDiscountAmount > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', color: '#ef4444' }}>
                  <span>전체 할인 ({cartDiscountPercent}%)</span>
                  <span>-{cartDiscountAmount.toLocaleString()}원</span>
                </div>
              )}
              {discount > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', color: '#ef4444', fontWeight: 'bold', borderTop: '1px dotted #e2e8f0', paddingTop: '6px', marginTop: '2px' }}>
                  <span>총 할인 금액</span>
                  <span>-{discount.toLocaleString()}원</span>
                </div>
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontWeight: 'bold', fontSize: '15px', color: 'var(--text-primary)' }}>최종 결제 금액</span>
              <h3 style={{ color: 'var(--primary)', fontSize: '26px', fontWeight: '800', margin: 0 }}>
                {totalAmount.toLocaleString()}원
              </h3>
            </div>

            {/* Change Calculator for Cash/Transfer payments */}
            {method === 'TRANSFER' && (
              <div style={{ marginTop: '14px', borderTop: '1px dashed #e2e8f0', paddingTop: '14px', display: 'flex', flexDirection: 'column', gap: '8px', textAlign: 'left' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <label className="bo-label" style={{ fontWeight: '700' }}>받은 금액 (원)</label>
                  <input 
                    type="number" 
                    value={receivedCash} 
                    onChange={e => setReceivedCash(e.target.value)} 
                    placeholder="예: 20000"
                    disabled={isSubmitting}
                    className="bo-input"
                    style={{ width: '130px', height: '36px', padding: '0 10px', textAlign: 'right' }} 
                  />
                </div>
                {Number(receivedCash) > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', fontWeight: 'bold' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>거스름돈</span>
                    <span style={{ color: '#ef4444', fontSize: '15px' }}>{change.toLocaleString()}원</span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="bo-modal-footer">
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={isSubmitting}>취소</button>
          <button 
            type="submit" 
            className="btn btn-primary" 
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
