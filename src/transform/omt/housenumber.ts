// Overture addresses/address -> OpenMapTiles "housenumber" レイヤー
//
// 参考: openmaptiles/layers/housenumber/housenumber.yaml
// フィールドは housenumber 1 つだけの最小レイヤー。OMT では z14 のみに存在する。
// street / address_levels は OMT に対応フィールドがないため出力しない。
import type { TransformFn } from "../index.js";

const MIN_ZOOM = 14;

export const address: TransformFn = ({ zoom, properties }) => {
  if (zoom < MIN_ZOOM) return [];
  const number = properties.number;
  if (typeof number !== "string" || number === "") return [];
  return [{ layer: "housenumber", properties: { housenumber: number } }];
};
