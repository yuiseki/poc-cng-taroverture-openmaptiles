// Overture base/water -> OpenMapTiles "water" レイヤー
//
// 参考: openmaptiles/layers/water/water.yaml
//   river: water = river, stream, canal, ditch, drain
//   pond:  water = pond, basin, wastewater, salt_pond
//   dock / ocean / swimming_pool はそのまま、その他は lake
//
// OMT の water はポリゴンレイヤーなので、spring / waterfall などの
// ポイントフィーチャは破棄する (OMT では water_name / waterway の領分)。
import type { TransformFn } from "../index.js";

const POLYGON = 3;

const RIVER_VALUES = new Set(["river", "stream", "canal", "ditch", "drain"]);
const POND_VALUES = new Set(["pond", "basin", "wastewater", "salt_pond"]);
const PASSTHROUGH_VALUES = new Set(["ocean", "swimming_pool", "dock"]);

export const water: TransformFn = ({ type, properties }) => {
  if (type !== POLYGON) return [];
  const cls = properties.class;
  if (typeof cls !== "string") return [];

  let omtClass: string;
  if (RIVER_VALUES.has(cls)) omtClass = "river";
  else if (POND_VALUES.has(cls)) omtClass = "pond";
  else if (PASSTHROUGH_VALUES.has(cls)) omtClass = cls;
  else omtClass = "lake";

  const out: Record<string, unknown> = { class: omtClass };
  if (properties.is_intermittent === true) out.intermittent = 1;
  return [{ layer: "water", properties: out }];
};
