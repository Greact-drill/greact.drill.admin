import React from 'react';
import { Button } from 'primereact/button';
import { Message } from 'primereact/message';

type Props = {
  text: string;
  onRetry?: () => void;
  className?: string;
};

export default function ErrorBanner({ text, onRetry, className }: Props) {
  return (
    <div className={className}>
      <Message
        severity="error"
        text={text}
      />
      {onRetry ? (
        <div className="mt-2">
          <Button
            type="button"
            label="Повторить"
            icon="pi pi-refresh"
            size="small"
            severity="secondary"
            onClick={onRetry}
          />
        </div>
      ) : null}
    </div>
  );
}

