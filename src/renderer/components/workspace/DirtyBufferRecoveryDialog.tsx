import { useState } from 'react'
import type { DirtyBuffer } from '@/lib/dirty-buffer-manager'

interface Props {
  buffers: DirtyBuffer[]
  onKeep: (paths: string[]) => void
  onDiscard: (paths: string[]) => void
  onClose: () => void
}

export function DirtyBufferRecoveryDialog({ buffers, onKeep, onDiscard, onClose }: Props) {
  const [selected, setSelected] = useState<Set<string>>(new Set(buffers.map(b => b.path)))
  const [preview, setPreview] = useState<DirtyBuffer | null>(null)

  const allSelected = selected.size === buffers.length

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
    }}>
      <div style={{
        background: '#1a1a1f', borderRadius: '12px', border: '1px solid #2a2a30',
        width: '640px', maxHeight: '80vh', display: 'flex', flexDirection: 'column',
        boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
      }}>
        <div style={{ padding: '20px 24px', borderBottom: '1px solid #2a2a30' }}>
          <h2 style={{ fontSize: '15px', fontWeight: 600, color: '#e2e8f0', margin: 0 }}>
            Unsaved Changes Recovered
          </h2>
          <p style={{ fontSize: '12px', color: '#6b7280', margin: '6px 0 0 0' }}>
            The application closed unexpectedly. We found {buffers.length} file{buffers.length !== 1 ? 's' : ''} with unsaved changes.
          </p>
        </div>

        <div style={{ flex: 1, overflow: 'auto', padding: '8px 0' }}>
          <div style={{ padding: '0 24px 8px 24px', borderBottom: '1px solid #1a1a20' }}>
            <label style={{ fontSize: '12px', color: '#aaa', display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={allSelected}
                onChange={() => setSelected(allSelected ? new Set() : new Set(buffers.map(b => b.path)))}
                style={{ accentColor: '#2563eb' }}
              />
              {allSelected ? 'Deselect all' : 'Select all'}
            </label>
          </div>
          {buffers.map(buf => (
            <div
              key={buf.path}
              style={{
                display: 'flex', alignItems: 'center', gap: '10px',
                padding: '8px 24px', cursor: 'pointer',
                background: preview?.path === buf.path ? '#0d0d10' : undefined,
                borderBottom: '1px solid #1a1a20',
              }}
              onClick={() => setPreview(buf)}
            >
              <input
                type="checkbox"
                checked={selected.has(buf.path)}
                onChange={(e) => {
                  e.stopPropagation()
                  setSelected(prev => {
                    const next = new Set(prev)
                    if (next.has(buf.path)) next.delete(buf.path)
                    else next.add(buf.path)
                    return next
                  })
                }}
                style={{ accentColor: '#2563eb' }}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '13px', color: '#e2e8f0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {buf.path.split('/').pop()}
                </div>
                <div style={{ fontSize: '11px', color: '#6b7280', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {buf.path}
                </div>
              </div>
              <div style={{ fontSize: '10px', color: '#f59e0b', whiteSpace: 'nowrap' }}>
                {new Date(buf.lastModified).toLocaleTimeString()}
              </div>
            </div>
          ))}
        </div>

        {preview && (
          <div style={{
            borderTop: '1px solid #2a2a30', padding: '12px 24px',
            maxHeight: '200px', overflow: 'auto', background: '#0d0d10',
          }}>
            <div style={{ fontSize: '11px', color: '#6b7280', marginBottom: '6px' }}>
              Preview: {preview.path}
            </div>
            <pre style={{
              fontSize: '11px', color: '#aaa', margin: 0, whiteSpace: 'pre-wrap',
              fontFamily: "'JetBrains Mono', monospace", lineHeight: 1.5,
            }}>
              {preview.content.slice(0, 2000)}{preview.content.length > 2000 ? '\n... (truncated)' : ''}
            </pre>
          </div>
        )}

        <div style={{ padding: '16px 24px', borderTop: '1px solid #2a2a30', display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
          <button
            onClick={() => { onDiscard([...selected]); onClose() }}
            style={{
              padding: '8px 16px', background: 'transparent', color: '#ccc',
              border: '1px solid #555', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: 500,
            }}
          >
            Discard Selected
          </button>
          <button
            onClick={() => { onKeep([...selected]); onClose() }}
            style={{
              padding: '8px 16px', background: '#2563eb', color: '#fff',
              border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: 500,
            }}
          >
            Keep Selected ({selected.size})
          </button>
        </div>
      </div>
    </div>
  )
}
