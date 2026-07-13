import React, { useState, useEffect } from 'react';
import { Receipt, PaymentMethod, CartItem } from '../types';
import { supabase } from '../supabase';
import { Search, Calendar, RefreshCw, Undo, Coins, TrendingUp, Award, ShoppingBag, Eye } from 'lucide-react';

interface HistoryViewProps {
  currentCashierName: string;
  onSelectReceipt: (receipt: Receipt) => void;
  showToast: (msg: string) => void;
}

const HistoryView: React.FC<HistoryViewProps> = ({ currentCashierName, onSelectReceipt, showToast }) => {
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
    fetchHistory();
  }, [dateRangeType, startDate, endDate]);

  // Apply filters client-side for dynamic reactivity
  const filteredOrders = orders.filter(order => {
    // Search Cashier, ID, Order Number
    const matchesSearch = 
      order.order_number.toLowerCase().includes(searchQuery.toLowerCase()) || 
      order.cashier_name.toLowerCase().includes(searchQuery.toLowerCase());
      
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
    if (curr.is_refunded) {
      acc.refundCount += 1;
      acc.refundAmount += Number(curr.total_amount) || 0;
    } else {
      acc.totalSales += Number(curr.total_amount) || 0;
      acc.salesCount += 1;
      acc.totalQty += Number(curr.total_quantity) || 0;
      
      if (curr.payment_method === 'CARD') {
        acc.cardAmount += Number(curr.total_amount) || 0;
        acc.cardCount += 1;
      } else {
        acc.transferAmount += Number(curr.total_amount) || 0;
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
    totalSales: 0,
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

  const avgPurchase = stats.salesCount > 0 ? Math.round(stats.totalSales / stats.salesCount) : 0;
  const topProducts = (Object.entries(stats.itemsSold) as [string, number][])
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  // Refund Order & restore inventory
  const handleRefund = async (order: any) => {
    if (order.is_refunded) return;
    const confirmRefund = window.confirm(
      `⚠️ 주문번호 [${order.order_number}] 결제건을 환불하시겠습니까?\n이 주문에 포함된 ${order.total_quantity}개의 상품 재고가 원래대로 복구됩니다.`
    );
    if (!confirmRefund) return;

    setIsLoading(true);
    try {
      // 1. Mark Order Header as refunded in Supabase
      const { error: refundError } = await supabase
        .from('orders')
        .update({
          is_refunded: true,
          refunded_at: new Date().toISOString(),
          refunded_by: currentCashierName
        })
        .eq('id', order.id);

      if (refundError) throw refundError;

      // 2. Restore Stock Levels for each item in the order
      for (const item of order.order_items) {
        if (item.product_id === 'DISCOUNT' || item.product_id === 'GS') continue;
        
        // Fetch current stock
        const { data: prodData, error: prodFetchError } = await supabase
          .from('products')
          .select('stock, name')
          .eq('id', item.product_id)
          .single();

        if (prodFetchError) {
          console.warn(`Could not find product ${item.product_id} to restore inventory, skipping.`, prodFetchError);
          continue;
        }

        const restoredStock = (prodData.stock || 0) + item.quantity;
        
        // Update product stock
        await supabase
          .from('products')
          .update({ stock: restoredStock })
          .eq('id', item.product_id);
      }

      showToast(`↩️ 주문번호 [${order.order_number}] 환불 완료 및 재고가 복원되었습니다.`);
      fetchHistory();
    } catch (err: any) {
      console.error(err);
      alert(`⚠️ 환불 처리 중 오류가 발생했습니다: ${err.message || err}`);
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
      refundedBy: o.refunded_by
    };

    onSelectReceipt(receipt);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', height: '100%', overflow: 'hidden', padding: '10px' }}>
      
      {/* Top Toggle Switch */}
      <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
        <button 
          type="button" 
          onClick={() => setViewMode('list')}
          className={`gnb-tab ${viewMode === 'list' ? 'active' : ''}`}
          style={{ flex: 1, padding: '12px', borderRadius: '8px', border: '1px solid var(--border-color)', fontSize: '13.5px', height: 'auto', textAlign: 'center' }}
        >
          💻 매출 거래 내역
        </button>
        <button 
          type="button" 
          onClick={() => setViewMode('dashboard')}
          className={`gnb-tab ${viewMode === 'dashboard' ? 'active' : ''}`}
          style={{ flex: 1, padding: '12px', borderRadius: '8px', border: '1px solid var(--border-color)', fontSize: '13.5px', height: 'auto', textAlign: 'center' }}
        >
          📊 매출 통계 대시보드
        </button>
      </div>

      {/* Date Filter & Search Row */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', background: '#f8fafc', padding: '16px', borderRadius: '12px', border: '1px solid var(--border-color)', flexShrink: 0 }}>
        
        {/* Date presets */}
        <div style={{ display: 'flex', gap: '4px' }}>
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
              style={{
                padding: '6px 12px',
                borderRadius: '6px',
                border: '1px solid var(--border-color)',
                fontSize: '12.5px',
                background: dateRangeType === opt.value ? 'var(--primary)' : '#ffffff',
                color: dateRangeType === opt.value ? '#ffffff' : 'var(--text-secondary)',
                fontWeight: 'bold',
                cursor: 'pointer'
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {/* Custom date range inputs */}
        {dateRangeType === 'custom' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Calendar size={14} color="var(--text-secondary)" />
            <input 
              type="date" 
              value={startDate} 
              onChange={e => setStartDate(e.target.value)} 
              style={{ padding: '6px 10px', border: '1px solid var(--border-color)', borderRadius: '6px', fontSize: '13px' }} 
            />
            <span style={{ color: 'var(--text-muted)' }}>~</span>
            <input 
              type="date" 
              value={endDate} 
              onChange={e => setEndDate(e.target.value)} 
              style={{ padding: '6px 10px', border: '1px solid var(--border-color)', borderRadius: '6px', fontSize: '13px' }} 
            />
            <button type="button" onClick={fetchHistory} style={{ padding: '6px 10px', background: 'var(--primary-glow)', color: 'var(--primary)', border: '1px solid var(--border-color)', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>적용</button>
          </div>
        )}

        <button 
          type="button" 
          onClick={fetchHistory} 
          style={{ marginLeft: 'auto', padding: '8px', border: '1px solid var(--border-color)', background: '#ffffff', borderRadius: '8px', cursor: 'pointer' }}
          title="새로고침"
        >
          <RefreshCw size={14} className={isLoading ? 'spin-icon' : ''} style={{ animation: isLoading ? 'spin 2s linear infinite' : 'none' }} />
        </button>
      </div>

      {/* Advanced filters only relevant for list mode */}
      {viewMode === 'list' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '8px', flexShrink: 0 }}>
          {/* Search bar */}
          <div style={{ position: 'relative' }}>
            <Search size={14} style={{ position: 'absolute', left: '10px', top: '12px', color: 'var(--text-muted)' }} />
            <input
              type="text"
              placeholder="주문번호, 캐셔명 검색"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              style={{ width: '100%', padding: '8px 8px 8px 30px', border: '1px solid var(--border-color)', borderRadius: '8px', fontSize: '13px' }}
            />
          </div>

          {/* Payment Method filter */}
          <select 
            value={paymentFilter} 
            onChange={e => setPaymentFilter(e.target.value as any)}
            style={{ padding: '8px', border: '1px solid var(--border-color)', borderRadius: '8px', background: '#fff', fontSize: '13px' }}
          >
            <option value="all">결제 수단 전체</option>
            <option value="CARD">💳 카드 결제</option>
            <option value="TRANSFER">🏦 계좌 이체</option>
          </select>

          {/* Refund Status filter */}
          <select 
            value={refundFilter} 
            onChange={e => setRefundFilter(e.target.value as any)}
            style={{ padding: '8px', border: '1px solid var(--border-color)', borderRadius: '8px', background: '#fff', fontSize: '13px' }}
          >
            <option value="all">거래 상태 전체</option>
            <option value="active">정상 결제</option>
            <option value="refunded">↩️ 환불 처리건</option>
          </select>

          {/* Product name filter */}
          <select 
            value={selectedProduct} 
            onChange={e => setSelectedProduct(e.target.value)}
            style={{ padding: '8px', border: '1px solid var(--border-color)', borderRadius: '8px', background: '#fff', fontSize: '13px' }}
          >
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
          <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)' }}>
            <RefreshCw size={24} style={{ animation: 'spin 2s linear infinite', marginBottom: '8px' }} />
            <div>매출 데이터를 안전하게 조회하는 중...</div>
          </div>
        ) : viewMode === 'list' ? (
          /* TRANSACTION LIST VIEW */
          <div style={{ height: '100%', overflowY: 'auto', background: '#ffffff', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-lg)' }}>
            {filteredOrders.length === 0 ? (
              <div style={{ padding: '60px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                해당 기간에 검색조건과 일치하는 매출 기록이 없습니다. 💸
              </div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13.5px' }}>
                <thead>
                  <tr style={{ background: '#f8fafc', borderBottom: '1px solid var(--border-color)', position: 'sticky', top: 0 }}>
                    <th style={{ padding: '14px 16px', color: 'var(--text-secondary)' }}>결제 시간</th>
                    <th style={{ padding: '14px 16px', color: 'var(--text-secondary)' }}>주문번호</th>
                    <th style={{ padding: '14px 16px', color: 'var(--text-secondary)' }}>담당 캐셔</th>
                    <th style={{ padding: '14px 16px', color: 'var(--text-secondary)' }}>판매 내역</th>
                    <th style={{ padding: '14px 16px', color: 'var(--text-secondary)', textAlign: 'right' }}>결제액</th>
                    <th style={{ padding: '14px 16px', color: 'var(--text-secondary)', textAlign: 'center' }}>결제수단</th>
                    <th style={{ padding: '14px 16px', color: 'var(--text-secondary)', textAlign: 'center' }}>상태</th>
                    <th style={{ padding: '14px 16px', color: 'var(--text-secondary)', textAlign: 'center' }}>관리</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredOrders.map((o) => {
                    const itemsStr = o.order_items?.map((i: any) => `${i.product_name} x ${i.quantity}`).join(', ');

                    return (
                      <tr 
                        key={o.id} 
                        style={{ 
                          borderBottom: '1px solid var(--border-color)', 
                          background: o.is_refunded ? '#fff1f2' : '#ffffff',
                          opacity: o.is_refunded ? 0.8 : 1
                        }}
                      >
                        <td style={{ padding: '12px 16px', color: 'var(--text-secondary)' }}>
                          {new Date(o.payment_date_time).toLocaleString('ko-KR', { hour12: false, month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </td>
                        <td style={{ padding: '12px 16px', fontWeight: '700' }}>{o.order_number}</td>
                        <td style={{ padding: '12px 16px', color: 'var(--text-secondary)' }}>{o.cashier_name}</td>
                        <td style={{ padding: '12px 16px', maxWidth: '220px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={itemsStr}>
                          {itemsStr}
                        </td>
                        <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 'bold', textDecoration: o.is_refunded ? 'line-through' : 'none' }}>
                          {Number(o.total_amount).toLocaleString()}원
                        </td>
                        <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                          <span style={{ fontSize: '11px', padding: '3px 8px', borderRadius: '4px', background: o.payment_method === 'CARD' ? 'var(--primary-glow)' : 'var(--success-glow)', color: o.payment_method === 'CARD' ? 'var(--primary)' : 'var(--success)', fontWeight: 'bold' }}>
                            {o.payment_method === 'CARD' ? '신용카드' : '계좌이체'}
                          </span>
                        </td>
                        <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                          {o.is_refunded ? (
                            <span style={{ fontSize: '11px', padding: '3px 8px', borderRadius: '20px', background: '#fecdd3', color: '#e11d48', fontWeight: '700' }}>환불완료</span>
                          ) : (
                            <span style={{ fontSize: '11px', padding: '3px 8px', borderRadius: '20px', background: '#dcfce7', color: '#16a34a', fontWeight: '700' }}>정상판매</span>
                          )}
                        </td>
                        <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                          <div style={{ display: 'flex', gap: '4px', justifyContent: 'center' }}>
                            <button 
                              type="button" 
                              className="btn btn-secondary" 
                              style={{ padding: '6px', minWidth: 'auto', borderRadius: '6px' }}
                              onClick={() => handleSelectOrderForReceipt(o)}
                              title="영수증 상세"
                            >
                              <Eye size={12} />
                            </button>
                            {!o.is_refunded && (
                              <button 
                                type="button" 
                                className="btn btn-secondary" 
                                style={{ padding: '6px', minWidth: 'auto', borderRadius: '6px', color: '#e11d48' }}
                                onClick={() => handleRefund(o)}
                                title="환불 처리"
                              >
                                <Undo size={12} />
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
            
            {/* Top Score Cards Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
              <div style={{ background: '#ffffff', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '16px', display: 'flex', alignItems: 'center', gap: '16px', boxShadow: 'var(--shadow-sm)' }}>
                <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: 'var(--primary-glow)', display: 'flex', alignItems: 'center', justifyItems: 'center', justifyContent: 'center' }}>
                  <Coins size={22} color="var(--primary)" />
                </div>
                <div>
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>순 매출 총액 (환불 제외)</div>
                  <div style={{ fontSize: '20px', fontWeight: '800', color: 'var(--text-primary)', marginTop: '2px' }}>{stats.totalSales.toLocaleString()}원</div>
                </div>
              </div>

              <div style={{ background: '#ffffff', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '16px', display: 'flex', alignItems: 'center', gap: '16px', boxShadow: 'var(--shadow-sm)' }}>
                <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: 'var(--success-glow)', display: 'flex', alignItems: 'center', justifyItems: 'center', justifyContent: 'center' }}>
                  <ShoppingBag size={22} color="var(--success)" />
                </div>
                <div>
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>총 결제 건수 / 아이템수</div>
                  <div style={{ fontSize: '20px', fontWeight: '800', color: 'var(--text-primary)', marginTop: '2px' }}>{stats.salesCount}건 ({stats.totalQty}개)</div>
                </div>
              </div>

              <div style={{ background: '#ffffff', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '16px', display: 'flex', alignItems: 'center', gap: '16px', boxShadow: 'var(--shadow-sm)' }}>
                <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: '#fffbeb', display: 'flex', alignItems: 'center', justifyItems: 'center', justifyContent: 'center' }}>
                  <TrendingUp size={22} color="#d97706" />
                </div>
                <div>
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>주문당 평균 결제액 (객단가)</div>
                  <div style={{ fontSize: '20px', fontWeight: '800', color: 'var(--text-primary)', marginTop: '2px' }}>{avgPurchase.toLocaleString()}원</div>
                </div>
              </div>

              <div style={{ background: '#ffffff', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '16px', display: 'flex', alignItems: 'center', gap: '16px', boxShadow: 'var(--shadow-sm)' }}>
                <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: '#fff1f2', display: 'flex', alignItems: 'center', justifyItems: 'center', justifyContent: 'center' }}>
                  <Undo size={22} color="#e11d48" />
                </div>
                <div>
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>환불 처리 건수 / 금액</div>
                  <div style={{ fontSize: '20px', fontWeight: '800', color: '#e11d48', marginTop: '2px' }}>{stats.refundCount}건 (-{stats.refundAmount.toLocaleString()}원)</div>
                </div>
              </div>
            </div>

            {/* Bottom Breakdown Cards Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', flexWrap: 'wrap' }}>
              
              {/* Payment Methods Ratio */}
              <div style={{ background: '#ffffff', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '20px', boxShadow: 'var(--shadow-sm)' }}>
                <h3 style={{ fontSize: '14.5px', fontWeight: '800', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <TrendingUp size={16} color="var(--primary)" /> 결제 수단별 금액 통계
                </h3>
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12.5px', marginBottom: '4px' }}>
                      <span style={{ fontWeight: '700' }}>💳 신용카드 결제 ({stats.cardCount}건)</span>
                      <span style={{ fontWeight: 'bold' }}>{stats.cardAmount.toLocaleString()}원</span>
                    </div>
                    <div style={{ height: '12px', background: '#f1f5f9', borderRadius: '6px', overflow: 'hidden' }}>
                      <div style={{ 
                        height: '100%', 
                        background: 'var(--primary)', 
                        width: stats.totalSales > 0 ? `${(stats.cardAmount / stats.totalSales) * 100}%` : '0%' 
                      }} />
                    </div>
                  </div>

                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12.5px', marginBottom: '4px' }}>
                      <span style={{ fontWeight: '700' }}>🏦 계좌 이체 송금 ({stats.transferCount}건)</span>
                      <span style={{ fontWeight: 'bold' }}>{stats.transferAmount.toLocaleString()}원</span>
                    </div>
                    <div style={{ height: '12px', background: '#f1f5f9', borderRadius: '6px', overflow: 'hidden' }}>
                      <div style={{ 
                        height: '100%', 
                        background: 'var(--success)', 
                        width: stats.totalSales > 0 ? `${(stats.transferAmount / stats.totalSales) * 100}%` : '0%' 
                      }} />
                    </div>
                  </div>
                </div>
              </div>

              {/* Popular Products Top List */}
              <div style={{ background: '#ffffff', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '20px', boxShadow: 'var(--shadow-sm)' }}>
                <h3 style={{ fontSize: '14.5px', fontWeight: '800', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Award size={16} color="#d97706" /> 기간 내 인기 판매 상품 TOP 5
                </h3>
                
                {topProducts.length === 0 ? (
                  <div style={{ padding: '20px 0', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '13px' }}>
                    인기 상품 통계 데이터가 부족합니다.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {topProducts.map(([name, qty], idx) => {
                      const maxQty = topProducts[0][1];
                      return (
                        <div key={name} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px' }}>
                          <span style={{ fontWeight: 'bold', width: '20px', color: idx < 3 ? 'var(--primary)' : 'var(--text-muted)' }}>{idx + 1}.</span>
                          <span style={{ flex: 1, fontWeight: '600' }}>{name}</span>
                          <div style={{ flex: 2, height: '8px', background: '#f1f5f9', borderRadius: '4px', overflow: 'hidden' }}>
                            <div style={{ 
                              height: '100%', 
                              background: idx === 0 ? '#f59e0b' : 'var(--primary)', 
                              width: `${(qty / maxQty) * 100}%` 
                            }} />
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
