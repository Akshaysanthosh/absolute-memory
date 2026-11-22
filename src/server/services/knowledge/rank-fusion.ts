export function reciprocalRankScores(lists: ReadonlyArray<ReadonlyArray<{ id: string }>>) {
  const scores = new Map<string, number>();
  for (const list of lists) {
    list.forEach(({ id }, index) => {
      scores.set(id, (scores.get(id) ?? 0) + 1 / (60 + index + 1));
    });
  }
  return scores;
}
