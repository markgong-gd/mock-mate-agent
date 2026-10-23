/**
 * @file 【公共·env】加载 .env
 * 做什么：若存在 .env 则载入 process.env（不覆盖已有变量；测试环境跳过）。后端入口第一行 import 它。
 */
import { existsSync } from 'node:fs';

let loaded = false;

/** 若存在 .env 则加载到 process.env（不覆盖已有变量）；测试环境跳过 */
export function loadDotEnv() {
  if (loaded) return;
  loaded = true;
  if (process.env.NODE_ENV !== 'test' && existsSync('.env')) process.loadEnvFile('.env');
}

loadDotEnv();
