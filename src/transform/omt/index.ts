// Overture -> OpenMapTiles 変換レジストリ
// キーは "テーマ名/入力レイヤー名"。レイヤー単位で段階的に実装を増やしていく。
//
// 実装状況:
//   [x] buildings/building       -> building
//   [x] buildings/building_part  -> building
//   [x] transportation/segment   -> transportation, transportation_name
//   [x] base/water               -> water
//   [x] base/land                -> landcover
//   [x] base/land_cover          -> landcover
//   [x] base/land_use            -> landuse, park, landcover
//   [x] divisions/division_boundary -> boundary
//   [x] divisions/division       -> place
//   [x] places/place             -> poi
//   [ ] addresses/address        -> housenumber
import type { TransformRegistry } from "../index.js";
import { building, buildingPart } from "./building.js";
import { segment } from "./transportation.js";
import { water } from "./water.js";
import { land, landCover } from "./landcover.js";
import { landUse } from "./landuse.js";
import { divisionBoundary, division } from "./divisions.js";
import { place } from "./poi.js";

export const omtRegistry: TransformRegistry = {
  "buildings/building": building,
  "buildings/building_part": buildingPart,
  "transportation/segment": segment,
  "base/water": water,
  "base/land": land,
  "base/land_cover": landCover,
  "base/land_use": landUse,
  "divisions/division_boundary": divisionBoundary,
  "divisions/division": division,
  "places/place": place,
};

// omt モードが出力しうる OMT レイヤー名 (tile.json の vector_layers 用)
export const omtOutputLayers = [
  "building",
  "transportation",
  "transportation_name",
  "water",
  "landcover",
  "landuse",
  "park",
  "boundary",
  "place",
  "poi",
];
