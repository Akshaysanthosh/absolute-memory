'use client';
import { useState } from 'react';
import { Pencil } from 'lucide-react';
import { api } from '@/shared/client';
import styles from './item-title.module.css';
export function ItemTitle({ id, title }: { id: string; title: string }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(title);
  const [saved, setSaved] = useState(title);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return (
    <div className={styles.editor}>
      {editing ? (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (busy || !value.trim()) return;
            setBusy(true);
            setError('');
            try {
              await api(`/api/items/${id}`, {
                method: 'PATCH',
                body: JSON.stringify({ title: value.trim() }),
              });
              setSaved(value.trim());
              setEditing(false);
              window.dispatchEvent(new Event('am:library-changed'));
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <input
            aria-label="Item title"
            autoFocus
            value={value}
            maxLength={300}
            onChange={(e) => setValue(e.target.value)}
          />
          <button disabled={busy || !value.trim()}>Save</button>
          <button type="button" disabled={busy} onClick={() => setEditing(false)}>
            Cancel
          </button>
        </form>
      ) : (
        <>
          <span title={saved}>{saved}</span>
          <button
            type="button"
            aria-label="Rename item"
            title="Rename item"
            onClick={() => {
              setValue(saved);
              setEditing(true);
            }}
          >
            <Pencil size={15} />
          </button>
        </>
      )}
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
