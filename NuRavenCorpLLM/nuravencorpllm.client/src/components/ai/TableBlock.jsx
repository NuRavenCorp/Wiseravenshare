import React from 'react';

export const TableBlock = ({ title, data }) => {
  if (!Array.isArray(data) || data.length === 0) {
    return null;
  }

  return (
    <div className="table-stack">
      {data.map((group, i) => {
        const rows = group.rows || [];
        if (!rows.length) {
          return null;
        }

        const columns = Array.from(new Set(rows.flatMap((row) => Object.keys(row))));
        return (
          <div key={`${group.source}-${i}`} className="glass-card">
            <div className="subtle-title">{title} · {group.source}</div>
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    {columns.map((column) => <th key={column}>{column}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, rowIndex) => (
                    <tr key={rowIndex}>
                      {columns.map((column) => <td key={column}>{formatCell(row[column])}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
    </div>
  );
};

function formatCell(value) {
  if (value == null) {
    return '—';
  }

  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value)) {
    return new Date(value).toLocaleString();
  }

  if (typeof value === 'string' && value.length > 90) {
    return `${value.slice(0, 90)}...`;
  }

  return String(value);
}
