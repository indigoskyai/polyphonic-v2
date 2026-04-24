import React from 'react';

interface SelectOption { value: string; label: string; }
interface SelectProps extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'onChange' | 'size'> {
  options: SelectOption[];
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}

const Select = React.forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { options, value, onChange, placeholder, className = '', ...rest },
  ref,
) {
  return (
    <span className={`select-wrap${className ? ` ${className}` : ''}`}>
      <select
        ref={ref}
        className="select-native"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        {...rest}
      >
        {placeholder && <option value="" disabled hidden>{placeholder}</option>}
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </span>
  );
});

export default Select;
export { Select };
export type { SelectOption, SelectProps };
