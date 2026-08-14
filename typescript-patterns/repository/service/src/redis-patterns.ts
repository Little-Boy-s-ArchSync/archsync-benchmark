import { createClient as createRedisClient } from "redis";
import * as redis from "redis";

const cache = createRedisClient({ url: "redis://redis:6379" });
const namespaceCache = redis.createClient({ url: process.env.REDIS_URL });
const localCache = new Map<string, string>();
const logger = { set: (_key: string, _value: string) => undefined };
const redisDocumentation = "redis://redis:6379";

export async function exerciseRedisPatterns(): Promise<void> {
  await cache.get("order:1");
  await cache.hSet("orders", "1", "ready");
  await namespaceCache.lPush("orders", "1");
  await namespaceCache.mGet(["order:1", "order:2"]);

  localCache.get("order:1");
  logger.set("order:1", "ready");
  await cache.connect();
  void redisDocumentation;
}

