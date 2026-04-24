import React, { useRef, useState } from 'react';

interface TooltipProps {
  content: React.ReactNode;
  side?: 'top' | 'bottom' | 'left' | 'right';
  delay?: number;
  children: React.ReactElement;
}

export default function Tooltip({ content, side = 'top', delay = 600, children }: TooltipProps) {
  const [visible, setVisible] = useState(false);
  const timer = useRef<number | null>(null);

  const show = () => {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setVisible(true), delay);
  };
  const hide = () => {
    if (timer.current) window.clearTimeout(timer.current);
    setVisible(false);
  };

  const trigger = React.cloneElement(children as React.ReactElement, {
    onMouseEnter: show,
    onMouseLeave: hide,
    onFocus: show,
    onBlur: hide,
  });

  return (
    <span className="tooltip-wrap" style={{ position: 'relative', display: 'inline-flex' }}>
      {trigger}
      {visible && (
        <span role="tooltip" className={`tooltip-box tooltip-box--${side}`}>
          {content}
        </span>
      )}
    </span>
  );
}

export { Tooltip };
