const english = new Intl.PluralRules('en');

export function plural(count: number, singular: string, multiple = singular + 's') {
  return `${count} ${english.select(count) === 'one' ? singular : multiple}`;
}
