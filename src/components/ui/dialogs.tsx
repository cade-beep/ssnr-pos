import React, { useEffect, useState } from 'react';
import Modal from './Modal';
import Button from './Button';
import { Input } from './Field';

export interface AlertOptions {
  title?: string;
}

export interface ConfirmOptions {
  title?: string;
  danger?: boolean;
  confirmText?: string;
  cancelText?: string;
}

export interface PromptOptions {
  title?: string;
  defaultValue?: string;
  placeholder?: string;
  inputType?: 'text' | 'number';
}

type DialogRequest =
  | { kind: 'alert'; message: string; options: AlertOptions; resolve: () => void }
  | { kind: 'confirm'; message: string; options: ConfirmOptions; resolve: (ok: boolean) => void }
  | { kind: 'prompt'; message: string; options: PromptOptions; resolve: (value: string | null) => void };

let enqueueDialog: ((req: DialogRequest) => void) | null = null;

// window.alert 대체 — 확인 버튼 하나짜리 통일 다이얼로그
export function showAlert(message: string, options: AlertOptions = {}): Promise<void> {
  return new Promise((resolve) => {
    if (enqueueDialog) {
      enqueueDialog({ kind: 'alert', message, options, resolve });
    } else {
      window.alert(message);
      resolve();
    }
  });
}

// window.confirm 대체 — 취소/확인 통일 다이얼로그 (danger: 삭제류 빨간 버튼)
export function showConfirm(message: string, options: ConfirmOptions = {}): Promise<boolean> {
  return new Promise((resolve) => {
    if (enqueueDialog) {
      enqueueDialog({ kind: 'confirm', message, options, resolve });
    } else {
      resolve(window.confirm(message));
    }
  });
}

// window.prompt 대체 — 입력 필드가 있는 통일 다이얼로그
export function showPrompt(message: string, options: PromptOptions = {}): Promise<string | null> {
  return new Promise((resolve) => {
    if (enqueueDialog) {
      enqueueDialog({ kind: 'prompt', message, options, resolve });
    } else {
      resolve(window.prompt(message, options.defaultValue));
    }
  });
}

export const DialogHost: React.FC = () => {
  const [queue, setQueue] = useState<DialogRequest[]>([]);
  const [inputValue, setInputValue] = useState('');
  const current = queue.length > 0 ? queue[0] : null;

  useEffect(() => {
    enqueueDialog = (req) => setQueue((q) => [...q, req]);
    return () => {
      enqueueDialog = null;
    };
  }, []);

  useEffect(() => {
    if (current && current.kind === 'prompt') {
      setInputValue(current.options.defaultValue ?? '');
    }
  }, [current]);

  if (!current) return null;

  const dismiss = () => setQueue((q) => q.slice(1));

  const handleCancel = () => {
    if (current.kind === 'alert') current.resolve();
    else if (current.kind === 'confirm') current.resolve(false);
    else current.resolve(null);
    dismiss();
  };

  const handleOk = () => {
    if (current.kind === 'alert') current.resolve();
    else if (current.kind === 'confirm') current.resolve(true);
    else current.resolve(inputValue);
    dismiss();
  };

  const title = current.options.title ?? (current.kind === 'alert' ? '알림' : '확인');

  const footer =
    current.kind === 'alert' ? (
      <Button variant="primary" onClick={handleOk} autoFocus>
        확인
      </Button>
    ) : (
      <>
        <Button variant="secondary" onClick={handleCancel}>
          {(current.kind === 'confirm' && current.options.cancelText) || '취소'}
        </Button>
        <Button
          type={current.kind === 'prompt' ? 'submit' : 'button'}
          variant={current.kind === 'confirm' && current.options.danger ? 'danger' : 'primary'}
          onClick={current.kind === 'prompt' ? undefined : handleOk}
          autoFocus={current.kind === 'confirm'}
        >
          {(current.kind === 'confirm' && current.options.confirmText) || '확인'}
        </Button>
      </>
    );

  return (
    <Modal
      title={title}
      maxWidth={400}
      zIndex={3000}
      onClose={handleCancel}
      closeOnOverlay={current.kind === 'alert'}
      as={current.kind === 'prompt' ? 'form' : 'div'}
      onSubmit={
        current.kind === 'prompt'
          ? (e) => {
              e.preventDefault();
              handleOk();
            }
          : undefined
      }
      footer={footer}
    >
      <div style={{ fontSize: '14px', color: 'var(--text-secondary)', lineHeight: 1.6, whiteSpace: 'pre-line' }}>
        {current.message}
      </div>
      {current.kind === 'prompt' && (
        <Input
          autoFocus
          type={current.options.inputType || 'text'}
          value={inputValue}
          placeholder={current.options.placeholder}
          onChange={(e) => setInputValue(e.target.value)}
          style={{ marginTop: '14px' }}
        />
      )}
    </Modal>
  );
};
