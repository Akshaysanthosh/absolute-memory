export function createLibraryRevisionCache<T>(
  fetchRevision: () => Promise<string>,
  fetchSnapshot: () => Promise<T>,
) {
  let savedRevision: string | undefined;
  let generation = 0;
  return {
    invalidate() {
      generation += 1;
      savedRevision = undefined;
    },
    async read(): Promise<T | null> {
      const attempt = generation;
      const revision = await fetchRevision();
      if (savedRevision === revision) return null;
      const page = await fetchSnapshot();
      if (attempt === generation) savedRevision = revision;
      return page;
    },
  };
}
