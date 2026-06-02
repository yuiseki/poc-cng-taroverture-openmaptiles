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
  /** overzoom 倍率 (1 = 等倍)。z がテーマの maxzoom を超えたとき 2^(z - maxzoom) */
  scale?: number;
  /** 親タイル内での子タイルの象限オフセット (0 <= dx,dy < scale) */
  dx?: number;
  dy?: number;
}

// 各テーマの PMTiles から z/x/y のタイルを並列取得する。
// テーマの maxzoom を超えるズームでは祖先タイル (maxzoom) を取得し、
// overzoom 情報 (scale, dx, dy) を付けて返す。存在しないテーマはスキップ。
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
      let fz = z;
      let fx = x;
      let fy = y;
      let scale = 1;
      let dx = 0;
      let dy = 0;
      if (maxzoom !== undefined && z > maxzoom) {
        const depth = z - maxzoom;
        fz = maxzoom;
        fx = x >> depth;
        fy = y >> depth;
        scale = 2 ** depth;
        dx = x - (fx << depth);
        dy = y - (fy << depth);
      }
      const resp = await pm.getZxy(fz, fx, fy);
      if (!resp || !resp.data || resp.data.byteLength === 0) return null;
      return { theme, data: new Uint8Array(resp.data as ArrayBuffer), scale, dx, dy };
    }),
  );
  return results.filter((r): r is ThemeTile => r !== null);
}

// overzoom: 親タイル座標 p を子タイル座標 c = p * scale - d * extent に変換し、
// 子タイル範囲 (バッファ付き) に bbox がかからないフィーチャは null を返す。
// ポリゴンの厳密なクリップはしない (レンダラ側でクリップされる前提の PoC 判断)。
const OVERZOOM_BUFFER = 256;

function overzoomGeometry(
  geometry: Array<Array<{ x: number; y: number }>>,
  scale: number,
  dx: number,
  dy: number,
  extent: number,
): Array<Array<{ x: number; y: number }>> | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const out = geometry.map((ring) =>
    ring.map((p) => {
      const x = p.x * scale - dx * extent;
      const y = p.y * scale - dy * extent;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
      return { x, y };
    }),
  );
  const lo = -OVERZOOM_BUFFER;
  const hi = extent + OVERZOOM_BUFFER;
  if (maxX < lo || maxY < lo || minX > hi || minY > hi) return null;
  return out;
}

// themeTiles をデコードし、transform を通して出力レイヤーを組み立て、
// 1 枚の MVT (非圧縮 Buffer) にエンコードする。フィーチャが 0 件なら null。
export function mergeTiles(
  themeTiles: ThemeTile[],
  transform: TransformFn,
  zoom: number,
): Buffer | null {
  const outLayers = new Map<string, { extent: number; features: VtPbfFeature[] }>();
  for (const { theme, data, scale = 1, dx = 0, dy = 0 } of themeTiles) {
    const tile = new VectorTile(new Protobuf(data));
    for (const name of Object.keys(tile.layers)) {
      const layer = tile.layers[name];
      for (let i = 0; i < layer.length; i++) {
        const feature = layer.feature(i);

        // overzoom 時はジオメトリを子タイル座標へ変換し、範囲外なら捨てる。
        // 等倍時はタイル座標のまま無変換で引き回す。
        let loadGeometry: () => Array<Array<{ x: number; y: number }>>;
        if (scale !== 1) {
          const transformed = overzoomGeometry(
            feature.loadGeometry(),
            scale,
            dx,
            dy,
            layer.extent,
          );
          if (transformed === null) continue;
          loadGeometry = () => transformed;
        } else {
          loadGeometry = () => feature.loadGeometry();
        }

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
            loadGeometry,
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
