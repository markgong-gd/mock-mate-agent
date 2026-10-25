/**
 * @file 【智能体·retrieval】事实检索器
 * 做什么：把一条 JD 要求变成向量，只在当前用户的 facts 里召回。
 * 为什么 userId 放在构造函数里：它来自请求上下文，不作为模型可填的参数，避免提示词注入换成别人的 id。
 * 继承 BaseRetriever 是为了和 LangChain 的检索接口对齐；业务代码请调用 retrieve()，返回带 id 的结构。
 */
import { Document } from '@langchain/core/documents';
import { BaseRetriever, type BaseRetrieverInput } from '@langchain/core/retrievers';
import { searchFacts } from '@/backend/db/vector';
import { getEmbeddings } from '@/agent/llm/embeddings';
import type { RetrievedFact } from '@/shared/schemas/resume';

export interface FactRetrieverPorts {
  k?: number;
  embedQuery?: (text: string) => Promise<number[]>;
  embedModel?: string;
  search?: typeof searchFacts;
}

export class FactRetriever extends BaseRetriever {
  lc_namespace = ['mockmate', 'retrievers'];
  private readonly k: number;

  constructor(
    private readonly userId: string,
    private readonly ports: FactRetrieverPorts = {},
    fields?: BaseRetrieverInput,
  ) {
    super(fields);
    if (!userId) throw new Error('FactRetriever 必须提供 userId');
    this.k = ports.k ?? 4;
  }

  /** 召回当前用户的事实。k 是这一次查询的条数 */
  async retrieve(query: string, k = this.k): Promise<RetrievedFact[]> {
    const embedQuery = this.ports.embedQuery ?? ((text: string) => getEmbeddings().embedQuery(text));
    const embedModel = this.ports.embedModel ?? getEmbeddings().id;
    const search = this.ports.search ?? searchFacts;
    const vector = await embedQuery(query);
    return search({ userId: this.userId, vector, embedModel, k });
  }

  override async _getRelevantDocuments(query: string): Promise<Document[]> {
    const hits = await this.retrieve(query);
    return hits.map(
      (hit) =>
        new Document({
          pageContent: hit.text,
          metadata: { id: hit.id, experienceId: hit.experienceId, userId: this.userId, score: hit.score },
        }),
    );
  }
}
