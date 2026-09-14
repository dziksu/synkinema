import { tr } from "./i18n";
/** Serializes user intent. A failed edit invalidates already queued dependent edits. */
export class EditQueue {
  private tail: Promise<unknown> = Promise.resolve();
  private generation = 0;
  enqueue<T>(work: () => Promise<T>): Promise<T> {
    const generation = this.generation;
    const next = this.tail.then(async () => {
      if (generation !== this.generation)
        throw new Error(
          tr("Pending edits were cancelled after a save error. Try again."),
        );
      try {
        return await work();
      } catch (error) {
        this.generation++;
        throw error;
      }
    });
    this.tail = next.catch(() => undefined);
    return next;
  }
}
