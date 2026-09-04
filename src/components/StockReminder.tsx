import React, { useEffect, useState } from 'react';
import { Bell, X } from 'lucide-react';

/**
 * 15:00 재고 알림.
 * 빵이 나오는 화~금에만, 오후 3시부터 그날 닫을 때까지 띄운다.
 * 닫으면 그날 하루는 다시 뜨지 않는다 (기기별로 기억).
 */
const DISMISS_KEY = 'ssnr_stock_reminder_dismissed_on';
const REMIND_HOUR = 15;
/** 0=일 … 6=토. 월요일과 주말은 빵이 나오지 않으므로 제외 */
const REMIND_DAYS = [2, 3, 4, 5];

const today = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export const isReminderDue = (now: Date, dismissedOn: string | null): boolean => {
  if (!REMIND_DAYS.includes(now.getDay())) return false;
  if (now.getHours() < REMIND_HOUR) return false;
  return dismissedOn !== today(now);
};

interface StockReminderProps {
  /** 재고 조사 탭으로 이동 */
  onGoToStock: () => void;
  /** 이미 재고 조사 화면을 보고 있으면 굳이 띄우지 않는다 */
  isOnStockTab: boolean;
}

const StockReminder: React.FC<StockReminderProps> = ({ onGoToStock, isOnStockTab }) => {
  const [due, setDue] = useState(false);

  useEffect(() => {
    const check = () => {
      let dismissedOn: string | null = null;
      try {
        dismissedOn = localStorage.getItem(DISMISS_KEY);
      } catch {
        dismissedOn = null;
      }
      setDue(isReminderDue(new Date(), dismissedOn));
    };
    check();
    // 3시가 되는 순간을 놓치지 않을 정도로만 확인한다
    const timer = window.setInterval(check, 60_000);
    return () => window.clearInterval(timer);
  }, []);

  if (!due || isOnStockTab) return null;

  const dismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, today(new Date()));
    } catch (e) {
      console.error(e);
    }
    setDue(false);
  };

  return (
    <div className="stock-reminder" role="status">
      <Bell size={16} aria-hidden="true" />
      <span className="stock-reminder-text">
        <strong>오후 3시입니다.</strong> 빵이 나왔으면 재고를 채워 주세요.
      </span>
      <button type="button" className="stock-reminder-go" onClick={onGoToStock}>
        재고 채우러 가기
      </button>
      <button type="button" className="stock-reminder-close" onClick={dismiss} aria-label="오늘은 그만 보기">
        <X size={15} />
      </button>
    </div>
  );
};

export default StockReminder;
