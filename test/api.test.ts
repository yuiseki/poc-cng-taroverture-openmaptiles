import { test } from "node:test";
import assert from "node:assert/strict";
import { gunzipSync } from "node:zlib";
import { VectorTile } from "@mapbox/vector-tile";
import Protobuf from "pbf";
import { buildApp } from "../src/index.js";
import type { TileSources } from "../src/sources.js";
import { makeMvt, polygon } from "./helpers.js";

// 実ネットワークに出ないフェイクの PMTiles ソース
function fakeSources(): TileSources {
  const buildingsTile = makeMvt("building", [
    { type: 3, properties: { height: 15 }, loadGeometry: polygon },
  ]);
  return {
    buildings: { getZxy: async () => ({ data: buildingsTile }) },
    places: { getZxy: async () => undefined },
  };
}

test("GET /health は ok を返す", async () => {
  const app = buildApp({ sources: fakeSources() });
  const res = await app.inject({ url: "/health" });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.json(), { status: "ok" });
  await app.close();
});

test("GET /tiles/raw/tile.json は TileJSON を返す", async () => {
  const app = buildApp({ sources: fakeSources() });
  const res = await app.inject({ url: "/tiles/raw/tile.json" });
  assert.equal(res.statusCode, 200);
  const tj = res.json();
  assert.equal(tj.tilejson, "3.0.0");
  assert.ok(tj.tiles[0].endsWith("/tiles/raw/{z}/{x}/{y}.mvt"));
  assert.ok(tj.vector_layers.some((l: { id: string }) => l.id === "segment"));
  await app.close();
});

test("GET /tiles/raw/z/x/y.mvt はマージ済み gzip MVT を返す", async () => {
  const app = buildApp({ sources: fakeSources() });
  const res = await app.inject({ url: "/tiles/raw/14/14552/6451.mvt" });
  assert.equal(res.statusCode, 200);
  assert.equal(res.headers["content-encoding"], "gzip");
  const tile = new VectorTile(new Protobuf(gunzipSync(res.rawPayload)));
  assert.deepEqual(Object.keys(tile.layers), ["building"]);
  assert.equal(tile.layers.building.feature(0).properties.height, 15);
  await app.close();
});

test("GET /tiles/omt/z/x/y.mvt は OMT スキーマに変換して返す", async () => {
  const app = buildApp({ sources: fakeSources() });
  const res = await app.inject({ url: "/tiles/omt/14/14552/6451.mvt" });
  assert.equal(res.statusCode, 200);
  const tile = new VectorTile(new Protobuf(gunzipSync(res.rawPayload)));
  assert.equal(tile.layers.building.feature(0).properties.render_height, 15);
  await app.close();
});

test("不正な mode は 404", async () => {
  const app = buildApp({ sources: fakeSources() });
  const res = await app.inject({ url: "/tiles/bogus/14/0/0.mvt" });
  assert.equal(res.statusCode, 404);
  await app.close();
});

test("範囲外のタイル座標は 400", async () => {
  const app = buildApp({ sources: fakeSources() });
  const res = await app.inject({ url: "/tiles/raw/2/100/0.mvt" });
  assert.equal(res.statusCode, 400);
  await app.close();
});

test("全テーマ空タイルなら 204", async () => {
  const app = buildApp({
    sources: { buildings: { getZxy: async () => undefined } },
  });
  const res = await app.inject({ url: "/tiles/raw/14/0/0.mvt" });
  assert.equal(res.statusCode, 204);
  await app.close();
});

test("GET /styles/osm-bright は openmaptiles の url を自サーバに書き換えて返す", async () => {
  const app = buildApp({ sources: fakeSources() });
  const res = await app.inject({ url: "/styles/osm-bright" });
  assert.equal(res.statusCode, 200);
  const style = res.json();
  assert.equal(style.name, "Bright");
  assert.ok(style.sources.openmaptiles.url.endsWith("/tiles/omt/tile.json"));
  assert.ok(!style.sources.openmaptiles.url.startsWith("pmtiles://"));
  await app.close();
});

test("X-Forwarded-Proto: https のとき tile.json と styles の URL が https になる (TLS 終端プロキシ対応)", async () => {
  const app = buildApp({ sources: fakeSources() });
  const tj = await app.inject({
    url: "/tiles/omt/tile.json",
    headers: { "x-forwarded-proto": "https", host: "tiles.example.com" },
  });
  assert.ok(tj.json().tiles[0].startsWith("https://tiles.example.com/"));
  const style = await app.inject({
    url: "/styles/osm-bright",
    headers: { "x-forwarded-proto": "https", host: "tiles.example.com" },
  });
  assert.ok(style.json().sources.openmaptiles.url.startsWith("https://tiles.example.com/"));
  await app.close();
});

test("GET /styles/unknown は 404", async () => {
  const app = buildApp({ sources: fakeSources() });
  const res = await app.inject({ url: "/styles/unknown" });
  assert.equal(res.statusCode, 404);
  await app.close();
});

test("2回目のリクエストはキャッシュから返る (upstream 1回のみ)", async () => {
  let calls = 0;
  const buildingsTile = makeMvt("building", [{ type: 3, properties: {}, loadGeometry: polygon }]);
  const app = buildApp({
    sources: {
      buildings: {
        getZxy: async () => {
          calls += 1;
          return { data: buildingsTile };
        },
      },
    },
  });
  await app.inject({ url: "/tiles/raw/14/100/100.mvt" });
  await app.inject({ url: "/tiles/raw/14/100/100.mvt" });
  assert.equal(calls, 1);
  await app.close();
});
