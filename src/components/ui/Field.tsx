import React from 'react';

export interface FieldProps {
  label?: React.ReactNode;
  htmlFor?: string;
  className?: string;
  style?: React.CSSProperties;
  children: React.ReactNode;
}

export const Field: React.FC<FieldProps> = ({ label, htmlFor, className, style, children }) => (
  <div className={className ? `bo-field ${className}` : 'bo-field'} style={style}>
    {label !== undefined && (
      <label className="bo-label" htmlFor={htmlFor}>
        {label}
      </label>
    )}
    {children}
  </div>
);

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...rest }, ref) => (
    <input ref={ref} className={className ? `bo-input ${className}` : 'bo-input'} {...rest} />
  )
);
Input.displayName = 'Input';

export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, ...rest }, ref) => (
    <select ref={ref} className={className ? `bo-select ${className}` : 'bo-select'} {...rest} />
  )
);
Select.displayName = 'Select';
