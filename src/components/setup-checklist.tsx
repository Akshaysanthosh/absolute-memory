'use client';
import { useCallback, useEffect, useState } from 'react';
import { Check, ChevronDown, ChevronUp, X } from 'lucide-react';
import { api } from '@/shared/client';
import type { Checklist } from '@/shared/onboarding-options';
import './setup-checklist.css';

const COLLAPSED = 'am-setup-checklist-collapsed';

/**
 * Getting-started checklist for new accounts. Each step opens the screen where it happens, and
 * ticks itself off from what the account has actually done. Collapses to a pill; can be dismissed.
 */
export function SetupChecklist({ onAdd }: { onAdd: () => void }) {
  const [state, setState] = useState<Checklist | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const load = useCallback(() => {
    void api<Checklist>('/api/onboarding')
      .then(setState)
      .catch(() => {});
  }, []);
  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(COLLAPSED) === '1');
    } catch {}
    load();
    const refresh = () => {
      if (document.visibilityState === 'visible') load();
    };
    document.addEventListener('visibilitychange', refresh);
    return () => document.removeEventListener('visibilitychange', refresh);
  }, [load]);
  if (!state?.show) return null;

  const required = state.steps.filter((step) => !step.optional);
  const done = required.filter((step) => step.done).length;
  const allDone = done === required.length;
  const toggle = () =>
    setCollapsed((current) => {
      try {
        localStorage.setItem(COLLAPSED, current ? '0' : '1');
      } catch {}
      return !current;
    });
  async function dismiss() {
    setState((current) => current && { ...current, show: false });
    try {
      await api('/api/onboarding', { method: 'POST', body: JSON.stringify({ action: 'dismiss' }) });
    } catch {}
  }

  if (collapsed)
    return (
      <button type="button" className="setup-checklist-pill" onClick={toggle} aria-expanded="false">
        <span
          className="setup-checklist-ring"
          style={{ '--progress': `${(done / required.length) * 100}%` } as React.CSSProperties}
        />
        {allDone ? 'You’re all set' : `Get set up · ${done} of ${required.length}`}
        <ChevronUp size={15} aria-hidden="true" />
      </button>
    );

  return (
    <aside className="setup-checklist" aria-label="Get set up">
      <header>
        <strong>{allDone ? 'You’re all set' : 'Get set up'}</strong>
        <span>
          {done} of {required.length}
        </span>
        <button type="button" aria-label="Collapse checklist" onClick={toggle}>
          <ChevronDown size={16} />
        </button>
        <button type="button" aria-label="Dismiss checklist" onClick={() => void dismiss()}>
          <X size={16} />
        </button>
      </header>
      <div className="setup-checklist-bar">
        <i style={{ width: `${(done / required.length) * 100}%` }} />
      </div>
      <ol>
        {state.steps.map((step) => {
          const body = (
            <>
              <span className="setup-checklist-check" data-done={step.done || undefined}>
                {step.done && <Check size={12} />}
              </span>
              <span>
                <b>
                  {step.label}
                  {step.optional && <em> · optional</em>}
                </b>
                <small>{step.hint}</small>
              </span>
            </>
          );
          if (step.done)
            return (
              <li key={step.id} data-done>
                {body}
              </li>
            );
          return (
            <li key={step.id}>
              {step.id === 'save' ? (
                <button type="button" onClick={onAdd}>
                  {body}
                </button>
              ) : (
                <a href={step.href}>{body}</a>
              )}
            </li>
          );
        })}
      </ol>
      {allDone && (
        <button type="button" className="setup-checklist-done" onClick={() => void dismiss()}>
          Hide checklist
        </button>
      )}
    </aside>
  );
}
