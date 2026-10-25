/**
 * @file 【公共·schemas】向量维度常量
 * 做什么：固定 facts.embedding 的维度。P1 决策见 docs/02-architecture.md §1.3。
 * 为什么是 1024：对齐 bge-m3，且低于 pgvector HNSW 的 2000 维上限。
 * 改这个数字必须同时加迁移，并把已有向量全部重算（02 §5.4）。
 */
export const EMBEDDING_DIM = 1024 as const;

/** 离线默认向量的模型标识。没配 MODEL_EMBED 时写入 facts.embed_model */
export const FAKE_EMBED_MODEL_ID = `fake:ngram-${EMBEDDING_DIM}` as const;
