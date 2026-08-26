import React, { forwardRef } from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'danger-outline' | 'outline' | 'ghost';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(({
  variant = 'secondary',
  size = 'md',
  fullWidth = false,
  className,
  type = 'button',
  children,
  ...rest
}, ref) => {
  const classes = ['btn', `btn--${variant}`, `btn--${size}`];
  if (fullWidth) classes.push('btn--full');
  if (className) classes.push(className);

  return (
    <button ref={ref} type={type} className={classes.join(' ')} {...rest}>
      {children}
    </button>
  );
});

Button.displayName = 'Button';

export default Button;
