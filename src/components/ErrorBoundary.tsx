import { Component, ErrorInfo, ReactNode } from 'react';
import { auditLog } from '../utils/auditLogger';
import Button from './ui/Button';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Unhandled Error caught by ErrorBoundary:", error, errorInfo);
    
    // Audit log the rendering exception
    auditLog({
      action: 'UNEXPECTED_EXCEPTION',
      result: 'FAIL',
      context: {
        message: error.message,
        stack: error.stack,
        componentStack: errorInfo.componentStack
      }
    });
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div style={{
          height: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#f8fafc',
          color: '#191f28',
          padding: '24px',
          textAlign: 'center',
          fontFamily: 'system-ui, -apple-system, sans-serif'
        }}>
          <span style={{ fontSize: '64px', marginBottom: '16px' }}>⚠️</span>
          <h1 style={{ fontSize: '24px', fontWeight: '800', marginBottom: '12px' }}>포스기 화면에 문제가 발생했습니다</h1>
          <p style={{ fontSize: '15px', color: '#4e5968', maxWidth: '480px', lineHeight: '1.6', marginBottom: '24px' }}>
            화면을 그리는 도중 예상치 못한 오류가 발생했습니다. 아래 버튼을 눌러 화면을 새로고침 하거나, 현상이 지속될 경우 관리자에게 문의해 주세요.
          </p>
          <div style={{ display: 'flex', gap: '12px' }}>
            <Button variant="primary" size="md" onClick={() => window.location.reload()}>
              새로고침
            </Button>
            <Button
              variant="secondary"
              size="md"
              onClick={() => {
                this.setState({ hasError: false, error: null });
              }}
            >
              임시 복구 시도
            </Button>
          </div>
          {this.state.error && (
            <details style={{ marginTop: '32px', textAlign: 'left', background: '#ffffff', border: '1px solid #e5e8eb', padding: '16px', borderRadius: '8px', maxWidth: '600px', width: '100%' }}>
              <summary style={{ fontSize: '13px', color: '#8b95a1', cursor: 'pointer', userSelect: 'none' }}>오류 상세 정보 (개발자 디버그용)</summary>
              <pre style={{ fontSize: '12px', color: '#ef4444', overflowX: 'auto', marginTop: '12px', whiteSpace: 'pre-wrap' }}>
                {this.state.error.toString()}
              </pre>
            </details>
          )}
        </div>
      );
    }

    return this.props.children;
  }
}
