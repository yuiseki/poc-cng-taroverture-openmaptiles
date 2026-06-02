// Overture buildings テーマ -> OpenMapTiles "building" レイヤー
//
// OMT 側のフィールド定義 (openmaptiles/layers/building/building.yaml):
//   render_height:     height や levels から近似した高さ
//   render_min_height: min_height や min_levels から近似した底面の高さ
//   colour:            色
//   hide_3d:           3D 描画しないフラグ (building:part を持つ outline 用)
//
// OMT の近似ロジック (building.sql) に合わせて 1 フロア = 3.66m とする。
import type { TransformFn } from "../index.js";

const METERS_PER_FLOOR = 3.66;

// OMT の building レイヤーは z13 から
const MIN_ZOOM = 13;

function toNumber(v: unknown): number | undefined {
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

export const building: TransformFn = ({ zoom, properties }) => {
  if (zoom < MIN_ZOOM) return [];
  const height = toNumber(properties.height);
  const numFloors = toNumber(properties.num_floors);
  const minHeight = toNumber(properties.min_height);
  const minFloor = toNumber(properties.min_floor);

  const out: Record<string, unknown> = {
    render_height: height ?? (numFloors !== undefined ? numFloors * METERS_PER_FLOOR : 5),
    render_min_height: minHeight ?? (minFloor !== undefined ? minFloor * METERS_PER_FLOOR : 0),
  };
  if (typeof properties.facade_color === "string") {
    out.colour = properties.facade_color;
  }
  return [{ layer: "building", properties: out }];
};

// building_part も OMT では building レイヤーに入る
export const buildingPart: TransformFn = (input) => building(input);
