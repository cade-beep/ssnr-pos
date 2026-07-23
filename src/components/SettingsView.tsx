import React, { useState, useEffect } from 'react';
import { CashierUser } from '../types';
import { supabase } from '../supabase';
import { FileSpreadsheet, Lock, RefreshCw, BarChart, ShieldCheck, Printer } from 'lucide-react';
import { auditLog } from '../utils/auditLogger';
import { withTimeout } from '../utils/asyncHelper';
import Button from './ui/Button';
import Modal from './ui/Modal';
import { Field, Input, Select } from './ui/Field';
import { showAlert, showConfirm } from './ui/dialogs';

interface SettingsViewProps {
  currentCashier: CashierUser;
  onLogout: () => void;
  showToast: (msg: string) => void;
  onRefreshProducts: () => void;
}

const SettingsView: React.FC<SettingsViewProps> = ({
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

  // Printer settings states
  const [printerName, setPrinterName] = useState(() => localStorage.getItem('ssnr_pos_printer_name') || '기본 프린터');
  const [printerPort, setPrinterPort] = useState(() => localStorage.getItem('ssnr_pos_printer_port') || 'USB001');
  const [paperWidth, setPaperWidth] = useState(() => localStorage.getItem('ssnr_pos_paper_width') || '80');

  const handleSavePrinterSettings = (e: React.FormEvent) => {
    e.preventDefault();
    localStorage.setItem('ssnr_pos_printer_name', printerName);
    localStorage.setItem('ssnr_pos_printer_port', printerPort);
    localStorage.setItem('ssnr_pos_paper_width', paperWidth);
    showToast('🖨️ 프린터 설정이 저장되었습니다.');
  };



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

      // Prepare empty snapshot of current stocks (inventory functionality deprecated)
      const inventorySnapshot: Record<string, { stock: number; threshold: number }> = {};

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
      showAlert(`마감 정산 산출 실패: ${err.message || err}`, { title: '마감 정산 실패' });
      setIsCloseModalOpen(false);
    }
  };

  // Save closing report to Supabase
  const handleSaveCloseReport = async () => {
    if (!closingData) return;
    const confirmSave = await showConfirm(
      '오늘 마감 정산 보고서를 저장하시겠습니까?\n이 작업은 하루 영업 종료 시 한 번만 실행하는 것을 권장합니다.',
      { title: '마감 보고서 저장', confirmText: '저장' }
    );
    if (!confirmSave) return;

    setSavingClose(true);
    try {
      const { error } = (await withTimeout(
        supabase
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
          })
      )) as any;

      if (error) throw error;

      auditLog({
        action: 'BUSINESS_CLOSE',
        result: 'SUCCESS',
        context: {
          salesAmount: closingData.total_sales,
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

      showAlert(`마감 보고서 저장 실패: ${err.message || err}`, { title: '저장 실패' });
    } finally {
      setSavingClose(false);
    }
  };

  const handlePrintReport = () => {
    window.print();
  };

  if (currentCashier.role === 'Staff') {
    return (
      <div className="bo-page" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', flexDirection: 'column' }}>
        <h2 style={{ color: 'var(--text-primary)', marginBottom: '8px' }}>⚠️ 접근 권한 없음</h2>
        <p style={{ color: 'var(--text-muted)' }}>스태프 계정은 설정 페이지에 접근할 수 없습니다.</p>
      </div>
    );
  }

  return (
    <div className="bo-page-grid">
      
      {/* LEFT COLUMN */}
      <div className="bo-page-col">
        
        {/* Cashier profile card */}
        <div className="bo-card">
          <div className="bo-card-header">
            <Lock size={16} color="var(--primary)" /> 근무자 정보 및 보안
          </div>
          
          <div className="bo-info-list">
            <div className="bo-info-row">
              <span className="bo-info-key">로그인 이름</span>
              <span className="bo-info-value">{currentCashier.name}</span>
            </div>
            <div className="bo-info-row">
              <span className="bo-info-key">이메일 계정</span>
              <span className="bo-info-value">{currentCashier.email}</span>
            </div>
            <div className="bo-info-row">
              <span className="bo-info-key">부여된 권한</span>
              <span className="bo-badge bo-badge--primary">{currentCashier.role}</span>
            </div>
            {currentCashier.store_id && (
              <div className="bo-info-row">
                <span className="bo-info-key">매장 고유 코드</span>
                <span className="bo-info-value" style={{ fontFamily: 'monospace', fontSize: '11px', userSelect: 'all', background: '#f1f5f9', padding: '2px 6px', borderRadius: '4px' }}>
                  {currentCashier.store_id}
                </span>
              </div>
            )}
          </div>

          <Button variant="danger-outline" size="md" fullWidth onClick={onLogout}>
            👋 근무자 로그아웃
          </Button>
        </div>

        {/* Database linkages - Owner only */}
        {currentCashier.role === 'Owner' && (
          <div className="bo-card">
            <div className="bo-card-header">
              <FileSpreadsheet size={16} color="var(--success)" /> 데이터베이스 관리 연동
            </div>
            
            <div className="bo-info-list">
              <div className="bo-info-row">
                <span className="bo-info-key">Supabase DB 상태</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  {dbConnected === null ? (
                    <span style={{ color: 'var(--text-muted)' }}>확인 중...</span>
                  ) : dbConnected ? (
                    <span className="bo-badge bo-badge--success"><ShieldCheck size={12} /> 양호</span>
                  ) : (
                    <span className="bo-badge bo-badge--danger">오류</span>
                  )}
                  <button type="button" onClick={checkSupabaseConnection} disabled={checkingDb} style={{ border: 'none', background: 'transparent', padding: '2px', cursor: 'pointer' }}>
                    <RefreshCw size={12} className={checkingDb ? 'spin' : ''} />
                  </button>
                </div>
              </div>

              <div style={{ fontSize: '12px', color: 'var(--text-muted)', background: 'var(--bg-primary)', padding: '10px 12px', borderRadius: '8px', border: '1px solid var(--border-color)', wordBreak: 'break-all', fontFamily: 'monospace' }}>
                API: bhnlbfwajdrlxmjjqnio.supabase.co
              </div>
            </div>

            <a 
              href={import.meta.env.VITE_SPREADSHEET_URL || "https://docs.google.com/spreadsheets"}
              target="_blank" 
              rel="noopener noreferrer"
              className="btn btn--secondary btn--md btn--full"
              style={{ textDecoration: 'none' }}
            >
              <FileSpreadsheet size={14} />
              <span>구글 스프레드시트 이동</span>
            </a>
          </div>
        )}

        {/* Printer Settings Card - Owner & Manager */}
        <div className="bo-card">
          <div className="bo-card-header">
            <Printer size={16} color="var(--primary)" /> 영수증 프린터 설정
          </div>
          <form onSubmit={handleSavePrinterSettings} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <Field label="프린터 장치명">
              <Input type="text" value={printerName} onChange={e => setPrinterName(e.target.value)} style={{ height: '36px' }} />
            </Field>
            <div style={{ display: 'flex', gap: '8px' }}>
              <Field label="포트" style={{ flex: 1 }}>
                <Input type="text" value={printerPort} onChange={e => setPrinterPort(e.target.value)} style={{ height: '36px' }} />
              </Field>
              <Field label="용지 폭 (mm)" style={{ flex: 1 }}>
                <Select value={paperWidth} onChange={e => setPaperWidth(e.target.value)} style={{ height: '36px' }}>
                  <option value="80">80mm</option>
                  <option value="58">58mm</option>
                </Select>
              </Field>
            </div>
            <Button type="submit" variant="primary" size="sm" fullWidth style={{ marginTop: '4px' }}>
              프린터 설정 저장
            </Button>
          </form>
        </div>

        {/* Business close trigger - Owner only (Manager gets it in right column) */}
        {currentCashier.role === 'Owner' && (
          <div className="bo-card">
            <div className="bo-card-header">
              <BarChart size={16} color="var(--primary)" /> 영업 정산 및 마감
            </div>
            <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '16px', lineHeight: '1.5' }}>
              금일 발생한 매출 합산과 재고 상태를 마감 정산 보고서로 집계하고 데이터베이스에 영구적으로 보존합니다.
            </p>

            <Button variant="primary" size="md" fullWidth onClick={handleCalculateClose}>
              📊 금일 영업 마감 정산 실행
            </Button>
          </div>
        )}

      </div>

      {/* RIGHT COLUMN */}
      <div className="bo-page-col">



        {/* History of close reports - Owner only */}
        {currentCashier.role === 'Owner' && (
          <div className="bo-card" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div className="bo-card-header" style={{ flexShrink: 0 }}>
              <BarChart size={16} color="var(--primary)" /> 최근 10건 마감 보고서 이력
            </div>
            
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {loadingReports ? (
                <div className="bo-empty" style={{ padding: '20px' }}>
                  <div className="bo-empty-text">이력을 가져오는 중...</div>
                </div>
              ) : reports.length === 0 ? (
                <div className="bo-empty" style={{ padding: '20px' }}>
                  <div className="bo-empty-text">기록된 마감 보고서가 존재하지 않습니다.</div>
                </div>
              ) : (
                reports.map(r => (
                  <div 
                    key={r.id}
                    className="bo-report-item"
                    style={{ padding: '14px 4px', cursor: 'pointer' }}
                    onClick={() => setActiveCloseReport(r)}
                    title="자세히 보기"
                  >
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                      <span className="bo-report-date">
                        {new Date(r.closed_at).toLocaleDateString('ko-KR')} 마감 보고
                      </span>
                      <span className="bo-report-meta">
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
        )}

      </div>

      {/* CLOSE REPORT BUILDER MODAL */}
      {isCloseModalOpen && (
        <Modal
          maxWidth={460}
          title="영업 마감 정산 보고"
          description="마감 완료를 누르면 보고서가 저장되며 출력 가능 상태가 됩니다."
          onClose={() => !savingClose && setIsCloseModalOpen(false)}
          footer={
            <>
              <Button variant="secondary" onClick={() => setIsCloseModalOpen(false)} disabled={savingClose}>취소</Button>
              <Button variant="primary" onClick={handleSaveCloseReport} disabled={savingClose || !closingData}>
                {savingClose ? '저장 중...' : '마감 완료'}
              </Button>
            </>
          }
        >
              {closingData ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
                  <div className="bo-data-row">
                    <span className="bo-data-key">정산 시간</span>
                    <span className="bo-data-value">{new Date(closingData.closed_at).toLocaleString('ko-KR')}</span>
                  </div>
                  <div className="bo-data-row">
                    <span className="bo-data-key">담당자</span>
                    <span className="bo-data-value">{closingData.cashier_name}</span>
                  </div>

                  <hr className="bo-divider" />

                  <div className="bo-data-row" style={{ borderBottom: 'none' }}>
                    <span className="bo-data-key" style={{ fontWeight: '600' }}>총 매출액 (환불 제외)</span>
                    <span className="bo-data-value" style={{ fontSize: '18px', color: 'var(--primary)' }}>
                      {closingData.total_sales.toLocaleString()}원
                    </span>
                  </div>

                  <div style={{ paddingLeft: '12px', borderLeft: '3px solid var(--primary)', display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '13px', color: 'var(--text-muted)', margin: '8px 0 12px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>💳 신용카드 매출</span>
                      <span style={{ fontWeight: '600' }}>{closingData.card_sales.toLocaleString()}원</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>🏦 계좌이체 매출</span>
                      <span style={{ fontWeight: '600' }}>{closingData.transfer_sales.toLocaleString()}원</span>
                    </div>
                  </div>

                  <div className="bo-data-row">
                    <span className="bo-data-key">총 거래 / 아이템 건수</span>
                    <span className="bo-data-value">{closingData.sales_count}건 ({closingData.total_quantity}개)</span>
                  </div>
                  <div className="bo-data-row">
                    <span className="bo-data-key">환불 처리 건수 / 금액</span>
                    <span className="bo-data-value" style={{ color: 'var(--danger)' }}>
                      {closingData.refund_count}건 (-{closingData.refund_amount.toLocaleString()}원)
                    </span>
                  </div>

                  <hr className="bo-divider" />
                  
                  <div className="bo-section-title" style={{ fontSize: '13px' }}>🥖 금일 품목별 판매 수량</div>
                  <div style={{ maxHeight: '100px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    {(Object.entries(closingData.item_details) as [string, number][]).length === 0 ? (
                      <div className="bo-empty" style={{ padding: '8px' }}>
                        <div className="bo-empty-text" style={{ fontSize: '12px' }}>판매 이력 없음</div>
                      </div>
                    ) : (
                      (Object.entries(closingData.item_details) as [string, number][]).map(([name, qty]) => (
                        <div key={name} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                          <span style={{ color: 'var(--text-secondary)' }}>{name}</span>
                          <span style={{ fontWeight: '700' }}>{qty}개</span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              ) : (
                <div className="bo-empty">
                  <div className="bo-empty-text">데이터를 준비하는 중...</div>
                </div>
              )}
        </Modal>
      )}

      {/* VIEW CLOSE REPORT PRINT-PREVIEW MODAL */}
      {activeCloseReport && (
        <Modal
          maxWidth={420}
          bodyStyle={{ padding: '28px' }}
          onClose={() => setActiveCloseReport(null)}
          footer={
            <>
              <Button variant="secondary" onClick={handlePrintReport}>
                <Printer size={14} />
                <span>정산서 출력</span>
              </Button>
              <Button variant="primary" onClick={() => setActiveCloseReport(null)}>
                닫기
              </Button>
            </>
          }
        >
              <div className="receipt-paper">
                <div style={{ textAlign: 'center', marginBottom: '16px' }}>
                  <h2 style={{ fontSize: '18px', fontWeight: '800', margin: 0 }}>일일 마감 정산서</h2>
                  <p style={{ color: 'var(--text-muted)', fontSize: '12px', margin: '4px 0 0 0' }}>서산나래 미니 포스</p>
                </div>

                <div style={{ fontSize: '12px', color: 'var(--text-secondary)', borderBottom: '1px solid #e5e7eb', paddingBottom: '8px', marginBottom: '12px', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                  <div>마감일시: {new Date(activeCloseReport.closed_at).toLocaleString('ko-KR')}</div>
                  <div>마감담당: {activeCloseReport.cashier_name}</div>
                  <div>보고서번호: {activeCloseReport.id?.substring(0, 8).toUpperCase()}</div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '13px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '16px', fontWeight: '800', borderBottom: '2px solid #000', paddingBottom: '6px' }}>
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

                  <div style={{ display: 'flex', justifyContent: 'space-between', color: '#e11d48', borderBottom: '1px solid #e5e7eb', paddingBottom: '8px' }}>
                    <span>환불 건수 / 금액</span>
                    <span>{activeCloseReport.refund_count}건 (-{Number(activeCloseReport.refund_amount).toLocaleString()}원)</span>
                  </div>
                </div>

                <div style={{ marginTop: '14px' }}>
                  <h4 style={{ fontSize: '12px', margin: '0 0 8px 0', borderBottom: '1px solid #e5e7eb', paddingBottom: '4px' }}>품목별 판매 현황</h4>
                  {(Object.entries(activeCloseReport.item_details || {}) as [string, number][]).map(([name, qty]) => (
                    <div key={name} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', margin: '3px 0' }}>
                      <span>{name}</span>
                      <span>{Number(qty)}개</span>
                    </div>
                  ))}
                </div>

                <div style={{ marginTop: '16px', borderTop: '1px dashed #94a3b8', paddingTop: '10px', fontSize: '10px', color: '#94a3b8', textAlign: 'center' }}>
                  본 정산서는 Supabase 클라우드에 안전하게 보존되었습니다.
                </div>
              </div>
        </Modal>
      )}

    </div>
  );
};

export default SettingsView;