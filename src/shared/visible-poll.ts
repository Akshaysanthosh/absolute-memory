/** Serial, cancellable polling. Returning false stops until the caller starts a new poll. */
export function pollWhileVisible(
  run: (signal: AbortSignal) => Promise<boolean>,
  options: {
    onError: (error: unknown) => void;
    intervalMs?: number;
    errorIntervalMs?: number;
    visibility?: Pick<Document, 'hidden' | 'addEventListener' | 'removeEventListener'>;
  },
): () => void {
  const visibility = options.visibility ?? document;
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let running = false,
    finished = false;
  const schedule = (delay: number) => {
    if (!controller.signal.aborted && !finished && !visibility.hidden)
      timer = setTimeout(() => void tick(), delay);
  };
  async function tick() {
    if (running || finished || controller.signal.aborted || visibility.hidden) return;
    running = true;
    let delay = options.intervalMs ?? 10000;
    try {
      finished = !(await run(controller.signal));
    } catch (error) {
      if (!controller.signal.aborted) options.onError(error);
      delay = options.errorIntervalMs ?? 60000;
    } finally {
      running = false;
      schedule(delay);
    }
  }
  const onVisibility = () => {
    clearTimeout(timer);
    if (!visibility.hidden) void tick();
  };
  visibility.addEventListener('visibilitychange', onVisibility);
  void tick();
  return () => {
    controller.abort();
    clearTimeout(timer);
    visibility.removeEventListener('visibilitychange', onVisibility);
  };
}
