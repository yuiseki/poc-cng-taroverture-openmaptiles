import { test } from "node:test";
import assert from "node:assert/strict";
import { address } from "../src/transform/omt/housenumber.js";

const input = (properties: Record<string, unknown>, zoom = 14) => ({
  theme: "addresses",
  layer: "address",
  zoom,
  type: 1,
  properties,
});

test("housenumber: number が housenumber になる", () => {
  const out = address(input({ number: "7-9", street: "神田錦町一丁目" }));
  assert.equal(out.length, 1);
  assert.equal(out[0].layer, "housenumber");
  assert.deepEqual(out[0].properties, { housenumber: "7-9" });
});

test("housenumber: number がなければ破棄される", () => {
  assert.equal(address(input({ street: "x" })).length, 0);
});

test("housenumber: z13 以下では破棄される (OMT housenumber は z14 のみ)", () => {
  assert.equal(address(input({ number: "1-1" }, 13)).length, 0);
});
