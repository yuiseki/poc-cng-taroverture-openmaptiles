import { test } from "node:test";
import assert from "node:assert/strict";
import { VectorTile } from "@mapbox/vector-tile";
import Protobuf from "pbf";
import { mergeTiles, fetchThemeTiles } from "../src/merge.js";
import { passthroughTransform, createRegistryTransform } from "../src/transform/index.js";
import { omtRegistry } from "../src/transform/omt/index.js";
import type { TileSources } from "../src/sources.js";
import { makeMvt, polygon, point } from "./helpers.js";

test("mergeTiles: 2テーマのタイルが 1 枚にマージされる (passthrough)", () => {
  const buildingsTile = makeMvt("building", [
    { type: 3, properties: { height: 10 }, loadGeometry: polygon },
  ]);
  const placesTile = makeMvt("place", [
    { type: 1, properties: { name: "Tokyo" }, loadGeometry: point },
  ]);
  const merged = mergeTiles(
    [
      { theme: "buildings", data: buildingsTile },
      { theme: "places", data: placesTile },
    ],
    passthroughTransform,
    14,
  );
  assert.ok(merged instanceof Buffer);
  const tile = new VectorTile(new Protobuf(merged));
  assert.deepEqual(Object.keys(tile.layers).sort(), ["building", "place"]);
  assert.equal(tile.layers.building.length, 1);
  assert.equal(tile.layers.building.feature(0).properties.height, 10);
  assert.equal(tile.layers.place.feature(0).properties.name, "Tokyo");
});

test("mergeTiles: omt 変換でレイヤー名と属性が OMT スキーマになる", () => {
  const buildingsTile = makeMvt("building", [
    { type: 3, properties: { height: 20 }, loadGeometry: polygon },
  ]);
  const placesTile = makeMvt("place", [
    { type: 1, properties: { name: "Tokyo" }, loadGeometry: point },
  ]);
  const merged = mergeTiles(
    [
      { theme: "buildings", data: buildingsTile },
      { theme: "places", data: placesTile },
    ],
    createRegistryTransform(omtRegistry),
    14,
  );
  assert.ok(merged);
  const tile = new VectorTile(new Protobuf(merged));
  // place はレジストリ未登録なので落ちる
  assert.deepEqual(Object.keys(tile.layers), ["building"]);
  const f = tile.layers.building.feature(0);
  assert.equal(f.properties.render_height, 20);
  assert.equal(f.properties.render_min_height, 0);
  // 入力属性はコピーされない
  assert.equal(f.properties.height, undefined);
});

test("mergeTiles: 全フィーチャが破棄されたら null を返す", () => {
  const buildingsTile = makeMvt("building", [
    { type: 3, properties: { height: 10 }, loadGeometry: polygon },
  ]);
  const merged = mergeTiles([{ theme: "buildings", data: buildingsTile }], () => [], 14);
  assert.equal(merged, null);
});

test("mergeTiles: 入力 0 件なら null を返す", () => {
  assert.equal(mergeTiles([], passthroughTransform, 14), null);
});

test("mergeTiles: null 属性は削除されオブジェクト属性は JSON 文字列化される", () => {
  const tileData = makeMvt("place", [
    { type: 1, properties: { name: "Tokyo" }, loadGeometry: point },
  ]);
  // transform の出力に直接 null / object を混ぜて sanitize を検証する
  const merged = mergeTiles(
    [{ theme: "places", data: tileData }],
    () => [{ layer: "place", properties: { name: "Tokyo", empty: null, meta: { a: 1 } } }],
    14,
  );
  assert.ok(merged);
  const tile = new VectorTile(new Protobuf(merged));
  const f = tile.layers.place.feature(0);
  assert.equal(f.properties.name, "Tokyo");
  assert.equal(f.properties.empty, undefined);
  assert.equal(f.properties.meta, JSON.stringify({ a: 1 }));
});

test("mergeTiles: ジオメトリが保持される", () => {
  const buildingsTile = makeMvt("building", [{ type: 3, properties: {}, loadGeometry: polygon }]);
  const merged = mergeTiles(
    [{ theme: "buildings", data: buildingsTile }],
    passthroughTransform,
    14,
  );
  assert.ok(merged);
  const tile = new VectorTile(new Protobuf(merged));
  const geom = tile.layers.building.feature(0).loadGeometry();
  assert.equal(geom.length, 1);
  assert.equal(geom[0].length, 4);
  assert.deepEqual({ x: geom[0][1].x, y: geom[0][1].y }, { x: 100, y: 0 });
});

test("fetchThemeTiles: maxzoom 超過のテーマはリクエストせずスキップする", async () => {
  let called = false;
  const sources: TileSources = {
    divisions: {
      getZxy: async () => {
        called = true;
        return { data: new Uint8Array([1]) };
      },
    },
  };
  // divisions の maxzoom は 12 なので z14 はスキップされる
  const result = await fetchThemeTiles(sources, 14, 0, 0);
  assert.equal(called, false);
  assert.deepEqual(result, []);
});

test("fetchThemeTiles: タイルが存在しないテーマは結果から除外される", async () => {
  const data = makeMvt("place", [{ type: 1, properties: {}, loadGeometry: point }]);
  const sources: TileSources = {
    places: { getZxy: async () => ({ data }) },
    buildings: { getZxy: async () => undefined },
  };
  const result = await fetchThemeTiles(sources, 10, 0, 0);
  assert.equal(result.length, 1);
  assert.equal(result[0].theme, "places");
});
