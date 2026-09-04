import React, { useState, useEffect } from 'react';
import { CashierUser } from '../types';
import Logo from './Logo';
import { ShoppingBag, Receipt, Package, UserCog, Settings, LucideIcon } from 'lucide-react';

type TabKey = 'sales' | 'history' | 'products' | 'employees' | 'settings';
type Role = 'Owner' | 'Staff';

interface SidebarProps {
  activeTab: TabKey;
  onTabChange: (tab: TabKey) => void;
  currentCashier: CashierUser;
  onLogout: () => void;
  pendingStaffCount?: number;
}

const MAIN_NAV_ITEMS: { key: TabKey; label: string; icon: LucideIcon; roles: Role[] }[] = [
  { key: 'sales', label: '판매', icon: ShoppingBag, roles: ['Owner', 'Staff'] },
  { key: 'history', label: '주문 내역', icon: Receipt, roles: ['Owner', 'Staff'] },
  { key: 'products', label: '상품 관리', icon: Package, roles: ['Owner', 'Staff'] },
];

const BOTTOM_NAV_ITEMS: { key: TabKey; label: string; icon: LucideIcon; roles: Role[] }[] = [
  { key: 'employees', label: '직원', icon: UserCog, roles: ['Owner'] },
  { key: 'settings', label: '설정', icon: Settings, roles: ['Owner'] },
];

const Sidebar: React.FC<SidebarProps> = ({ activeTab, onTabChange, currentCashier, onLogout, pendingStaffCount }) => {
  const [online, setOnline] = useState<boolean>(navigator.onLine);

  useEffect(() => {
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  const visibleMainItems = MAIN_NAV_ITEMS.filter(item => item.roles.includes(currentCashier.role));
  const visibleBottomItems = BOTTOM_NAV_ITEMS.filter(item => item.roles.includes(currentCashier.role));

  const cashierInitial = currentCashier.name ? currentCashier.name.charAt(0) : 'C';

  return (
    <nav className="app-sidebar" aria-label="메인 네비게이션">
      {/* Top: Logo */}
      <button
        type="button"
        className="sidebar-brand-icon-only"
        onClick={() => onTabChange('sales')}
        title="같이 POS 판매 화면으로"
        aria-label="홈으로 이동"
      >
        <Logo size={24} />
      </button>

      {/* Main Menu */}
      <div className="sidebar-nav-group main-nav">
        {visibleMainItems.map(({ key, label, icon: Icon }) => {
          const isActive = activeTab === key;
          return (
            <button
              key={key}
              type="button"
              className={`sidebar-icon-btn ${isActive ? 'active' : ''}`}
              onClick={() => onTabChange(key)}
              title={label}
              data-tooltip={label}
              aria-label={label}
              aria-current={isActive ? 'page' : undefined}
            >
              {isActive && <span className="active-indicator" aria-hidden="true" />}
              <Icon size={22} />
              <span className="sidebar-icon-label">{label}</span>
            </button>
          );
        })}
      </div>

      {/* Bottom Menu */}
      <div className="sidebar-nav-group bottom-nav">
        {visibleBottomItems.map(({ key, label, icon: Icon }) => {
          const isActive = activeTab === key;
          return (
            <button
              key={key}
              type="button"
              className={`sidebar-icon-btn ${isActive ? 'active' : ''}`}
              onClick={() => onTabChange(key)}
              title={label}
              data-tooltip={label}
              aria-label={label}
              aria-current={isActive ? 'page' : undefined}
            >
              {isActive && <span className="active-indicator" aria-hidden="true" />}
              <Icon size={22} />
              <span className="sidebar-icon-label">{label}</span>
              {key === 'employees' && pendingStaffCount && pendingStaffCount > 0 ? (
                <span
                  className="pending-badge-dot"
                  title={`${pendingStaffCount}명의 승인 대기 직원`}
                  aria-label={`${pendingStaffCount}명 대기`}
                />
              ) : null}
            </button>
          );
        })}

        {/* Online status indicator */}
        <div
          className={`sidebar-status-mini ${online ? 'online' : 'offline'}`}
          title={online ? '온라인 연결 상태' : '오프라인 상태'}
        >
          <span className="status-dot" />
        </div>

        {/* Cashier Profile / Logout */}
        <button
          type="button"
          className="sidebar-profile-mini"
          onClick={onLogout}
          title={`${currentCashier.name} (${currentCashier.role}) - 클릭 시 로그아웃`}
          aria-label="로그아웃"
        >
          <span className="profile-initial">{cashierInitial}</span>
        </button>
      </div>
    </nav>
  );
};

export default Sidebar;
