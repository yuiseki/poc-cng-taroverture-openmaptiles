// Overture base/land, base/land_cover -> OpenMapTiles "landcover" レイヤー
//
// 参考: openmaptiles/layers/landcover/landcover.yaml の class 集約表
//   farmland / ice / wood / rock / grass / wetland / sand
// 元の値は subclass に保持する (OMT も同様の構造)。
import type { TransformFn } from "../index.js";

const POLYGON = 3;

// OMT landcover.yaml の class -> subclass 対応の逆引き
const CLASS_BY_SUBCLASS: Record<string, string> = {
  // farmland
  farmland: "farmland",
  farm: "farmland",
  orchard: "farmland",
  vineyard: "farmland",
  plant_nursery: "farmland",
  crop: "farmland",
  // ice
  glacier: "ice",
  ice_shelf: "ice",
  snow: "ice",
  // wood
  wood: "wood",
  forest: "wood",
  // rock
  bare_rock: "rock",
  scree: "rock",
  rock: "rock",
  stone: "rock",
  // grass
  fell: "grass",
  flowerbed: "grass",
  grassland: "grass",
  heath: "grass",
  scrub: "grass",
  shrubbery: "grass",
  shrub: "grass",
  tundra: "grass",
  grass: "grass",
  moss: "grass",
  meadow: "grass",
  allotments: "grass",
  village_green: "grass",
  recreation_ground: "grass",
  golf_course: "grass",
  // wetland
  wetland: "wetland",
  bog: "wetland",
  swamp: "wetland",
  wet_meadow: "wetland",
  marsh: "wetland",
  reedbed: "wetland",
  saltern: "wetland",
  tidalflat: "wetland",
  saltmarsh: "wetland",
  mangrove: "wetland",
  // sand
  beach: "sand",
  sand: "sand",
  dune: "sand",
  barren: "sand",
};

function toLandcover(value: unknown): { layer: string; properties: Record<string, unknown> }[] {
  if (typeof value !== "string") return [];
  const omtClass = CLASS_BY_SUBCLASS[value];
  if (omtClass === undefined) return [];
  return [{ layer: "landcover", properties: { class: omtClass, subclass: value } }];
}

// base/land: class に OSM 由来の値 (wood, grassland, sand, ...) が入る。
// tree (ポイント) / tree_row (ライン) / island 等の背景陸地は対象外。
export const land: TransformFn = ({ type, properties }) => {
  if (type !== POLYGON) return [];
  return toLandcover(properties.class);
};

// base/land_cover: class が "undefined" で、subtype (forest, shrub, crop, ...) が実体。
// ESA WorldCover 由来の広域ポリゴンで低ズーム向け。urban は OMT に対応がないので破棄。
export const landCover: TransformFn = ({ type, properties }) => {
  if (type !== POLYGON) return [];
  return toLandcover(properties.subtype);
};
