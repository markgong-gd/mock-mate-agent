/**
 * @file 【智能体·graphs】LangGraph 存档（PostgresSaver 单例）
 * 做什么：图的每一步状态都写入 Postgres 的 langgraph schema，thread_id 区分会话；
 *        因此图可以 interrupt 暂停、进程重启后从存档继续。setupCheckpointer() 在启动时建表。
 */
import { PostgresSaver } from '@langchain/langgraph-checkpoint-postgres';
import { getPool } from '@/backend/db/client';

export const CHECKPOINT_SCHEMA = 'langgraph';

let saver: PostgresSaver | undefined;

/** PostgresSaver 单例：与 Drizzle 共用连接池，存档放在独立 schema `langgraph` */
export function getCheckpointer(): PostgresSaver {
  saver ??= new PostgresSaver(getPool(), undefined, { schema: CHECKPOINT_SCHEMA });
  return saver;
}

/** 启动时调用：创建 / 迁移存档表（幂等） */
export async function setupCheckpointer(): Promise<void> {
  await getCheckpointer().setup();
}

/** 进程内重置（测试中模拟“进程重启”用） */
export function resetCheckpointerForTesting() {
  saver = undefined;
}
