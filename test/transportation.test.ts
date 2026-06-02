import { test } from "node:test";
import assert from "node:assert/strict";
import { segment } from "../src/transform/omt/transportation.js";

const input = (properties: Record<string, unknown>, zoom = 14) => ({
  theme: "transportation",
  layer: "segment",
  zoom,
  type: 2,
  properties: { subtype: "road", ...properties },
});

function transportationOf(outputs: { layer: string; properties: Record<string, unknown> }[]) {
  return outputs.find((o) => o.layer === "transportation");
}

test("segment: motorway はそのまま class=motorway", () => {
  const out = transportationOf(segment(input({ class: "motorway" })));
  assert.ok(out);
  assert.equal(out.properties.class, "motorway");
});

test("segment: residential / unclassified は class=minor", () => {
  for (const cls of ["residential", "unclassified", "living_street", "road", "unknown"]) {
    const out = transportationOf(segment(input({ class: cls })));
    assert.ok(out, cls);
    assert.equal(out.properties.class, "minor", cls);
  }
});

test("segment: footway / steps / pedestrian / cycleway は class=path + subclass", () => {
  for (const cls of ["footway", "steps", "pedestrian", "cycleway", "path"]) {
    const out = transportationOf(segment(input({ class: cls })));
    assert.ok(out, cls);
    assert.equal(out.properties.class, "path", cls);
    assert.equal(out.properties.subclass, cls, cls);
  }
});

test("segment: rail subtype の standard_gauge は class=rail subclass=rail", () => {
  const out = transportationOf(segment(input({ subtype: "rail", class: "standard_gauge" })));
  assert.ok(out);
  assert.equal(out.properties.class, "rail");
  assert.equal(out.properties.subclass, "rail");
});

test("segment: subway は class=transit subclass=subway", () => {
  const out = transportationOf(segment(input({ subtype: "rail", class: "subway" })));
  assert.ok(out);
  assert.equal(out.properties.class, "transit");
  assert.equal(out.properties.subclass, "subway");
});

test("segment: road_flags の is_bridge は brunnel=bridge", () => {
  const out = transportationOf(
    segment(input({ class: "primary", road_flags: '[{"values":["is_bridge"]}]' })),
  );
  assert.ok(out);
  assert.equal(out.properties.brunnel, "bridge");
});

test("segment: road_flags の is_tunnel は brunnel=tunnel", () => {
  const out = transportationOf(
    segment(input({ class: "primary", road_flags: '[{"values":["is_tunnel"]}]' })),
  );
  assert.ok(out);
  assert.equal(out.properties.brunnel, "tunnel");
});

test("segment: road_flags の is_link は ramp=1", () => {
  const out = transportationOf(
    segment(input({ class: "motorway", road_flags: '[{"values":["is_link"]}]' })),
  );
  assert.ok(out);
  assert.equal(out.properties.ramp, 1);
});

test("segment: subclass=link でも ramp=1", () => {
  const out = transportationOf(segment(input({ class: "motorway", subclass: "link" })));
  assert.ok(out);
  assert.equal(out.properties.ramp, 1);
});

test("segment: subclass=parking_aisle は service 属性になる", () => {
  const out = transportationOf(segment(input({ class: "service", subclass: "parking_aisle" })));
  assert.ok(out);
  assert.equal(out.properties.class, "service");
  assert.equal(out.properties.service, "parking_aisle");
});

test("segment: road_surface は surface=paved/unpaved に正規化される", () => {
  const paved = transportationOf(
    segment(input({ class: "primary", road_surface: '[{"value":"paved"}]' })),
  );
  assert.equal(paved?.properties.surface, "paved");
  const unpaved = transportationOf(
    segment(input({ class: "primary", road_surface: '[{"value":"gravel"}]' })),
  );
  assert.equal(unpaved?.properties.surface, "unpaved");
});

test("segment: 後ろ向き全面 denied は oneway=1", () => {
  const out = transportationOf(
    segment(
      input({
        class: "tertiary",
        access_restrictions: '[{"access_type":"denied","when":{"heading":"backward"}}]',
      }),
    ),
  );
  assert.ok(out);
  assert.equal(out.properties.oneway, 1);
});

test("segment: mode 限定の backward denied は oneway にしない", () => {
  const out = transportationOf(
    segment(
      input({
        class: "tertiary",
        access_restrictions:
          '[{"access_type":"denied","when":{"mode":["bicycle"],"heading":"backward"}}]',
      }),
    ),
  );
  assert.ok(out);
  assert.equal(out.properties.oneway, undefined);
});

test("segment: @name があれば transportation_name レイヤーにも出力される", () => {
  const outputs = segment(
    input({
      class: "tertiary",
      "@name": "神田警察通り",
      names:
        '{"common":{"en":"Kanda Keisatsu Dōri","ja":"神田警察通り"},"primary":"神田警察通り"}',
    }),
  );
  const name = outputs.find((o) => o.layer === "transportation_name");
  assert.ok(name);
  assert.equal(name.properties.name, "神田警察通り");
  assert.equal(name.properties.name_en, "Kanda Keisatsu Dōri");
  assert.equal(name.properties["name:ja"], "神田警察通り");
  assert.equal(name.properties.class, "tertiary");
});

test("segment: 無名の道路は transportation_name を出力しない", () => {
  const outputs = segment(input({ class: "tertiary" }));
  assert.equal(outputs.length, 1);
  assert.equal(outputs[0].layer, "transportation");
});

test("segment: ズームゲート (tertiary は z11 から、z9 では落ちる)", () => {
  assert.equal(segment(input({ class: "tertiary" }, 9)).length, 0);
  assert.ok(transportationOf(segment(input({ class: "tertiary" }, 11))));
});

test("segment: motorway は z4 から見える", () => {
  assert.ok(transportationOf(segment(input({ class: "motorway" }, 4))));
  assert.equal(segment(input({ class: "motorway" }, 3)).length, 0);
});

test("segment: path は z13 から", () => {
  assert.equal(segment(input({ class: "footway" }, 12)).length, 0);
  assert.ok(transportationOf(segment(input({ class: "footway" }, 13))));
});

test("segment: 入力属性 (id, connectors 等) は出力にコピーされない", () => {
  const out = transportationOf(
    segment(input({ class: "primary", id: "abc", connectors: "[]", version: 1 })),
  );
  assert.ok(out);
  assert.equal(out.properties.id, undefined);
  assert.equal(out.properties.connectors, undefined);
  assert.equal(out.properties.version, undefined);
});
