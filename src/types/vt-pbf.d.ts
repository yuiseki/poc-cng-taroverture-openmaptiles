// vt-pbf は型定義を同梱していないので、本プロジェクトで使う最小限の面だけ宣言する。
// fromVectorTileJs は vector-tile-js 互換のレイヤーインターフェース
// ({version, name, extent, length, feature(i)}) を受け取って MVT バイト列を返す。
declare module "vt-pbf" {
  export interface VtPbfFeature {
    type: number;
    properties: Record<string, string | number | boolean>;
    loadGeometry: () => Array<Array<{ x: number; y: number }>>;
  }
  export interface VtPbfLayer {
    version: number;
    name: string;
    extent: number;
    length: number;
    feature: (i: number) => VtPbfFeature;
  }
  export function fromVectorTileJs(tile: { layers: Record<string, VtPbfLayer> }): Uint8Array;
  const vtpbf: { fromVectorTileJs: typeof fromVectorTileJs };
  export default vtpbf;
}
