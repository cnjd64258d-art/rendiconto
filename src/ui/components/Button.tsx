import type { ButtonHTMLAttributes, ReactNode } from 'react';
import styles from './Button.module.css';
import { cx } from './cx';

type Variant = 'primary' | 'secondary' | 'plain' | 'destructive';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: 'regular' | 'large';
  block?: boolean;
  children: ReactNode;
}

export function Button({
  variant = 'primary',
  size = 'regular',
  block = false,
  className,
  type = 'button',
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cx(styles.button, styles[variant], size === 'large' && styles.large, block && styles.block, className)}
      {...rest}
    >
      {children}
    </button>
  );
}
