import React from 'react';

type Props = {
  icon?: string;
  title: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
};

export default function EmptyState({ icon, title, description, actions }: Props) {
  return (
    <div className="app-empty-state" role="status" aria-live="polite">
      {icon ? (
        <div className="app-empty-state-icon" aria-hidden="true">
          <i className={icon} />
        </div>
      ) : null}
      <strong className="app-empty-state-title">{title}</strong>
      {description ? <div className="app-empty-state-description">{description}</div> : null}
      {actions ? <div className="app-empty-state-actions">{actions}</div> : null}
    </div>
  );
}

