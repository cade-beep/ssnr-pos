import React, { useState, useEffect } from 'react';
import { Product } from '../types';
import { supabase } from '../supabase';
import { FileSpreadsheet, Lock, RefreshCw, BarChart, AlertTriangle, ShieldCheck, Printer } from 'lucide-react';
import { auditLog } from '../utils/auditLogger';

interface SettingsViewProps {
  products: Product[];
  currentCashier: { email: string; name: string; role: '관리자' | '캐셔' };
  onLogout: () => void;
  showToast: (msg: string) => void;
  onRefreshProducts: () => void;
}

const SettingsView: React.FC<SettingsViewProps> = ({
  products,
  currentCashier,
  onLogout,
  showToast,
  onRefreshProducts
}) => {
  const [dbConnected, setDbConnected] = useState<boolean | null>(null);
  const [checkingDb, setCheckingDb] = useState(false);
  const [reports, setReports] = useState<any[]>([]);
  const [loadingReports, setLoadingReports] = useState(false);

  // Close report states
  const [isCloseModalOpen, setIsCloseModalOpen] = useState(false);
  const [closingData, setClosingData] = useState<any>(null);
  const [savingClose, setSavingClose] = useState(false);
  const [activeCloseReport, setActiveCloseReport] = useState<any>(null);

  // Low stock products
  const lowStockProducts = products.filter(
    p => p.isActive !== false && (p.stock || 0) <= (p.lowStockThreshold || 5)
  );

  const checkSupabaseConnection = async () => {
    setCheckingDb(true);
    try {
      const { error } = await supabase.from('orders').select('id').limit(1);
      if (error) throw error;
      setDbConnected(true);
      onRefreshProducts();
      showToast('⚡ Supabase 데이터베이스 연결 및 상품 갱신 완료!');
    } catch (err) {
      console.error(err);
      setDbConnected(false);
      showToast('⚠️ Supabase 연결에 실패했습니다.');
    } finally {
      setCheckingDb(false);
    }
  };

  const fetchReports = async () => {
    setLoadingReports(true);
    try {
      const { data, error } = await supabase
        .from('closing_reports')
        .select('*')
        .order('closed_at', { ascending: false })
        .limit(10);
      if (error) throw error;
      setReports(data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingReports(false);
    }
  };

  useEffect(() => {
    checkSupabaseConnection();
    fetchReports();
  }, []);

  // Compute Today's Sales for Closing
  const handleCalculateClose = async () => {
    setIsCloseModalOpen(true);
    setClosingData(null);

    try {
      // Get today's start and end timestamps
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      const end = new Date();
      end.setHours(23, 59, 59, 999);

      // Fetch today's orders
      const { data: todayOrders, error: orderErr } = await supabase
        .from('orders')
        .select(`
          id,
          total_amount,
          total_quantity,
          payment_method,
          is_refunded,
          order_items (
            product_name,
            quantity
          )
        `)
        .gte('payment_date_time', start.toISOString())
        .lte('payment_date_time', end.toISOString());

      if (orderErr) throw orderErr;

      // Aggregates
      let totalSales = 0;
      let cardSales = 0;
      let transferSales = 0;
      let totalQty = 0;
      let refundCount = 0;
      let refundAmount = 0;
      let salesCount = 0;
      const itemDetails: Record<string, number> = {};

      todayOrders?.forEach((order: any) => {
        if (order.is_refunded) {
          refundCount += 1;
          refundAmount += Number(order.total_amount) || 0;
        } else {
          totalSales += Number(order.total_amount) || 0;
          salesCount += 1;
          totalQty += Number(order.total_quantity) || 0;

          if (order.payment_method === 'CARD') {
            cardSales += Number(order.total_amount) || 0;
          } else {
            transferSales += Number(order.total_amount) || 0;
          }

          order.order_items?.forEach((item: any) => {
            const name = item.product_name;
            if (name && !name.includes('[할인적용')) {
              itemDetails[name] = (itemDetails[name] || 0) + (Number(item.quantity) || 0);
            }
          });
        }
      });

      // Prepare snapshot of current stocks
      const inventorySnapshot: Record<string, { stock: number; threshold: number }> = {};
      products.forEach(p => {
        inventorySnapshot[p.name] = {
          stock: p.stock || 0,
          threshold: p.lowStockThreshold || 5
        };
      });

      setClosingData({
        closed_at: new Date().toISOString(),
        cashier_name: currentCashier.name,
        total_sales: totalSales,
        card_sales: cardSales,
        transfer_sales: transferSales,
        cash_sales: 0,
        total_quantity: totalQty,
        refund_count: refundCount,
        refund_amount: refundAmount,
        sales_count: salesCount,
        item_details: itemDetails,
        inventory_snapshot: inventorySnapshot
      });
    } catch (err: any) {
      console.error(err);
      alert(`마감 정산 산출 실패: ${err.message || err}`);
      setIsCloseModalOpen(false);
    }
  };

  // Save closing report to Supabase
  const handleSaveCloseReport = async () => {
    if (!closingData) return;
    const confirmSave = window.confirm('오늘 마감 정산 보고서를 저장하시겠습니까?\n이 작업은 하루 영업 종료 시 한 번만 실행하는 것을 권장합니다.');
    if (!confirmSave) return;

    setSavingClose(true);
    try {
      const { error } = await supabase
        .from('closing_reports')
        .insert({
          cashier_name: closingData.cashier_name,
          total_sales: closingData.total_sales,
          card_sales: closingData.card_sales,
          transfer_sales: closingData.transfer_sales,
          cash_sales: closingData.cash_sales,
          total_quantity: closingData.total_quantity,
          refund_count: closingData.refund_count,
          refund_amount: closingData.refund_amount,
          sales_count: closingData.sales_count,
          item_details: closingData.item_details,
          inventory_snapshot: closingData.inventory_snapshot
        });

      if (error) throw error;

      auditLog({
        action: 'BUSINESS_CLOSE',
        result: 'SUCCESS',
        context: {
          salesAmount: closingData.sales_amount,
          refundAmount: closingData.refund_amount,
          salesCount: closingData.sales_count
        }
      });

      showToast('📊 금일 영업 마감 보고서가 정상 기입되었습니다!');
      setIsCloseModalOpen(false);
      fetchReports();
    } catch (err: any) {
      console.error(err);
      
      auditLog({
        action: 'API_FAILURE',
        result: 'FAIL',
        context: { actionType: 'BUSINESS_CLOSE', error: err.message || String(err) }
      });

      alert(`마감 보고서 저장 실패: ${err.message || err}`);
    } finally {
      setSavingClose(false);
    }
  };

  const handlePrintReport = () => {
    window.print();
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr', gap: '20px', height: '100%', overflow: 'hidden', padding: '10px' }}>
      
      {/* LEFT COLUMN: System Config & Cashier info */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', overflowY: 'auto' }}>
        
        {/* Cashier profile card */}
        <div style={{ background: '#ffffff', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '20px', boxShadow: 'var(--shadow-sm)' }}>
          <h3 style={{ fontSize: '15px', fontWeight: '800', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Lock size={16} color="var(--primary)" /> 근무자 정보 및 보안
          </h3>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '13.5px', marginBottom: '16px' }}>
            <div>
              <span style={{ color: 'var(--text-secondary)' }}>로그인 이름:</span>{' '}
              <strong style={{ fontWeight: '700' }}>{currentCashier.name}</strong>
            </div>
            <div>
              <span style={{ color: 'var(--text-secondary)' }}>이메일 계정:</span>{' '}
              <strong style={{ fontWeight: '600' }}>{currentCashier.email}</strong>
            </div>
            <div>
              <span style={{ color: 'var(--text-secondary)' }}>부여된 권한:</span>{' '}
              <span style={{ fontSize: '12px', padding: '2px 8px', borderRadius: '4px', background: 'var(--primary-glow)', color: 'var(--primary)', fontWeight: 'bold' }}>
                {currentCashier.role}
              </span>
            </div>
          </div>

          <button 
            type="button" 
            className="btn btn-secondary" 
            style={{ width: '100%', padding: '12px', borderRadius: '8px', color: '#ef4444', borderColor: '#fca5a5', fontWeight: 'bold' }}
            onClick={onLogout}
          >
            👋 근무자 로그아웃
          </button>
        </div>

        {/* Database linkages */}
        <div style={{ background: '#ffffff', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '20px', boxShadow: 'var(--shadow-sm)' }}>
          <h3 style={{ fontSize: '15px', fontWeight: '800', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <FileSpreadsheet size={16} color="var(--success)" /> 데이터베이스 관리 연동
          </h3>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '13.5px', marginBottom: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>Supabase DB 상태:</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                {dbConnected === null ? (
                  <span style={{ color: 'var(--text-muted)' }}>확인 중...</span>
                ) : dbConnected ? (
                  <span style={{ color: 'var(--success)', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <ShieldCheck size={14} /> 양호
                  </span>
                ) : (
                  <span style={{ color: '#ef4444', fontWeight: '700' }}>오류</span>
                )}
                <button type="button" onClick={checkSupabaseConnection} disabled={checkingDb} style={{ border: 'none', background: 'transparent', padding: '2px', cursor: 'pointer' }}>
                  <RefreshCw size={12} className={checkingDb ? 'spin' : ''} />
                </button>
              </div>
            </div>

            <div style={{ fontSize: '12px', color: 'var(--text-secondary)', background: '#f8fafc', padding: '8px', borderRadius: '6px', border: '1px solid var(--border-color)', wordBreak: 'break-all' }}>
              API: bhnlbfwajdrlxmjjqnio.supabase.co
            </div>
          </div>

          <a 
            href={import.meta.env.VITE_SPREADSHEET_URL || "https://docs.google.com/spreadsheets"}
            target="_blank" 
            rel="noopener noreferrer"
            className="btn btn-secondary" 
            style={{ width: '100%', padding: '12px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', textDecoration: 'none', fontWeight: 'bold' }}
          >
            <FileSpreadsheet size={14} />
            <span>구글 스프레드시트 이동</span>
          </a>
        </div>

        {/* Business close trigger */}
        <div style={{ background: '#ffffff', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '20px', boxShadow: 'var(--shadow-sm)' }}>
          <h3 style={{ fontSize: '15px', fontWeight: '800', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <BarChart size={16} color="var(--primary)" /> 영업 정산 및 마감
          </h3>
          <p style={{ fontSize: '12.5px', color: 'var(--text-secondary)', marginBottom: '16px', lineHeight: '1.4' }}>
            금일 발생한 매출 합산과 재고 상태를 마감 정산 보고서로 집계하고 데이터베이스에 영구적으로 보존합니다.
          </p>

          <button 
            type="button" 
            className="btn btn-primary" 
            style={{ width: '100%', padding: '12px', borderRadius: '8px', fontWeight: 'bold' }}
            onClick={handleCalculateClose}
          >
            📊 금일 영업 마감 정산 실행
          </button>
        </div>

      </div>

      {/* RIGHT COLUMN: Low Stock Warning panel & Past Close Reports */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', overflowY: 'auto' }}>
        
        {/* Stock Alerts panel */}
        <div style={{ background: '#ffffff', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '20px', boxShadow: 'var(--shadow-sm)' }}>
          <h3 style={{ fontSize: '15px', fontWeight: '800', marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <AlertTriangle size={16} color="#f59e0b" /> 실시간 재고 부족 알림
            <span style={{ fontSize: '11px', padding: '1px 6px', borderRadius: '10px', background: lowStockProducts.length > 0 ? '#fee2e2' : '#dcfce7', color: lowStockProducts.length > 0 ? '#ef4444' : '#16a34a', fontWeight: 'bold' }}>
              {lowStockProducts.length}건
            </span>
          </h3>
          
          <div style={{ maxHeight: '180px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {lowStockProducts.length === 0 ? (
              <div style={{ padding: '12px', background: '#f0fdf4', color: '#16a34a', border: '1px solid #bbf7d0', borderRadius: '8px', fontSize: '13px', textAlign: 'center', fontWeight: 'bold' }}>
                ✅ 모든 활성 상품의 재고가 여유롭습니다.
              </div>
            ) : (
              lowStockProducts.map(p => (
                <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', background: '#fffbeb', border: '1px solid #fef3c7', borderRadius: '8px', fontSize: '13px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span>{p.emoji || '🍞'}</span>
                    <strong style={{ fontWeight: '700' }}>{p.name}</strong>
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>ID: {p.id}</span>
                  </div>
                  <span style={{ color: (p.stock || 0) === 0 ? '#ef4444' : '#d97706', fontWeight: '800' }}>
                    {(p.stock || 0) === 0 ? '품절' : `${p.stock}개 남음`} (경고: {p.lowStockThreshold}개)
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* History of close reports */}
        <div style={{ background: '#ffffff', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '20px', boxShadow: 'var(--shadow-sm)', flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <h3 style={{ fontSize: '15px', fontWeight: '800', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
            <BarChart size={16} color="var(--primary)" /> 최근 10건 마감 보고서 이력
          </h3>
          
          <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {loadingReports ? (
              <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-secondary)' }}>이력을 가져오는 중...</div>
            ) : reports.length === 0 ? (
              <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '12.5px' }}>기록된 마감 보고서가 존재하지 않습니다.</div>
            ) : (
              reports.map(r => (
                <div 
                  key={r.id}
                  style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px', border: '1px solid var(--border-color)', borderRadius: '8px', background: '#f8fafc', cursor: 'pointer' }}
                  onClick={() => setActiveCloseReport(r)}
                  title="자세히 보기"
                >
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', fontSize: '12.5px' }}>
                    <strong style={{ fontWeight: '700' }}>
                      {new Date(r.closed_at).toLocaleDateString('ko-KR')} 마감 보고
                    </strong>
                    <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                      담당: {r.cashier_name} | 거래건수: {r.sales_count}건
                    </span>
                  </div>
                  <strong style={{ fontSize: '14px', fontWeight: '800', color: 'var(--text-primary)' }}>
                    {Number(r.total_sales).toLocaleString()}원
                  </strong>
                </div>
              ))
            )}
          </div>
        </div>

      </div>

      {/* MID-CALCULATION / CLOSE REPORT BUILDER MODAL */}
      {isCloseModalOpen && (
        <div className="modal-overlay" style={{ zIndex: 1100 }}>
          <div className="modal-content" style={{ maxWidth: '440px', maxHeight: '90vh', overflowY: 'auto' }}>
            <div className="modal-body">
              <div className="modal-title" style={{ textAlign: 'center', marginBottom: '8px' }}>📊 영업 마감 정산 보고</div>
              <p style={{ textAlign: 'center', fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '16px' }}>
                마감 완료를 누르면 보고서가 저장되며 출력 가능 상태가 됩니다.
              </p>

              {closingData ? (
                <div style={{ border: '1px solid var(--border-color)', padding: '16px', borderRadius: '10px', background: '#f9fafb', display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '13px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #e2e8f0', paddingBottom: '6px' }}>
                    <span>정산 시간</span>
                    <strong style={{ fontWeight: '700' }}>{new Date(closingData.closed_at).toLocaleString('ko-KR')}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #e2e8f0', paddingBottom: '6px' }}>
                    <span>담당자</span>
                    <strong style={{ fontWeight: '700' }}>{closingData.cashier_name}</strong>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '6px' }}>
                    <span style={{ fontWeight: 'bold' }}>총 매출액 (환불 제외)</span>
                    <strong style={{ fontSize: '16px', color: 'var(--primary)', fontWeight: '800' }}>
                      {closingData.total_sales.toLocaleString()}원
                    </strong>
                  </div>

                  <div style={{ paddingLeft: '10px', borderLeft: '2px solid var(--primary)', display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px', color: 'var(--text-secondary)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>💳 신용카드 매출</span>
                      <span>{closingData.card_sales.toLocaleString()}원</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>🏦 계좌이체 매출</span>
                      <span>{closingData.transfer_sales.toLocaleString()}원</span>
                    </div>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px dashed #cbd5e1', paddingTop: '8px' }}>
                    <span>총 거래 / 아이템 건수</span>
                    <strong style={{ fontWeight: '700' }}>{closingData.sales_count}건 ({closingData.total_quantity}개)</strong>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>환불 처리 건수 / 금액</span>
                    <strong style={{ color: '#ef4444', fontWeight: '700' }}>
                      {closingData.refund_count}건 (-{closingData.refund_amount.toLocaleString()}원)
                    </strong>
                  </div>

                  {/* Sold items details list */}
                  <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '8px', marginTop: '6px' }}>
                    <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '6px', fontWeight: 'bold' }}>🥖 금일 품목별 판매 수량</div>
                    <div style={{ maxHeight: '100px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      {(Object.entries(closingData.item_details) as [string, number][]).length === 0 ? (
                        <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '11px' }}>판매 이력 없음</div>
                      ) : (
                        (Object.entries(closingData.item_details) as [string, number][]).map(([name, qty]) => (
                          <div key={name} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                            <span>{name}</span>
                            <span style={{ fontWeight: 'bold' }}>{qty}개</span>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                </div>
              ) : (
                <div style={{ padding: '30px', textAlign: 'center' }}>데이터를 준비하는 중...</div>
              )}
            </div>

            <div className="modal-footer">
              <button type="button" className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setIsCloseModalOpen(false)} disabled={savingClose}>취소</button>
              <button type="button" className="btn btn-primary" style={{ flex: 1.5 }} onClick={handleSaveCloseReport} disabled={savingClose || !closingData}>
                {savingClose ? '저장 중...' : '마감 완료'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* VIEW CLOSE REPORT PRINT-PREVIEW MODAL */}
      {activeCloseReport && (
        <div className="modal-overlay" style={{ zIndex: 1100 }}>
          <div className="modal-content" style={{ maxWidth: '420px', minHeight: '600px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
            <div className="modal-body" style={{ padding: '24px', overflowY: 'auto' }}>
              <div className="receipt-paper">
                <div style={{ textAlign: 'center', marginBottom: '14px' }}>
                  <h2 style={{ fontSize: '18px', fontWeight: '800', margin: 0 }}>일일 마감 정산서</h2>
                  <p style={{ color: 'var(--text-secondary)', fontSize: '11px', margin: '2px 0 0 0' }}>서산나래 미니 포스</p>
                </div>

                <div className="receipt-meta" style={{ fontSize: '11px', color: '#475569', borderBottom: '1px solid #cbd5e1', paddingBottom: '6px', marginBottom: '8px' }}>
                  <div>마감일시: {new Date(activeCloseReport.closed_at).toLocaleString('ko-KR')}</div>
                  <div>마감담당: {activeCloseReport.cashier_name}</div>
                  <div>보고서번호: {activeCloseReport.id?.substring(0, 8).toUpperCase()}</div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '12.5px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '15px', fontWeight: '800', borderBottom: '2px solid #000', paddingBottom: '4px' }}>
                    <span>총 매출액</span>
                    <span>{Number(activeCloseReport.total_sales).toLocaleString()}원</span>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>카드 매출</span>
                    <span>{Number(activeCloseReport.card_sales).toLocaleString()}원</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>이체 매출</span>
                    <span>{Number(activeCloseReport.transfer_sales).toLocaleString()}원</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>정상 거래 건수</span>
                    <span>{activeCloseReport.sales_count}건 ({activeCloseReport.total_quantity}개)</span>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', color: '#e11d48', borderBottom: '1px solid #cbd5e1', paddingBottom: '6px' }}>
                    <span>환불 건수 / 금액</span>
                    <span>{activeCloseReport.refund_count}건 (-{Number(activeCloseReport.refund_amount).toLocaleString()}원)</span>
                  </div>
                </div>

                <div style={{ marginTop: '12px' }}>
                  <h4 style={{ fontSize: '12px', margin: '0 0 6px 0', borderBottom: '1px solid #e2e8f0', paddingBottom: '2px' }}>품목별 판매 현황</h4>
                  {(Object.entries(activeCloseReport.item_details || {}) as [string, number][]).map(([name, qty]) => (
                    <div key={name} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', margin: '2px 0' }}>
                      <span>{name}</span>
                      <span>{Number(qty)}개</span>
                    </div>
                  ))}
                </div>

                <div style={{ marginTop: '14px', borderTop: '1px dashed #94a3b8', paddingTop: '8px', fontSize: '10px', color: '#64748b', textAlign: 'center' }}>
                  본 정산서는 Supabase 클라우드에 안전하게 보존되었습니다.
                </div>
              </div>
            </div>

            <div className="modal-footer">
              <button type="button" className="btn btn-secondary" style={{ flex: 1 }} onClick={handlePrintReport}>
                <Printer size={14} />
                <span>정산서 출력</span>
              </button>
              <button type="button" className="btn btn-primary" style={{ flex: 1 }} onClick={() => setActiveCloseReport(null)}>
                닫기
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default SettingsView;
