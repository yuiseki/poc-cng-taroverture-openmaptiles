// Overture base/land_use -> OpenMapTiles "landuse" / "park" / "landcover" レイヤー
//
// 参考: openmaptiles/layers/landuse/landuse.yaml の class enum
// Overture の land_use.class は OSM の landuse/amenity/leisure 値由来なので、
// OMT の enum と一致するものは素通しし、OMT で別レイヤー扱いのものを振り分ける:
//   park / garden            -> park レイヤー (OMT では landuse ではなく park)
//   grass / farmland 系      -> landcover レイヤー
//   対応のないもの (construction 等) -> 破棄
import type { TransformFn } from "../index.js";

const POLYGON = 3;

// openmaptiles/layers/landuse/landuse.yaml の values をそのまま
const LANDUSE_VALUES = new Set([
  "railway",
  "cemetery",
  "military",
  "residential",
  "commercial",
  "industrial",
  "garages",
  "retail",
  "bus_station",
  "school",
  "university",
  "kindergarten",
  "college",
  "library",
  "hospital",
  "stadium",
  "pitch",
  "playground",
  "track",
  "theme_park",
  "zoo",
  "suburb",
  "quarter",
  "neighbourhood",
  "dam",
  "quarry",
]);

// OMT では cemetery に集約される値
const CEMETERY_ALIASES = new Set(["grave_yard"]);

// OMT の park レイヤーに入る値
const PARK_VALUES = new Set(["park", "garden", "dog_park", "national_park", "nature_reserve"]);

// landcover に振り分ける値 (class -> OMT landcover class)
const LANDCOVER_VALUES: Record<string, string> = {
  grass: "grass",
  meadow: "grass",
  allotments: "grass",
  village_green: "grass",
  recreation_ground: "grass",
  greenhouse_horticulture: "farmland",
  farmland: "farmland",
  farmyard: "farmland",
  orchard: "farmland",
  vineyard: "farmland",
};

export const landUse: TransformFn = ({ type, properties }) => {
  if (type !== POLYGON) return [];
  const cls = properties.class;
  if (typeof cls !== "string") return [];

  if (LANDUSE_VALUES.has(cls)) {
    return [{ layer: "landuse", properties: { class: cls } }];
  }
  if (CEMETERY_ALIASES.has(cls)) {
    return [{ layer: "landuse", properties: { class: "cemetery" } }];
  }
  if (PARK_VALUES.has(cls)) {
    const out: Record<string, unknown> = { class: cls };
    if (typeof properties["@name"] === "string") out.name = properties["@name"];
    return [{ layer: "park", properties: out }];
  }
  const landcoverClass = LANDCOVER_VALUES[cls];
  if (landcoverClass !== undefined) {
    return [{ layer: "landcover", properties: { class: landcoverClass, subclass: cls } }];
  }
  return [];
};
