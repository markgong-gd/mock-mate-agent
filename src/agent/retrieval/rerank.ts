/**
 * @file 【智能体·retrieval】题库重排入口
 * P2a-04 的结论是不启用重排：没有接入 MODEL_RERANK，关键词 + 向量的 RRF 已经够用。
 * 以后要加重排，只改这个文件。
 */
export async function rerankQuestions<T>(items: T[]): Promise<T[]> {
  return items;
}
