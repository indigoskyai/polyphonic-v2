import React from 'react';

interface RadioOption<T extends string> {
  value: T;
  title: string;
  description?: string;
  danger?: boolean;
}

interface RadioGroupProps<T extends string> {
  options: RadioOption<T>[];
  value: T;
  onChange: (v: T) => void;
  name?: string;
}

export default function RadioGroup<T extends string>({
  options,
  value,
  onChange,
  name,
}: RadioGroupProps<T>) {
  return (
    <div className="radio-group" role="radiogroup">
      {options.map((opt) => {
        const selected = opt.value === value;
        return (
          <label
            key={opt.value}
            className="radio-option"
            data-selected={selected ? 'true' : undefined}
          >
            <input
              type="radio"
              name={name}
              value={opt.value}
              checked={selected}
              onChange={() => onChange(opt.value)}
              className="radio-option__input"
            />
            <span className="radio-option__circle" aria-hidden="true" />
            <span className="radio-option__content">
              <span className="radio-option__title">{opt.title}</span>
              {opt.description && (
                <span
                  className={`radio-option__description${opt.danger ? ' radio-option__description--danger' : ''}`}
                >
                  {opt.description}
                </span>
              )}
            </span>
          </label>
        );
      })}
    </div>
  );
}

export { RadioGroup };
export type { RadioOption };
