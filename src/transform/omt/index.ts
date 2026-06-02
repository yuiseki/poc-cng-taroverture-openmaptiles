// Overture -> OpenMapTiles 変換レジストリ
// キーは "テーマ名/入力レイヤー名"。レイヤー単位で段階的に実装を増やしていく。
//
// 実装状況:
//   [x] buildings/building       -> building
//   [x] buildings/building_part  -> building
//   [x] transportation/segment   -> transportation, transportation_name
//   [ ] base/water               -> water
//   [ ] base/land_cover          -> landcover
//   [ ] base/land_use            -> landuse
//   [ ] divisions/division_boundary -> boundary
//   [ ] places/place             -> poi, place
//   [ ] addresses/address        -> housenumber
import type { TransformRegistry } from "../index.js";
import { building, buildingPart } from "./building.js";
import { segment } from "./transportation.js";

export const omtRegistry: TransformRegistry = {
  "buildings/building": building,
  "buildings/building_part": buildingPart,
  "transportation/segment": segment,
};

// omt モードが出力しうる OMT レイヤー名 (tile.json の vector_layers 用)
export const omtOutputLayers = ["building", "transportation", "transportation_name"];
