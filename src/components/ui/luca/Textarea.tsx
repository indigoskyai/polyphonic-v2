import React from 'react';

type TextareaVariant = 'default' | 'mono';

interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  variant?: TextareaVariant;
}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { variant = 'default', className = '', ...rest },
  ref,
) {
  const cls = `textarea-base textarea-base--${variant}${className ? ` ${className}` : ''}`;
  return <textarea ref={ref} className={cls} {...rest} />;
});

export default Textarea;
export { Textarea };
export type { TextareaProps, TextareaVariant };
