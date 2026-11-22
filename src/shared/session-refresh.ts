/** One account/session owns each queue; no module-level data or persistent cache. */
export function createSessionRefresh<T>(options: {
  load: () => Promise<T>;
  commit: (value: T) => void;
  error: (error: unknown) => void;
  settled: () => void;
}) {
  let pending: Promise<void> | null = null,
    dirty = false,
    disposed = false;
  const refresh = (): Promise<void> => {
    if (disposed) return Promise.resolve();
    if (pending) return pending;
    pending = (async () => {
      do {
        dirty = false;
        try {
          const value = await options.load();
          if (!disposed && !dirty) options.commit(value);
        } catch (error) {
          if (!disposed && !dirty) options.error(error);
        }
      } while (dirty && !disposed);
    })().finally(() => {
      pending = null;
      if (!disposed) options.settled();
    });
    return pending;
  };
  return {
    refresh,
    invalidate: () => {
      dirty = true;
    },
    dispose: () => {
      disposed = true;
      dirty = false;
    },
  };
}
