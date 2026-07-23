import React, { useState, useEffect } from 'react';
import { CashierUser } from '../types';
import Logo from './Logo';
import { ShoppingBag, Receipt, Package, Users, UserCog, Settings, LogOut, LucideIcon } from 'lucide-react';

type TabKey = 'sales' | 'history' | 'products' | 'customers' | 'employees' | 'settings';
type Role = 'Owner' | 'Manager' | 'Staff';

interface SidebarProps {
  activeTab: TabKey;
  onTabChange: (tab: TabKey) => void;
  currentCashier: CashierUser;
  onLogout: () => void;
}

const NAV_ITEMS: { key: TabKey; label: string; icon: LucideIcon; roles: Role[] }[] = [
  { key: 'sales', label: '판매', icon: ShoppingBag, roles: ['Owner', 'Manager', 'Staff'] },
  { key: 'history', label: '판매내역', icon: Receipt, roles: ['Owner', 'Manager', 'Staff'] },
  { key: 'products', label: '상품관리', icon: Package, roles: ['Owner', 'Manager', 'Staff'] },
  { key: 'customers', label: '고객', icon: Users, roles: ['Owner', 'Manager'] },
  { key: 'employees', label: '직원', icon: UserCog, roles: ['Owner'] },
  { key: 'settings', label: '설정', icon: Settings, roles: ['Owner', 'Manager'] },
];

const Sidebar: React.FC<SidebarProps> = ({ activeTab, onTabChange, currentCashier, onLogout }) => {
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

  const visibleItems = NAV_ITEMS.filter(item => item.roles.includes(currentCashier.role));

  return (
    <nav className="app-sidebar">
      <button type="button" className="sidebar-brand" onClick={() => onTabChange('sales')} title="판매 화면으로">
        <span className="sidebar-brand-icon"><Logo size={18} /></span>
        <span className="sidebar-brand-text">같이 POS</span>
      </button>

      <div className="sidebar-nav">
        {visibleItems.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            type="button"
            className={`sidebar-nav-item ${activeTab === key ? 'active' : ''}`}
            onClick={() => onTabChange(key)}
          >
            <span className="sidebar-nav-icon"><Icon size={20} /></span>
            <span className="sidebar-nav-label">{label}</span>
          </button>
        ))}
      </div>

      <div className="sidebar-footer">
        <div className={`sidebar-status ${online ? 'online' : 'offline'}`}>
          <span className="sidebar-status-dot" />
          <span>{online ? '정상 연결' : '오프라인'}</span>
        </div>

        <button type="button" className="sidebar-profile" onClick={onLogout} title="클릭하여 로그아웃">
          <span className="sidebar-profile-avatar">👤</span>
          <span className="sidebar-profile-info">
            <span className="sidebar-profile-name">{currentCashier.name} 님</span>
            <span className="sidebar-profile-role">{currentCashier.role}</span>
          </span>
          <LogOut size={16} className="sidebar-profile-logout" />
        </button>
      </div>
    </nav>
  );
};

export default Sidebar;
