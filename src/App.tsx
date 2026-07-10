import React, { useState, useEffect } from 'react';
import { Product, CartItem, PaymentMethod, Receipt, CashierUser, BusinessState } from './types';
import POSGrid from './components/POSGrid';
import Cart from './components/Cart';
import ReceiptModal from './components/ReceiptModal';
import LoginOverlay from './components/LoginOverlay';
import QuantityInput from './components/QuantityInput';
import { ShoppingBag, Clock, FileSpreadsheet, RefreshCw, TrendingUp, Coins, Award } from 'lucide-react';
import { supabase } from './supabase';

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
  const [currentCashier, setCurrentCashier] = useState<CashierUser | null>(null);

  // Business Open / Close States
  const [businessState, setBusinessState] = useState<BusinessState>('CLOSED');
  const [isBusinessOpenModalOpen, setIsBusinessOpenModalOpen] = useState<boolean>(false);
  const [isBusinessCloseModalOpen, setIsBusinessCloseModalOpen] = useState<boolean>(false);
  const [openingQtys, setOpeningQtys] = useState<{ [productId: string]: number }>({});
  const [wasteQtys, setWasteQtys] = useState<{ [productId: string]: number }>({});
  const [closingReport, setClosingReport] = useState<any | null>(null);

  const loadBusinessState = () => {
    const webappUrl = import.meta.env.VITE_GOOGLE_SHEETS_WEBAPP_URL || "";
    if (!webappUrl) return;
    fetch(`${webappUrl}?action=getBusinessState`)
      .then(res => res.json())
      .then(data => {
        if (data && data.success && data.state) {
          setBusinessState(data.state);
        }
      })
      .catch(err => console.error("영업 상태 조회 실패:", err));
  };

  /**
   * 영업 개시 수량 로드.
   * GAS ?action=getOpeningQty 는 다음 우선순위로 반환합니다:
   *   1순위: 오늘 날짜의 OpeningQty 시트 데이터 (이미 개시된 경우)
   *   2순위: 직전 영업일의 OpeningQty 시트 데이터 (기본값으로 사용)
   * 응답 형태: { success: true, quantities: { '소보로빵': 20, '단팥빵': 15 } }
   */
  const loadOpeningQuantities = () => {
    const webappUrl = import.meta.env.VITE_GOOGLE_SHEETS_WEBAPP_URL || "";
    if (!webappUrl) return;
    fetch(`${webappUrl}?action=getOpeningQty`)
      .then(res => res.json())
      .then(data => {
        if (data && data.success && data.quantities) {
          const initial: { [key: string]: number } = {};
          products.forEach(p => {
            const matchedQty = data.quantities[p.name] ?? data.quantities[p.name.trim()] ?? 0;
            initial[p.id] = matchedQty;
          });
          setOpeningQtys(initial);
        }
      })
      .catch(err => console.error("개시 수량 로드 실패:", err));
  };

  useEffect(() => {
    // 앱 구동 시 현재 로그인된 세션이 이미 존재하면 로드
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
      } else {
        setCurrentCashier(null);
      }
    });

    // 세션 상태 변경 시 (로그인/로그아웃) 실시간 감지하여 상태 업데이트
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

    loadBusinessState();

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (products.length > 0) {
      loadOpeningQuantities();
    }
  }, [products]);

  // CLOSED 상태이고 관리자인 경우 자동으로 영업 개시 모달을 띄우는 동기화 UX 추가
  useEffect(() => {
    if (currentCashier && currentCashier.role === '관리자' && businessState === 'CLOSED') {
      setIsBusinessOpenModalOpen(true);
    }
  }, [currentCashier, businessState]);

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

  // 영업 개시 처리 함수
  // GAS doPost(action='businessOpen') 에서 quantitiesList 를 Sales 시트에
  // BUSINESS-OPEN 레코드로 1행 저장합니다. (중복 방지 처리 포함)
  const handleBusinessOpen = () => {
    const webappUrl = import.meta.env.VITE_GOOGLE_SHEETS_WEBAPP_URL || "";
    if (!webappUrl) return;

    const payload = {
      action: 'businessOpen',
      cashierName: currentCashier?.name || '관리자',
      quantitiesList: products.map(p => ({
        name: p.name,
        quantity: openingQtys[p.id] ?? 0
      }))
    };

    // OPTIONS preflight를 회피하는 단순 POST fetch (Content-Type 제거)
    fetch(webappUrl, {
      method: 'POST',
      body: JSON.stringify(payload)
    })
    .then(res => res.json())
    .then(data => {
      if (data && data.success) {
        if (data.alreadyOpened) {
          alert("오늘 영업은 이미 개시되었습니다.\n현재 재고를 불러옵니다.");
        } else {
          showToast('🌅 오늘의 영업이 개시되었습니다! POS 결제가 활성화됩니다.');
        }
        setBusinessState('OPENED');
        setIsBusinessOpenModalOpen(false);
        // 즉시 동기화된 개시 수량을 스프레드시트로부터 로드
        loadOpeningQuantities();
      } else {
        alert('영업 개시 등록 실패: ' + (data.message || '알 수 없는 서버 에러'));
      }
    })
    .catch(err => {
      console.error('영업 개시 오류:', err);
      alert('네트워크 연결이 지연되고 있습니다.');
    });
  };



  // 영업 마감 결산 데이터 생성 함수
  const prepareBusinessClose = () => {
    const webappUrl = import.meta.env.VITE_GOOGLE_SHEETS_WEBAPP_URL || "";
    if (!webappUrl) return;

    // 초기 폐기 수량은 모두 0개로 세팅
    const initialWastes: { [key: string]: number } = {};
    products.forEach(p => {
      initialWastes[p.id] = 0;
    });
    setWasteQtys(initialWastes);

    fetch(`${webappUrl}?action=sales`)
    .then(res => res.json())
    .then(salesData => {
      if (salesData.success) {
        const salesList = salesData.sales || [];

        // 1. 오늘 매출 합계 계산 (Sales 시트 기반, 영업 개시/마감은 제외)
        const todaySales = salesList.filter((s: any) => {
          try {
            if (s.paymentMethod === 'Business Open' || s.paymentMethod === 'Business Close') {
              return false;
            }
            const normalized = s.paymentDateTime.replace(/\./g, '/');
            const d = new Date(normalized);
            const today = new Date();
            return d.getFullYear() === today.getFullYear() &&
                   d.getMonth() === today.getMonth() &&
                   d.getDate() === today.getDate();
          } catch(e) {
            return false;
          }
        });

        let totalSales = 0;
        let cashSales = 0;
        let cardSales = 0;
        let transactionCount = todaySales.length;

        todaySales.forEach((sale: any) => {
          totalSales += Number(sale.totalAmount) || 0;
          if (sale.paymentMethod === '계좌이체') {
            cashSales += Number(sale.totalAmount) || 0;
          } else if (sale.paymentMethod === '신용카드') {
            cardSales += Number(sale.totalAmount) || 0;
          }
        });

        // 2. 오늘 품목별 판매수량 합산
        const soldCountMap: { [productName: string]: number } = {};
        products.forEach(p => {
          soldCountMap[p.name] = 0;
        });

        if (receiptsHistory.length > 0) {
          // 로컬 구조적 히스토리 사용 (문자열 파싱 없음)
          receiptsHistory.forEach(receipt => {
            const d = new Date(receipt.date);
            const today = new Date();
            const isToday = d.getFullYear() === today.getFullYear() &&
                            d.getMonth() === today.getMonth() &&
                            d.getDate() === today.getDate();
            if (isToday) {
              receipt.items.forEach(item => {
                if (item.product.id !== 'DISCOUNT') {
                  soldCountMap[item.product.name] = (soldCountMap[item.product.name] || 0) + item.quantity;
                }
              });
            }
          });
        } else {
          // 폴백: 오늘 자 sales의 items 문자열 파싱 (리프레시 시에만 실행)
          todaySales.forEach((sale: any) => {
            if (sale.items) {
              const itemsArr = sale.items.split(', ');
              itemsArr.forEach((itemStr: string) => {
                const parts = itemStr.split(' x ');
                const name = parts[0];
                const cleanName = name.split(' (')[0].trim();
                const qtyPart = parts[1] ? parts[1].split(' ')[0] : '1';
                const qty = Number(qtyPart) || 1;
                if (cleanName && !cleanName.includes('[할인적용')) {
                  soldCountMap[cleanName] = (soldCountMap[cleanName] || 0) + qty;
                }
              });
            }
          });
        }

        // 3. 결산 최종 산출용 soldMap 저장 (ID 기준 매칭)
        const soldMapById: { [productId: string]: number } = {};
        products.forEach(p => {
          const soldQty = soldCountMap[p.name] ?? soldCountMap[p.name.trim()] ?? 0;
          soldMapById[p.id] = soldQty;
        });

        const openingQtyTotal = Object.values(openingQtys).reduce((a, b) => a + b, 0);
        const soldQtyTotal = Object.values(soldMapById).reduce((a, b) => a + b, 0);
        const remainingQtyTotal = openingQtyTotal - soldQtyTotal;

        setClosingReport({
          openingQty: openingQtyTotal,
          soldQty: soldQtyTotal,
          remainingQty: remainingQtyTotal,
          totalSales,
          cashSales,
          cardSales,
          transactionCount,
          soldMap: soldMapById
        });

        setIsBusinessCloseModalOpen(true);
      } else {
        alert('마감 정산 데이터 로드 실패');
      }
    })
    .catch(err => {
      console.error('영업 마감 조회 에러:', err);
      alert('네트워크 연결이 지연되고 있습니다.');
    });
  };

  // 영업 마감 전송 함수
  const handleBusinessCloseSubmit = () => {
    const webappUrl = import.meta.env.VITE_GOOGLE_SHEETS_WEBAPP_URL || "";
    if (!webappUrl || !closingReport) return;

    const totalWaste = Object.values(wasteQtys).reduce((a, b) => a + b, 0);
    const finalRemaining = closingReport.openingQty - closingReport.soldQty - totalWaste;

    const payload = {
      action: 'dailyClosing',
      cashierName: currentCashier?.name || '관리자',
      openingQty: closingReport.openingQty,
      soldQty: closingReport.soldQty,
      wasteQty: totalWaste,
      remainingQty: finalRemaining,
      totalSales: closingReport.totalSales,
      cashSales: closingReport.cashSales,
      cardSales: closingReport.cardSales,
      transactionCount: closingReport.transactionCount,
      itemsList: products.map(p => {
        const op = openingQtys[p.id] || 0;
        const sold = closingReport.soldMap[p.id] || 0;
        const waste = wasteQtys[p.id] || 0;
        const rem = Math.max(0, op - sold - waste);
        return {
          name: p.name,
          opening: op,
          sold: sold,
          waste: waste,
          remaining: rem
        };
      })
    };

    // OPTIONS preflight를 회피하는 단순 POST fetch (Content-Type 제거)
    fetch(webappUrl, {
      method: 'POST',
      body: JSON.stringify(payload)
    })
    .then(res => res.json())
    .then(data => {
      if (data && data.success) {
        setBusinessState('FINISHED');
        setIsBusinessCloseModalOpen(false);
        showToast('🌙 금일 영업 마감 완료! 구글 시트에 정산 보고서가 적재되었습니다.');
      } else {
        alert('영업 마감 전송 실패: ' + (data.message || '알 수 없는 서버 에러'));
      }
    })
    .catch(err => {
      console.error('영업 마감 전송 실패:', err);
      alert('네트워크 연결이 지연되고 있습니다.');
    });
  };

  // Add to cart
  const handleAddToCart = (product: Product) => {
    if (businessState !== 'OPENED') {
      showToast(businessState === 'CLOSED' ? '🌅 영업 개시를 먼저 진행해 주십시오.' : '🌙 오늘 영업이 마감되었습니다.');
      return;
    }
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
        cashierName: currentCashier ? currentCashier.name : '시스템',
        purchasedItems: receipt.items.map((item: any) => {
          const itemDiscount = item.discount && item.discountQty ? item.discount * item.discountQty : 0;
          return {
            id: item.product.id,
            name: item.product.name,
            quantity: item.quantity,
            unitPrice: item.product.price,
            amount: Math.max(0, (item.product.price * item.quantity) - itemDiscount)
          };
        })
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
        onLoginSuccess={(user) => {
          setCurrentCashier(user);
          showToast(`🔓 ${user.name} (${user.role}) 근무자 로그인 성공`);
        }}
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
          {/* 영업 상태 뱃지 */}
          <div 
            style={{ 
              fontSize: '12.5px', 
              padding: '4px 10px', 
              background: businessState === 'OPENED' ? 'rgba(52, 211, 153, 0.15)' : 'rgba(239, 68, 68, 0.15)',
              color: businessState === 'OPENED' ? '#34d399' : '#f87171',
              borderRadius: '99px',
              border: businessState === 'OPENED' ? '1px solid rgba(52, 211, 153, 0.25)' : '1px solid rgba(239, 68, 68, 0.25)',
              fontWeight: '700',
              display: 'flex',
              alignItems: 'center',
              gap: '4px'
            }}
          >
            {businessState === 'CLOSED' && '💤 영업 준비 중'}
            {businessState === 'OPENED' && '🌅 영업 중'}
            {businessState === 'FINISHED' && '🌙 영업 마감'}
          </div>

          {/* 관리자 영업 제어 버튼 */}
          {currentCashier.role === '관리자' && (
            <>
              {businessState === 'CLOSED' && (
                <button
                  type="button"
                  onClick={() => setIsBusinessOpenModalOpen(true)}
                  style={{
                    background: 'rgba(56, 189, 248, 0.15)',
                    border: '1px solid rgba(56, 189, 248, 0.25)',
                    borderRadius: '6px',
                    padding: '6px 12px',
                    color: '#38bdf8',
                    cursor: 'pointer',
                    fontSize: '12.5px',
                    fontWeight: '700',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    transition: 'all 0.2s ease',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
                  }}
                >
                  🌅 영업 개시
                </button>
              )}
              {businessState === 'OPENED' && (
                <button
                  type="button"
                  onClick={prepareBusinessClose}
                  style={{
                    background: 'rgba(251, 191, 36, 0.15)',
                    border: '1px solid rgba(251, 191, 36, 0.25)',
                    borderRadius: '6px',
                    padding: '6px 12px',
                    color: '#fbbf24',
                    cursor: 'pointer',
                    fontSize: '12.5px',
                    fontWeight: '700',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    transition: 'all 0.2s ease',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
                  }}
                >
                  🌙 영업 마감
                </button>
              )}
            </>
          )}

          {currentCashier.role === '관리자' && (
            <a
              href={import.meta.env.VITE_SPREADSHEET_URL || '#'}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                textDecoration: 'none',
                color: '#34d399',
                background: 'rgba(52, 211, 153, 0.1)',
                border: '1px solid rgba(52, 211, 153, 0.2)',
                borderRadius: '6px',
                padding: '6px 12px',
                fontSize: '12.5px',
                fontWeight: '700',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
              }}
            >
              <FileSpreadsheet size={13} />
              📊 스프레드시트
            </a>
          )}
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
            onClick={async () => {
              await supabase.auth.signOut();
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
            로그아웃
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
            businessState={businessState}
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

      {/* 영업 개시 모달 */}
      {isBusinessOpenModalOpen && (
        <div className="modal-overlay" style={{ zIndex: 1100 }}>
          <div className="modal-content" style={{ maxWidth: '500px', width: '90%', padding: '24px', maxHeight: '80vh', overflowY: 'auto' }}>
            <div className="modal-header" style={{ marginBottom: '18px' }}>
              <h3 style={{ fontSize: '18px', fontWeight: 'bold' }}>🌅 오늘의 영업 개시 준비</h3>
            </div>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '16px' }}>
              오늘 판매를 시작할 상품의 초기 수량을 입력해 주세요. (전날 마감 수량 또는 0으로 기본 세팅됩니다.)
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '20px' }}>
              {products.map(p => (
                <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,255,255,0.02)', padding: '10px 16px', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
                  <span style={{ fontSize: '14px', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span>{p.emoji}</span> {p.name}
                  </span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <QuantityInput
                      value={openingQtys[p.id] ?? 0}
                      min={0}
                      onIncrease={() =>
                        setOpeningQtys(prev => ({ ...prev, [p.id]: (prev[p.id] ?? 0) + 1 }))
                      }
                      onDecrease={() =>
                        setOpeningQtys(prev => ({ ...prev, [p.id]: Math.max(0, (prev[p.id] ?? 0) - 1) }))
                      }
                      onChange={(val) =>
                        setOpeningQtys(prev => ({ ...prev, [p.id]: val }))
                      }
                    />
                    <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>개</span>
                  </div>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: '8px', borderTop: '1px solid var(--border-color)', paddingTop: '16px' }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setIsBusinessOpenModalOpen(false)}
                style={{ flex: 1 }}
              >
                취소
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleBusinessOpen}
                style={{ flex: 1 }}
              >
                영업 개시 확정
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 영업 마감 결산 모달 */}
      {isBusinessCloseModalOpen && closingReport && (
        <div className="modal-overlay" style={{ zIndex: 1100 }}>
          <div className="modal-content" style={{ maxWidth: '600px', width: '90%', padding: '24px', maxHeight: '85vh', overflowY: 'auto' }}>
            <div className="modal-header" style={{ marginBottom: '18px' }}>
              <h3 style={{ fontSize: '18px', fontWeight: 'bold' }}>🌙 금일 영업 마감 결산 보고</h3>
            </div>
            
            {/* 결산 재무 지표 */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '20px' }}>
              <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '12px', textAlign: 'center' }}>
                <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '4px' }}>총 매출액</div>
                <div style={{ fontSize: '18px', fontWeight: '800', color: '#fbbf24' }}>{closingReport.totalSales.toLocaleString()}원</div>
              </div>
              <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '12px', textAlign: 'center' }}>
                <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '4px' }}>신용카드 매출</div>
                <div style={{ fontSize: '16px', fontWeight: '700', color: '#38bdf8' }}>{closingReport.cardSales.toLocaleString()}원</div>
              </div>
              <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '12px', textAlign: 'center' }}>
                <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '4px' }}>계좌이체 매출</div>
                <div style={{ fontSize: '16px', fontWeight: '700', color: '#2ec4b6' }}>{closingReport.cashSales.toLocaleString()}원</div>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '20px' }}>
              <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '8px 12px', textAlign: 'center' }}>
                <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>총 개시 수량</div>
                <div style={{ fontSize: '15px', fontWeight: '700' }}>{closingReport.openingQty}개</div>
              </div>
              <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '8px 12px', textAlign: 'center' }}>
                <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>총 판매 수량</div>
                <div style={{ fontSize: '15px', fontWeight: '700' }}>{closingReport.soldQty}개</div>
              </div>
              <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '8px 12px', textAlign: 'center' }}>
                <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>최종 남은 실재고</div>
                <div style={{ fontSize: '15px', fontWeight: '700', color: '#34d399' }}>
                  {closingReport.openingQty - closingReport.soldQty - Object.values(wasteQtys).reduce((a, b) => a + b, 0)}개
                </div>
              </div>
            </div>

            {/* 품목별 수량 비교 및 폐기 입력 리스트 */}
            <div style={{ fontSize: '13px', fontWeight: '700', marginBottom: '8px', color: 'var(--text-primary)' }}>품목별 결산 요약 및 폐기 입력</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '24px', maxHeight: '280px', overflowY: 'auto', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '8px' }}>
              {products.map((p) => {
                const op = openingQtys[p.id] || 0;
                const sold = closingReport.soldMap[p.id] || 0;
                const waste = wasteQtys[p.id] || 0;
                const rem = Math.max(0, op - sold - waste);
                return (
                  <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', borderBottom: '1px solid rgba(255,255,255,0.02)', background: 'rgba(255,255,255,0.01)', borderRadius: '4px', marginBottom: '4px' }}>
                    <span style={{ fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px', fontWeight: '600' }}>
                      <span>{p.emoji}</span> {p.name}
                    </span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                      <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                        개시: {op} | 판매: {sold}
                      </span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ fontSize: '12px', color: '#fca5a5' }}>폐기:</span>
                        <input
                          type="number"
                          min="0"
                          max={op - sold}
                          value={waste}
                          onChange={(e) => {
                            const val = parseInt(e.target.value, 10);
                            setWasteQtys(prev => ({
                              ...prev,
                              [p.id]: isNaN(val) || val < 0 ? 0 : val
                            }));
                          }}
                          style={{
                            width: '50px',
                            padding: '4px 6px',
                            textAlign: 'right',
                            borderRadius: '4px',
                            border: '1px solid var(--border-color)',
                            background: 'rgba(255,255,255,0.05)',
                            color: '#fff',
                            fontWeight: '700',
                            fontSize: '12px'
                          }}
                        />
                      </div>
                      <span style={{ fontSize: '12.5px', fontWeight: '800', color: '#34d399', width: '80px', textAlign: 'right' }}>
                        실재고: {rem}개
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            <p style={{ fontSize: '12px', color: '#f87171', textAlign: 'center', marginBottom: '16px' }}>
              ⚠️ 영업 마감 확정 시 오늘 영업 데이터가 스프레드시트에 영구 보존되며, 다음 영업 개시 전까지 추가 결제가 차단됩니다.
            </p>

            <div style={{ display: 'flex', gap: '8px', borderTop: '1px solid var(--border-color)', paddingTop: '16px' }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setIsBusinessCloseModalOpen(false)}
                style={{ flex: 1 }}
              >
                취소
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleBusinessCloseSubmit}
                style={{ flex: 1, background: '#fbbf24', borderColor: '#fbbf24', color: '#000' }}
              >
                영업 마감 확정
              </button>
            </div>
          </div>
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
