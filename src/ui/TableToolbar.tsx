import React from 'react';
import { Button } from 'primereact/button';
import { InputText } from 'primereact/inputtext';

type Props = {
  /** Displayed above the table/grid; optional */
  title?: string;
  /** Current query value */
  query: string;
  /** Called on every change (debounce should be done by caller if needed) */
  onQueryChange: (value: string) => void;
  /** Placeholder for search input */
  queryPlaceholder?: string;
  /** Shows a compact result counter on the right */
  resultCount?: number;
  /** Optional chips/filters block under/near search */
  filters?: React.ReactNode;
  /** Right-side actions (create/import/export/refresh etc.) */
  actions?: React.ReactNode;
  /** Show clear button when query non-empty */
  allowClear?: boolean;
  /** Disable search input */
  disabled?: boolean;
};

export default function TableToolbar({
  title,
  query,
  onQueryChange,
  queryPlaceholder = 'Поиск...',
  resultCount,
  filters,
  actions,
  allowClear = true,
  disabled = false,
}: Props) {
  return (
    <section className="table-toolbar">
      <div className="table-toolbar-row">
        <div className="table-toolbar-left">
          {title ? <strong className="table-toolbar-title">{title}</strong> : null}
          <span className="p-input-icon-left table-toolbar-search">
            <i className="pi pi-search" />
            <InputText
              value={query}
              onChange={(e) => onQueryChange(e.target.value)}
              placeholder={queryPlaceholder}
              className="app-input w-full"
              disabled={disabled}
            />
          </span>
          {allowClear && query ? (
            <Button
              type="button"
              label="Сбросить"
              icon="pi pi-times"
              text
              size="small"
              severity="secondary"
              onClick={() => onQueryChange('')}
              disabled={disabled}
            />
          ) : null}
        </div>

        <div className="table-toolbar-right">
          {typeof resultCount === 'number' ? (
            <span className="table-toolbar-count" title="Количество элементов">
              {resultCount}
            </span>
          ) : null}
          {actions}
        </div>
      </div>

      {filters ? <div className="table-toolbar-filters">{filters}</div> : null}
    </section>
  );
}

