/**
 * @file 【后端·core】事实向量化
 * embedFactsForUser 可重复调用：只处理 embedding 为空或 embed_model 不是当前模型的行。
 * 中途失败时，已经写回的行不会被重做。这就是“可续跑”。
 * requestEmbedFacts 由 runtime 在 pg-boss 起来之后注入，避免 core 和 jobs 互相 import。
 */
import { hashUserId } from '@/shared/common/ids';
import { logger } from '@/shared/common/logger';
import { listFactsNeedingEmbed, writeFactEmbedding } from '@/backend/db/repos/profile';
import { getEmbeddings } from '@/agent/llm/embeddings';

const BATCH = 16;

let sender: ((userId: string) => Promise<void>) | undefined;

/** runtime 启动 pg-boss 后调用。没注入时直接在当前进程算完，避免保存档案后向量一直空着 */
export function setEmbedFactsSender(next: (userId: string) => Promise<void>) {
  sender = next;
}

export async function requestEmbedFacts(userId: string) {
  if (sender) await sender(userId);
  else await embedFactsForUser(userId);
}

export async function embedFactsForUser(userId: string): Promise<{ embedded: number }> {
  const embeddings = getEmbeddings();
  let embedded = 0;
  for (let round = 0; round < 100; round++) {
    const batch = await listFactsNeedingEmbed(userId, embeddings.id, BATCH);
    if (batch.length === 0) break;
    const vectors = await embeddings.embedDocuments(batch.map((fact) => fact.text));
    for (let i = 0; i < batch.length; i++) {
      const fact = batch[i];
      const vector = vectors[i];
      if (!fact || !vector) continue;
      await writeFactEmbedding({ userId, id: fact.id, embedding: vector, embedModel: embeddings.id });
      embedded += 1;
    }
  }
  logger.info({ userIdHash: hashUserId(userId), embedded, model: embeddings.id }, 'facts embedded');
  return { embedded };
}
