import React, { useState, useEffect } from 'react';
import { Customer } from '../types';
import { supabase } from '../supabase';
import { Search } from 'lucide-react';

interface CustomersViewProps {
  role: 'Owner' | 'Manager' | 'Staff';
  showToast: (msg: string) => void;
}

const CustomersView: React.FC<CustomersViewProps> = ({ role, showToast }) => {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  const fetchCustomers = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('customers')
        .select('*')
        .order('name', { ascending: true });
      if (error) throw error;
      setCustomers(data || []);
    } catch (err: any) {
      console.error(err);
      showToast(`⚠️ 고객 정보 로드 실패: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCustomers();
  }, []);

  const filteredCustomers = customers.filter(c =>
    c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (c.phone && c.phone.includes(searchTerm)) ||
    (c.email && c.email.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  if (role === 'Staff') {
    return (
      <div className="bo-page" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', flexDirection: 'column' }}>
        <h2 style={{ color: 'var(--text-primary)', marginBottom: '8px' }}>⚠️ 접근 권한 없음</h2>
        <p style={{ color: 'var(--text-muted)' }}>스태프 계정은 고객 관리 메뉴에 접근할 수 없습니다.</p>
      </div>
    );
  }

  return (
    <div className="bo-page">

      {/* Top Toolbar */}
      <div className="bo-toolbar" style={{ flexShrink: 0, gap: '10px' }}>
        <div className="search-container" style={{ flex: 1 }}>
          <div className="search-icon-wrapper">
            <Search size={18} />
          </div>
          <input
            type="text"
            className="search-input"
            placeholder="고객 이름, 전화번호, 이메일로 검색"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      {/* Customer Table */}
      <div className="bo-table-wrap" style={{ flex: 1 }}>
        <table className="bo-table">
          <thead>
            <tr>
              <th>이름</th>
              <th>전화번호</th>
              <th>이메일</th>
              <th>메모 / 특이사항</th>
              <th>등록 시간</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5} className="cell-empty">불러오는 중...</td>
              </tr>
            ) : filteredCustomers.length === 0 ? (
              <tr>
                <td colSpan={5} className="cell-empty">조회할 수 있는 등록된 고객 정보가 없습니다.</td>
              </tr>
            ) : (
              filteredCustomers.map((c) => (
                <tr key={c.id}>
                  <td className="cell-bold">{c.name}</td>
                  <td>{c.phone}</td>
                  <td>{c.email || <span style={{ color: 'var(--text-muted)' }}>-</span>}</td>
                  <td style={{ maxWidth: '300px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={c.notes || ''}>
                    {c.notes || <span style={{ color: 'var(--text-muted)' }}>-</span>}
                  </td>
                  <td style={{ color: 'var(--text-muted)', fontSize: '12.5px' }}>
                    {c.created_at ? new Date(c.created_at).toLocaleString('ko-KR') : '-'}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

    </div>
  );
};

export default CustomersView;
