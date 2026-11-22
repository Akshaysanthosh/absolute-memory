'use client';
import { useState } from 'react';
import Link from 'next/link';
import { api } from '@/shared/client';
export function ExtensionPair({ challenge, name }: { challenge: string; name: string }) {
  const [state, setState] = useState<'idle' | 'busy' | 'done'>('idle');
  const [error, setError] = useState('');
  return (
    <section className="settings-card">
      <span className="eyebrow">CHROME + ABSOLUTE MEMORY</span>
      <h1>{state === 'done' ? 'Your reading home is connected.' : 'Connect this browser?'}</h1>
      {state === 'done' ? (
        <>
          <p>
            Return to the Absolute Memory extension tab. Then pin its icon in Chrome and click it on
            any article to save.
          </p>
          <Link className="button primary" href="/library">
            Open my library
          </Link>
        </>
      ) : (
        <>
          <p>
            Connect to <strong>{name}’s</strong> library. This browser can save articles and check
            their preparation status. It cannot browse your library.
          </p>
          <p>Match this code with the one shown in the extension:</p>
          <p className="pair-code">{challenge.slice(0, 8).toUpperCase()}</p>
          <p>
            Continue only if you just started this connection from the Absolute Memory extension.
          </p>
          <button
            className="button primary"
            disabled={state === 'busy'}
            onClick={async () => {
              setState('busy');
              setError('');
              try {
                await api('/api/extension/pair', {
                  method: 'POST',
                  body: JSON.stringify({ challenge }),
                });
                setState('done');
              } catch (e) {
                setError((e as Error).message);
                setState('idle');
              }
            }}
          >
            {state === 'busy' ? 'Connecting…' : 'Connect Chrome'}
          </button>
          <Link className="text-link" style={{ marginLeft: 20 }} href="/library">
            Cancel
          </Link>
          {error && (
            <p role="alert" className="error-banner">
              {error}
            </p>
          )}
          <p className="quiet-note">
            You can disconnect this browser at any time from Capture channels.
          </p>
        </>
      )}
    </section>
  );
}
