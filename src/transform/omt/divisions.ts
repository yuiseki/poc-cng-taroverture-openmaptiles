// Overture divisions テーマ -> OpenMapTiles "boundary" / "place" レイヤー
//
// 参考: openmaptiles/layers/boundary/boundary.yaml, place/place.yaml
//
// Overture divisions の subtype は行政階層を表し、OSM の admin_level と
// 対応がとれる (https://docs.overturemaps.org/schema/concepts/by-theme/divisions/):
//   country=2, dependency=3, region=4, macrocounty=5, county=6,
//   localadmin=7, locality=8, borough=9, neighborhood=10, ...
//
// division_boundary (ライン) -> boundary
// division (ポイント)        -> place (地名ラベルの源泉は places テーマではなくこちら)
// division_area (ポリゴン)   -> 対応なし (OMT は行政界ポリゴンを持たない)
import type { TransformFn } from "../index.js";
import { namesOf } from "./names.js";

const ADMIN_LEVEL: Record<string, number> = {
  country: 2,
  dependency: 3,
  macroregion: 3,
  region: 4,
  macrocounty: 5,
  county: 6,
  localadmin: 7,
  locality: 8,
  borough: 9,
  macrohood: 10,
  neighborhood: 10,
  microhood: 11,
};

export const divisionBoundary: TransformFn = ({ properties }) => {
  const subtype = properties.subtype;
  if (typeof subtype !== "string") return [];
  const adminLevel = ADMIN_LEVEL[subtype];
  if (adminLevel === undefined) return [];
  return [
    {
      layer: "boundary",
      properties: {
        admin_level: adminLevel,
        maritime: properties.class === "maritime" ? 1 : 0,
        disputed: properties.is_disputed === true ? 1 : 0,
      },
    },
  ];
};

// division subtype -> OMT place class
const PLACE_CLASS: Record<string, string> = {
  country: "country",
  dependency: "country",
  region: "state",
  macroregion: "state",
  macrocounty: "province",
  county: "province",
  localadmin: "town",
  borough: "borough",
  macrohood: "suburb",
  neighborhood: "neighbourhood",
  microhood: "neighbourhood",
};

// locality の Overture class でそのまま OMT place class になる値
const LOCALITY_CLASSES = new Set(["city", "town", "village", "hamlet"]);

export const division: TransformFn = ({ properties }) => {
  const subtype = properties.subtype;
  if (typeof subtype !== "string") return [];

  let placeClass: string | undefined;
  if (subtype === "locality") {
    const cls = properties.class;
    placeClass = typeof cls === "string" && LOCALITY_CLASSES.has(cls) ? cls : "town";
  } else {
    placeClass = PLACE_CLASS[subtype];
  }
  if (placeClass === undefined) return [];

  const names = namesOf(properties);
  if (names === null) return [];
  return [{ layer: "place", properties: { ...names, class: placeClass } }];
};
