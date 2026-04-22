import React from 'react';

type Props = {
  kicker?: string;
  title: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
};

export default function PageHeader({ kicker, title, description, actions }: Props) {
  return (
    <section className="page-header">
      <div className="page-header-main">
        <div className="page-header-copy">
          {kicker ? <span className="page-header-kicker">{kicker}</span> : null}
          <h2 className="page-header-title">{title}</h2>
          {description ? <div className="page-header-description">{description}</div> : null}
        </div>
        {actions ? <div className="page-header-actions">{actions}</div> : null}
      </div>
    </section>
  );
}

