import React, { useState, useRef, useEffect } from 'react';
import { CashierUser } from '../types';
import { supabase } from '../supabase';
import { auditLog } from '../utils/auditLogger';
import Logo from './Logo';
import Button from './ui/Button';
import { showAlert, showPrompt } from './ui/dialogs';

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
    const rawEmail = signUpEmail.trim();
    const rawName = signUpName.trim();
    const rawPassword = signUpPassword.trim();
    const cleanStoreId = signUpStoreId.trim().toLowerCase();

    if (!rawEmail || !rawName || !rawPassword || !cleanStoreId) {
      setSignUpError('모든 필드를 올바르게 입력해 주세요.');
      return;
    }

    if (rawPassword.length < 6) {
      setSignUpError('비밀번호는 최소 6자 이상이어야 합니다.');
      return;
    }

    if (cleanStoreId.length < 3) {
      setSignUpError('매장 고유 코드는 최소 3자 이상이어야 합니다.');
      return;
    }

    setIsSigningUp(true);
    setSignUpError('');

    let finalEmail = rawEmail;
    if (!finalEmail.includes('@')) {
      finalEmail = `${finalEmail}@ssnr-pos.com`;
    }

    try {
      // Step 1: Pre-validate Store ID existence against user_roles / default store
      const { data: existingStores, error: storeCheckError } = await supabase
        .from('user_roles')
        .select('store_id')
        .eq('store_id', cleanStoreId)
        .limit(1);

      if (storeCheckError) {
        console.warn('Store check warning:', storeCheckError);
      }

      if ((!existingStores || existingStores.length === 0) && cleanStoreId !== 'ssnr-pos-9877') {
        setSignUpError('존재하지 않는 매장 고유 코드(Store ID)입니다. 매장 소유자(Owner)에게 올바른 코드를 확인받아 입력해 주세요.');
        setIsSigningUp(false);
        return;
      }

      // Step 2: Attempt signup via RPC fallback or Auth API
      let signupSuccess = false;

      // Try self-service signup RPC if available
      try {
        const { data: rpcUserId, error: rpcErr } = await supabase.rpc('signup_staff_rpc', {
          p_email: finalEmail,
          p_password: rawPassword,
          p_name: rawName,
          p_store_id: cleanStoreId
        });

        if (!rpcErr && rpcUserId) {
          signupSuccess = true;
        } else if (rpcErr && !rpcErr.message?.includes('Could not find the function')) {
          throw rpcErr;
        }
      } catch (rpcCatchErr: any) {
        if (rpcCatchErr?.message && !rpcCatchErr.message.includes('Could not find the function')) {
          throw rpcCatchErr;
        }
      }

      // Fallback to standard Supabase Auth signUp
      if (!signupSuccess) {
        const { error: authError } = await supabase.auth.signUp({
          email: finalEmail,
          password: rawPassword,
          options: {
            data: {
              name: rawName,
              role: 'Staff',
              store_id: cleanStoreId
            }
          }
        });

        if (authError) throw authError;
      }

      auditLog({ action: 'SIGNUP', result: 'SUCCESS', context: { email: finalEmail, storeId: cleanStoreId } });
      showAlert('🎉 직원 회원가입 신청이 완료되었습니다!\n매장 관리자(Owner)의 승인 후 로그인이 가능합니다.', { title: '가입 신청 완료' });
      
      setEmail(signUpEmail);
      setIsSignUp(false);
      
      setSignUpEmail('');
      setSignUpName('');
      setSignUpPassword('');
      setSignUpStoreId('');
    } catch (err: any) {
      // Requirement 3: Raw original error output to console.error
      console.error("Signup Error:", err);

      let extractedMsg = "";

      if (typeof err === "string") {
        extractedMsg = err;
      } else if (err?.message && typeof err.message === "string" && err.message !== "{}" && err.message !== "[]") {
        extractedMsg = err.message;
      } else if (err?.error_description && typeof err.error_description === "string") {
        extractedMsg = err.error_description;
      } else if (err?.details && typeof err.details === "string") {
        extractedMsg = err.details;
      } else if (err?.name && typeof err.name === "string" && err.name !== "AuthRetryableFetchError" && err.name !== "Error") {
        extractedMsg = err.name;
      }

      let userMsg = "";

      // Requirement 1: User-readable Korean error messages
      if (extractedMsg.includes("User already registered") || extractedMsg.includes("already exists") || extractedMsg.includes("email_already_exists") || extractedMsg.includes("이미")) {
        userMsg = "이미 가입되어 있는 이메일/아이디입니다. 다른 아이디를 사용하거나 기존 계정으로 로그인해 주세요.";
      } else if (extractedMsg.includes("Password should be at least") || extractedMsg.includes("password")) {
        userMsg = "비밀번호는 최소 6자 이상이어야 합니다.";
      } else if (extractedMsg.includes("invalid email") || extractedMsg.includes("Unable to validate email address")) {
        userMsg = "올바른 이메일 형식이 아닙니다.";
      } else if (extractedMsg.includes("Store ID") || extractedMsg.includes("매장")) {
        userMsg = extractedMsg;
      } else if (extractedMsg.includes("AuthRetryableFetchError") || err?.status === 500) {
        userMsg = "인증 서버 가입 처리 오류 (500)가 발생했습니다. 매장 관리자(Owner)에게 [직원] 탭에서 직접 초대해 주시기를 요청해 주세요.";
      } else if (extractedMsg.includes("Failed to fetch") || extractedMsg.includes("NetworkError") || extractedMsg.includes("fetch failed")) {
        userMsg = "네트워크 연결 상태가 불안정합니다. 인터넷 연결을 확인해 주십시오.";
      } else if (extractedMsg) {
        userMsg = `회원가입 실패: ${extractedMsg}`;
      }

      // Requirement 2: Never allow empty string or "{}"
      if (!userMsg || userMsg.trim() === "" || userMsg === "{}" || userMsg.includes("{}")) {
        userMsg = "회원가입 중 오류가 발생했습니다.";
      }

      setSignUpError(userMsg);
    } finally {
      setIsSigningUp(false);
    }
  };

  const handleForgotPassword = async () => {
    const inputEmail = await showPrompt(
      '가입하신 아이디(이메일)를 입력해 주세요. 비밀번호 재설정 메일을 보내드립니다.',
      { title: '비밀번호 찾기', defaultValue: email }
    );
    if (!inputEmail || !inputEmail.trim()) return;

    let targetEmail = inputEmail.trim();
    if (!targetEmail.includes('@')) {
      targetEmail = `${targetEmail}@ssnr-pos.com`;
    }

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(targetEmail, {
        redirectTo: window.location.origin
      });
      if (error) throw error;
      showAlert('📧 비밀번호 재설정 메일을 보냈습니다. 메일함(스팸함 포함)을 확인해 주세요.', { title: '비밀번호 찾기' });
    } catch (err: any) {
      console.error('비밀번호 재설정 요청 실패:', err);
      const detail = err?.message || err?.error_description || err?.msg || (err?.status ? `서버 응답 코드 ${err.status}` : '알 수 없는 오류');
      showAlert(`⚠️ 비밀번호 재설정 요청에 실패했습니다: ${detail}`, { title: '비밀번호 찾기 실패' });
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
        let finalRole: 'Owner' | 'Staff' = 'Staff';
        let finalStoreId = 'ssnr-pos-9877';

        // 메타데이터 이름이 없으면 이메일 ID 앞자리를 이름으로 사용 (rbflrbgh -> rbflrbgh)
        let displayName = user.user_metadata?.name || user.email?.split('@')[0] || '캐셔';
        if (user.email?.startsWith('rbflrbgh') && displayName === 'rbflrbgh') {
          displayName = '김규호';
        }

        if (session?.user.id) {
          const { data: roleData } = await supabase
            .from('user_roles')
            .select('role, store_id, is_approved')
            .eq('user_id', session.user.id)
            .single();

          if (roleData) {
            if (!roleData.is_approved) {
              await supabase.auth.signOut();
              auditLog({ action: 'AUTH_FAILURE', result: 'FAIL', context: { email: user.email, reason: 'pending_approval' } });
              setLoginError('가입 승인 대기 중입니다. 매장 관리자에게 문의해 주세요.');
              setIsLoggingIn(false);
              return;
            }
            finalRole = roleData.role as 'Owner' | 'Staff';
            finalStoreId = roleData.store_id;
          } else {
            const isOwner = 
              user.email === 'rbflrbgh@gmail.com' || 
              user.email === 'rbflrbgh@ssnr-pos.com';
            finalRole = isOwner ? 'Owner' : 'Staff';
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

            {/* Forgot password */}
            <div style={{ marginTop: '12px', textAlign: 'center' }}>
              <button
                type="button"
                onClick={handleForgotPassword}
                style={{ fontSize: '13px', color: 'var(--text-secondary)', border: 'none', background: 'transparent', cursor: 'pointer', textDecoration: 'underline' }}
              >
                비밀번호를 잊으셨나요?
              </button>
            </div>

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
