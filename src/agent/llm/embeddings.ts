/**
 * @file 【智能体·llm】向量化
 * 做什么：getEmbeddings() 按 MODEL_EMBED 返回向量模型；没配置时用离线 n-gram 哈希向量。
 * 为什么默认离线：P0 的 fake 对话模型没有 embedding 接口，但档案保存后仍要能走完“向量化 → 召回”。
 * 代价：哈希向量只对字面重叠敏感，不是语义相似。换 bge-m3 只改 MODEL_EMBED，维度保持 1024。
 */
import { Embeddings } from '@langchain/core/embeddings';
import { OllamaEmbeddings } from '@langchain/ollama';
import { OpenAIEmbeddings } from '@langchain/openai';
import { AppError } from '@/shared/common/errors';
import { logger } from '@/shared/common/logger';
import { EMBEDDING_DIM, FAKE_EMBED_MODEL_ID } from '@/shared/schemas/embedding';
import { serverEnv } from '@/shared/env/server';

export interface ResolvedEmbeddings {
  /** 写入 facts.embed_model。换模型后旧向量因 id 不同会被重新计算 */
  id: string;
  dim: number;
  embedDocuments(texts: string[]): Promise<number[][]>;
  embedQuery(text: string): Promise<number[]>;
}

/** 字符 bigram + 英文词的哈希向量，L2 归一化，便于余弦比较 */
export function hashEmbed(text: string, dim: number = EMBEDDING_DIM): number[] {
  const vector = new Array<number>(dim).fill(0);
  const tokens = new Set<string>();
  for (const word of text.toLowerCase().match(/[a-z0-9+#.]{2,}/g) ?? []) tokens.add(word);
  const chars = Array.from(text.toLowerCase().replace(/\s+/g, ''));
  for (let i = 0; i < chars.length - 1; i++) tokens.add(`${chars[i]}${chars[i + 1]}`);
  for (const token of tokens) {
    let hash = 2166136261;
    for (let i = 0; i < token.length; i++) {
      hash ^= token.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    const unsigned = hash >>> 0;
    const index = unsigned % dim;
    vector[index] = (vector[index] ?? 0) + ((unsigned & 1) === 0 ? 1 : -1);
  }
  let norm = 0;
  for (const n of vector) norm += n * n;
  norm = Math.sqrt(norm) || 1;
  return vector.map((n) => n / norm);
}

class HashEmbeddings extends Embeddings {
  constructor(private readonly dim: number) {
    super({});
  }

  embedDocuments(documents: string[]): Promise<number[][]> {
    return Promise.resolve(documents.map((doc) => hashEmbed(doc, this.dim)));
  }

  embedQuery(document: string): Promise<number[]> {
    return Promise.resolve(hashEmbed(document, this.dim));
  }
}

let cached: ResolvedEmbeddings | undefined;
let warnedFallback = false;

function assertDim(dim: number) {
  if (dim !== EMBEDDING_DIM) {
    throw new AppError(
      'INTERNAL',
      `当前 facts.embedding 是 vector(${EMBEDDING_DIM})，EMBEDDING_DIM=${dim} 不一致。更换维度需要新迁移并全量重新向量化。`,
    );
  }
}

function wrap(id: string, dim: number, model: Embeddings): ResolvedEmbeddings {
  const check = (vectors: number[][]) => {
    for (const vector of vectors) {
      if (vector.length !== dim) {
        throw new AppError(
          'INTERNAL',
          `模型 ${id} 返回了 ${vector.length} 维向量，表结构需要 ${dim} 维。请换 bge-m3 或其它 1024 维模型。`,
        );
      }
    }
    return vectors;
  };
  return {
    id,
    dim,
    async embedDocuments(texts) {
      return check(await model.embedDocuments(texts));
    },
    async embedQuery(text) {
      const [vector] = check([await model.embedQuery(text)]);
      if (!vector) throw new AppError('INTERNAL', '向量模型返回空结果');
      return vector;
    },
  };
}

function resolve(): ResolvedEmbeddings {
  const env = serverEnv().llm;
  assertDim(env.embeddingDim);
  const ref = env.models.embed;
  if (!ref) {
    if (!warnedFallback) {
      warnedFallback = true;
      logger.warn('MODEL_EMBED 未配置，事实向量使用离线 n-gram（只适合本地学习）');
    }
    return wrap(FAKE_EMBED_MODEL_ID, env.embeddingDim, new HashEmbeddings(env.embeddingDim));
  }
  const provider = env.providers[ref.provider];
  if (!provider) throw new AppError('INTERNAL', `provider "${ref.provider}" 未配置`);
  if (provider.kind === 'fake') return wrap(ref.id, env.embeddingDim, new HashEmbeddings(env.embeddingDim));
  if (provider.kind === 'ollama') {
    return wrap(
      ref.id,
      env.embeddingDim,
      new OllamaEmbeddings({ model: ref.model, baseUrl: provider.baseUrl ?? 'http://127.0.0.1:11434' }),
    );
  }
  if (provider.kind === 'openai-compatible') {
    return wrap(
      ref.id,
      env.embeddingDim,
      new OpenAIEmbeddings({
        model: ref.model,
        apiKey: provider.apiKey,
        configuration: { baseURL: provider.baseUrl },
      }),
    );
  }
  throw new AppError(
    'INTERNAL',
    `provider kind "${provider.kind}" 没有 embeddings 接口。请使用 ollama 或 openai-compatible（例如硅基流动 bge-m3）。`,
  );
}

export function getEmbeddings(): ResolvedEmbeddings {
  cached ??= resolve();
  return cached;
}

export function resetEmbeddingsForTesting() {
  cached = undefined;
  warnedFallback = false;
}
