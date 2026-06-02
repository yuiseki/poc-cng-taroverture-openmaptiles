import { test } from "node:test";
import assert from "node:assert/strict";
import { place } from "../src/transform/omt/poi.js";

const input = (properties: Record<string, unknown>, zoom = 14) => ({
  theme: "places",
  layer: "place",
  zoom,
  type: 1,
  properties: { "@name": "テスト店", ...properties },
});

test("poi: 代表的な basic_category のマッピング", () => {
  const cases: Array<[string, string]> = [
    ["restaurant", "restaurant"],
    ["casual_eatery", "restaurant"],
    ["fast_food_restaurant", "fast_food"],
    ["cafe", "cafe"],
    ["coffee_shop", "cafe"],
    ["bar", "bar"],
    ["brewery", "beer"],
    ["convenience_store", "shop"],
    ["fashion_and_apparel_store", "clothing_store"],
    ["department_store", "grocery"],
    ["pharmacy_and_drug_store", "pharmacy"],
    ["train_station", "railway"],
    ["parking", "parking"],
    ["hospital", "hospital"],
    ["dental_clinic", "dentist"],
    ["bank_or_credit_union", "bank"],
    ["atm", "atm"],
    ["hotel", "lodging"],
    ["college_university", "college"],
    ["high_school", "school"],
    ["government_office", "town_hall"],
    ["police_station", "police"],
    ["fire_station", "fire_station"],
    ["christian_place_of_worship", "place_of_worship"],
    ["buddhist_place_of_worship", "place_of_worship"],
    ["museum", "museum"],
    ["art_gallery", "art_gallery"],
    ["movie_theater", "cinema"],
    ["stadium_arena", "stadium"],
    ["golf_course", "golf"],
    ["park", "park"],
    ["playground", "playground"],
    ["historic_site", "attraction"],
    ["monument", "monument"],
    ["castle", "castle"],
    ["professional_service", "office"],
    ["corporate_or_business_office", "office"],
    ["laundry_service", "laundry"],
    ["auto_dealer", "car"],
  ];
  for (const [basic, expected] of cases) {
    const out = place(input({ basic_category: basic }));
    assert.equal(out[0]?.layer, "poi", basic);
    assert.equal(out[0]?.properties.class, expected, basic);
  }
});

test("poi: subclass は basic_category の値を保持する", () => {
  const out = place(input({ basic_category: "sushi_restaurant_like" }));
  // 未知の値はフォールバックに回るため、既知の値で確認
  const known = place(input({ basic_category: "coffee_shop" }));
  assert.equal(known[0]?.properties.subclass, "coffee_shop");
});

test("poi: 未知の basic_category は taxonomy の最上位階層でフォールバック", () => {
  const out = place(
    input({
      basic_category: "totally_new_category",
      taxonomy: '{"primary":"x","hierarchy":["eat_and_drink","x"]}',
    }),
  );
  assert.equal(out[0]?.properties.class, "restaurant");
  const retail = place(
    input({
      basic_category: "totally_new_store",
      taxonomy: '{"primary":"x","hierarchy":["retail","x"]}',
    }),
  );
  assert.equal(retail[0]?.properties.class, "shop");
});

test("poi: 自然地物 (mountain/river/bridge) は破棄される", () => {
  for (const basic of ["mountain", "river", "bridge"]) {
    assert.equal(place(input({ basic_category: basic })).length, 0, basic);
  }
});

test("poi: カテゴリ情報が一切なければ破棄される", () => {
  assert.equal(place(input({})).length, 0);
});

test("poi: 名前がなければ破棄される", () => {
  const out = place({
    theme: "places",
    layer: "place",
    zoom: 14,
    type: 1,
    properties: { basic_category: "restaurant" },
  });
  assert.equal(out.length, 0);
});

test("poi: confidence から rank が決まる (高信頼=1, 低信頼=10)", () => {
  const high = place(input({ basic_category: "restaurant", confidence: 0.95 }));
  assert.equal(high[0]?.properties.rank, 1);
  const low = place(input({ basic_category: "restaurant", confidence: 0.08 }));
  assert.equal(low[0]?.properties.rank, 10);
  const mid = place(input({ basic_category: "restaurant", confidence: 0.5 }));
  assert.equal(mid[0]?.properties.rank, 5);
});

test("poi: confidence がなければ rank=10", () => {
  const out = place(input({ basic_category: "restaurant" }));
  assert.equal(out[0]?.properties.rank, 10);
});

test("poi: 多言語名が引き継がれる", () => {
  const out = place(
    input({
      basic_category: "train_station",
      "@name": "東京駅",
      names: '{"common":{"en":"Tokyo Station","ja":"東京駅"},"primary":"東京駅"}',
    }),
  );
  assert.equal(out[0]?.properties.name, "東京駅");
  assert.equal(out[0]?.properties.name_en, "Tokyo Station");
  assert.equal(out[0]?.properties["name:ja"], "東京駅");
});
