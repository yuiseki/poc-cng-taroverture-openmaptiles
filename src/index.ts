// HTTP 層。タイルの取得・マージは merge.ts、スキーマ変換は transform/ に委譲する。
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { gzipSync } from "node:zlib";
import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import { createSources, THEMES, type TileSources } from "./sources.js";
import { fetchThemeTiles, mergeTiles } from "./merge.js";
import {
  passthroughTransform,
  createRegistryTransform,
  type TransformFn,
} from "./transform/index.js";
import { omtRegistry, omtOutputLayers } from "./transform/omt/index.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

const MODES: Record<string, TransformFn> = {
  // raw: Overture のレイヤー名・属性をそのまま 1 枚にマージ (デバッグ用)
  raw: passthroughTransform,
  // omt: OpenMapTiles スキーマへ変換 (レジストリ未登録レイヤーは落ちる)
  omt: createRegistryTransform(omtRegistry),
};

const MAXZOOM = 14;

// マージ済みタイルの単純 LRU キャッシュ (value は gzip 済みタイル、空タイルは null)
class LruCache<K, V> {
  private readonly max: number;
  private readonly map = new Map<K, V>();
  constructor(max = 256) {
    this.max = max;
  }
  get(key: K): V | undefined {
    if (!this.map.has(key)) return undefined;
    const v = this.map.get(key) as V;
    this.map.delete(key);
    this.map.set(key, v);
    return v;
  }
  set(key: K, value: V): void {
    this.map.delete(key);
    this.map.set(key, value);
    if (this.map.size > this.max) {
      this.map.delete(this.map.keys().next().value as K);
    }
  }
}

export interface BuildAppOptions {
  sources?: TileSources;
  cacheSize?: number;
}

export function buildApp({ sources = createSources(), cacheSize = 256 }: BuildAppOptions = {}): FastifyInstance {
  const app = Fastify({ logger: true });
  app.register(cors, { origin: true });
  const tileCache = new LruCache<string, Buffer | null>(cacheSize);

  app.get("/health", async () => ({ status: "ok" }));

  app.get("/", async (_req, reply) => {
    const html = readFileSync(join(__dirname, "..", "docs", "index.html"), "utf-8");
    return reply.type("text/html").send(html);
  });

  app.get<{ Params: { mode: string } }>("/tiles/:mode/tile.json", async (req, reply) => {
    const { mode } = req.params;
    if (!MODES[mode]) return reply.code(404).send({ error: `unknown mode: ${mode}` });
    const base = `${req.protocol}://${req.headers.host}`;
    const vectorLayers =
      mode === "raw"
        ? Object.entries(THEMES).flatMap(([theme, layers]) =>
            layers.map((id) => ({ id, description: `overture ${theme}/${id}`, fields: {} })),
          )
        : omtOutputLayers.map((id) => ({ id, description: `OpenMapTiles ${id}`, fields: {} }));
    return {
      tilejson: "3.0.0",
      name: `taroverture-merge-tile (${mode})`,
      tiles: [`${base}/tiles/${mode}/{z}/{x}/{y}.mvt`],
      minzoom: 0,
      maxzoom: MAXZOOM,
      vector_layers: vectorLayers,
    };
  });

  app.get<{ Params: { mode: string; z: string; x: string; file: string } }>(
    "/tiles/:mode/:z/:x/:file",
    async (req, reply) => {
      const { mode, z, x, file } = req.params;
      const transform = MODES[mode];
      if (!transform) return reply.code(404).send({ error: `unknown mode: ${mode}` });
      const m = /^(\d+)\.(mvt|pbf)$/.exec(file);
      if (!m) return reply.code(400).send({ error: "tile path must be /{z}/{x}/{y}.mvt" });
      const zi = Number(z);
      const xi = Number(x);
      const yi = Number(m[1]);
      if (
        !Number.isInteger(zi) ||
        zi < 0 ||
        zi > MAXZOOM ||
        xi < 0 ||
        yi < 0 ||
        xi >= 2 ** zi ||
        yi >= 2 ** zi
      ) {
        return reply.code(400).send({ error: "tile coordinates out of range" });
      }

      const cacheKey = `${mode}/${zi}/${xi}/${yi}`;
      let gz = tileCache.get(cacheKey);
      if (gz === undefined) {
        const themeTiles = await fetchThemeTiles(sources, zi, xi, yi);
        const merged = mergeTiles(themeTiles, transform, zi);
        gz = merged === null ? null : gzipSync(merged);
        tileCache.set(cacheKey, gz);
      }
      if (gz === null) return reply.code(204).send();
      return reply
        .type("application/vnd.mapbox-vector-tile")
        .header("content-encoding", "gzip")
        .header("cache-control", "public, max-age=3600")
        .send(gz);
    },
  );

  return app;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const app = buildApp();
  const port = Number(process.env.PORT ?? 3000);
  app.listen({ port, host: "0.0.0.0" }).catch((err) => {
    app.log.error(err);
    process.exit(1);
  });
}
