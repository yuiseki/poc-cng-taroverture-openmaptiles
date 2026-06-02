// Overture places/place -> OpenMapTiles "poi" レイヤー
//
// 参考: openmaptiles/layers/poi/poi.yaml の class 集約表
//
// Overture places のカテゴリは独自タクソノミー (~2000 値) だが、タイルには
// 集約済みの basic_category (~165 値) が入っているのでこれを対応表で OMT poi class に
// マッピングする。表にない値は taxonomy.hierarchy の最上位階層でフォールバックする。
//
// subclass には basic_category をそのまま保持する (OMT の subclass 語彙とは異なるが、
// 元情報を失わないことを優先する PoC 判断)。
//
// Overture (Meta 由来) の POI は OSM より桁違いに密なため、2 段階で間引く:
//   1. 変換器 (per-feature): confidence < 0.7 を破棄し、連絡先系属性の充実度を
//      richness スコアとして内部属性 _score に出力する
//   2. 後処理 (per-tile): (_score, confidence) 降順でソートして上位 1000 件にキャップし、
//      順位帯から rank 1 (上位) 〜 5 を付与する。スタイル側は rank<=N で密度を調整できる
import type { TransformFn, LayerPostProcessor } from "../index.js";
import { namesOf, parseJson } from "./names.js";

const CLASS_BY_BASIC: Record<string, string> = {
  // eat & drink
  restaurant: "restaurant",
  casual_eatery: "restaurant",
  food_truck_stand: "restaurant",
  fast_food_restaurant: "fast_food",
  food_court: "fast_food",
  cafe: "cafe",
  coffee_shop: "cafe",
  non_alcoholic_beverage_venue: "cafe",
  smoothie_juice_bar: "cafe",
  bar: "bar",
  lounge: "bar",
  dance_club: "bar",
  comedy_club: "bar",
  adult_entertainment_venue: "bar",
  alcoholic_beverage_venue: "beer",
  brewery: "beer",
  winery: "beer",
  // shops
  convenience_store: "shop",
  specialty_store: "shop",
  second_hand_store: "shop",
  electronics_store: "shop",
  flowers_and_gifts_store: "shop",
  sporting_goods_store: "shop",
  hardware_home_and_garden_store: "shop",
  arts_crafts_and_hobby_store: "shop",
  office_supply_store: "shop",
  toys_and_games_store: "shop",
  musical_instrument_and_pro_audio_store: "shop",
  vehicle_parts_store: "shop",
  personal_care_and_beauty_store: "shop",
  personal_or_beauty_service: "shop",
  shopping_mall: "shop",
  fashion_and_apparel_store: "clothing_store",
  food_and_beverage_store: "grocery",
  farmers_market: "grocery",
  department_store: "grocery",
  warehouse_club_store: "grocery",
  discount_store: "grocery",
  books_music_and_video_store: "library",
  pharmacy_and_drug_store: "pharmacy",
  laundry_service: "laundry",
  // offices & services
  professional_service: "office",
  corporate_or_business_office: "office",
  real_estate_service: "office",
  financial_service: "office",
  technical_service: "office",
  legal_service: "office",
  attorney_or_law_firm: "office",
  media_service: "office",
  print_media_service: "office",
  printing_service: "office",
  design_service: "office",
  event_or_party_service: "office",
  travel_service: "office",
  shipping_or_delivery_service: "office",
  home_service: "office",
  building_or_construction_service: "office",
  rental_service: "office",
  recreational_equipment_rental: "office",
  supplier_or_distributor: "office",
  manufacturer: "office",
  wholesaler: "office",
  telecommunications_service: "office",
  agricultural_service: "office",
  educational_service: "office",
  television_station: "office",
  labor_union: "office",
  b2b_service: "office",
  b2b_office_and_professional_service: "office",
  b2b_transportation_and_storage_service: "office",
  b2b_industrial_and_machine_service: "office",
  b2b_energy_and_utility_service: "office",
  b2b_science_and_technology_service: "office",
  // transport
  train_station: "railway",
  public_transit_facility_or_service: "railway",
  ground_transport_facility_or_service: "bus",
  parking: "parking",
  taxi_or_ride_share_service: "car",
  automotive_service: "car",
  vehicle_service: "car",
  auto_dealer: "car",
  vehicle_dealer: "car",
  // health
  hospital: "hospital",
  outpatient_care_facility: "hospital",
  walk_in_clinic: "hospital",
  surgery: "hospital",
  specialized_health_care: "hospital",
  specialized_medical_facility: "hospital",
  primary_care_or_general_clinic: "hospital",
  behavioral_or_mental_health_clinic: "hospital",
  physical_medicine_and_rehabilitation: "hospital",
  reproductive_perinatal_and_womens_care: "hospital",
  medical_service: "hospital",
  vision_or_eye_care_clinic: "hospital",
  complementary_and_alternative_medicine: "hospital",
  dental_clinic: "dentist",
  // wellness (OMT に直接の class がないため class=subclass の流儀に倣う)
  gym: "gym",
  fitness_studio: "gym",
  wellness_service: "gym",
  sport_or_fitness_facility: "gym",
  sport_or_recreation_club: "gym",
  // culture & attraction
  historic_site: "attraction",
  fairgrounds: "attraction",
  amusement_park: "attraction",
  arcade: "attraction",
  gaming_venue: "attraction",
  science_attraction: "museum",
  public_fountain: "attraction",
  monument: "monument",
  sculpture_statue: "monument",
  castle: "castle",
  art_gallery: "art_gallery",
  street_art: "art_gallery",
  cultural_center: "art_gallery",
  museum: "museum",
  library: "library",
  movie_theater: "cinema",
  theatre_venue: "theatre",
  event_venue: "theatre",
  music_venue: "music",
  stadium_arena: "stadium",
  skating_rink: "stadium",
  golf_course: "golf",
  park: "park",
  dog_park: "park",
  garden: "park",
  public_plaza: "park",
  playground: "playground",
  // worship
  christian_place_of_worship: "place_of_worship",
  buddhist_place_of_worship: "place_of_worship",
  religious_organization: "place_of_worship",
  // education
  college_university: "college",
  research_institute: "college",
  high_school: "school",
  elementary_school: "school",
  specialty_school: "school",
  place_of_learning: "school",
  tutoring_service: "school",
  // government & civic
  government_office: "town_hall",
  courthouse: "town_hall",
  civic_center: "town_hall",
  civic_organization: "town_hall",
  social_or_community_service: "town_hall",
  social_club: "town_hall",
  family_service: "town_hall",
  embassy: "town_hall",
  police_station: "police",
  fire_station: "fire_station",
  // finance
  bank_or_credit_union: "bank",
  atm: "atm",
  // lodging
  hotel: "lodging",
  lodging: "lodging",
  resort: "lodging",
  inn: "lodging",
  bed_and_breakfast: "lodging",
};

