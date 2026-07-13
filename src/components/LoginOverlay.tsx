import React, { useState, useRef, useEffect } from 'react';
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
  const emailInputRef = useRef<HTMLInputElement>(null);

  // Autofocus the email input on mount
  useEffect(() => {
    const timer = setTimeout(() => {
      emailInputRef.current?.focus();
    }, 100);
    return () => clearTimeout(timer);
  }, []);

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
        {/* Brand header */}
        <div className="login-header">
          <div className="login-brand-icon">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z" />
              <line x1="3" y1="6" x2="21" y2="6" />
              <path d="M16 10a4 4 0 01-8 0" />
            </svg>
          </div>
          <h1 className="login-title">서산나래 미니 POS</h1>
          <p className="login-subtitle">안전한 매장 운영을 위해 로그인하세요</p>
        </div>

        {/* Login form */}
        <form onSubmit={handleLogin} className="login-form" autoComplete="off">
          <div className="login-field">
            <label className="login-label" htmlFor="login-email">아이디</label>
            <div className={`login-input-wrapper ${isLoggingIn ? 'disabled' : ''}`}>
              <svg className="login-input-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
              <input
                ref={emailInputRef}
                id="login-email"
                type="text"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setLoginError('');
                }}
                placeholder="아이디 또는 이메일"
                className="login-input"
                disabled={isLoggingIn}
                autoComplete="username"
                tabIndex={1}
              />
            </div>
          </div>

          <div className="login-field">
            <label className="login-label" htmlFor="login-password">비밀번호</label>
            <div className={`login-input-wrapper ${isLoggingIn ? 'disabled' : ''}`}>
              <svg className="login-input-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0110 0v4" />
              </svg>
              <input
                id="login-password"
                type="password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setLoginError('');
                }}
                placeholder="비밀번호 입력"
                className="login-input"
                maxLength={30}
                disabled={isLoggingIn}
                autoComplete="current-password"
                tabIndex={2}
              />
            </div>
          </div>

          {/* Error message */}
          {loginError && (
            <div className="login-error" role="alert">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              <span>{loginError}</span>
            </div>
          )}

          {/* Submit button */}
          <button
            type="submit"
            className="login-submit-btn"
            disabled={isLoggingIn}
            tabIndex={3}
          >
            {isLoggingIn ? (
              <>
                <div className="login-spinner" />
                <span>인증 중...</span>
              </>
            ) : (
              <span>로그인</span>
            )}
          </button>
        </form>

        {/* Footer */}
        <div className="login-footer">
          <span>© 서산나래</span>
          <span className="login-footer-dot">·</span>
          <span>POS v1.0</span>
        </div>
      </div>
    </div>
  );
};

export default LoginOverlay;
