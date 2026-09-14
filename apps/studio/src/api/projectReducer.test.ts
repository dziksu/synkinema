import { expect, it } from "vitest";
import cases from "./generated/edit-cases.json";
import { projectAfter, type EditPlan } from "./projectReducer";
import type { ProjectSnapshot } from "./generated/client";
for (const example of cases)
  it(`matches server behavior for ${example.name}`, () => {
    const projected = projectAfter(
      example.before as ProjectSnapshot,
      example.plan as EditPlan,
    );
    expect(projected).toEqual({
      ...example.after,
      revision: example.before.revision,
    });
  });
