import { tr } from "@/lib/i18n";

/** History reads confirmed revisions, so its planning must wait for earlier
 * saves and their stack updates. Ordinary edits still project concurrently. */
export class EditHistoryQueue {
  private pending: Promise<void> = Promise.resolve();
  private history?: Promise<void>;
  private generation = 0;

  enqueue<T>(work: () => Promise<T>, history: boolean): Promise<T> {
    const generation = this.generation;
    const previous = this.pending;
    const task = (history ? previous : this.history || Promise.resolve()).then(
      () => {
        if (generation !== this.generation)
          throw new Error(
            tr("Pending edits were cancelled after a save error. Try again."),
          );
        return work();
      },
    );
    const settled = task.then(
      () => {},
      () => {
        if (generation === this.generation) this.generation++;
      },
    );
    this.pending = Promise.all([previous, settled]).then(() => {});
    if (history) {
      this.history = settled;
      void settled.then(() => {
        if (this.history === settled) this.history = undefined;
      });
    }
    return task;
  }
}
