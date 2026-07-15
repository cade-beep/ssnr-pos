import React, { useState, useEffect } from 'react';
import { supabase } from '../supabase';
import { UserPlus, UserMinus, Shield, ShieldCheck, Mail, Key } from 'lucide-react';
import { withTimeout } from '../utils/asyncHelper';

interface EmployeesViewProps {
  role: 'Owner' | 'Manager' | 'Staff';
  storeId: string;
  currentUserId: string | undefined; // to prevent self-deletion or self-demotion
  showToast: (msg: string) => void;
}

interface Employee {
  user_id: string;
  email: string;
  name: string;
  role: 'Owner' | 'Manager' | 'Staff';
  store_id: string;
}

const EmployeesView: React.FC<EmployeesViewProps> = ({ role, storeId, currentUserId, showToast }) => {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(false);

  // Invite Modal States
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [employeeRole, setEmployeeRole] = useState<'Owner' | 'Manager' | 'Staff'>('Staff');
  const [submitting, setSubmitting] = useState(false);

  const fetchEmployees = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('get_employees_rpc');
      if (error) throw error;
      setEmployees(data || []);
    } catch (err: any) {
      console.error(err);
      showToast(`⚠️ 직원 목록 로드 실패: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEmployees();
  }, []);

  const handleInviteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !name.trim() || !password.trim()) {
      alert('모든 필수 항목을 기입해 주세요.');
      return;
    }

    if (password.trim().length < 6) {
      alert('비밀번호는 최소 6자 이상이어야 합니다.');
      return;
    }

    setSubmitting(true);
    try {
      const { error } = await withTimeout(
        supabase.rpc('invite_employee_rpc', {
          p_email: email.trim(),
          p_password: password.trim(),
          p_name: name.trim(),
          p_role: employeeRole,
          p_store_id: storeId
        }),
        12000
      ) as any;

      if (error) throw error;

      showToast(`✉️ [${name}] 직원이 정상 등록되었습니다.`);
      setIsInviteOpen(false);
      
      // Clear inputs
      setEmail('');
      setName('');
      setPassword('');
      setEmployeeRole('Staff');

      fetchEmployees();
    } catch (err: any) {
      console.error(err);
      alert(`⚠️ 직원 초대 실패: ${err.message || err}`);
    } finally {
      setSubmitting(false);
    }
  };

  const handleRoleChange = async (userId: string, empName: string, newRole: 'Owner' | 'Manager' | 'Staff') => {
    if (userId === currentUserId) {
      alert('본인의 직급 및 권한을 직접 수정할 수 없습니다.');
      return;
    }

    if (!window.confirm(`⚠️ [${empName}] 직원의 권한을 [${newRole}] (으)로 변경하시겠습니까?`)) {
      fetchEmployees(); // revert select UI
      return;
    }

    try {
      const { error } = await supabase.rpc('update_employee_role_rpc', {
        p_user_id: userId,
        p_role: newRole
      });
      if (error) throw error;

      showToast(`🛡️ [${empName}] 직원의 직급이 ${newRole}(으)로 변경되었습니다.`);
      fetchEmployees();
    } catch (err: any) {
      console.error(err);
      alert(`⚠️ 직급 변경 실패: ${err.message}`);
      fetchEmployees();
    }
  };

  const handleRemoveEmployee = async (userId: string, empName: string) => {
    if (userId === currentUserId) {
      alert('자기 자신은 직원 명단에서 해고하거나 삭제할 수 없습니다.');
      return;
    }

    if (!window.confirm(`🚨 정말로 [${empName}] 직원을 매장 명단에서 해고/삭제하시겠습니까?\n이 직원의 로그인 계정이 삭제되며 더이상 시스템에 로그인할 수 없게 됩니다.`)) {
      return;
    }

    try {
      const { error } = await supabase.rpc('remove_employee_rpc', {
        p_user_id: userId
      });
      if (error) throw error;

      showToast(`🗑️ [${empName}] 직원이 정상 삭제(해고) 처리되었습니다.`);
      fetchEmployees();
    } catch (err: any) {
      console.error(err);
      alert(`⚠️ 직원 삭제 실패: ${err.message}`);
    }
  };

  if (role !== 'Owner') {
    return (
      <div className="bo-page" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', flexDirection: 'column' }}>
        <h2 style={{ color: 'var(--text-primary)', marginBottom: '8px' }}>⚠️ 접근 권한 없음</h2>
        <p style={{ color: 'var(--text-muted)' }}>매장 소유자(Owner) 계정만 직원 정보 및 권한 관리가 가능합니다.</p>
      </div>
    );
  }

  return (
    <div className="bo-page">
      
      {/* Top Toolbar */}
      <div className="bo-toolbar" style={{ flexShrink: 0, justifyContent: 'flex-end' }}>
        <button 
          type="button" 
          className="btn btn-primary" 
          style={{ width: 'auto', padding: '0 20px', display: 'flex', alignItems: 'center', gap: '6px', borderRadius: '10px', height: '46px' }}
          onClick={() => setIsInviteOpen(true)}
        >
          <UserPlus size={16} />
          <span>신규 직원 등록 (초대)</span>
        </button>
      </div>

      {/* Employees Table */}
      <div className="bo-table-wrap" style={{ flex: 1 }}>
        <table className="bo-table">
          <thead>
            <tr>
              <th>이름</th>
              <th>이메일 계정</th>
              <th>지정 권한 (Role)</th>
              <th className="text-center">권한 변경</th>
              <th className="text-center">강제 해고</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5} className="cell-empty">불러오는 중...</td>
              </tr>
            ) : employees.length === 0 ? (
              <tr>
                <td colSpan={5} className="cell-empty">등록된 직원이 없습니다.</td>
              </tr>
            ) : (
              employees.map((emp) => {
                const isSelf = emp.user_id === currentUserId;
                return (
                  <tr key={emp.user_id}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        {emp.role === 'Owner' ? (
                          <ShieldCheck size={18} color="var(--primary)" />
                        ) : emp.role === 'Manager' ? (
                          <Shield size={18} color="var(--success)" />
                        ) : (
                          <Shield size={18} color="var(--text-muted)" />
                        )}
                        <span className="cell-bold">
                          {emp.name} {isSelf && <span style={{ color: 'var(--primary)', fontSize: '11px', fontWeight: 'normal' }}>(본인)</span>}
                        </span>
                      </div>
                    </td>
                    <td style={{ color: 'var(--text-secondary)' }}>{emp.email}</td>
                    <td>
                      <span className={`bo-badge ${emp.role === 'Owner' ? 'bo-badge--primary' : emp.role === 'Manager' ? 'bo-badge--success' : 'bo-badge--neutral'}`}>
                        {emp.role}
                      </span>
                    </td>
                    <td className="text-center">
                      <select 
                        className="bo-select" 
                        value={emp.role} 
                        onChange={(e) => handleRoleChange(emp.user_id, emp.name, e.target.value as any)}
                        disabled={isSelf}
                        style={{ height: '32px', width: '120px', margin: '0 auto', opacity: isSelf ? 0.6 : 1 }}
                      >
                        <option value="Owner">Owner</option>
                        <option value="Manager">Manager</option>
                        <option value="Staff">Staff</option>
                      </select>
                    </td>
                    <td className="text-center">
                      <button
                        type="button"
                        className="bo-action-btn bo-action-btn--danger"
                        onClick={() => handleRemoveEmployee(emp.user_id, emp.name)}
                        disabled={isSelf}
                        style={{ opacity: isSelf ? 0.4 : 1, cursor: isSelf ? 'not-allowed' : 'pointer' }}
                        title={isSelf ? '자기 자신은 해고할 수 없습니다' : '직원 강제 해고'}
                      >
                        <UserMinus size={14} />
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* INVITE MODAL */}
      {isInviteOpen && (
        <div className="bo-modal-overlay">
          <form className="bo-modal" onSubmit={handleInviteSubmit} style={{ maxWidth: '440px' }}>
            <div className="bo-modal-header">
              <div className="bo-modal-title">✉️ 신규 직원 초대 등록</div>
              <div className="bo-modal-desc">초대할 직원의 이메일 계정과 첫 로그인 비밀번호를 생성합니다.</div>
            </div>

            <div className="bo-modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div className="bo-field">
                <label className="bo-label">직원 이름 *</label>
                <input type="text" className="bo-input" value={name} onChange={e => setName(e.target.value)} placeholder="예: 김코딩 캐셔" required style={{ height: '38px' }} />
              </div>

              <div className="bo-field">
                <label className="bo-label">이메일 계정 *</label>
                <div style={{ position: 'relative' }}>
                  <Mail size={16} style={{ position: 'absolute', left: '12px', top: '11px', color: 'var(--text-muted)' }} />
                  <input 
                    type="email" 
                    className="bo-input" 
                    value={email} 
                    onChange={e => setEmail(e.target.value)} 
                    placeholder="worker@company.com" 
                    required 
                    style={{ height: '38px', paddingLeft: '36px' }} 
                  />
                </div>
              </div>

              <div className="bo-field">
                <label className="bo-label">초기 비밀번호 (최소 6자) *</label>
                <div style={{ position: 'relative' }}>
                  <Key size={16} style={{ position: 'absolute', left: '12px', top: '11px', color: 'var(--text-muted)' }} />
                  <input 
                    type="password" 
                    className="bo-input" 
                    value={password} 
                    onChange={e => setPassword(e.target.value)} 
                    placeholder="******" 
                    required 
                    style={{ height: '38px', paddingLeft: '36px' }} 
                  />
                </div>
              </div>

              <div className="bo-field">
                <label className="bo-label">직원 권한 직급 *</label>
                <select 
                  className="bo-select" 
                  value={employeeRole} 
                  onChange={e => setEmployeeRole(e.target.value as any)} 
                  style={{ height: '38px' }}
                >
                  <option value="Staff">Staff (할인/환불/설정 불가, 본인 오늘 실적만 조회 가능)</option>
                  <option value="Manager">Manager (제품 CRUD/재고조정 가능하나 가격/이미지 변경 불가, 마감 가능)</option>
                  <option value="Owner">Owner (매장 소유주 - 직원 초대 및 모든 권한 가능)</option>
                </select>
              </div>
            </div>

            <div className="bo-modal-footer">
              <button type="button" className="btn btn-secondary" onClick={() => setIsInviteOpen(false)} disabled={submitting}>취소</button>
              <button type="submit" className="btn btn-primary" disabled={submitting}>
                {submitting ? '초대 등록 중...' : '등록 완료'}
              </button>
            </div>
          </form>
        </div>
      )}

    </div>
  );
};

export default EmployeesView;
