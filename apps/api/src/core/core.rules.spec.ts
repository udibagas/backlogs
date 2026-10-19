import assert from "node:assert/strict";
import test from "node:test";
import { createsDependencyCycle, isValidDateRange } from "./core.rules";

test("dependency checks reject self and indirect cycles", () => {
  const edges = [
    { itemId: "a", dependsOnId: "b" },
    { itemId: "b", dependsOnId: "c" }
  ];
  assert.equal(createsDependencyCycle("a", "a", edges), true);
  assert.equal(createsDependencyCycle("c", "a", edges), true);
  assert.equal(createsDependencyCycle("a", "c", edges), false);
});

test("dependency checks allow unrelated branches", () => {
  assert.equal(
    createsDependencyCycle("item-1", "item-2", [{ itemId: "item-3", dependsOnId: "item-4" }]),
    false
  );
});

test("Sprint dates allow missing bounds during planning but reject invalid ranges", () => {
  assert.equal(isValidDateRange(), true);
  assert.equal(isValidDateRange(new Date("2026-01-01"), undefined), true);
  assert.equal(isValidDateRange(new Date("2026-02-01"), new Date("2026-01-31")), false);
  assert.equal(isValidDateRange(new Date("2026-01-01"), new Date("2026-01-01")), false);
});
