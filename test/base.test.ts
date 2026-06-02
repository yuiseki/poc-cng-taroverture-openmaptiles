import { test } from "node:test";
import assert from "node:assert/strict";
import { water } from "../src/transform/omt/water.js";
import { land, landCover } from "../src/transform/omt/landcover.js";
import { landUse } from "../src/transform/omt/landuse.js";

const POLYGON = 3;
const LINE = 2;
const POINT = 1;

const input = (
  layer: string,
  properties: Record<string, unknown>,
  type = POLYGON,
  zoom = 13,
) => ({ theme: "base", layer, zoom, type, properties });

// ---- water ----

test("water: river/stream/canal/ditch/drain は class=river", () => {
  for (const cls of ["river", "stream", "canal", "ditch", "drain"]) {
    const out = water(input("water", { class: cls }));
    assert.equal(out[0]?.properties.class, "river", cls);
    assert.equal(out[0]?.layer, "water");
  }
});

test("water: pond 系は class=pond", () => {
  for (const cls of ["pond", "basin", "wastewater", "salt_pond"]) {
    assert.equal(water(input("water", { class: cls }))[0]?.properties.class, "pond", cls);
  }
});

test("water: swimming_pool / ocean はそのまま", () => {
  assert.equal(
    water(input("water", { class: "swimming_pool" }))[0]?.properties.class,
    "swimming_pool",
  );
  assert.equal(water(input("water", { class: "ocean" }))[0]?.properties.class, "ocean");
});

test("water: その他 (water/reservoir/moat) は class=lake", () => {
  for (const cls of ["water", "reservoir", "moat", "lake"]) {
    assert.equal(water(input("water", { class: cls }))[0]?.properties.class, "lake", cls);
  }
});

test("water: is_intermittent は intermittent=1", () => {
  const out = water(input("water", { class: "river", is_intermittent: true }));
  assert.equal(out[0]?.properties.intermittent, 1);
});

test("water: ポイント (spring/waterfall) は破棄される", () => {
  assert.equal(water(input("water", { class: "spring" }, POINT)).length, 0);
  assert.equal(water(input("water", { class: "waterfall" }, POINT)).length, 0);
});

// ---- landcover (land) ----

test("land: wood/forest は class=wood", () => {
  for (const cls of ["wood", "forest"]) {
    const out = land(input("land", { class: cls }));
    assert.equal(out[0]?.layer, "landcover", cls);
    assert.equal(out[0]?.properties.class, "wood", cls);
    assert.equal(out[0]?.properties.subclass, cls, cls);
  }
});

test("land: grass 系 (grassland/heath/scrub) は class=grass", () => {
  for (const cls of ["grassland", "heath", "scrub", "meadow"]) {
    assert.equal(land(input("land", { class: cls }))[0]?.properties.class, "grass", cls);
  }
});

test("land: sand / rock 系", () => {
  assert.equal(land(input("land", { class: "sand" }))[0]?.properties.class, "sand");
  assert.equal(land(input("land", { class: "stone" }))[0]?.properties.class, "rock");
  assert.equal(land(input("land", { class: "bare_rock" }))[0]?.properties.class, "rock");
});

test("land: wetland は class=wetland", () => {
  assert.equal(land(input("land", { class: "wetland" }))[0]?.properties.class, "wetland");
});

test("land: tree ポイントと tree_row ラインは破棄される", () => {
  assert.equal(land(input("land", { class: "tree" }, POINT)).length, 0);
  assert.equal(land(input("land", { class: "tree_row" }, LINE)).length, 0);
});

test("land: island/islet/land (背景陸地) は破棄される", () => {
  for (const cls of ["island", "islet", "land"]) {
    assert.equal(land(input("land", { class: cls })).length, 0, cls);
  }
});

// ---- landcover (land_cover) ----

test("land_cover: subtype からマッピングされる (class は undefined)", () => {
  const cases: Array<[string, string]> = [
    ["forest", "wood"],
    ["shrub", "grass"],
    ["grass", "grass"],
    ["crop", "farmland"],
    ["barren", "sand"],
    ["wetland", "wetland"],
    ["snow", "ice"],
  ];
  for (const [subtype, expected] of cases) {
    const out = landCover(input("land_cover", { subtype, class: "undefined" }));
    assert.equal(out[0]?.properties.class, expected, subtype);
    assert.equal(out[0]?.properties.subclass, subtype, subtype);
  }
});

test("land_cover: urban は破棄される", () => {
  assert.equal(landCover(input("land_cover", { subtype: "urban", class: "undefined" })).length, 0);
});

// ---- landuse ----

test("landuse: OMT enum と一致する class は素通し", () => {
  for (const cls of ["residential", "commercial", "school", "stadium", "pitch", "playground"]) {
    const out = landUse(input("land_use", { class: cls }));
    assert.equal(out[0]?.layer, "landuse", cls);
    assert.equal(out[0]?.properties.class, cls, cls);
  }
});

test("landuse: grave_yard は cemetery に集約", () => {
  assert.equal(landUse(input("land_use", { class: "grave_yard" }))[0]?.properties.class, "cemetery");
});

test("landuse: park/garden は park レイヤーへ", () => {
  for (const cls of ["park", "garden"]) {
    const out = landUse(input("land_use", { class: cls }));
    assert.equal(out[0]?.layer, "park", cls);
    assert.equal(out[0]?.properties.class, cls, cls);
  }
});

test("landuse: park の名前は park レイヤーに引き継がれる", () => {
  const out = landUse(input("land_use", { class: "park", "@name": "日比谷公園" }));
  assert.equal(out[0]?.properties.name, "日比谷公園");
});

test("landuse: grass/meadow/farmland 系は landcover へ", () => {
  const grass = landUse(input("land_use", { class: "grass" }));
  assert.equal(grass[0]?.layer, "landcover");
  assert.equal(grass[0]?.properties.class, "grass");
  const farm = landUse(input("land_use", { class: "farmland" }));
  assert.equal(farm[0]?.layer, "landcover");
  assert.equal(farm[0]?.properties.class, "farmland");
  const orchard = landUse(input("land_use", { class: "orchard" }));
  assert.equal(orchard[0]?.properties.class, "farmland");
});

test("landuse: OMT に対応のない class (construction/pedestrian 等) は破棄", () => {
  for (const cls of ["construction", "pedestrian", "plaza", "brownfield", "greenfield"]) {
    assert.equal(landUse(input("land_use", { class: cls })).length, 0, cls);
  }
});
