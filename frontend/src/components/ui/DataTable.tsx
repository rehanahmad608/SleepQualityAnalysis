import type { ReactNode } from 'react';
import { useState } from 'react';

export interface Column<T> {
  key: string;
  header: ReactNode;
  render?: (row: T, index: number) => ReactNode;
  accessor?: (row: T) => ReactNode;
  align?: 'left' | 'right' | 'center';
  className?: string;
}

export interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  getRowKey?: (row: T, index: number) => string | number;
  emptyMessage?: string;
  caption?: string;
  className?: string;
  'aria-label'?: string;
}

export function DataTable<T>({
  columns,
  data,
  getRowKey,
  emptyMessage = 'No rows to display.',
  caption,
  className = '',
  ...aria
}: DataTableProps<T>) {
  const empty = data.length === 0;
  return (
    <div className={`data-table-wrapper ${className}`.trim()}>
      <table className="data-table" {...aria}>
        {caption && <caption className="visually-hidden">{caption}</caption>}
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key} className={c.className} style={{ textAlign: c.align ?? 'left' }}>
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {empty && (
            <tr>
              <td colSpan={columns.length} className="empty-cell text-center" style={{ padding: '24px' }}>
                {emptyMessage}
              </td>
            </tr>
          )}
          {data.map((row, idx) => {
            const key = getRowKey ? getRowKey(row, idx) : idx;
            return (
              <tr key={key}>
                {columns.map((c) => {
                  const content = c.render
                    ? c.render(row, idx)
                    : c.accessor
                    ? c.accessor(row)
                    : (row as Record<string, ReactNode>)[c.key];
                  const isNumeric = c.align === 'right';
                  const isEmpty = content === null || content === undefined || content === '';
                  return (
                    <td
                      key={c.key}
                      className={`${isNumeric ? 'numeric' : ''} ${isEmpty ? 'empty-cell' : ''} ${c.className ?? ''}`.trim()}
                      style={{ textAlign: c.align ?? 'left' }}
                    >
                      {isEmpty ? '—' : content}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export interface ChartOrTableToggleProps {
  view: 'chart' | 'table';
  onChange: (v: 'chart' | 'table') => void;
  chartLabel?: string;
  tableLabel?: string;
}

export function ChartOrTableToggle({
  view,
  onChange,
  chartLabel = 'Chart',
  tableLabel = 'Table',
}: ChartOrTableToggleProps) {
  return (
    <div className="tab-list" role="tablist" aria-label="View mode">
      <button
        type="button"
        role="tab"
        aria-selected={view === 'chart'}
        className={`tab-btn ${view === 'chart' ? 'active' : ''}`}
        onClick={() => onChange('chart')}
      >
        {chartLabel}
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={view === 'table'}
        className={`tab-btn ${view === 'table' ? 'active' : ''}`}
        onClick={() => onChange('table')}
      >
        {tableLabel}
      </button>
    </div>
  );
}

export function useChartTableToggle(defaultView: 'chart' | 'table' = 'chart') {
  return useState<'chart' | 'table'>(defaultView);
}
