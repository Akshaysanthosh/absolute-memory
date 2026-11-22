export const settingsSections = [
  ['account', 'Account'],
  ['providers', 'AI & providers'],
  ['keys', 'API keys'],
  ['extension', 'Extension'],
  ['import', 'Import'],
  ['export', 'Export'],
  ['invites', 'Invites'],
  ['sessions', 'Sessions'],
] as const;
export type SettingsSection = (typeof settingsSections)[number][0];
