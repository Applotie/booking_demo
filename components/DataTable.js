'use client';

import { Fragment } from 'react';

/**
 * Lightweight responsive table.
 * columns: [{ key, header, render?(row), className?, align?: 'right'|'center', hideBelow?: 'sm'|'md'|'lg' }]
 */
export default function DataTable({ columns, rows, rowKey = (r) => r.id, emptyMessage = 'No records found.', onRowClick, expandedKey, renderExpanded, footer, dense = false }) {
  const hide = { sm: 'hidden sm:table-cell', md: 'hidden md:table-cell', lg: 'hidden lg:table-cell' };
  const align = (a) => (a === 'right' ? 'text-right' : a === 'center' ? 'text-center' : 'text-left');
  const pad = dense ? 'px-3 py-2' : 'px-4 py-3';
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-slate-200 text-sm">
        <thead className="bg-slate-50">
          <tr>
            {columns.map((c) => (
              <th key={c.key} scope="col" className={`${pad} whitespace-nowrap text-xs font-semibold uppercase tracking-wide text-slate-500 ${align(c.align)} ${c.hideBelow ? hide[c.hideBelow] : ''}`}>
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 bg-white">
          {rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="px-4 py-10 text-center text-sm text-slate-500">
                {emptyMessage}
              </td>
            </tr>
          ) : (
            rows.map((row) => {
              const key = rowKey(row);
              return (
                <Fragment key={key}>
                  <tr
                    className={onRowClick ? 'cursor-pointer hover:bg-slate-50' : ''}
                    onClick={onRowClick ? (e) => {
                      if (e.target.closest('button, a, input, select, label')) return;
                      onRowClick(row);
                    } : undefined}
                  >
                    {columns.map((c) => (
                      <td key={c.key} className={`${pad} align-top ${align(c.align)} ${c.className || ''} ${c.hideBelow ? hide[c.hideBelow] : ''}`}>
                        {c.render ? c.render(row) : row[c.key]}
                      </td>
                    ))}
                  </tr>
                  {expandedKey === key && renderExpanded ? (
                    <tr className="bg-slate-50/70">
                      <td colSpan={columns.length} className="px-4 py-3">
                        {renderExpanded(row)}
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              );
            })
          )}
        </tbody>
        {footer ? <tfoot className="bg-slate-50 font-medium">{footer}</tfoot> : null}
      </table>
    </div>
  );
}
