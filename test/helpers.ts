// テスト用の合成 MVT を作る (vector-tile-js 互換の最小インターフェース)
import vtpbf, { type VtPbfFeature } from "vt-pbf";

export function makeMvt(layerName: string, features: VtPbfFeature[], extent = 4096): Uint8Array {
  const layer = {
    version: 2,
    name: layerName,
    extent,
    length: features.length,
    feature: (i: number) => features[i],
  };
  return new Uint8Array(vtpbf.fromVectorTileJs({ layers: { [layerName]: layer } }));
}

export const polygon = () => [
  [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 100, y: 100 },
    { x: 0, y: 0 },
  ],
];

export const point = () => [[{ x: 50, y: 50 }]];
