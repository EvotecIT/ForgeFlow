export function pickPrimaryByPath<T extends { path: string }>(
  items: readonly T[],
  isWorktree: (item: T) => boolean
): T | undefined {
  if (items.length === 0) {
    return undefined;
  }
  const nonWorktrees = items.filter((item) => !isWorktree(item));
  const pool = nonWorktrees.length > 0 ? nonWorktrees : items;
  return pickShortestPath(pool);
}

export function pickShortestPath<T extends { path: string }>(items: readonly T[]): T | undefined {
  if (items.length === 0) {
    return undefined;
  }
  return [...items].sort((left, right) => {
    const lengthDiff = left.path.length - right.path.length;
    if (lengthDiff !== 0) {
      return lengthDiff;
    }
    return left.path.localeCompare(right.path);
  })[0];
}
