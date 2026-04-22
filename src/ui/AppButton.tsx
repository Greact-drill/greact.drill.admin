import React from 'react';
import classNames from 'classnames';
import { Button } from 'primereact/button';
import type { ButtonProps } from 'primereact/button';

type Variant = 'primary' | 'secondary' | 'danger' | 'info' | 'text';

type Props = Omit<ButtonProps, 'severity'> & {
  variant?: Variant;
};

function mapVariantToPrimeSeverity(variant: Variant | undefined): ButtonProps['severity'] {
  if (variant === 'danger') return 'danger';
  if (variant === 'info') return 'info';
  if (variant === 'secondary') return 'secondary';
  return undefined;
}

export default function AppButton({ variant = 'primary', className, ...props }: Props) {
  const severity = mapVariantToPrimeSeverity(variant);

  return (
    <Button
      {...props}
      severity={severity}
      className={classNames(
        variant === 'primary' ? 'app-btn app-btn--primary' : 'app-btn',
        variant === 'text' ? 'app-btn--text' : null,
        className
      )}
    />
  );
}

