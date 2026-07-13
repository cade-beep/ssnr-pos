import React from 'react';
import { Receipt } from '../types';
import { Printer, CheckCircle } from 'lucide-react';

interface ReceiptModalProps {
  receipt: Receipt;
  onClose: () => void;
}

const ReceiptModal: React.FC<ReceiptModalProps> = ({ receipt, onClose }) => {
  const handlePrint = () => {
    // Opens print settings window for active frame/window
    window.print();
  };

  return (
    <div className="bo-modal-overlay">
      <div className="bo-modal" style={{ maxWidth: '440px' }}>
        <div className="bo-modal-body" style={{ padding: '24px 24px 4px 24px', flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: '16px', flexShrink: 0 }}>
            <CheckCircle size={40} color="var(--success)" style={{ marginBottom: '8px' }} />
            <h2 style={{ fontSize: '18px', fontWeight: '700', color: 'var(--text-primary)' }}>결제 완료</h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '12px', marginTop: '2px' }}>성공적으로 결제가 완료되었습니다.</p>
          </div>

          {/* Styled Receipt Paper */}
          <div className="bo-receipt-paper" style={{ flex: 1, display: 'flex', flexDirection: 'column', maxHeight: '500px', overflowY: 'auto', marginBottom: '12px' }}>
            <div className="bo-receipt-header">
              <h3>서산나래</h3>
              <p>광양읍 오성길14</p>
              <p>TEL: 061-761-9877</p>
              <div className="bo-receipt-meta">
                <div>주문번호: {receipt.id}</div>
                <div>일시: {receipt.date.toLocaleString('ko-KR')}</div>
              </div>
            </div>

            <div className="bo-receipt-item-row" style={{ fontWeight: '700', borderBottom: '1px solid #cbd5e1', paddingBottom: '4px' }}>
              <div className="bo-receipt-item-name">상품명</div>
              <div className="bo-receipt-item-qty">수량</div>
              <div className="bo-receipt-item-amount">금액</div>
            </div>

            <div style={{ margin: '8px 0' }}>
              {receipt.items.map((item) => (
                <div key={item.product.id} className="bo-receipt-item-row">
                  <div className="bo-receipt-item-name">{item.product.name}</div>
                  <div className="bo-receipt-item-qty">{item.quantity}</div>
                  <div className="bo-receipt-item-amount">
                    {(item.product.price * item.quantity).toLocaleString()}
                  </div>
                </div>
              ))}
            </div>

            <div className="bo-receipt-divider"></div>

            <div className="bo-receipt-row big" style={{ borderTop: 'none', paddingTop: 0, marginTop: 0 }}>
              <span>청구합계</span>
              <span>{receipt.total.toLocaleString()}원</span>
            </div>

            <div className="bo-receipt-divider"></div>

            <div className="bo-receipt-row">
              <span>결제수단</span>
              <span>{receipt.paymentMethod === 'CARD' ? '신용카드' : '계좌이체'}</span>
            </div>
            <div className="bo-receipt-row">
              <span>받은금액</span>
              <span>{receipt.receivedAmount.toLocaleString()}원</span>
            </div>
            <div className="bo-receipt-row" style={{ fontWeight: '700' }}>
              <span>거스름돈</span>
              <span>{receipt.change.toLocaleString()}원</span>
            </div>

            <div className="bo-receipt-divider"></div>
            <div style={{ textAlign: 'center', fontSize: '11px', color: '#64748b', marginTop: '4px' }}>
              방문해 주셔서 감사합니다.
            </div>
          </div>
        </div>

        <div className="bo-modal-footer">
          <button type="button" className="btn btn-secondary" onClick={handlePrint}>
            <Printer size={14} />
            <span>영수증 출력</span>
          </button>
          <button type="button" className="btn btn-primary" onClick={onClose}>
            닫기
          </button>
        </div>
      </div>
    </div>
  );
};

export default ReceiptModal;
