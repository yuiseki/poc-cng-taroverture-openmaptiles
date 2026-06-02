import { test } from "node:test";
import assert from "node:assert/strict";
import { namesOf } from "../src/transform/omt/names.js";

test("namesOf: name:latin は common.en を優先する", () => {
  const out = namesOf({
    "@name": "神田警察通り",
    names: '{"common":{"en":"Kanda Keisatsu Dōri","ja":"神田警察通り"},"primary":"神田警察通り"}',
  });
  assert.equal(out?.["name:latin"], "Kanda Keisatsu Dōri");
  assert.equal(out?.["name:nonlatin"], "神田警察通り");
});

test("namesOf: en がなければ ja-Latn を name:latin に使う", () => {
  const out = namesOf({
    "@name": "九段北二丁目",
    names: '{"common":{"ja-Latn":"Kudan-Kita 2-chōme","ja":"九段北二丁目"},"primary":"九段北二丁目"}',
  });
  assert.equal(out?.["name:latin"], "Kudan-Kita 2-chōme");
});

test("namesOf: primary が ASCII なら name:latin にフォールバック", () => {
  const out = namesOf({ "@name": "RIMOWA" });
  assert.equal(out?.["name:latin"], "RIMOWA");
  assert.equal(out?.["name:nonlatin"], undefined);
});

test("namesOf: 非 ASCII の primary は name:nonlatin にフォールバック", () => {
  const out = namesOf({ "@name": "東京駅" });
  assert.equal(out?.["name:latin"], undefined);
  assert.equal(out?.["name:nonlatin"], "東京駅");
});

test("namesOf: 既存フィールド (name/name_en/name:ja) は変わらない", () => {
  const out = namesOf({
    "@name": "東京駅",
    names: '{"common":{"en":"Tokyo Station","ja":"東京駅"},"primary":"東京駅"}',
  });
  assert.equal(out?.name, "東京駅");
  assert.equal(out?.name_en, "Tokyo Station");
  assert.equal(out?.["name:ja"], "東京駅");
});

test("namesOf: 名前がなければ null", () => {
  assert.equal(namesOf({}), null);
});
