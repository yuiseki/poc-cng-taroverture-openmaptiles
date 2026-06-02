// Overture transportation テーマ -> OpenMapTiles "transportation" / "transportation_name" レイヤー
//
// 参考:
//   openmaptiles/layers/transportation/transportation.yaml (class/subclass/brunnel/ramp/oneway の定義)
//   planetiler-openmaptiles Transportation.java (rail/transit の判定: RAILWAY_RAIL_VALUES / RAILWAY_TRANSIT_VALUES)
//
// Overture の segment.class は OSM の highway 値由来なので OMT class へはほぼ素通しで、
// residential 等 -> minor、footway 等 -> path の集約だけ行う。
import type { TransformFn, TransformOutput, Properties } from "../index.js";
import { namesOf, parseJson } from "./names.js";

// OMT class -> 表示開始ズーム (OMT の標準的な minzoom に概ね合わせた PoC 値)
const CLASS_MINZOOM: Record<string, number> = {
  motorway: 4,
  trunk: 5,
  primary: 7,
  secondary: 9,
  tertiary: 11,
  minor: 12,
  service: 13,
  track: 13,
  path: 13,
  rail: 11,
  transit: 13,
  ferry: 10,
};

// highway 値の集約 (transportation.yaml の class 定義)
const MINOR_VALUES = new Set(["unclassified", "residential", "living_street", "road", "unknown"]);
const PATH_VALUES = new Set([
  "pedestrian",
  "path",
  "footway",
  "cycleway",
  "steps",
  "bridleway",
  "corridor",
]);

// railway 値の集約 (planetiler Transportation.java)
const RAIL_VALUES = new Set(["standard_gauge", "rail", "narrow_gauge", "preserved", "funicular"]);
const TRANSIT_VALUES = new Set(["subway", "light_rail", "monorail", "tram"]);

// OMT の service 属性に入る値 (subclass 由来)
const SERVICE_VALUES = new Set(["parking_aisle", "driveway", "alley", "spur", "yard", "siding"]);

const PAVED_VALUES = new Set(["paved", "asphalt", "concrete", "paving_stones", "sett"]);

// Overture の (subtype, class) -> OMT の (class, subclass)
function omtClass(
  subtype: unknown,
  cls: string,
): { class: string; subclass?: string } | null {
  if (subtype === "rail") {
    const subclass = cls === "standard_gauge" ? "rail" : cls;
    if (RAIL_VALUES.has(cls)) return { class: "rail", subclass };
    if (TRANSIT_VALUES.has(cls)) return { class: "transit", subclass };
    return { class: "rail", subclass };
  }
  if (subtype === "water") return { class: "ferry" };
  if (MINOR_VALUES.has(cls)) return { class: "minor" };
  if (PATH_VALUES.has(cls)) return { class: "path", subclass: cls };
  // motorway / trunk / primary / secondary / tertiary / service / track 等は素通し
  return { class: cls };
}

// road_flags / rail_flags: [{values: ["is_bridge", ...], when?: ...}] 形式
function collectFlags(properties: Properties): Set<string> {
  const flags = new Set<string>();
  for (const key of ["road_flags", "rail_flags"]) {
    const parsed = parseJson(properties[key]);
    if (!Array.isArray(parsed)) continue;
    for (const rule of parsed) {
      const values = (rule as { values?: unknown }).values;
      if (!Array.isArray(values)) continue;
      for (const v of values) if (typeof v === "string") flags.add(v);
    }
  }
  return flags;
}

// access_restrictions に「mode 限定なしの backward 全面 denied」があれば一方通行とみなす
function isOneway(properties: Properties): boolean {
  const parsed = parseJson(properties.access_restrictions);
  if (!Array.isArray(parsed)) return false;
  return parsed.some((rule) => {
    const r = rule as { access_type?: unknown; when?: { heading?: unknown; mode?: unknown } };
    return (
      r.access_type === "denied" &&
      r.when?.heading === "backward" &&
      r.when?.mode === undefined
    );
  });
}

function surfaceOf(properties: Properties): string | undefined {
  const parsed = parseJson(properties.road_surface);
  if (!Array.isArray(parsed) || parsed.length === 0) return undefined;
  const value = (parsed[0] as { value?: unknown }).value;
  if (typeof value !== "string") return undefined;
  return PAVED_VALUES.has(value) ? "paved" : "unpaved";
}

const NAME_MINZOOM = 12;

export const segment: TransformFn = ({ zoom, properties }) => {
  const cls = properties.class;
  if (typeof cls !== "string") return [];
  const mapped = omtClass(properties.subtype, cls);
  if (mapped === null) return [];
  const minzoom = CLASS_MINZOOM[mapped.class] ?? 13;
  if (zoom < minzoom) return [];

  const out: Properties = { class: mapped.class };
  if (mapped.subclass !== undefined) out.subclass = mapped.subclass;

  const flags = collectFlags(properties);
  if (flags.has("is_bridge")) out.brunnel = "bridge";
  else if (flags.has("is_tunnel")) out.brunnel = "tunnel";
  if (flags.has("is_link") || properties.subclass === "link") out.ramp = 1;

  const subclass = properties.subclass;
  if (typeof subclass === "string" && SERVICE_VALUES.has(subclass)) out.service = subclass;

  const surface = surfaceOf(properties);
  if (surface !== undefined) out.surface = surface;

  if (isOneway(properties)) out.oneway = 1;

  const outputs: TransformOutput[] = [{ layer: "transportation", properties: out }];

  if (zoom >= NAME_MINZOOM) {
    const names = namesOf(properties);
    if (names !== null) {
      outputs.push({
        layer: "transportation_name",
        properties: { ...names, class: mapped.class, ...(mapped.subclass !== undefined ? { subclass: mapped.subclass } : {}) },
      });
    }
  }
  return outputs;
};
