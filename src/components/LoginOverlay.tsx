import React, { useState } from 'react';

export interface CashierUser {
  name: string;
  role: '관리자' | '캐셔';
}

interface LoginOverlayProps {
  users: CashierUser[];
  onLoginSuccess: (user: CashierUser) => void;
  isLoading: boolean;
  errorMsg: string;
  onRetry: () => void;
}

const LoginOverlay: React.FC<LoginOverlayProps> = ({
  users,
  onLoginSuccess,
  isLoading,
  errorMsg,
  onRetry
}) => {
  const [selectedUser, setSelectedUser] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [loginError, setLoginError] = useState<string>('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');

    if (!selectedUser) {
      setLoginError('근무자를 선택해 주십시오.');
      return;
    }

    try {
      // 1. 구글 시트에서 가져온 유저들의 비밀번호 검증 요청
      const webappUrl = import.meta.env.VITE_GOOGLE_SHEETS_WEBAPP_URL || "";
      const res = await fetch(`${webappUrl}?action=verify&name=${encodeURIComponent(selectedUser)}&password=${encodeURIComponent(password)}`);
      
      if (!res.ok) {
        throw new Error('인증 서버 연결 실패');
      }

      const result = await res.json();
      if (result && result.success) {
        const found = users.find(u => u.name === selectedUser);
        if (found) {
          onLoginSuccess(found);
        } else {
          onLoginSuccess({ name: selectedUser, role: '캐셔' });
        }
      } else {
        setLoginError(result.message || '비밀번호가 일치하지 않습니다.');
      }
    } catch (err: any) {
      console.error('로그인 에러:', err);
      setLoginError('로그인 처리 중 네트워크 오류가 발생했습니다.');
    }
  };

  return (
    <div className="login-overlay">
      <div className="login-card">
        <div className="login-header">
          <div className="login-logo">🛒</div>
          <h2>서산나래 미니 POS</h2>
          <p>계산대 시작을 위해 근무자 로그인을 완료해 주십시오.</p>
        </div>

        {isLoading ? (
          <div className="login-loading">
            <div className="spinner"></div>
            <p>스프레드시트에서 캐셔 정보를 안전하게 로드하는 중...</p>
          </div>
        ) : errorMsg ? (
          <div className="login-error-pane">
            <p className="error-text">❌ {errorMsg}</p>
            <p className="sub-text">스프레드시트에 '캐서설정' 시트가 존재하고 첫 줄에 [이름, 비밀번호, 역할] 헤더가 기입되어 있는지 확인해 주십시오.</p>
            <button onClick={onRetry} className="btn btn-primary" style={{ marginTop: '16px' }}>
              다시 시도하기
            </button>
          </div>
        ) : (
          <form onSubmit={handleLogin} className="login-form">
            <div className="form-group">
              <label>근무자 선택</label>
              <select
                value={selectedUser}
                onChange={(e) => {
                  setSelectedUser(e.target.value);
                  setLoginError('');
                }}
                className="login-select"
              >
                <option value="">-- 근무자를 선택하세요 --</option>
                {users.map((u) => (
                  <option key={u.name} value={u.name}>
                    {u.name} ({u.role})
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label>비밀번호 입력</label>
              <input
                type="password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setLoginError('');
                }}
                placeholder="비밀번호를 입력하세요"
                className="login-input"
                maxLength={20}
              />
            </div>

            {loginError && <div className="form-error">⚠️ {loginError}</div>}

            <button type="submit" className="btn btn-primary login-submit-btn">
              로그인 및 영업 개시
            </button>
          </form>
        )}
      </div>
    </div>
  );
};

export default LoginOverlay;
