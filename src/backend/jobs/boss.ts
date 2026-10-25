/**
 * @file 【后端·jobs】pg-boss 实例存放处
 * 做什么：runtime 启动后 setBoss，用例层 getBoss 入队。
 * 为什么不放在 runtime.ts：embed.service 要入队，而 jobs 的 handler 又要调 embed.service，放这里可以避开循环依赖。
 */
import type { PgBoss } from 'pg-boss';

let current: PgBoss | undefined;

export function setBoss(boss: PgBoss | undefined) {
  current = boss;
}

export function getBoss(): PgBoss | undefined {
  return current;
}
