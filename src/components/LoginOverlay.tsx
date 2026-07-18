import React, { useState, useRef, useEffect } from 'react';
import { CashierUser } from '../types';
import { supabase } from '../supabase';
import { auditLog } from '../utils/auditLogger';
import Logo from './Logo';
import Button from './ui/Button';
import { showAlert } from './ui/dialogs';

interface LoginOverlayProps {
  onLoginSuccess: (user: CashierUser) => void;
}

const LoginOverlay: React.FC<LoginOverlayProps> = ({ onLoginSuccess }) => {
  const [email, setEmail] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [loginError, setLoginError] = useState<string>('');
  const [isLoggingIn, setIsLoggingIn] = useState<boolean>(false);
  const emailInputRef = useRef<HTMLInputElement>(null);

  const [isSignUp, setIsSignUp] = useState(false);
  const [signUpEmail, setSignUpEmail] = useState('');
  const [signUpName, setSignUpName] = useState('');
  const [signUpPassword, setSignUpPassword] = useState('');
  const [signUpStoreId, setSignUpStoreId] = useState('');
  const [signUpError, setSignUpError] = useState('');
  const [isSigningUp, setIsSigningUp] = useState(false);

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!signUpEmail.trim() || !signUpName.trim() || !signUpPassword.trim() || !signUpStoreId.trim()) {
      setSignUpError('모든 필드를 올바르게 입력해 주세요.');
      return;
    }

    if (signUpPassword.length < 6) {
      setSignUpError('비밀번호는 최소 6자 이상이어야 합니다.');
      return;
    }

    // Validate store code format
    const cleanStoreId = signUpStoreId.trim();
    if (cleanStoreId.length < 3) {
      setSignUpError('매장 코드는 최소 3자 이상이어야 합니다.');
      return;
    }

    setIsSigningUp(true);
    setSignUpError('');

    let finalEmail = signUpEmail.trim();
    if (!finalEmail.includes('@')) {
      finalEmail = `${finalEmail}@ssnr-pos.com`;
    }

    try {
      const { error } = await supabase.auth.signUp({
        email: finalEmail,
        password: signUpPassword,
        options: {
          data: {
            name: signUpName.trim(),
            role: 'Staff', // Default to Staff role for employees signing up
            store_id: cleanStoreId
          }
        }
      });

      if (error) throw error;

      auditLog({ action: 'SIGNUP', result: 'SUCCESS', context: { email: finalEmail, storeId: cleanStoreId } });
      showAlert('🎉 직원 회원가입이 완료되었습니다!\n방금 가입하신 계정으로 로그인을 시도해 주세요.', { title: '회원가입 완료' });
      
      setEmail(signUpEmail);
      setIsSignUp(false);
      
      setSignUpEmail('');
      setSignUpName('');
      setSignUpPassword('');
      setSignUpStoreId('');
    } catch (err: any) {
      console.error('Signup error:', err);
      setSignUpError(err.message || '회원가입 처리 중 오류가 발생했습니다.');
    } finally {
      setIsSigningUp(false);
    }
  };

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
    // 브라우저 세션을 얻고 RLS 검증을 통과하기 위해 Supabase Auth로 로그인합니다.
    if (import.meta.env.VITE_ENABLE_DEV_LOGIN === 'true' && email.trim() === 'admin' && password === 'admin') {
      setIsLoggingIn(true);
      try {
        const devEmail = import.meta.env.VITE_DEV_ADMIN_EMAIL;
        const devPassword = import.meta.env.VITE_DEV_ADMIN_PASSWORD;

        if (!devEmail || !devPassword) {
          throw new Error('개발자 로그인 환경변수(VITE_DEV_ADMIN_EMAIL, VITE_DEV_ADMIN_PASSWORD)가 설정되지 않았습니다. .env 파일을 확인해 주십시오.');
        }

        const { data, error } = await supabase.auth.signInWithPassword({
          email: devEmail,
          password: devPassword
        });

        if (error) {
          throw error;
        }

        if (data && data.user) {
          const user = data.user;

          // Debug prints as requested
          const {
            data: { session }
          } = await supabase.auth.getSession();
          console.log("Logged-in Session User ID (Dev Bypass):", session?.user.id);
          console.log("Logged-in Session User Email (Dev Bypass):", session?.user.email);

          let devRole: 'Owner' | 'Manager' | 'Staff' = 'Owner';
          let devStoreId = 'ssnr-pos-9877';

          if (session?.user.id) {
            const { data: roleData } = await supabase
              .from('user_roles')
              .select('role, store_id')
              .eq('user_id', session.user.id)
              .single();
            if (roleData) {
              devRole = roleData.role as 'Owner' | 'Manager' | 'Staff';
              devStoreId = roleData.store_id;
            }
          }

          auditLog({ action: 'LOGIN', result: 'SUCCESS', context: { email: devEmail, type: 'dev_bypass' } });
          
          let displayName = user.user_metadata?.name || '임시관리자';
          
          onLoginSuccess({
            id: user.id,
            email: devEmail,
            name: displayName,
            role: devRole,
            store_id: devStoreId
          });
          return;
        } else {
          throw new Error('사용자 세션 데이터를 찾을 수 없습니다.');
        }
      } catch (err: any) {
        console.error('개발용 바이패스 로그인 에러:', err);
        setLoginError(`개발용 계정 로그인 실패: ${err.message || err}`);
      } finally {
        setIsLoggingIn(false);
      }
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

        // Debug prints as requested
        const {
          data: { session }
        } = await supabase.auth.getSession();

        console.log("Logged-in Session User ID:", session?.user.id);
        console.log("Logged-in Session User Email:", session?.user.email);

        // Query user_roles table
        let finalRole: 'Owner' | 'Manager' | 'Staff' = 'Staff';
        let finalStoreId = 'ssnr-pos-9877';

        // 메타데이터 이름이 없으면 이메일 ID 앞자리를 이름으로 사용 (rbflrbgh -> rbflrbgh)
        let displayName = user.user_metadata?.name || user.email?.split('@')[0] || '캐셔';
        if (user.email?.startsWith('rbflrbgh') && displayName === 'rbflrbgh') {
          displayName = '김규호';
        }

        if (session?.user.id) {
          const { data: roleData } = await supabase
            .from('user_roles')
            .select('role, store_id')
            .eq('user_id', session.user.id)
            .single();

          if (roleData) {
            finalRole = roleData.role as 'Owner' | 'Manager' | 'Staff';
            finalStoreId = roleData.store_id;
          } else {
            // admin 이메일이거나 김규호 계정이면 자동으로 관리자로 설정
            const isAdmin = 
              user.user_metadata?.role === '관리자' || 
              user.email?.startsWith('admin') || 
              user.email?.startsWith('rbflrbgh') || 
              displayName === '김규호';
            finalRole = isAdmin ? 'Owner' : 'Staff';
          }
        }

        auditLog({ action: 'LOGIN', result: 'SUCCESS', context: { email: user.email } });
        onLoginSuccess({
          id: user.id,
          email: user.email || '',
          name: displayName,
          role: finalRole,
          store_id: finalStoreId
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
      <div className="login-card" style={{ maxWidth: '400px', width: '90%' }}>
        {/* Brand header */}
        <div className="login-header">
          <div className="login-brand-icon">
            <Logo size={28} />
          </div>
          <h1 className="login-title">서산나래 미니 POS</h1>
          <p className="login-subtitle">
            {isSignUp ? '사내 직원(Staff) 회원가입' : '안전한 매장 운영을 위해 로그인하세요'}
          </p>
        </div>

        {isSignUp ? (
          /* Sign Up Form */
          <form onSubmit={handleSignUp} className="login-form" autoComplete="off">
            <div className="login-field" style={{ marginBottom: '12px' }}>
              <label className="login-label">아이디 (이메일)</label>
              <div className="login-input-wrapper">
                <input
                  type="text"
                  value={signUpEmail}
                  onChange={(e) => {
                    setSignUpEmail(e.target.value);
                    setSignUpError('');
                  }}
                  placeholder="예: owner 또는 owner@email.com"
                  className="login-input"
                  style={{ height: '36px', fontSize: '13.5px' }}
                  required
                />
              </div>
            </div>

            <div className="login-field" style={{ marginBottom: '12px' }}>
              <label className="login-label">사용자 이름</label>
              <div className="login-input-wrapper">
                <input
                  type="text"
                  value={signUpName}
                  onChange={(e) => {
                    setSignUpName(e.target.value);
                    setSignUpError('');
                  }}
                  placeholder="예: 홍길동"
                  className="login-input"
                  style={{ height: '36px', fontSize: '13.5px' }}
                  required
                />
              </div>
            </div>

            <div className="login-field" style={{ marginBottom: '12px' }}>
              <label className="login-label">매장 고유 코드 (Store ID)</label>
              <div className="login-input-wrapper">
                <input
                  type="text"
                  value={signUpStoreId}
                  onChange={(e) => {
                    setSignUpStoreId(e.target.value);
                    setSignUpError('');
                  }}
                  placeholder="매장 소유자에게 공유받은 코드를 입력하세요"
                  className="login-input"
                  style={{ height: '36px', fontSize: '13.5px' }}
                  required
                />
              </div>
            </div>

            <div className="login-field" style={{ marginBottom: '12px' }}>
              <label className="login-label">비밀번호 (최소 6자)</label>
              <div className="login-input-wrapper">
                <input
                  type="password"
                  value={signUpPassword}
                  onChange={(e) => {
                    setSignUpPassword(e.target.value);
                    setSignUpError('');
                  }}
                  placeholder="비밀번호 설정"
                  className="login-input"
                  style={{ height: '36px', fontSize: '13.5px' }}
                  required
                />
              </div>
            </div>

            {/* Error message */}
            {signUpError && (
              <div className="login-error" role="alert" style={{ marginBottom: '12px' }}>
                <span>⚠️ {signUpError}</span>
              </div>
            )}

            {/* Submit button */}
            <Button type="submit" variant="primary" size="lg" fullWidth disabled={isSigningUp}>
              {isSigningUp ? '직원 등록 중...' : '직원 회원가입'}
            </Button>

            <Button
              variant="secondary"
              size="lg"
              fullWidth
              onClick={() => { setIsSignUp(false); setSignUpError(''); }}
              style={{ marginTop: '8px' }}
            >
              로그인 화면으로 돌아가기
            </Button>
          </form>
        ) : (
          /* Login Form */
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
            <Button type="submit" variant="primary" size="lg" fullWidth disabled={isLoggingIn} tabIndex={3}>
              {isLoggingIn ? (
                <>
                  <div className="login-spinner" />
                  <span>인증 중...</span>
                </>
              ) : (
                <span>로그인</span>
              )}
            </Button>

            {/* Link to Sign Up */}
            <div style={{ marginTop: '16px', textAlign: 'center' }}>
              <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>사내 직원으로 가입하시나요? </span>
              <button
                type="button"
                onClick={() => { setIsSignUp(true); setLoginError(''); }}
                style={{ fontSize: '13px', color: 'var(--primary)', border: 'none', background: 'transparent', cursor: 'pointer', fontWeight: 'bold', textDecoration: 'underline' }}
              >
                직원 계정 회원가입 (Staff)
              </button>
            </div>
          </form>
        )}

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
