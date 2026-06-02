import { test } from "node:test";
import assert from "node:assert/strict";
import { gunzipSync } from "node:zlib";
import { VectorTile } from "@mapbox/vector-tile";
import Protobuf from "pbf";
import { place, poiPostProcess } from "../src/transform/omt/poi.js";
import { omtPostProcessors } from "../src/transform/omt/index.js";
import { mergeTiles } from "../src/merge.js";
import { createRegistryTransform } from "../src/transform/index.js";
import { omtRegistry } from "../src/transform/omt/index.js";
import { makeMvt, point } from "./helpers.js";

const input = (properties: Record<string, unknown>) => ({
  theme: "places",
  layer: "place",
  zoom: 14,
  type: 1,
  properties: { "@name": "テスト店", basic_category: "restaurant", ...properties },
});

// ---- 変換器: confidence 下限と richness スコア ----

test("poi: confidence 0.7 未満は破棄される", () => {
  assert.equal(place(input({ confidence: 0.69 })).length, 0);
  assert.equal(place(input({ confidence: 0.7 })).length, 1);
  assert.equal(place(input({ confidence: 0.95 })).length, 1);
});

test("poi: confidence がないものは破棄される", () => {
  assert.equal(place(input({})).length, 0);
});

test("poi: 属性の充実度が _score になる", () => {
  const bare = place(input({ confidence: 0.8 }));
  assert.equal(bare[0]?.properties._score, 0);
  const rich = place(
    input({
      confidence: 0.8,
      websites: '["https://example.com"]',
      phones: '["+81000000000"]',
      socials: '["https://facebook.com/x"]',
      emails: '["a@example.com"]',
      brand: '{"names":{"primary":"チェーン"}}',
    }),
  );
  assert.equal(rich[0]?.properties._score, 5);
});

test("poi: 空配列・空 brand はスコアに数えない", () => {
  const out = place(input({ confidence: 0.8, websites: "[]", brand: '{"names":{}}' }));
  assert.equal(out[0]?.properties._score, 0);
});

// ---- 後処理: ソート・キャップ・rank 付与 ----

function feat(score: number, confidence: number, name = "x") {
  const properties: Record<string, unknown> = {
    name,
    class: "restaurant",
    subclass: "restaurant",
    _score: score,
    _confidence: confidence,
  };
  return { type: 1, properties };
}

test("poiPostProcess: _score 降順、同点は _confidence 降順でソートされる", () => {
  const out = poiPostProcess([feat(1, 0.8, "low"), feat(3, 0.7, "high"), feat(1, 0.9, "mid")]);
  assert.deepEqual(
    out.map((f) => f.properties.name),
    ["high", "mid", "low"],
  );
});

test("poiPostProcess: 1000 件にキャップされる", () => {
  const many = Array.from({ length: 1500 }, (_, i) => feat(i % 6, 0.8, `f${i}`));
  assert.equal(poiPostProcess(many).length, 1000);
});

test("poiPostProcess: 順位帯で rank 10-50 が付与され、内部属性は除去される", () => {
  // OMT スタイルの流儀: rank<=14 が z14、15-24 が z15、>=25 が z16 で表示される
  const many = Array.from({ length: 800 }, (_, i) => feat(800 - i, 0.8, `f${i}`));
  const out = poiPostProcess(many);
  assert.equal(out[0].properties.rank, 10);
  assert.equal(out[99].properties.rank, 10);
  assert.equal(out[100].properties.rank, 20);
  assert.equal(out[249].properties.rank, 20);
  assert.equal(out[250].properties.rank, 30);
  assert.equal(out[499].properties.rank, 30);
  assert.equal(out[500].properties.rank, 40);
  assert.equal(out[749].properties.rank, 40);
  assert.equal(out[750].properties.rank, 50);
  assert.equal(out[0].properties._score, undefined);
  assert.equal(out[0].properties._confidence, undefined);
});

// ---- merge 統合: postProcessors 経由で適用される ----

test("mergeTiles: postProcessors が poi レイヤーに適用される", () => {
  const features = [
    { type: 1, properties: { "@name": "貧弱", basic_category: "restaurant", confidence: 0.75 }, loadGeometry: point },
    {
      type: 1,
      properties: {
        "@name": "充実",
        basic_category: "restaurant",
        confidence: 0.75,
        websites: '["https://example.com"]',
        phones: '["+81000000000"]',
      },
      loadGeometry: point,
    },
    { type: 1, properties: { "@name": "低信頼", basic_category: "restaurant", confidence: 0.5 }, loadGeometry: point },
  ];
  const data = makeMvt("place", features as never);
  const merged = mergeTiles(
    [{ theme: "places", data }],
    createRegistryTransform(omtRegistry),
    14,
    omtPostProcessors,
  );
  assert.ok(merged);
  const tile = new VectorTile(new Protobuf(merged));
  const l = tile.layers.poi;
  // 低信頼は変換器で落ち、残り 2 件が充実度順
  assert.equal(l.length, 2);
  assert.equal(l.feature(0).properties.name, "充実");
  assert.equal(l.feature(0).properties.rank, 10);
  assert.equal(l.feature(0).properties._score, undefined);
  assert.equal(l.feature(1).properties.name, "貧弱");
});
