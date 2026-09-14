import { type QueryClient, type QueryKey } from "@tanstack/react-query";

type Patch = (value: any) => any;
type Entry = {
  key: QueryKey;
  base: unknown;
  layers: Map<symbol, { apply: Patch; group?: string }>;
};
const stores = new WeakMap<QueryClient, Map<string, Entry>>();
function store(client: QueryClient) {
  let value = stores.get(client);
  if (!value) {
    value = new Map();
    stores.set(client, value);
  }
  return value;
}
const hash = (key: QueryKey) => JSON.stringify(key);
function paint(client: QueryClient, entry: Entry) {
  let value = entry.base;
  for (const { apply } of entry.layers.values()) value = apply(value);
  if (value === undefined)
    client.removeQueries({ queryKey: entry.key, exact: true });
  else client.setQueryData(entry.key, value);
}
export function isOptimistic(client: QueryClient, key: QueryKey) {
  return !!store(client).get(hash(key))?.layers.size;
}
/** Layered rollback: failing one mutation never restores over a newer mutation. */
export async function optimistic(
  client: QueryClient,
  patches: { key: QueryKey; apply: Patch }[],
  group?: string,
) {
  const token = Symbol("optimistic mutation");
  if (patches.some((p) => p.key[0] === "jobs" || p.key[0] === "projects"))
    await client.cancelQueries({ queryKey: ["server-state"] });
  await Promise.all(
    patches.map(({ key }) =>
      client.cancelQueries({ queryKey: key, exact: true }),
    ),
  );
  // Validate every projection before touching any cache; a bad patch is atomic too.
  const staged = patches.map(({ key, apply }) => {
    const existing = store(client).get(hash(key));
    const entry: Entry = existing
      ? { ...existing, layers: new Map(existing.layers) }
      : { key, base: client.getQueryData(key), layers: new Map() };
    entry.layers.set(token, { apply, group });
    let value = entry.base;
    for (const layer of entry.layers.values()) value = layer.apply(value);
    return { entry, value };
  });
  for (const { entry, value } of staged) {
    store(client).set(hash(entry.key), entry);
    client.setQueryData(entry.key, value);
  }
  return {
    rollbackGroup() {
      for (const [id, entry] of store(client)) {
        for (const [layerId, layer] of entry.layers)
          if (layer.group === group) entry.layers.delete(layerId);
        paint(client, entry);
        if (!entry.layers.size) store(client).delete(id);
      }
    },
    settle(
      committed: boolean,
      authoritative?: (key: QueryKey, base: any) => any,
    ) {
      for (const { key } of patches) {
        const entry = store(client).get(hash(key));
        const apply = entry?.layers.get(token)?.apply;
        if (!entry || !apply) continue;
        if (committed)
          entry.base = authoritative
            ? authoritative(key, entry.base)
            : apply(entry.base);
        entry.layers.delete(token);
        paint(client, entry);
        if (!entry.layers.size) store(client).delete(hash(key));
      }
    },
  };
}
export type OptimisticContext = Awaited<ReturnType<typeof optimistic>>;

/** Read cancellation covers requests already in flight; this covers new polls/focus refetches. */
export async function guardedRead<T>(
  client: QueryClient,
  key: QueryKey,
  read: () => Promise<T>,
): Promise<T> {
  if (isOptimistic(client, key)) return client.getQueryData<T>(key)!;
  return read();
}

/** Promote validated results without erasing an unrelated optimistic layer. */
export function updateConfirmed<T>(
  client: QueryClient,
  key: QueryKey,
  update: (old: T | undefined) => T,
) {
  const entry = store(client).get(hash(key));
  if (entry) {
    entry.base = update(entry.base as T);
    paint(client, entry);
  } else client.setQueryData<T>(key, update);
}
