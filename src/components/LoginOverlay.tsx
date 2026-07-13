import React, { useState } from 'react';
import { CashierUser } from '../types';
import { supabase } from '../supabase';
import { auditLog } from '../utils/auditLogger';

interface LoginOverlayProps {
  onLoginSuccess: (user: CashierUser) => void;
}

const LoginOverlay: React.FC<LoginOverlayProps> = ({ onLoginSuccess }) => {
  const [email, setEmail] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [loginError, setLoginError] = useState<string>('');
  const [isLoggingIn, setIsLoggingIn] = useState<boolean>(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');

    if (!email.trim()) {
      setLoginError('아이디를 입력해 주십시오.');
      return;
    }
    if (!password) {
      setLoginError('비밀번호를 입력해 주십시오.');
      return;
    }

    // 임시 테스트용 로컬/바이패스 관리자 계정 지원 (VITE_ENABLE_DEV_LOGIN === 'true' 일 때만 허용)
    if (import.meta.env.VITE_ENABLE_DEV_LOGIN === 'true' && email.trim() === 'admin' && password === 'admin') {
      auditLog({ action: 'LOGIN', result: 'SUCCESS', context: { email: 'admin@ssnr-pos.com', type: 'dev_bypass' } });
      onLoginSuccess({
        email: 'admin@ssnr-pos.com',
        name: '임시관리자',
        role: '관리자'
      });
      return;
    }

    setIsLoggingIn(true);

    // 골뱅이(@)가 없는 단순 아이디인 경우, 뒤에 가상 도메인(@ssnr-pos.com)을 자동으로 덧붙여서 처리합니다.
    let loginEmail = email.trim();
    if (!loginEmail.includes('@')) {
      loginEmail = `${loginEmail}@ssnr-pos.com`;
    }

    try {
      // Supabase Auth로 이메일/비밀번호 인증 시도
      const { data, error } = await supabase.auth.signInWithPassword({
        email: loginEmail,
        password: password
      });

      if (error) {
        throw error;
      }

      if (data && data.user) {
        const user = data.user;
        // 메타데이터 이름이 없으면 이메일 ID 앞자리를 이름으로 사용 (rbflrbgh -> rbflrbgh)
        let displayName = user.user_metadata?.name || user.email?.split('@')[0] || '캐셔';
        if (user.email?.startsWith('rbflrbgh') && displayName === 'rbflrbgh') {
          displayName = '김규호';
        }

        // admin 이메일이거나 김규호 계정이면 자동으로 관리자로 설정
        const isAdmin = 
          user.user_metadata?.role === '관리자' || 
          user.email?.startsWith('admin') || 
          user.email?.startsWith('rbflrbgh') || 
          displayName === '김규호';

        auditLog({ action: 'LOGIN', result: 'SUCCESS', context: { email: user.email } });
        onLoginSuccess({
          email: user.email || '',
          name: displayName,
          role: isAdmin ? '관리자' : '캐셔'
        });
      } else {
        throw new Error('사용자 세션 데이터를 찾을 수 없습니다.');
      }
    } catch (err: any) {
      console.error('로그인 에러:', err);
      auditLog({ action: 'AUTH_FAILURE', result: 'FAIL', context: { email: email.trim(), error: err.message } });
      // 사용자 이해를 돕기 위한 예외 에러 메시지 맵핑
      if (err.message?.includes('Invalid login credentials')) {
        setLoginError('아이디 또는 비밀번호가 올바르지 않습니다.');
      } else if (err.message?.includes('Network')) {
        setLoginError('네트워크 연결이 지연되고 있습니다. 인터넷 연결을 확인하세요.');
      } else {
        setLoginError(err.message || '로그인 중 오류가 발생했습니다.');
      }
    } finally {
      setIsLoggingIn(false);
    }
  };

  return (
    <div className="login-overlay">
      <div className="login-card">
        <div className="login-header">
          <div className="login-logo">🛒</div>
          <h2>서산나래 미니 POS</h2>
          <p>안전한 매장 정산 및 로그인을 위해 계정을 입력해 주십시오.</p>
        </div>

        <form onSubmit={handleLogin} className="login-form">
          <div className="form-group">
            <label>아이디</label>
            <input
              type="text"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setLoginError('');
              }}
              placeholder="아이디 또는 이메일 입력"
              className="login-input"
              disabled={isLoggingIn}
              required
            />
          </div>

          <div className="form-group">
            <label>비밀번호</label>
            <input
              type="password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setLoginError('');
              }}
              placeholder="비밀번호를 입력하세요"
              className="login-input"
              maxLength={30}
              disabled={isLoggingIn}
              required
            />
          </div>

          {loginError && <div className="form-error">⚠️ {loginError}</div>}

          <button 
            type="submit" 
            className="btn btn-primary login-submit-btn" 
            disabled={isLoggingIn}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
          >
            {isLoggingIn ? (
              <>
                <div className="spinner" style={{ width: '14px', height: '14px', border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', margin: 0 }}></div>
                인증 중...
              </>
            ) : (
              '로그인 및 영업 개시'
            )}
          </button>
        </form>
      </div>
    </div>
  );
};

export default LoginOverlay;
