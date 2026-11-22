export const themes = ['light', 'dark'] as const;
export const sizes = ['small', 'medium', 'large'] as const;
export const measures = ['standard', 'wide'] as const;

export type ReaderPreferences = {
  theme: (typeof themes)[number];
  size: (typeof sizes)[number];
  measure: (typeof measures)[number];
};
export const defaults: ReaderPreferences = { theme: 'light', size: 'medium', measure: 'standard' };

export function readPreferences(): ReaderPreferences {
  try {
    const value = JSON.parse(localStorage.getItem('absolute-memory.reading') ?? '{}');
    return {
      theme: themes.includes(value.theme) ? value.theme : defaults.theme,
      size: sizes.includes(value.size) ? value.size : defaults.size,
      measure: measures.includes(value.measure) ? value.measure : defaults.measure,
    };
  } catch {
    return defaults;
  }
}

export function savePreferences(value: ReaderPreferences) {
  try {
    localStorage.setItem('absolute-memory.reading', JSON.stringify(value));
  } catch {
    // Reading can continue when the browser disables local storage.
  }
}
