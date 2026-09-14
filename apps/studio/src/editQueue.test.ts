import { it, expect } from "vitest";
import { EditQueue } from "./editQueue";
it("keeps rapid edits in order and reads the revision when executing", async () => {
  const queue = new EditQueue();
  let revision = 1;
  const seen: number[] = [];
  await Promise.all(
    Array.from({ length: 15 }, () =>
      queue.enqueue(async () => {
        const expected = revision;
        await Promise.resolve();
        expect(revision).toBe(expected);
        seen.push(++revision);
      }),
    ),
  );
  expect(seen).toEqual(Array.from({ length: 15 }, (_, i) => i + 2));
});
it("cancels dependent writes after conflict but accepts later deliberate retry", async () => {
  const queue = new EditQueue();
  let ran = false;
  const results = await Promise.allSettled([
    queue.enqueue(async () => {
      throw new Error("Conflict");
    }),
    queue.enqueue(async () => {
      ran = true;
    }),
  ]);
  expect(results.every((r) => r.status === "rejected")).toBe(true);
  expect(ran).toBe(false);
  expect(await queue.enqueue(async () => 42)).toBe(42);
});
