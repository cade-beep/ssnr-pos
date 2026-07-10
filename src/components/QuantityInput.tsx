import React, { useState, useEffect, useRef } from 'react';
import { Plus, Minus } from 'lucide-react';

interface QuantityInputProps {
  /** Current quantity value */
  value: number;
  /** Minimum allowed value, defaults to 0 */
  min?: number;
  /** Called when quantity should increase by 1 */
  onIncrease: () => void;
  /** Called when quantity should decrease by 1 */
  onDecrease: () => void;
  /** Called when user types a new quantity directly */
  onChange: (newValue: number) => void;
}

/**
 * A compact quantity selector with "+" and "-" buttons flanking a numeric input.
 * Styling matches the existing dark theme used throughout the app.
 * Supports click‑and‑hold for continuous change and disables mouse‑wheel adjustments.
 */
const QuantityInput: React.FC<QuantityInputProps> = ({
  value,
  min = 0,
  onIncrease,
  onDecrease,
  onChange,
}) => {
  const [internal, setInternal] = useState(value.toString());
  const incTimer = useRef<NodeJS.Timeout | null>(null);
  const decTimer = useRef<NodeJS.Timeout | null>(null);

  // Keep internal string in sync when external value changes
  useEffect(() => {
    setInternal(value.toString());
  }, [value]);

  const startHold = (callback: () => void, ref: React.MutableRefObject<NodeJS.Timeout | null>) => {
    callback();
    ref.current = setInterval(callback, 150);
  };

  const stopHold = (ref: React.MutableRefObject<NodeJS.Timeout | null>) => {
    if (ref.current) {
      clearInterval(ref.current);
      ref.current = null;
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    // Allow empty string while typing
    if (/^\d*$/.test(val)) {
      setInternal(val);
    }
  };

  const commitChange = () => {
    const parsed = parseInt(internal, 10);
    const newVal = isNaN(parsed) ? min : Math.max(min, parsed);
    if (newVal !== value) {
      onChange(newVal);
    }
    setInternal(newVal.toString());
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
      {/* Decrease button */}
      <button
        type="button"
        className="quantity-btn"
        onMouseDown={() => startHold(onDecrease, decTimer)}
        onMouseUp={() => stopHold(decTimer)}
        onMouseLeave={() => stopHold(decTimer)}
        onTouchStart={() => startHold(onDecrease, decTimer)}
        onTouchEnd={() => stopHold(decTimer)}
        disabled={value <= min}
        style={{ opacity: value <= min ? 0.4 : 1 }}
      >
        <Minus size={10} />
      </button>

      {/* Numeric input */}
      <input
        type="text"
        value={internal}
        onChange={handleInputChange}
        onBlur={commitChange}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            commitChange();
            e.currentTarget.blur();
          }
        }}
        onWheel={(e) => e.preventDefault()}
        style={{
          width: '40px',
          textAlign: 'center',
          background: 'rgba(255,255,255,0.05)',
          border: '1px solid var(--border-color)',
          color: '#fff',
          borderRadius: '4px',
          padding: '2px',
        }}
      />

      {/* Increase button */}
      <button
        type="button"
        className="quantity-btn"
        onMouseDown={() => startHold(onIncrease, incTimer)}
        onMouseUp={() => stopHold(incTimer)}
        onMouseLeave={() => stopHold(incTimer)}
        onTouchStart={() => startHold(onIncrease, incTimer)}
        onTouchEnd={() => stopHold(incTimer)}
      >
        <Plus size={10} />
      </button>
    </div>
  );
};

export default QuantityInput;
