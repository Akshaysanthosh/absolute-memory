'use client';
import { useState } from 'react';
import type { Capabilities } from '@/shared/capabilities';
import { settingsSections, type SettingsSection } from '@/shared/settings-sections';
import { AppearanceSelect } from './app-theme';
import { AccountSettings } from './account-settings';
import { ConnectionsView } from './connections-view';
import { IntegrationKeys } from './integration-keys';
import { InstanceInvites } from './instance-invites';
import { LibraryTransfers } from './library-transfers';
import { ProviderSettings } from './provider-settings';
import styles from './preferences.module.css';

export function SettingsView({
  googleEnabled,
  linkingFailed,
  initialSection,
  integrationsEnabled,
  isOwner,
  capabilities,
  appUrl,
}: {
  googleEnabled: boolean;
  linkingFailed: boolean;
  initialSection: SettingsSection;
  integrationsEnabled: boolean;
  isOwner: boolean;
  capabilities: Capabilities;
  appUrl: string;
}) {
  const [section, setSection] = useState(initialSection);
  const tabs = settingsSections.filter(
    ([id]) => (id !== 'invites' || isOwner) && (id !== 'keys' || integrationsEnabled),
  );

  function select(id: SettingsSection) {
    setSection(id);
    history.replaceState(history.state, '', `/settings?section=${id}`);
  }

  return (
    <div className={styles.page}>
      <header className={styles.intro}>
        <h1>Settings</h1>
      </header>
      <div
        role="tablist"
        aria-label="Settings sections"
        className={styles.tabs}
        onKeyDown={(event) => {
          const current = tabs.findIndex(([id]) => id === section);
          const next =
            event.key === 'ArrowRight'
              ? (current + 1) % tabs.length
              : event.key === 'ArrowLeft'
                ? (current + tabs.length - 1) % tabs.length
                : event.key === 'Home'
                  ? 0
                  : event.key === 'End'
                    ? tabs.length - 1
                    : -1;
          if (next < 0) return;
          event.preventDefault();
          const id = tabs[next][0];
          select(id);
          event.currentTarget.querySelector<HTMLButtonElement>(`#settings-tab-${id}`)?.focus();
        }}
      >
        {tabs.map(([id, label]) => (
          <button
            key={id}
            id={`settings-tab-${id}`}
            role="tab"
            aria-selected={id === section}
            aria-controls={`settings-panel-${id}`}
            tabIndex={id === section ? 0 : -1}
            onClick={() => select(id)}
          >
            {label}
          </button>
        ))}
      </div>
      {tabs.map(([id]) => (
        <div
          key={id}
          id={`settings-panel-${id}`}
          role="tabpanel"
          aria-labelledby={`settings-tab-${id}`}
          hidden={id !== section}
        >
          {id === section && (
            <>
              {id === 'account' && (
                <section className="settings-card">
                  <h2>Appearance</h2>
                  <p>Choose light, dark, or the system appearance.</p>
                  <AppearanceSelect />
                </section>
              )}
              {(id === 'account' || id === 'sessions') && (
                <AccountSettings
                  googleEnabled={googleEnabled}
                  isOwner={isOwner}
                  linkingFailed={linkingFailed}
                  section={id}
                />
              )}
              {id === 'providers' && (
                <ProviderSettings capabilities={capabilities} isOwner={isOwner} />
              )}
              {id === 'keys' && <IntegrationKeys />}
              {id === 'extension' && <ConnectionsView appUrl={appUrl} />}
              {(id === 'import' || id === 'export') && <LibraryTransfers mode={id} />}
              {id === 'invites' && <InstanceInvites />}
            </>
          )}
        </div>
      ))}
    </div>
  );
}
