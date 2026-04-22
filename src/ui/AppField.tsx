import React from 'react';
import classNames from 'classnames';

type Props = {
  label?: string;
  htmlFor?: string;
  hint?: React.ReactNode;
  error?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
};

export default function AppField({ label, htmlFor, hint, error, className, children }: Props) {
  return (
    <div className={classNames('app-field', className)}>
      {label ? (
        <label className="app-field__label" htmlFor={htmlFor}>
          {label}
        </label>
      ) : null}
      <div className="app-field__control">{children}</div>
      {error ? <div className="app-field__error">{error}</div> : null}
      {!error && hint ? <div className="app-field__hint">{hint}</div> : null}
    </div>
  );
}

