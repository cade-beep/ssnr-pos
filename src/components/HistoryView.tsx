import React, { useState, useEffect } from 'react';
import { Receipt, PaymentMethod, CartItem } from '../types';
import { supabase } from '../supabase';
import { Search, Calendar, RefreshCw, Undo, Coins, TrendingUp, Award, ShoppingBag, Eye } from 'lucide-react';
import { auditLog } from '../utils/auditLogger';
import { withTimeout } from '../utils/asyncHelper';
import { showAlert, showPrompt } from './ui/dialogs';

interface HistoryViewProps {
  onSelectReceipt: (receipt: Receipt) => void;
  showToast: (msg: string) => void;
  role: 'Owner' | 'Manager' | 'Staff';
}

const HistoryView: React.FC<HistoryViewProps> = ({ onSelectReceipt, showToast, role }) => {
  const [viewMode, setViewMode] = useState<'list' | 'dashboard'>('list');
  const [isLoading, setIsLoading] = useState(false);
  const [orders, setOrders] = useState<any[]>([]);

  // Filter States
  const [dateRangeType, setDateRangeType] = useState<'today' | 'yesterday' | 'week' | 'month' | 'custom'>('today');
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);
  const [searchQuery, setSearchQuery] = useState('');
  const [paymentFilter, setPaymentFilter] = useState<'all' | 'CARD' | 'TRANSFER'>('all');
  const [refundFilter, setRefundFilter] = useState<'all' | 'active' | 'refunded'>('all');
  const [selectedProduct, setSelectedProduct] = useState('all');

  // List of distinct product names for drop-down filter
  const [availableProducts, setAvailableProducts] = useState<string[]>([]);

  // Date range resolver
  const resolveDates = () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    let start = new Date(today);
    let end = new Date(today);
    end.setHours(23, 59, 59, 999);

    if (dateRangeType === 'yesterday') {
      start.setDate(start.getDate() - 1);
      end.setDate(end.getDate() - 1);
      end.setHours(23, 59, 59, 999);
    } else if (dateRangeType === 'week') {
      start.setDate(start.getDate() - 7);
    } else if (dateRangeType === 'month') {
      start.setMonth(start.getMonth() - 1);
    } else if (dateRangeType === 'custom') {
      const s = new Date(startDate);
      s.setHours(0, 0, 0, 0);
      const e = new Date(endDate);
      e.setHours(23, 59, 59, 999);
      return { start: s, end: e };
    }

    return { start, end };
  };

  const fetchHistory = async () => {
    if (isLoading) return;
    setIsLoading(true);
    const { start, end } = resolveDates();
    
    try {
      const { data, error } = await supabase
        .from('orders')
        .select(`
          id,
          order_number,
          payment_date_time,
          payment_method,
          total_amount,
          total_quantity,
          received_amount,
          change,
          cashier_name,
          is_refunded,
          refunded_at,
          refunded_by,
          subtotal,
          item_discount_amount,
          cart_discount_percent,
          cart_discount_amount,
          total_discount,
          final_total,
          order_items (
            product_id,
            product_name,
            product_price,
            quantity,
            discount,
            discount_qty,
            is_percent,
            discount_percent
          )
        `)
        .gte('payment_date_time', start.toISOString())
        .lte('payment_date_time', end.toISOString())
        .order('payment_date_time', { ascending: false });

      if (error) throw error;
      setOrders(data || []);

      // Extract unique products list from fetched orders
      const productSet = new Set<string>();
      data?.forEach(order => {
        order.order_items?.forEach((item: any) => {
          if (item.product_name && !item.product_name.includes('[할인적용')) {
            productSet.add(item.product_name);
          }
        });
      });
      setAvailableProducts(Array.from(productSet));
    } catch (err: any) {
      console.error('Failed to fetch sales history:', err);
      showToast(`⚠️ 매출 목록 로드 실패: ${err.message || err}`);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (role === 'Staff' && dateRangeType !== 'today') {
      setDateRangeType('today');
    }
  }, [role, dateRangeType]);

  const handleExportCSV = () => {
    if (filteredOrders.length === 0) {
      showAlert('내보낼 데이터가 없습니다.', { title: '내보내기' });
      return;
    }

    const headers = ['주문번호', '결제시간', '담당캐셔', '결제액', '결제수단', '환불여부', '판매내역'];
    const rows = filteredOrders.map(o => {
      const itemsStr = o.order_items?.map((i: any) => `${i.product_name} x ${i.quantity}`).join('; ') || '';
      return [
        o.order_number,
        new Date(o.payment_date_time).toLocaleString('ko-KR'),
        o.cashier_name,
        o.total_amount,
        o.payment_method === 'CARD' ? '신용카드' : '계좌이체',
        o.is_refunded ? '환불' : '정상',
        `"${itemsStr.replace(/"/g, '""')}"`
      ];
    });

    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `매출내역_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('📥 CSV 파일로 매출 내역을 내보냈습니다.');
  };

  useEffect(() => {
    fetchHistory();
  }, [dateRangeType, startDate, endDate]);

  // Apply filters client-side for dynamic reactivity
  const filteredOrders = orders.filter(order => {
    // Search Cashier, ID, Order Number
    const matchesSearch =
      (order.order_number || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (order.cashier_name || '').toLowerCase().includes(searchQuery.toLowerCase());
      
    // Payment Method
    const matchesPayment = paymentFilter === 'all' || order.payment_method === paymentFilter;

    // Refund Status
    const matchesRefund = 
      refundFilter === 'all' || 
      (refundFilter === 'refunded' && order.is_refunded) ||
      (refundFilter === 'active' && !order.is_refunded);

    // Product check
    const matchesProduct = selectedProduct === 'all' || order.order_items?.some((item: any) => item.product_name === selectedProduct);

    return matchesSearch && matchesPayment && matchesRefund && matchesProduct;
  });

  // Aggregating statistics for dashboard
  const stats = filteredOrders.reduce((acc, curr) => {
    // Resolve fields with backward-compatibility fallbacks
    const subtotalVal = Number(curr.subtotal) || curr.order_items?.reduce((sum: number, item: any) => {
      if (item.product_id === 'DISCOUNT') return sum;
      return sum + (Number(item.product_price) * Number(item.quantity));
    }, 0) || Number(curr.total_amount) || 0;

    const itemDiscountVal = Number(curr.item_discount_amount) || curr.order_items?.reduce((sum: number, item: any) => {
      if (item.product_id === 'DISCOUNT') return sum;
      return sum + (Number(item.discount || 0) * Number(item.discount_qty || 0));
    }, 0) || 0;

    const globalDiscountItem = curr.order_items?.find((item: any) => item.product_id === 'DISCOUNT');
    const oldGlobalDiscountVal = globalDiscountItem ? Math.abs(Number(globalDiscountItem.product_price) * Number(globalDiscountItem.quantity)) : 0;

    const cartDiscountVal = curr.cart_discount_amount !== undefined && curr.cart_discount_amount !== null
      ? Number(curr.cart_discount_amount)
      : oldGlobalDiscountVal;

    const totalDiscountVal = curr.total_discount !== undefined && curr.total_discount !== null
      ? Number(curr.total_discount)
      : (itemDiscountVal + cartDiscountVal);

    const netSalesVal = Number(curr.final_total) || Number(curr.total_amount) || 0;

    if (curr.is_refunded) {
      acc.refundCount += 1;
      acc.refundAmount += netSalesVal;
    } else {
      acc.grossSales += subtotalVal;
      acc.totalDiscount += totalDiscountVal;
      acc.netSales += netSalesVal;
      acc.salesCount += 1;
      acc.totalQty += Number(curr.total_quantity) || 0;

      // Check if order date is today (local date)
      const orderDate = new Date(curr.payment_date_time);
      const today = new Date();
      if (orderDate.toDateString() === today.toDateString()) {
        acc.todayDiscount += totalDiscountVal;
      }

      // Check if order date is current month/year
      if (orderDate.getMonth() === today.getMonth() && orderDate.getFullYear() === today.getFullYear()) {
        acc.monthlyDiscount += totalDiscountVal;
      }
      
      if (curr.payment_method === 'CARD') {
        acc.cardAmount += netSalesVal;
        acc.cardCount += 1;
      } else {
        acc.transferAmount += netSalesVal;
        acc.transferCount += 1;
      }

      // Aggregate item quantities
      curr.order_items?.forEach((item: any) => {
        const name = item.product_name;
        if (name && !name.includes('[할인적용')) {
          acc.itemsSold[name] = (acc.itemsSold[name] || 0) + (Number(item.quantity) || 0);
        }
      });
    }
    return acc;
  }, {
    grossSales: 0,
    totalDiscount: 0,
    netSales: 0,
    todayDiscount: 0,
    monthlyDiscount: 0,
    salesCount: 0,
    totalQty: 0,
    cardAmount: 0,
    cardCount: 0,
    transferAmount: 0,
    transferCount: 0,
    refundCount: 0,
    refundAmount: 0,
    itemsSold: {} as Record<string, number>
  });

  const avgPurchase = stats.salesCount > 0 ? Math.round(stats.netSales / stats.salesCount) : 0;
  const topProducts = (Object.entries(stats.itemsSold) as [string, number][])
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  // Refund Order & restore inventory (atomic database transaction)
  const handleRefund = async (order: any) => {
    if (isLoading || order.is_refunded) return;
    
    const reason = await showPrompt(
      `주문번호 [${order.order_number}] 결제건을 환불하시겠습니까?\n사유를 입력해 주세요 (필수):`,
      { title: '⚠️ 환불 처리', defaultValue: '고객 단순 변심' }
    );
    if (reason === null) return;
    if (!reason.trim()) {
      showAlert('환불 사유를 작성해야 환불 처리가 가능합니다.', { title: '환불 처리' });
      return;
    }

    setIsLoading(true);
    try {
      // Call secure atomic refund RPC
      const { data: rpcData, error: rpcError } = await withTimeout(
        supabase.rpc('refund_order', {
          p_order_number: order.order_number,
          p_reason: reason.trim()
        }),
        10000
      );

      if (rpcError) throw rpcError;

      if (!rpcData || !rpcData.success) {
        throw new Error(rpcData?.message || '서버 환불 처리에 실패했습니다.');
      }

      auditLog({
        action: 'REFUND',
        result: 'SUCCESS',
        context: { orderNumber: order.order_number, reason: reason.trim() }
      });

      showToast(`↩️ 주문번호 [${order.order_number}] 환불 완료 및 재고가 복원되었습니다.`);
      fetchHistory();
    } catch (err: any) {
      console.error(err);
      const errMsg = err.message || String(err);
      
      auditLog({
        action: 'API_FAILURE',
        result: 'FAIL',
        context: { actionType: 'REFUND', orderNumber: order.order_number, error: errMsg }
      });

      if (errMsg.includes('permission denied') || errMsg.includes('row-level security') || errMsg.includes('policy')) {
        showAlert('⚠️ 환불 권한이 없습니다. 관리자(어드민) 계정만 결제 취소 및 환불 처리가 가능합니다.', { title: '환불 처리 실패' });
      } else if (errMsg.includes('Failed to fetch') || errMsg.includes('NetworkError')) {
        showAlert('🌐 인터넷 연결이 원활하지 않습니다. 네트워크 설정을 점검한 후 다시 시도해 주세요.', { title: '환불 처리 실패' });
      } else {
        showAlert(`⚠️ 환불 처리 실패: ${errMsg}`, { title: '환불 처리 실패' });
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelectOrderForReceipt = (o: any) => {
    const items: CartItem[] = o.order_items.map((item: any) => ({
      product: {
        id: item.product_id,
        name: item.product_name,
        price: Number(item.product_price) || 0,
        category: 'etc',
        emoji: item.product_name.includes('[할인적용') ? '🏷️' : '🍞'
      },
      quantity: item.quantity,
      discount: item.discount,
      discountQty: item.discount_qty,
      isPercent: item.is_percent,
      discountPercent: item.discount_percent
    }));

    const receipt: Receipt = {
      id: o.order_number,
      items,
      total: Number(o.total_amount) || 0,
      totalQuantity: Number(o.total_quantity) || 0,
      paymentMethod: o.payment_method as PaymentMethod,
      receivedAmount: Number(o.received_amount) || Number(o.total_amount) || 0,
      change: Number(o.change) || 0,
      date: new Date(o.payment_date_time),
      cashierName: o.cashier_name,
      isRefunded: o.is_refunded,
      refundedAt: o.refunded_at,
      refundedBy: o.refunded_by,
      subtotal: o.subtotal !== undefined && o.subtotal !== null ? Number(o.subtotal) : undefined,
      itemDiscountAmount: o.item_discount_amount !== undefined && o.item_discount_amount !== null ? Number(o.item_discount_amount) : undefined,
      cartDiscountPercent: o.cart_discount_percent !== undefined && o.cart_discount_percent !== null ? Number(o.cart_discount_percent) : undefined,
      cartDiscountAmount: o.cart_discount_amount !== undefined && o.cart_discount_amount !== null ? Number(o.cart_discount_amount) : undefined,
      totalDiscount: o.total_discount !== undefined && o.total_discount !== null ? Number(o.total_discount) : undefined,
      finalTotal: o.final_total !== undefined && o.final_total !== null ? Number(o.final_total) : undefined
    };

    onSelectReceipt(receipt);
  };

  return (
    <div className="bo-page">
      
      {/* View Mode Toggle */}
      <div className="bo-filter-group">
        <button 
          type="button" 
          onClick={() => setViewMode('list')}
          className={`bo-filter-chip ${viewMode === 'list' ? 'active' : ''}`}
          style={{ flex: 1, justifyContent: 'center' }}
        >
          매출 거래 내역
        </button>
        <button 
          type="button" 
          onClick={() => setViewMode('dashboard')}
          className={`bo-filter-chip ${viewMode === 'dashboard' ? 'active' : ''}`}
          style={{ flex: 1, justifyContent: 'center' }}
        >
          매출 통계 대시보드
        </button>
      </div>

      {/* Date Filter & Search Row */}
      <div className="bo-card" style={{ padding: '16px', flexShrink: 0 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'center' }}>
          {/* Date presets */}
          <div className="bo-filter-group">
            {[
              { value: 'today', label: '오늘' },
              { value: 'yesterday', label: '어제' },
              { value: 'week', label: '7일' },
              { value: 'month', label: '30일' },
              { value: 'custom', label: '직접선택' }
            ].map(opt => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setDateRangeType(opt.value as any)}
                disabled={role === 'Staff' && opt.value !== 'today'}
                className={`bo-filter-chip ${dateRangeType === opt.value ? 'active' : ''}`}
                style={{ opacity: (role === 'Staff' && opt.value !== 'today') ? 0.4 : 1 }}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {/* Custom date range inputs */}
          {dateRangeType === 'custom' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Calendar size={14} color="var(--text-muted)" />
              <input type="date" className="bo-input" style={{ width: 'auto', height: '34px', fontSize: '13px' }} value={startDate} onChange={e => setStartDate(e.target.value)} />
              <span style={{ color: 'var(--text-muted)' }}>~</span>
              <input type="date" className="bo-input" style={{ width: 'auto', height: '34px', fontSize: '13px' }} value={endDate} onChange={e => setEndDate(e.target.value)} />
              <button type="button" className="bo-filter-chip active" onClick={fetchHistory}>적용</button>
            </div>
          )}

          <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px' }}>
            {role !== 'Staff' && (
              <button 
                type="button" 
                className="bo-filter-chip active"
                onClick={handleExportCSV}
                style={{ background: 'var(--success)', border: 'none', color: '#fff', display: 'flex', alignItems: 'center', gap: '4px', height: '32px' }}
              >
                📥 내보내기
              </button>
            )}
            <button type="button" className="bo-action-btn" onClick={fetchHistory} title="새로고침">
              <RefreshCw size={14} className={isLoading ? 'spin-icon' : ''} style={{ animation: isLoading ? 'spin 2s linear infinite' : 'none' }} />
            </button>
          </div>
        </div>
      </div>

      {/* Advanced filters (list mode only) */}
      {viewMode === 'list' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '8px', flexShrink: 0 }}>
          <div style={{ position: 'relative' }}>
            <Search size={14} style={{ position: 'absolute', left: '14px', top: '15px', color: 'var(--text-muted)' }} />
            <input
              type="text"
              className="bo-input"
              placeholder="주문번호, 캐셔명 검색"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              style={{ paddingLeft: '36px' }}
            />
          </div>
          <select className="bo-select" value={paymentFilter} onChange={e => setPaymentFilter(e.target.value as any)}>
            <option value="all">결제 수단 전체</option>
            <option value="CARD">💳 카드 결제</option>
            <option value="TRANSFER">🏦 계좌 이체</option>
          </select>
          <select className="bo-select" value={refundFilter} onChange={e => setRefundFilter(e.target.value as any)}>
            <option value="all">거래 상태 전체</option>
            <option value="active">정상 결제</option>
            <option value="refunded">↩️ 환불 처리건</option>
          </select>
          <select className="bo-select" value={selectedProduct} onChange={e => setSelectedProduct(e.target.value)}>
            <option value="all">판매 상품별 전체</option>
            {availableProducts.map(p => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        </div>
      )}

      {/* Main Content Area */}
      <div style={{ flex: 1, overflow: 'hidden' }}>
        {isLoading ? (
          <div className="bo-table-wrap" style={{ height: '100%', overflow: 'hidden' }}>
            <table className="bo-table">
              <thead>
                <tr>
                  <th>결제 시간</th>
                  <th>주문번호</th>
                  <th>담당 캐셔</th>
                  <th>판매 내역</th>
                  <th className="text-right">결제액</th>
                  <th className="text-center">결제수단</th>
                  <th className="text-center">상태</th>
                  <th className="text-center">관리</th>
                </tr>
              </thead>
              <tbody>
                {[1, 2, 3, 4, 5, 6, 7, 8].map(n => (
                  <tr key={n}>
                    <td><div className="skeleton" style={{ width: '80px', height: '14px', borderRadius: '4px' }} /></td>
                    <td><div className="skeleton" style={{ width: '120px', height: '14px', borderRadius: '4px' }} /></td>
                    <td><div className="skeleton" style={{ width: '60px', height: '14px', borderRadius: '4px' }} /></td>
                    <td><div className="skeleton" style={{ width: '150px', height: '14px', borderRadius: '4px' }} /></td>
                    <td className="text-right"><div className="skeleton" style={{ width: '60px', height: '14px', borderRadius: '4px', marginLeft: 'auto' }} /></td>
                    <td className="text-center"><div className="skeleton" style={{ width: '50px', height: '18px', borderRadius: '4px', margin: '0 auto' }} /></td>
                    <td className="text-center"><div className="skeleton" style={{ width: '50px', height: '18px', borderRadius: '4px', margin: '0 auto' }} /></td>
                    <td className="text-center"><div className="skeleton" style={{ width: '40px', height: '24px', borderRadius: '4px', margin: '0 auto' }} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : viewMode === 'list' ? (
          /* TRANSACTION LIST VIEW */
          <div className="bo-table-wrap" style={{ height: '100%' }}>
            {filteredOrders.length === 0 ? (
              <div className="bo-empty">
                <div className="bo-empty-icon">💸</div>
                <div className="bo-empty-text">해당 기간에 검색조건과 일치하는 매출 기록이 없습니다.</div>
              </div>
            ) : (
              <table className="bo-table">
                <thead>
                  <tr>
                    <th>결제 시간</th>
                    <th>주문번호</th>
                    <th>담당 캐셔</th>
                    <th>판매 내역</th>
                    <th className="text-right">결제액</th>
                    <th className="text-center">결제수단</th>
                    <th className="text-center">상태</th>
                    <th className="text-center">관리</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredOrders.map((o) => {
                    const itemsStr = o.order_items?.map((i: any) => `${i.product_name} x ${i.quantity}`).join(', ');

                    return (
                      <tr key={o.id} style={{ opacity: o.is_refunded ? 0.7 : 1, background: o.is_refunded ? '#fef2f2' : undefined }}>
                        <td style={{ color: 'var(--text-muted)' }}>
                          {new Date(o.payment_date_time).toLocaleString('ko-KR', { hour12: false, month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </td>
                        <td className="cell-bold">{o.order_number}</td>
                        <td style={{ color: 'var(--text-muted)' }}>{o.cashier_name}</td>
                        <td style={{ maxWidth: '220px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={itemsStr}>
                          {itemsStr}
                        </td>
                        <td className="text-right cell-bold" style={{ textDecoration: o.is_refunded ? 'line-through' : 'none' }}>
                          {Number(o.total_amount).toLocaleString()}원
                        </td>
                        <td className="text-center">
                          <span className={`bo-badge ${o.payment_method === 'CARD' ? 'bo-badge--primary' : 'bo-badge--success'}`}>
                            {o.payment_method === 'CARD' ? '신용카드' : '계좌이체'}
                          </span>
                        </td>
                        <td className="text-center">
                          {o.is_refunded ? (
                            <span className="bo-badge bo-badge--danger bo-badge--pill">환불완료</span>
                          ) : (
                            <span className="bo-badge bo-badge--success bo-badge--pill">정상판매</span>
                          )}
                        </td>
                        <td className="text-center">
                          <div className="bo-action-group">
                            <button type="button" className="bo-action-btn" onClick={() => handleSelectOrderForReceipt(o)} title="영수증 상세">
                              <Eye size={14} />
                            </button>
                            {!o.is_refunded && role !== 'Staff' && (
                              <button type="button" className="bo-action-btn bo-action-btn--danger" onClick={() => handleRefund(o)} title="환불 처리">
                                <Undo size={14} />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        ) : (
          /* STATISTICS DASHBOARD VIEW */
          <div style={{ height: '100%', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            
            {/* Top Stat Cards */}
            <div className="bo-stats-row" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
              <div className="bo-stat-card">
                <div className="bo-stat-label"><Coins size={16} color="var(--primary)" /> 순 매출 총액 (환불 제외)</div>
                <div className="bo-stat-value">{stats.netSales.toLocaleString()}원</div>
              </div>
              <div className="bo-stat-card">
                <div className="bo-stat-label"><Coins size={16} color="var(--success)" /> 총 매출액 (할인 전)</div>
                <div className="bo-stat-value">{stats.grossSales.toLocaleString()}원</div>
              </div>
              <div className="bo-stat-card">
                <div className="bo-stat-label"><TrendingUp size={16} color="var(--danger)" /> 할인 총액</div>
                <div className="bo-stat-value" style={{ color: 'var(--danger)' }}>-{stats.totalDiscount.toLocaleString()}원</div>
              </div>
              <div className="bo-stat-card">
                <div className="bo-stat-label"><TrendingUp size={16} color="#d97706" /> 오늘 할인액 / 이번 달 할인액</div>
                <div className="bo-stat-value" style={{ fontSize: '15px', display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '6px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}><span style={{ fontSize: '12px', fontWeight: 'normal', color: 'var(--text-secondary)' }}>오늘:</span> <span style={{ color: 'var(--danger)', fontWeight: 'bold' }}>-{stats.todayDiscount.toLocaleString()}원</span></div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}><span style={{ fontSize: '12px', fontWeight: 'normal', color: 'var(--text-secondary)' }}>이번달:</span> <span style={{ color: 'var(--danger)', fontWeight: 'bold' }}>-{stats.monthlyDiscount.toLocaleString()}원</span></div>
                </div>
              </div>
              <div className="bo-stat-card">
                <div className="bo-stat-label"><ShoppingBag size={16} color="var(--success)" /> 총 결제 건수 / 아이템수</div>
                <div className="bo-stat-value">
                  {stats.salesCount}건 ({stats.totalQty}개)
                  <div style={{ fontSize: '12px', fontWeight: 'normal', color: 'var(--text-secondary)', marginTop: '4px' }}>
                    객단가: {avgPurchase.toLocaleString()}원
                  </div>
                </div>
              </div>
              <div className="bo-stat-card">
                <div className="bo-stat-label"><Undo size={16} color="#e11d48" /> 환불 처리 건수 / 금액</div>
                <div className="bo-stat-value bo-stat-value--danger">{stats.refundCount}건 (-{stats.refundAmount.toLocaleString()}원)</div>
              </div>
            </div>

            {/* Bottom Breakdown Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              
              {/* Payment Methods Ratio */}
              <div className="bo-card">
                <div className="bo-card-header">
                  <TrendingUp size={16} color="var(--primary)" /> 결제 수단별 금액 통계
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '6px' }}>
                      <span style={{ fontWeight: '600' }}>💳 신용카드 결제 ({stats.cardCount}건)</span>
                      <span style={{ fontWeight: '700' }}>{stats.cardAmount.toLocaleString()}원</span>
                    </div>
                    <div style={{ height: '10px', background: '#f1f5f9', borderRadius: '5px', overflow: 'hidden' }}>
                      <div style={{ height: '100%', background: 'var(--primary)', borderRadius: '5px', width: stats.netSales > 0 ? `${(stats.cardAmount / stats.netSales) * 100}%` : '0%', transition: 'width 0.3s ease' }} />
                    </div>
                  </div>
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '6px' }}>
                      <span style={{ fontWeight: '600' }}>🏦 계좌 이체 송금 ({stats.transferCount}건)</span>
                      <span style={{ fontWeight: '700' }}>{stats.transferAmount.toLocaleString()}원</span>
                    </div>
                    <div style={{ height: '10px', background: '#f1f5f9', borderRadius: '5px', overflow: 'hidden' }}>
                      <div style={{ height: '100%', background: 'var(--success)', borderRadius: '5px', width: stats.netSales > 0 ? `${(stats.transferAmount / stats.netSales) * 100}%` : '0%', transition: 'width 0.3s ease' }} />
                    </div>
                  </div>
                </div>
              </div>

              {/* Popular Products Top List */}
              <div className="bo-card">
                <div className="bo-card-header">
                  <Award size={16} color="#d97706" /> 기간 내 인기 판매 상품 TOP 5
                </div>
                {topProducts.length === 0 ? (
                  <div className="bo-empty" style={{ padding: '20px 0' }}>
                    <div className="bo-empty-text">인기 상품 통계 데이터가 부족합니다.</div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {topProducts.map(([name, qty], idx) => {
                      const maxQty = topProducts[0][1];
                      return (
                        <div key={name} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px' }}>
                          <span style={{ fontWeight: '700', width: '20px', color: idx < 3 ? 'var(--primary)' : 'var(--text-muted)' }}>{idx + 1}.</span>
                          <span style={{ flex: 1, fontWeight: '600' }}>{name}</span>
                          <div style={{ flex: 2, height: '8px', background: '#f1f5f9', borderRadius: '4px', overflow: 'hidden' }}>
                            <div style={{ height: '100%', borderRadius: '4px', background: idx === 0 ? '#f59e0b' : 'var(--primary)', width: `${(qty / maxQty) * 100}%`, transition: 'width 0.3s ease' }} />
                          </div>
                          <span style={{ fontWeight: '800', width: '40px', textAlign: 'right' }}>{qty}개</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
            
          </div>
        )}
      </div>
      
    </div>
  );
};

export default HistoryView;

