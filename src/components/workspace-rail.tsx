'use client';

import { Avatar } from '@astryxdesign/core/Avatar';
import { Button } from '@astryxdesign/core/Button';
import { DropdownMenu } from '@astryxdesign/core/DropdownMenu';
import { Highlighter, House, MessagesSquare, Network, Plus, Settings } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import { useAppTheme } from './app-theme';
import { authClient } from '@/shared/auth-client';
import { IntentLink } from './intent-link';
import './workspace-rail.css';

const links = [
  { href: '/library', label: 'Home', icon: House },
  { href: '/ask', label: 'Chat', icon: MessagesSquare },
  { href: '/graph', label: 'Graph', icon: Network },
  { href: '/highlights', label: 'Highlights', icon: Highlighter },
];

export function WorkspaceRail({ onAdd }: { onAdd: () => void }) {
  const pathname = usePathname();
  function home() {
    window.dispatchEvent(new Event('am:library-home'));
    if (pathname === '/library') window.scrollTo(0, 0);
  }

  return (
    <nav className="workspace-rail" aria-label="Main navigation">
      <IntentLink
        className="workspace-logo"
        href="/library"
        aria-label="Absolute Memory"
        onClick={home}
      >
        |a|
      </IntentLink>
      <Button
        className="workspace-rail-add"
        variant="primary"
        label="Add to library from navigation"
        isIconOnly
        icon={<Plus size={21} />}
        onClick={onAdd}
      />
      {links.map(({ href, label, icon: Icon }) => (
        <IntentLink
          className="workspace-rail-link"
          key={href}
          href={href}
          aria-current={pathname === href ? 'page' : undefined}
          onClick={href === '/library' ? home : undefined}
        >
          <Icon size={20} aria-hidden="true" />
          <span>{label}</span>
        </IntentLink>
      ))}
      <Button
        className="workspace-tab-add"
        label="Add"
        variant="ghost"
        icon={<Plus size={20} />}
        onClick={onAdd}
      />
      <IntentLink
        className="workspace-rail-link workspace-settings"
        href="/settings"
        aria-current={pathname === '/settings' ? 'page' : undefined}
      >
        <Settings size={20} aria-hidden="true" />
        <span>Settings</span>
      </IntentLink>
      <WorkspaceAccount />
    </nav>
  );
}

export function WorkspaceAccount({ mobile = false }: { mobile?: boolean }) {
  const router = useRouter();
  const { data } = authClient.useSession();
  const { setTheme } = useAppTheme();
  const name = data?.user.name || data?.user.email || 'Account';

  return (
    <div className={mobile ? 'workspace-account workspace-account-mobile' : 'workspace-account'}>
      <DropdownMenu
        placement="above"
        button={{
          label: `Account: ${name}`,
          isIconOnly: true,
          icon: <Avatar name={name} size="sm" />,
          variant: 'ghost',
        }}
        items={[
          { label: 'Settings', onClick: () => router.push('/settings') },
          { label: 'Extension', onClick: () => router.push('/settings?section=extension') },
          { label: 'Favorites', onClick: () => router.push('/library?filter=Favorites') },
          { label: 'Archived', onClick: () => router.push('/library?filter=Archived') },
          { label: 'Use system appearance', onClick: () => setTheme('system') },
          { type: 'divider' },
          {
            label: 'Sign out',
            onClick: () => void authClient.signOut().finally(() => location.assign('/')),
          },
        ]}
      />
    </div>
  );
}
