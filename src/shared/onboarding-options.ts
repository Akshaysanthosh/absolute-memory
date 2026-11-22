import type { SampleTopic } from '@/shared/sample-topic';

/** Choices on the first-run setup screens. Shared by the client screens and the server. */
export const PERSONAS = [
  { id: 'studying', label: 'Studying', hint: 'Lectures, papers, revision' },
  { id: 'research', label: 'Research and work', hint: 'Reports, industry reading, notes' },
  { id: 'building', label: 'Building something', hint: 'Startups, side projects, products' },
  { id: 'creating', label: 'Creating', hint: 'Videos, writing, inspiration' },
  { id: 'curious', label: 'Just curious', hint: 'Learning for its own sake' },
] as const;
export type Persona = (typeof PERSONAS)[number]['id'];

export const TOPICS: { id: SampleTopic; label: string }[] = [
  { id: 'ai', label: 'AI & tech' },
  { id: 'business', label: 'Startups & business' },
  { id: 'health', label: 'Health & science' },
  { id: 'productivity', label: 'Productivity' },
  { id: 'money', label: 'Money & investing' },
  { id: 'design', label: 'Design & creativity' },
  { id: 'study', label: 'Study & research' },
  { id: 'culture', label: 'Culture & ideas' },
];
/** Topics a persona starts with ticked; the user can change them. */
export const PERSONA_TOPICS: Record<Persona, SampleTopic[]> = {
  studying: ['study'],
  research: ['study', 'ai'],
  building: ['business', 'ai'],
  creating: ['design', 'culture'],
  curious: [],
};
export type ExtensionStep = 'installed' | 'skipped' | 'not-offered';

export type ChecklistStep = {
  id: 'highlight' | 'ask' | 'save' | 'extension' | 'provider';
  label: string;
  hint: string;
  done: boolean;
  href: string;
  optional?: boolean;
};
export type Checklist = { setupNeeded: boolean; show: boolean; steps: ChecklistStep[] };
