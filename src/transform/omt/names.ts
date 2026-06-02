// Overture の名前属性 -> OMT の name / name_en / name:ja
//
// タイル内の Overture フィーチャは以下を持つ:
//   @name: primary 名 (タイル生成時の convenience 属性)
//   names: {"common": {"en": ..., "ja": ...}, "primary": ...} の JSON 文字列
import type { Properties } from "../index.js";

export function parseJson(v: unknown): unknown {
  if (typeof v !== "string") return undefined;
  try {
    return JSON.parse(v);
  } catch {
    return undefined;
  }
}

// eslint-disable-next-line no-control-regex
const ASCII_ONLY = /^[\x00-\x7F]+$/;

export function namesOf(properties: Properties): Record<string, string> | null {
  const name = properties["@name"];
  if (typeof name !== "string" || name === "") return null;
  const out: Record<string, string> = { name };
  const parsed = parseJson(properties.names) as
    | { common?: Record<string, unknown> }
    | undefined;
  const common = parsed?.common ?? {};
  if (typeof common.en === "string") out.name_en = common.en;
  if (typeof common.ja === "string") out["name:ja"] = common.ja;

  // OMT 慣習の name:latin / name:nonlatin。既存スタイル (OSM Bright 等) の
  // text-field "{name:latin} {name:nonlatin}" がそのまま機能するために必要
  const latin =
    typeof common.en === "string"
      ? common.en
      : typeof common["ja-Latn"] === "string"
        ? (common["ja-Latn"] as string)
        : ASCII_ONLY.test(name)
          ? name
          : undefined;
  const nonlatin =
    typeof common.ja === "string" ? common.ja : !ASCII_ONLY.test(name) ? name : undefined;
  if (latin !== undefined) out["name:latin"] = latin;
  if (nonlatin !== undefined) out["name:nonlatin"] = nonlatin;
  return out;
}
