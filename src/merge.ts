// 複数テーマの MVT を 1 枚のタイルにマージする。
// スキーマ変換ロジックは持たない。変換は transform 関数 (純粋関数) に委譲し、
// このモジュールは MVT のデコード・ジオメトリの引き回し・再エンコードだけを担う。
import { VectorTile } from "@mapbox/vector-tile";
import Protobuf from "pbf";
import vtpbf, { type VtPbfFeature, type VtPbfLayer } from "vt-pbf";
import { THEME_MAXZOOM, type TileSources } from "./sources.js";
import type { TransformFn, Properties } from "./transform/index.js";

export interface ThemeTile {
  theme: string;
  data: Uint8Array;
}

// 各テーマの PMTiles から z/x/y のタイルを並列取得する。
// 戻り値: [{theme, data}] (存在しないテーマはスキップ)
export async function fetchThemeTiles(
  sources: TileSources,
  z: number,
  x: number,
  y: number,
): Promise<ThemeTile[]> {
  const entries = Object.entries(sources);
  const results = await Promise.all(
    entries.map(async ([theme, pm]): Promise<ThemeTile | null> => {
      const maxzoom = THEME_MAXZOOM[theme];
      if (maxzoom !== undefined && z > maxzoom) return null;
      const resp = await pm.getZxy(z, x, y);
      if (!resp || !resp.data || resp.data.byteLength === 0) return null;
      return { theme, data: new Uint8Array(resp.data as ArrayBuffer) };
    }),
  );
  return results.filter((r): r is ThemeTile => r !== null);
}

// themeTiles をデコードし、transform を通して出力レイヤーを組み立て、
// 1 枚の MVT (非圧縮 Buffer) にエンコードする。フィーチャが 0 件なら null。
export function mergeTiles(
  themeTiles: ThemeTile[],
  transform: TransformFn,
  zoom: number,
): Buffer | null {
  const outLayers = new Map<string, { extent: number; features: VtPbfFeature[] }>();
  for (const { theme, data } of themeTiles) {
    const tile = new VectorTile(new Protobuf(data));
    for (const name of Object.keys(tile.layers)) {
      const layer = tile.layers[name];
      for (let i = 0; i < layer.length; i++) {
        const feature = layer.feature(i);
        const outputs = transform({
          theme,
          layer: name,
          zoom,
          type: feature.type,
          properties: feature.properties,
        });
        for (const out of outputs) {
          let target = outLayers.get(out.layer);
          if (!target) {
            target = { extent: layer.extent, features: [] };
            outLayers.set(out.layer, target);
          }
          target.features.push({
            type: feature.type,
            properties: sanitizeProperties(out.properties),
            // ジオメトリはタイル座標のまま無変換で引き回す
            loadGeometry: () => feature.loadGeometry(),
          });
        }
      }
    }
  }
  if (outLayers.size === 0) return null;
  const layers: Record<string, VtPbfLayer> = {};
  for (const [name, { extent, features }] of outLayers) {
    layers[name] = {
      version: 2,
      name,
      extent,
      length: features.length,
      feature: (i) => features[i],
    };
  }
  return Buffer.from(vtpbf.fromVectorTileJs({ layers }));
}

// MVT の value 型は string / number / boolean のみ。
// null / undefined は削除し、オブジェクトは JSON 文字列化する。
function sanitizeProperties(properties: Properties): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {};
  for (const [k, v] of Object.entries(properties)) {
    if (v === null || v === undefined) continue;
    if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") {
      out[k] = v;
    } else {
      out[k] = JSON.stringify(v);
    }
  }
  return out;
}
