import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';

export interface ModalProps {
  title?: React.ReactNode;
  description?: React.ReactNode;
  footer?: React.ReactNode;
  maxWidth?: number | string;
  zIndex?: number;
  onClose?: () => void;
  closeOnOverlay?: boolean;
  closeOnEsc?: boolean;
  as?: 'div' | 'form';
  onSubmit?: (e: React.FormEvent<HTMLFormElement>) => void;
  bodyStyle?: React.CSSProperties;
  children: React.ReactNode;
}

const Modal: React.FC<ModalProps> = ({
  title,
  description,
  footer,
  maxWidth,
  zIndex,
  onClose,
  closeOnOverlay = false,
  closeOnEsc = true,
  as = 'div',
  onSubmit,
  bodyStyle,
  children,
}) => {
  useEffect(() => {
    if (!onClose || !closeOnEsc) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose, closeOnEsc]);

  const Tag = as as React.ElementType;

  return createPortal(
    <div
      className="bo-modal-overlay"
      style={zIndex !== undefined ? { zIndex } : undefined}
      onClick={closeOnOverlay && onClose ? onClose : undefined}
    >
      <Tag
        className="bo-modal"
        style={maxWidth !== undefined ? { maxWidth } : undefined}
        onClick={(e: React.MouseEvent) => e.stopPropagation()}
        onSubmit={onSubmit}
      >
        {(title !== undefined || description !== undefined) && (
          <div className="bo-modal-header">
            {title !== undefined && <div className="bo-modal-title">{title}</div>}
            {description !== undefined && <div className="bo-modal-desc">{description}</div>}
          </div>
        )}
        <div className="bo-modal-body" style={bodyStyle}>
          {children}
        </div>
        {footer && <div className="bo-modal-footer">{footer}</div>}
      </Tag>
    </div>,
    document.body
  );
};

export default Modal;
