'use client';

import { createContext, useContext, useState } from 'react';
import { createPortal } from 'react-dom';
function useWorkspaceState() {
  const [panelRoot, setPanelRoot] = useState<HTMLDivElement | null>(null);
  const [chatDraft, setChatDraft] = useState('');
  return { panelRoot, setPanelRoot, chatDraft, setChatDraft };
}

const WorkspaceContext = createContext<ReturnType<typeof useWorkspaceState> | null>(null);
export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const value = useWorkspaceState();
  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}
export function useWorkspace() {
  const value = useContext(WorkspaceContext);
  if (!value) throw new Error('Workspace controls must be inside the workspace layout.');
  return value;
}

/** Keep screen state in its screen while rendering controls beside the shared rail. */
export function WorkspacePanel({ children }: { children: React.ReactNode }) {
  const { panelRoot } = useWorkspace();
  return panelRoot ? createPortal(children, panelRoot) : null;
}
