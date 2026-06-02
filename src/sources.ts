// Overture テーマ別 PMTiles のリモートソース管理。
// HTTP Range リクエストでタイル単位の部分取得を行う (pmtiles ライブラリが
// ヘッダ・ディレクトリのキャッシュと leaf directory の解決を担当する)。
import { PMTiles, FetchSource } from "pmtiles";

export const DEFAULT_BASE_URL = "https://dev.smellman.org/static/overture-latest/";

// テーマ名 -> そのテーマに含まれるレイヤー名 (2026-06 時点の実測値)
export const THEMES: Record<string, string[]> = {
  addresses: ["address"],
  base: ["bathymetry", "infrastructure", "land", "land_cover", "land_use", "water"],
  buildings: ["building", "building_part"],
  divisions: ["division", "division_area", "division_boundary"],
  places: ["place"],
  transportation: ["connector", "segment"],
};

// テーマごとの maxzoom (これを超えるズームはタイルが存在しない)
export const THEME_MAXZOOM: Record<string, number> = {
  addresses: 14,
  base: 13,
  buildings: 14,
  divisions: 12,
  places: 14,
  transportation: 14,
};

// merge.ts が必要とする最小限のタイルソース面。
// PMTiles インスタンスも、テスト用フェイクもこれを満たす (構造的型付け)。
export interface TileSource {
  getZxy(z: number, x: number, y: number): Promise<{ data?: ArrayBuffer | Uint8Array } | undefined>;
}

export type TileSources = Record<string, TileSource>;

export interface CreateSourcesOptions {
  baseUrl?: string;
  themes?: string[];
}

export function createSources({
  baseUrl = DEFAULT_BASE_URL,
  themes = Object.keys(THEMES),
}: CreateSourcesOptions = {}): TileSources {
  const headers = new Headers({ "user-agent": "poc-cng-taroverture-merge-tile/0.1" });
  const sources: TileSources = {};
  for (const theme of themes) {
    sources[theme] = new PMTiles(new FetchSource(`${baseUrl}${theme}.pmtiles`, headers));
  }
  return sources;
}
