import { test } from "node:test";
import assert from "node:assert/strict";
import { passthroughTransform, createRegistryTransform } from "../src/transform/index.js";
import { building } from "../src/transform/omt/building.js";
import { omtRegistry } from "../src/transform/omt/index.js";

test("passthroughTransform はレイヤー名と属性をそのまま返す", () => {
  const out = passthroughTransform({
    theme: "places",
    layer: "place",
    zoom: 10,
    type: 1,
    properties: { name: "Tokyo" },
  });
  assert.deepEqual(out, [{ layer: "place", properties: { name: "Tokyo" } }]);
});

test("createRegistryTransform は未登録レイヤーを破棄する", () => {
  const transform = createRegistryTransform({});
  const out = transform({ theme: "places", layer: "place", zoom: 10, type: 1, properties: {} });
  assert.deepEqual(out, []);
});

test("omtRegistry: buildings/building と building_part が登録済み", () => {
  assert.ok(omtRegistry["buildings/building"]);
  assert.ok(omtRegistry["buildings/building_part"]);
});

const buildingInput = (zoom: number, properties: Record<string, unknown>) => ({
  theme: "buildings",
  layer: "building",
  zoom,
  type: 3,
  properties,
});

test("building: height をそのまま render_height に使う", () => {
  const out = building(buildingInput(14, { height: 12.5 }));
  assert.equal(out.length, 1);
  assert.equal(out[0].layer, "building");
  assert.equal(out[0].properties.render_height, 12.5);
  assert.equal(out[0].properties.render_min_height, 0);
});

test("building: height がなければ num_floors * 3.66 で近似する", () => {
  const out = building(buildingInput(14, { num_floors: 10 }));
  assert.equal(out[0].properties.render_height, 36.6);
});

test("building: height も num_floors もなければ 5m とする", () => {
  const out = building(buildingInput(14, {}));
  assert.equal(out[0].properties.render_height, 5);
});

test("building: min_height は render_min_height になる", () => {
  const out = building(buildingInput(14, { height: 30, min_height: 12 }));
  assert.equal(out[0].properties.render_min_height, 12);
});

test("building: facade_color は colour になる", () => {
  const out = building(buildingInput(14, { facade_color: "#aabbcc" }));
  assert.equal(out[0].properties.colour, "#aabbcc");
});

test("building: z12 以下では破棄される", () => {
  const out = building(buildingInput(12, { height: 10 }));
  assert.deepEqual(out, []);
});

test("building: height が数値文字列でも数値化される", () => {
  const out = building(buildingInput(14, { height: "8.2" }));
  assert.equal(out[0].properties.render_height, 8.2);
});
