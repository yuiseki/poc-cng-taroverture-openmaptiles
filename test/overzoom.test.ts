import { test } from "node:test";
import assert from "node:assert/strict";
import { VectorTile } from "@mapbox/vector-tile";
import Protobuf from "pbf";
import { mergeTiles, fetchThemeTiles } from "../src/merge.js";
import { passthroughTransform } from "../src/transform/index.js";
import type { TileSources } from "../src/sources.js";
import { makeMvt } from "./helpers.js";

test("fetchThemeTiles: maxzoom 超過のテーマは親タイルを取得して overzoom 情報を返す", async () => {
  const calls: Array<[number, number, number]> = [];
  const data = makeMvt("division_boundary", [
    {
      type: 2,
      properties: { subtype: "county" },
      loadGeometry: () => [[{ x: 0, y: 0 }, { x: 4096, y: 4096 }]],
    },
  ]);
  const sources: TileSources = {
    divisions: {
      getZxy: async (z, x, y) => {
        calls.push([z, x, y]);
        return { data };
      },
    },
  };
  // divisions の maxzoom は 12。z14 の (14552, 6451) の祖先は z12 の (3638, 1612)
  const result = await fetchThemeTiles(sources, 14, 14552, 6451);
  assert.deepEqual(calls, [[12, 3638, 1612]]);
  assert.equal(result.length, 1);
  assert.equal(result[0].scale, 4);
  // 14552 - (3638 << 2) = 0, 6451 - (1612 << 2) = 3
  assert.equal(result[0].dx, 0);
  assert.equal(result[0].dy, 3);
});

test("fetchThemeTiles: maxzoom 以下は通常取得 (scale=1)", async () => {
  const data = makeMvt("water", [
    { type: 3, properties: {}, loadGeometry: () => [[{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 0 }]] },
  ]);
  const sources: TileSources = {
    base: { getZxy: async () => ({ data }) },
  };
  const result = await fetchThemeTiles(sources, 13, 100, 100);
  assert.equal(result[0].scale, 1);
  assert.equal(result[0].dx, 0);
  assert.equal(result[0].dy, 0);
});

test("mergeTiles: overzoom でジオメトリがスケール・オフセットされる", () => {
  // 親タイル (extent 4096) の左上象限 (dx=0, dy=0)、scale=2
  // 親座標 (1024, 512) -> 子座標 (1024*2 - 0, 512*2 - 0) = (2048, 1024)
  const data = makeMvt("water", [
    {
      type: 3,
      properties: { class: "lake" },
      loadGeometry: () => [
        [
          { x: 1024, y: 512 },
          { x: 1536, y: 512 },
          { x: 1536, y: 1024 },
          { x: 1024, y: 512 },
        ],
      ],
    },
  ]);
  const merged = mergeTiles(
    [{ theme: "base", data, scale: 2, dx: 0, dy: 0 }],
    passthroughTransform,
    14,
  );
  assert.ok(merged);
  const tile = new VectorTile(new Protobuf(merged));
  const geom = tile.layers.water.feature(0).loadGeometry();
  assert.deepEqual({ x: geom[0][0].x, y: geom[0][0].y }, { x: 2048, y: 1024 });
  assert.deepEqual({ x: geom[0][1].x, y: geom[0][1].y }, { x: 3072, y: 1024 });
});

test("mergeTiles: overzoom で右下象限のオフセットが効く", () => {
  // scale=2, dx=1, dy=1: 親座標 (3072, 3072) -> 3072*2 - 1*4096 = 2048
  const data = makeMvt("water", [
    {
      type: 3,
      properties: {},
      loadGeometry: () => [
        [
          { x: 3072, y: 3072 },
          { x: 3584, y: 3072 },
          { x: 3584, y: 3584 },
          { x: 3072, y: 3072 },
        ],
      ],
    },
  ]);
  const merged = mergeTiles(
    [{ theme: "base", data, scale: 2, dx: 1, dy: 1 }],
    passthroughTransform,
    14,
  );
  assert.ok(merged);
  const tile = new VectorTile(new Protobuf(merged));
  const geom = tile.layers.water.feature(0).loadGeometry();
  assert.deepEqual({ x: geom[0][0].x, y: geom[0][0].y }, { x: 2048, y: 2048 });
});

test("mergeTiles: 子タイル範囲外のフィーチャは bbox 判定で破棄される", () => {
  // scale=2, dx=0, dy=0 (左上象限) に対して、右下象限にしかないフィーチャ
  const data = makeMvt("water", [
    {
      type: 3,
      properties: {},
      loadGeometry: () => [
        [
          { x: 3000, y: 3000 },
          { x: 3500, y: 3000 },
          { x: 3500, y: 3500 },
          { x: 3000, y: 3000 },
        ],
      ],
    },
    {
      type: 3,
      properties: {},
      loadGeometry: () => [
        [
          { x: 100, y: 100 },
          { x: 500, y: 100 },
          { x: 500, y: 500 },
          { x: 100, y: 100 },
        ],
      ],
    },
  ]);
  const merged = mergeTiles(
    [{ theme: "base", data, scale: 2, dx: 0, dy: 0 }],
    passthroughTransform,
    14,
  );
  assert.ok(merged);
  const tile = new VectorTile(new Protobuf(merged));
  // 範囲外の 1 件目は落ち、範囲内の 2 件目だけ残る
  assert.equal(tile.layers.water.length, 1);
  const geom = tile.layers.water.feature(0).loadGeometry();
  assert.deepEqual({ x: geom[0][0].x, y: geom[0][0].y }, { x: 200, y: 200 });
});

test("mergeTiles: scale=1 では従来どおり無変換", () => {
  const data = makeMvt("water", [
    {
      type: 3,
      properties: {},
      loadGeometry: () => [
        [
          { x: 10, y: 10 },
          { x: 20, y: 10 },
          { x: 20, y: 20 },
          { x: 10, y: 10 },
        ],
      ],
    },
  ]);
  const merged = mergeTiles(
    [{ theme: "base", data, scale: 1, dx: 0, dy: 0 }],
    passthroughTransform,
    13,
  );
  assert.ok(merged);
  const tile = new VectorTile(new Protobuf(merged));
  const geom = tile.layers.water.feature(0).loadGeometry();
  assert.deepEqual({ x: geom[0][0].x, y: geom[0][0].y }, { x: 10, y: 10 });
});
