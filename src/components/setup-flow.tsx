'use client';
import { useEffect, useRef, useState } from 'react';
import { api } from '@/shared/client';
import { AbsoluteMark } from '@/components/home/source-icons';
import {
  PERSONAS,
  PERSONA_TOPICS,
  TOPICS,
  type ExtensionStep,
  type Persona,
  type Checklist,
} from '@/shared/onboarding-options';
import './setup-flow.css';

type Step = 'persona' | 'topics' | 'privacy' | 'extension';

/** Desktop Chrome (and Chromium browsers that use the Chrome Web Store) can install the extension. */
function canInstallExtension() {
  const ua = navigator.userAgent;
  return /Chrome\//.test(ua) && !/Mobile|Android|iPhone|iPad|EdgA|EdgiOS|OPR\/|Firefox/.test(ua);
}

export function SetupFlow({ name }: { name: string }) {
  const [step, setStep] = useState<Step>('persona');
  const [persona, setPersona] = useState<Persona | null>(null);
  const [topics, setTopics] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [extensionOffered, setExtensionOffered] = useState<boolean | null>(null);
  const [waiting, setWaiting] = useState(false);
  const finished = useRef(false);
  useEffect(() => {
    setExtensionOffered(canInstallExtension());
  }, []);
  const ready = extensionOffered !== null;
  const steps: Step[] = extensionOffered
    ? ['persona', 'topics', 'privacy', 'extension']
    : ['persona', 'topics', 'privacy'];
  const index = steps.indexOf(step);

  async function finish(extension: ExtensionStep | null) {
    if (finished.current) return;
    finished.current = true;
    setBusy(true);
    setError('');
    try {
      await api('/api/onboarding', {
        method: 'POST',
        body: JSON.stringify({
          action: 'setup',
          persona,
          interests: topics,
          extension: extension ?? (extensionOffered ? 'skipped' : 'not-offered'),
        }),
      });
      window.location.assign('/library');
    } catch (e) {
      finished.current = false;
      setBusy(false);
      setError(e instanceof Error ? e.message : 'Setup could not be saved. Please try again.');
    }
  }
  function next() {
    if (index < steps.length - 1) setStep(steps[index + 1]);
    else void finish(null);
  }
  function choosePersona(id: Persona) {
    setPersona(id);
    setTopics((current) => (current.length ? current : PERSONA_TOPICS[id]));
    setStep('topics');
  }
  function toggleTopic(id: string) {
    setTopics((current) =>
      current.includes(id)
        ? current.filter((t) => t !== id)
        : current.length >= 3
          ? current
          : [...current, id],
    );
  }

  // While the extension step waits for the user to install and connect, check every few seconds.
  useEffect(() => {
    if (step !== 'extension' || !waiting) return;
    const timer = window.setInterval(() => {
      void api<Checklist>('/api/onboarding')
        .then((state) => {
          if (state.steps.find((s) => s.id === 'extension')?.done) void finish('installed');
        })
        .catch(() => {});
    }, 3000);
    return () => window.clearInterval(timer);
  });

  return (
    <main className="setup" aria-labelledby="setup-title">
      <div className="setup-card">
        <div className="setup-mark">
          <AbsoluteMark size={36} ink="currentColor" />
        </div>

        {step === 'persona' && (
          <>
            <h1 id="setup-title">
              {name ? `Hi ${name}, what brings you here?` : 'What brings you here?'}
            </h1>
            <p className="setup-lead">We’ll set up your library around it.</p>
            <div className="setup-options" role="list">
              {PERSONAS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  role="listitem"
                  className="setup-option"
                  aria-pressed={persona === p.id}
                  disabled={!ready}
                  onClick={() => choosePersona(p.id)}
                >
                  <strong>{p.label}</strong>
                  <small>{p.hint}</small>
                </button>
              ))}
            </div>
          </>
        )}

        {step === 'topics' && (
          <>
            <h1 id="setup-title">What are you into?</h1>
            <p className="setup-lead">
              Pick up to 3. Samples on these topics go to the top of your library.
            </p>
            <div className="setup-chips" role="group" aria-label="Topics">
              {TOPICS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className="setup-chip"
                  aria-pressed={topics.includes(t.id)}
                  disabled={!ready || (!topics.includes(t.id) && topics.length >= 3)}
                  onClick={() => toggleTopic(t.id)}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <button type="button" className="setup-primary" disabled={!ready} onClick={next}>
              Continue
            </button>
          </>
        )}

        {step === 'privacy' && (
          <>
            <h1 id="setup-title">Your library is yours alone</h1>
            <ul className="setup-nos">
              <li>
                <span>No</span> ads
              </li>
              <li>
                <span>No</span> public profiles or share links
              </li>
              <li>
                <span>No</span> feed, likes or followers
              </li>
              <li>
                <span>No</span> training AI on your saves
              </li>
            </ul>
            <p className="setup-fine">Export or delete your library from Settings at any time.</p>
            <button type="button" className="setup-primary" disabled={!ready} onClick={next}>
              Sounds good
            </button>
          </>
        )}

        {step === 'extension' && (
          <>
            <h1 id="setup-title">Save from any page in one click</h1>
            <p className="setup-lead">
              Open chrome://extensions and turn on Developer mode. Select Load unpacked and choose
              the extension folder from your Absolute Memory download.
            </p>
            <p className="setup-keys">
              On any page, press <kbd>Alt</kbd> + <kbd>Shift</kbd> + <kbd>S</kbd>. The page lands in
              your library.
            </p>
            <button type="button" className="setup-primary" onClick={() => setWaiting(true)}>
              I loaded the extension
            </button>
            {waiting && (
              <p className="setup-status" role="status">
                After installing, open the extension and connect your account. This screen moves on
                by itself.
              </p>
            )}
            <button
              type="button"
              className="setup-secondary"
              disabled={!ready || busy}
              onClick={() => void finish('skipped')}
            >
              I’ll do it later
            </button>
          </>
        )}

        {error && (
          <p className="setup-error" role="alert">
            {error}
          </p>
        )}
        <div className="setup-foot">
          <div className="setup-dots" aria-label={`Step ${index + 1} of ${steps.length}`}>
            {steps.map((s, i) => (
              <i key={s} data-on={i <= index || undefined} />
            ))}
          </div>
          <div className="setup-nav">
            {index > 0 && (
              <button
                type="button"
                className="setup-link"
                disabled={!ready || busy}
                onClick={() => setStep(steps[index - 1])}
              >
                Back
              </button>
            )}
            <button
              type="button"
              className="setup-link"
              disabled={!ready || busy}
              onClick={() => void finish(null)}
            >
              Skip setup
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}
