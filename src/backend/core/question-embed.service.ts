/**
 * @file 【后端·core】题库向量化
 * 只处理 embedding 为空或 embed_model 不是当前模型的行。中断后再跑，已经写回的行不会重做。
 */
import { logger } from '@/shared/common/logger';
import { listQuestionsNeedingEmbed, writeQuestionEmbedding } from '@/backend/db/repos/questions';
import { getEmbeddings } from '@/agent/llm/embeddings';
import { limits } from './config';

let sender: (() => Promise<void>) | undefined;

/** runtime 启动 pg-boss 后注入。没注入时（例如 seed 命令）就在当前进程算完 */
export function setEmbedQuestionsSender(next: () => Promise<void>) {
  sender = next;
}

export async function requestEmbedQuestions() {
  if (sender) await sender();
  else await embedQuestions();
}

export async function embedQuestions(): Promise<{ embedded: number }> {
  const embeddings = getEmbeddings();
  let embedded = 0;
  for (let round = 0; round < 100; round++) {
    const batch = await listQuestionsNeedingEmbed(embeddings.id, limits.embedBatchSize);
    if (batch.length === 0) break;
    const vectors = await embeddings.embedDocuments(batch.map((row) => row.searchText));
    for (let i = 0; i < batch.length; i++) {
      const row = batch[i];
      const vector = vectors[i];
      if (!row || !vector) continue;
      await writeQuestionEmbedding({ id: row.id, embedding: vector, embedModel: embeddings.id });
      embedded += 1;
    }
  }
  logger.info({ embedded, model: embeddings.id }, 'questions embedded');
  return { embedded };
}
