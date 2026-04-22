import React from 'react';
import classNames from 'classnames';

type Props = {
  children: React.ReactNode;
  className?: string;
  padded?: boolean;
};

export default function AppCard({ children, className, padded = true }: Props) {
  return (
    <div className={classNames('app-card', padded && 'app-card--padded', className)}>
      {children}
    </div>
  );
}

