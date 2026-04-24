import React from 'react';

type PillSize = 'xs' | 'sm' | 'md';
type PillVariant = 'primary' | 'secondary' | 'ghost' | 'destructive';

interface PillProps {
  variant?: PillVariant;
  size?: PillSize;
  active?: boolean;
  icon?: React.ReactNode;
  children: React.ReactNode;
  onClick?: () => void;
  type?: 'button' | 'submit';
  disabled?: boolean;
  className?: string;
  'aria-label'?: string;
}

const Pill = React.forwardRef<HTMLButtonElement, PillProps>(function Pill(
  {
    variant = 'ghost',
    size = 'sm',
    active = false,
    icon,
    children,
    onClick,
    type = 'button',
    disabled = false,
    className = '',
    ...rest
  },
  ref,
) {
  const cls = `pill pill--${variant} pill--${size}${className ? ` ${className}` : ''}`;
  return (
    <button
      ref={ref}
      type={type}
      onClick={onClick}
      disabled={disabled}
      data-active={active ? 'true' : undefined}
      className={cls}
      {...rest}
    >
      {icon && <span className="pill__icon" aria-hidden="true">{icon}</span>}
      <span className="pill__label">{children}</span>
    </button>
  );
});

export default Pill;
export { Pill };
export type { PillProps, PillSize, PillVariant };
