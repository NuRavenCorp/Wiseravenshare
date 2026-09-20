import React from 'react';
import { Card } from '../common/Card';
import { Chip } from '../common/Chip';
import { truncate, relativeTime } from '../../lib/format';
import { FiFileText, FiTrash2 } from 'react-icons/fi';

export function DocumentGrid({ documents, onDelete, onSelect }) {
  return (
    <div className="grid-auto">
      {documents.map((d) => (
        <Card key={d.id} hoverable onClick={() => onSelect?.(d)}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
            <div style={{
              width: 36, height: 36, borderRadius: 10,
              background: 'linear-gradient(135deg, var(--accent), var(--accent-2))',
              display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white',
            }}>
              <FiFileText size={16} />
            </div>
            {onDelete && (
              <button
                onClick={(e) => { e.stopPropagation(); onDelete(d.id); }}
                style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
              >
                <FiTrash2 size={14} />
              </button>
            )}
          </div>
          <h4 style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>{truncate(d.title, 60)}</h4>
          <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            {d.chunkCount} chunks · {relativeTime(d.createdAt)}
          </p>
          <div style={{ marginTop: 10, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <Chip>{d.sourceKind}</Chip>
            {d.isPublic && <Chip tone="success">Public</Chip>}
            {d.isApproved && <Chip tone="info">Approved</Chip>}
          </div>
        </Card>
      ))}
    </div>
  );
}
