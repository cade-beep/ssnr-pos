import React from 'react';

interface LogoProps {
  size?: number;
  className?: string;
}

/**
 * Generic point-of-sale mark (register body + receipt/printer slot + keypad).
 * Renders in `currentColor` so it drops into any colored badge (header, login, favicon)
 * without being tied to a specific shop name or brand.
 */
const Logo: React.FC<LogoProps> = ({ size = 20, className }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    aria-hidden="true"
  >
    <rect x="4" y="9" width="16" height="11" rx="2" />
    <rect x="9" y="4" width="6" height="5" rx="1" />
    <line x1="4" y1="14" x2="20" y2="14" />
    <circle cx="8.5" cy="17" r="0.9" fill="currentColor" stroke="none" />
    <circle cx="12" cy="17" r="0.9" fill="currentColor" stroke="none" />
    <circle cx="15.5" cy="17" r="0.9" fill="currentColor" stroke="none" />
  </svg>
);

export default Logo;
