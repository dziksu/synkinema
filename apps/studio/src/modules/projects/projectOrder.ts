/** Keep the gallery stable when edits update the server's recently-edited list. */
export function projectsByCreatedAt<
  T extends { id: string; created_at: string },
>(projects: readonly T[]): T[] {
  const timestamp = (value: string) => Date.parse(value) || 0;
  return [...projects].sort(
    (a, b) =>
      timestamp(b.created_at) - timestamp(a.created_at) ||
      a.id.localeCompare(b.id),
  );
}
