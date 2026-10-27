/**
 * @file 【后端·db】同意记录
 * 只认当前文案版本。旧版本的同意还在表里，但 hasConsent 不会把它当成有效。
 */
import { and, eq } from 'drizzle-orm';
import { newId } from '@/shared/common/ids';
import { getDb } from '../client';
import { consents } from '../schema';

export async function grantConsent(userId: string, purpose: string, version: string): Promise<void> {
  await getDb().insert(consents).values({ id: newId(), userId, purpose, version }).onConflictDoNothing();
}

export async function hasConsent(userId: string, purpose: string, version: string): Promise<boolean> {
  const [row] = await getDb()
    .select({ id: consents.id })
    .from(consents)
    .where(and(eq(consents.userId, userId), eq(consents.purpose, purpose), eq(consents.version, version)));
  return Boolean(row);
}
