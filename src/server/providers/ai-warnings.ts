import type { LogWarningsFunction } from 'ai';
/** Known compatibility notice is informational; all other warnings stay visible. */
export function createAIWarningLogger(
  info: typeof console.info = console.info,
  warn: typeof console.warn = console.warn,
): LogWarningsFunction {
  const last = new Map<string, number>();
  return ({ warnings, provider, model }) => {
    for (const warning of warnings) {
      if (
        provider?.startsWith('deepseek') &&
        warning.type === 'compatibility' &&
        warning.feature === 'responseFormat JSON schema'
      ) {
        const key = `${provider}:${model}`,
          now = Date.now();
        if (!last.has(key) || now - last.get(key)! > 60000) {
          if (last.size >= 32) last.delete(last.keys().next().value!);
          last.set(key, now);
          info('AI schema compatibility mode');
        }
      } else warn('AI provider warning');
    }
  };
}
