'use client';
import { useEffect, useState } from 'react';
import { Lightbulb, X } from 'lucide-react';
import './onboarding-tip.css';

/** Short tips shown when a getting-started checklist step opens a screen (?tip=…). */
const TIPS: Record<string, string> = {
  highlight:
    'Select any sentence, then choose Highlight. Your highlights collect on the Highlights page.',
  ask: 'Select a passage and choose Ask. The answer comes from this item and links back to the passage it used.',
  extension:
    'Install the Chrome extension, then connect it here. After that, press Alt+Shift+S on any page to save it.',
};

export function OnboardingTip() {
  const [tip, setTip] = useState<string | null>(null);
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('tip');
    if (id && TIPS[id]) setTip(TIPS[id]);
  }, []);
  if (!tip) return null;
  function close() {
    setTip(null);
    const url = new URL(window.location.href);
    url.searchParams.delete('tip');
    window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash);
  }
  return (
    <div className="onboarding-tip" role="status">
      <Lightbulb size={16} aria-hidden="true" />
      <p>{tip}</p>
      <button type="button" onClick={close}>
        Got it
      </button>
      <button type="button" className="onboarding-tip-x" aria-label="Close tip" onClick={close}>
        <X size={15} />
      </button>
    </div>
  );
}
