export interface DependencyEdge {
  itemId: string;
  dependsOnId: string;
}

export function createsDependencyCycle(
  itemId: string,
  dependsOnId: string,
  edges: DependencyEdge[]
): boolean {
  if (itemId === dependsOnId) return true;
  const dependencies = new Map<string, string[]>();
  for (const edge of edges) {
    dependencies.set(edge.itemId, [...(dependencies.get(edge.itemId) ?? []), edge.dependsOnId]);
  }
  const pending = [dependsOnId];
  const visited = new Set<string>();
  while (pending.length) {
    const current = pending.pop()!;
    if (current === itemId) return true;
    if (visited.has(current)) continue;
    visited.add(current);
    pending.push(...(dependencies.get(current) ?? []));
  }
  return false;
}

export function isValidDateRange(start?: Date, end?: Date): boolean {
  return !(start && end && start >= end);
}