// 自然地物・構造物は OMT では別レイヤー (mountain_peak / water_name 等) の領分なので破棄
const DROP_BASIC = new Set([
  "mountain",
  "river",
  "bridge",
  "campus_building",
  "storage_facility",
  "public_utility",
  "recreational_trail_or_path",
  "psychic_advising",
]);

// taxonomy.hierarchy[0] (Overture 最上位カテゴリ) によるフォールバック
const CLASS_BY_TAXONOMY_ROOT: Record<string, string> = {
  eat_and_drink: "restaurant",
  retail: "shop",
  accommodation: "lodging",
  automotive: "car",
  arts_and_entertainment: "attraction",
  attractions_and_activities: "attraction",
  active_life: "gym",
  beauty_and_spa: "shop",
  education: "school",
  financial_service: "office",
  health_and_medical: "hospital",
  pets: "veterinary",
  business_to_business: "office",
  professional_services: "office",
  services_and_business: "office",
  public_service_and_government: "town_hall",
  religious_organization: "place_of_worship",
  real_estate: "office",
  travel: "attraction",
  mass_media: "office",
  private_establishments_and_corporates: "office",
};

function omtPoiClass(properties: Record<string, unknown>): string | undefined {
  const basic = properties.basic_category;
  if (typeof basic === "string") {
    if (DROP_BASIC.has(basic)) return undefined;
    const cls = CLASS_BY_BASIC[basic];
    if (cls !== undefined) return cls;
  }
  const taxonomy = parseJson(properties.taxonomy) as { hierarchy?: unknown[] } | undefined;
  const root = taxonomy?.hierarchy?.[0];
  if (typeof root === "string") return CLASS_BY_TAXONOMY_ROOT[root];
  return undefined;
}

const MIN_CONFIDENCE = 0.7;

// 連絡先系属性の保有数を richness スコアにする (空配列・空オブジェクトは数えない)
function richnessScore(properties: Record<string, unknown>): number {
  let score = 0;
  for (const key of ["websites", "phones", "socials", "emails"]) {
    const parsed = parseJson(properties[key]);
    if (Array.isArray(parsed) && parsed.length > 0) score += 1;
  }
  const brand = parseJson(properties.brand) as { names?: { primary?: unknown } } | undefined;
  if (typeof brand?.names?.primary === "string") score += 1;
  return score;
}

export const place: TransformFn = ({ properties }) => {
  const confidence = properties.confidence;
  if (typeof confidence !== "number" || confidence < MIN_CONFIDENCE) return [];
  const names = namesOf(properties);
  if (names === null) return [];
  const cls = omtPoiClass(properties);
  if (cls === undefined) return [];

  const subclass =
    typeof properties.basic_category === "string" ? properties.basic_category : cls;

  return [
    {
      layer: "poi",
      properties: {
        ...names,
        class: cls,
        subclass,
        // 内部属性 (poiPostProcess が rank に変換して除去する)
        _score: richnessScore(properties),
        _confidence: confidence,
      },
    },
  ];
};

const MAX_POI_PER_TILE = 1000;

// 順位帯 -> rank。値域は OMT スタイルの流儀に合わせる:
// OSM Bright は rank<=14 を z14、15-24 を z15、>=25 を z16 で出し分けるため、
// top100=10 (z14 で表示)、次150=20 (z15)、以降=30/40/50 (z16+) とする
const RANK_BOUNDS: Array<[number, number]> = [
  [100, 10],
  [250, 20],
  [500, 30],
  [750, 40],
];
const RANK_REST = 50;

export const poiPostProcess: LayerPostProcessor = (features) => {
  const num = (v: unknown) => (typeof v === "number" ? v : 0);
  const sorted = [...features].sort((a, b) => {
    const score = num(b.properties._score) - num(a.properties._score);
    if (score !== 0) return score;
    return num(b.properties._confidence) - num(a.properties._confidence);
  });
  const capped = sorted.slice(0, MAX_POI_PER_TILE);
  capped.forEach((f, idx) => {
    const bound = RANK_BOUNDS.find(([limit]) => idx < limit);
    f.properties.rank = bound ? bound[1] : RANK_REST;
    delete f.properties._score;
    delete f.properties._confidence;
  });
  return capped;
};
