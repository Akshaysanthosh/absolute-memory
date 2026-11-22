/** Drain available work without keeping a scale-to-zero database awake. A single
 * in-flight operation may finish after the deadline; its own timeout still applies.
 * Delayed retries stay persisted for the next scheduled invocation. */
export async function drainAvailableWork(options: {
  importNext: () => Promise<boolean>;
  organizeNext: () => Promise<boolean>;
  now?: () => number;
  maxMilliseconds?: number;
  maxSteps?: number;
}) {
  const now = options.now ?? Date.now;
  const deadline = now() + (options.maxMilliseconds ?? 300_000);
  const maxSteps = options.maxSteps ?? 200;
  let imports = 0,
    organizationSteps = 0;
  const available = () => now() < deadline && imports + organizationSteps < maxSteps;
  while (available()) {
    let progressed = false;
    if (await options.importNext()) {
      imports++;
      progressed = true;
    }
    if (available() && (await options.organizeNext())) {
      organizationSteps++;
      progressed = true;
    }
    if (!progressed) return { imports, organizationSteps, stopped: 'idle' as const };
  }
  return { imports, organizationSteps, stopped: 'budget' as const };
}
