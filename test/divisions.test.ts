import { test } from "node:test";
import assert from "node:assert/strict";
import { divisionBoundary, division } from "../src/transform/omt/divisions.js";

const LINE = 2;
const POINT = 1;

const boundaryInput = (properties: Record<string, unknown>, zoom = 12) => ({
  theme: "divisions",
  layer: "division_boundary",
  zoom,
  type: LINE,
  properties,
});

const divisionInput = (properties: Record<string, unknown>, zoom = 12) => ({
  theme: "divisions",
  layer: "division",
  zoom,
  type: POINT,
  properties,
});

// ---- division_boundary -> boundary ----

test("boundary: subtype から admin_level が決まる", () => {
  const cases: Array<[string, number]> = [
    ["country", 2],
    ["region", 4],
    ["county", 6],
    ["localadmin", 7],
    ["locality", 8],
    ["neighborhood", 10],
  ];
  for (const [subtype, expected] of cases) {
    const out = divisionBoundary(boundaryInput({ subtype, class: "land" }));
    assert.equal(out[0]?.layer, "boundary", subtype);
    assert.equal(out[0]?.properties.admin_level, expected, subtype);
  }
});

test("boundary: class=maritime は maritime=1、land は 0", () => {
  const maritime = divisionBoundary(boundaryInput({ subtype: "country", class: "maritime" }));
  assert.equal(maritime[0]?.properties.maritime, 1);
  const land = divisionBoundary(boundaryInput({ subtype: "country", class: "land" }));
  assert.equal(land[0]?.properties.maritime, 0);
});

test("boundary: is_disputed は disputed=1", () => {
  const out = divisionBoundary(
    boundaryInput({ subtype: "country", class: "land", is_disputed: true }),
  );
  assert.equal(out[0]?.properties.disputed, 1);
});

test("boundary: disputed なしは disputed=0", () => {
  const out = divisionBoundary(boundaryInput({ subtype: "country", class: "land" }));
  assert.equal(out[0]?.properties.disputed, 0);
});

test("boundary: 未知の subtype は破棄される", () => {
  assert.equal(divisionBoundary(boundaryInput({ subtype: "galaxy", class: "land" })).length, 0);
});

// ---- division -> place ----

test("place: country/region/county のマッピング", () => {
  const cases: Array<[string, string]> = [
    ["country", "country"],
    ["region", "state"],
    ["county", "province"],
    ["macrohood", "suburb"],
    ["neighborhood", "neighbourhood"],
    ["microhood", "neighbourhood"],
    ["borough", "borough"],
  ];
  for (const [subtype, expected] of cases) {
    const out = division(divisionInput({ subtype, "@name": "テスト" }));
    assert.equal(out[0]?.layer, "place", subtype);
    assert.equal(out[0]?.properties.class, expected, subtype);
  }
});

test("place: locality は Overture class (city/town/...) を使う", () => {
  const city = division(divisionInput({ subtype: "locality", class: "city", "@name": "東京" }));
  assert.equal(city[0]?.properties.class, "city");
  const hamlet = division(divisionInput({ subtype: "locality", class: "hamlet", "@name": "x" }));
  assert.equal(hamlet[0]?.properties.class, "hamlet");
  // class がない locality は town 扱い
  const noClass = division(divisionInput({ subtype: "locality", "@name": "x" }));
  assert.equal(noClass[0]?.properties.class, "town");
});

test("place: 多言語名が引き継がれる", () => {
  const out = division(
    divisionInput({
      subtype: "neighborhood",
      "@name": "千住東一丁目",
      names: '{"common":{"en":"Senju-azuma 1-chome","ja":"千住東一丁目"},"primary":"千住東一丁目"}',
    }),
  );
  assert.equal(out[0]?.properties.name, "千住東一丁目");
  assert.equal(out[0]?.properties.name_en, "Senju-azuma 1-chome");
  assert.equal(out[0]?.properties["name:ja"], "千住東一丁目");
});

test("place: 名前のない division は破棄される", () => {
  assert.equal(division(divisionInput({ subtype: "neighborhood" })).length, 0);
});
