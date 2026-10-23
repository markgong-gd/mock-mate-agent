/**
 * @file 【后端·db】users 仓储：ensureUser(userId)
 */
import { getDb } from '../client';
import { users } from '../schema';

/** 确保用户存在（当前单用户模式下由启动流程为 DEV_USER_ID 调用） */
export async function ensureUser(userId: string): Promise<void> {
  await getDb().insert(users).values({ id: userId }).onConflictDoNothing();
}
