import React from 'react';

interface FormFieldProps {
  label: string;
  hint?: string;
  helpText?: string;
  children: React.ReactNode;
  htmlFor?: string;
}

export default function FormField({ label, hint, helpText, children, htmlFor }: FormFieldProps) {
  return (
    <div className="form-field">
      <div className="form-field__label-col">
        {htmlFor ? (
          <label htmlFor={htmlFor} className="form-field__title">{label}</label>
        ) : (
          <div className="form-field__title">{label}</div>
        )}
        {hint && <div className="form-field__hint">{hint}</div>}
      </div>
      <div className="form-field__control">
        {children}
        {helpText && <div className="form-field__help">{helpText}</div>}
      </div>
    </div>
  );
}

export { FormField };
