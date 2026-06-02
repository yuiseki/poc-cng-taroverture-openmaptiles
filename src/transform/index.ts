// スキーマ変換モジュール (疎結合)。
//
// このディレクトリは PMTiles / HTTP / MVT エンコードを一切知らない。
// 入出力はプレーンなデータだけなので、将来このディレクトリごと独立リポジトリに
// 切り出して「PMTiles 一括ダウンロード -> OpenMapTiles 形式に変換」のような
// バッチツールからも再利用できる。

// 入力フィーチャの属性 (MVT の value 型に限らず、変換途中は何でも持てる)
export type Properties = Record<string, unknown>;

export interface TransformInput {
  /** Overture テーマ名 (例: "buildings") */
  theme: string;
  /** 入力レイヤー名 (例: "building") */
  layer: string;
  /** リクエストされたタイルのズームレベル */
  zoom: number;
  /** ジオメトリ種別 (1=Point, 2=LineString, 3=Polygon) */
  type: number;
  /** 入力フィーチャの属性 */
  properties: Properties;
}

export interface TransformOutput {
  /** 出力レイヤー名 (OpenMapTiles のレイヤー名) */
  layer: string;
  /** 出力フィーチャの属性 */
  properties: Properties;
}

/**
 * 変換関数。
 * - 空配列 [] を返すとフィーチャを破棄
 * - 複数要素で同一ジオメトリを複数レイヤーへ複製
 *   (例: segment -> transportation + transportation_name)
 */
export type TransformFn = (input: TransformInput) => TransformOutput[];

/** "theme/layer" -> 変換関数 */
export type TransformRegistry = Record<string, TransformFn>;

/**
 * レイヤー後処理。per-feature の純粋関数 (TransformFn) では書けない
 * タイル単位の処理 (ソート・件数キャップ・順位付け等) のためのフック。
 * 出力レイヤー名 -> 後処理関数。features の並べ替え・絞り込み・属性の書き換えのみ行い、
 * ジオメトリには触らない。
 */
export interface PostProcessFeature {
  type: number;
  properties: Record<string, unknown>;
}
export type LayerPostProcessor = <T extends PostProcessFeature>(features: T[]) => T[];
export type LayerPostProcessors = Record<string, LayerPostProcessor>;

// 変換せずそのまま通す (デバッグ・生データ確認用)
export const passthroughTransform: TransformFn = (input) => [
  { layer: input.layer, properties: input.properties },
];

// レジストリから変換器を引いて適用する。未登録のレイヤーは破棄される。
export function createRegistryTransform(registry: TransformRegistry): TransformFn {
  return (input) => {
    const fn = registry[`${input.theme}/${input.layer}`];
    if (!fn) return [];
    return fn(input);
  };
}
