import React from 'react';

interface EmptyStateProps {
  text: string;
  hint?: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}

export default function EmptyState({ text, hint, icon, action, className = '' }: EmptyStateProps) {
  return (
    <div className={`empty-state${className ? ` ${className}` : ''}`} role="status">
      {icon && <div className="empty-state__icon" aria-hidden="true">{icon}</div>}
      <div className="empty-state__text">{text}</div>
      {hint && <div className="empty-state__hint">{hint}</div>}
      {action && <div className="empty-state__action">{action}</div>}
    </div>
  );
}

export { EmptyState };
