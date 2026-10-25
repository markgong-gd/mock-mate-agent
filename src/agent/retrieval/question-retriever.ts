/**
 * @file 【智能体·retrieval】题库检索器
 * 每一条技能各做一次向量召回和一次关键词召回，再用 RRF 合并。
 * 向量还没算完时退回到标签过滤 + 词面重合，保证没跑 embed 也能出题。
 * P2a-04：关键词路开启，重排关闭。见 docs/02-architecture.md §1.3。
 */
import { Document } from '@langchain/core/documents';
import { BaseRetriever, type BaseRetrieverInput } from '@langchain/core/retrievers';
import {
  listQuestionsBySkills,
  searchQuestionsByKeyword,
  searchQuestionsByVector,
} from '@/backend/db/vector';
import { getEmbeddings } from '@/agent/llm/embeddings';
import { rankByOverlap } from '@/shared/domain/retrieval/overlap';
import { reciprocalRankFusion } from '@/shared/domain/retrieval/rrf';
import { findSkillTags } from '@/shared/schemas/skill-tags';
import type { QuestionType, RetrievedQuestion } from '@/shared/schemas/question';
import { rerankQuestions } from './rerank';

/** 关键词召回开启，重排关闭。换这个常量就等于改检索策略 */
export const QUESTION_RETRIEVAL = {
  keyword: true,
  rerank: false,
  rrfK: 60,
  perQueryK: 20,
} as const;

export interface QuestionQuery {
  skills: string[];
  /** 和技能一起拿去向量化的句子，一般是一条 JD 要求 */
  text?: string;
  /** 预留给短板 id。P3 才有 weaknesses 表，现在不参与过滤 */
  weaknessIds?: string[];
  difficulty?: [number, number];
  types?: QuestionType[];
  k: number;
}

export interface QuestionRetrieverPorts {
  embedQuery?: (text: string) => Promise<number[]>;
  embedModel?: string;
  searchVector?: typeof searchQuestionsByVector;
  searchKeyword?: typeof searchQuestionsByKeyword;
  listBySkills?: typeof listQuestionsBySkills;
  keyword?: boolean;
}

export class QuestionRetriever extends BaseRetriever {
  lc_namespace = ['mockmate', 'retrievers'];

  constructor(
    private readonly ports: QuestionRetrieverPorts = {},
    fields?: BaseRetrieverInput,
  ) {
    super(fields);
  }

  async retrieve(query: QuestionQuery): Promise<RetrievedQuestion[]> {
    const skills = [...new Set(query.skills.filter(Boolean))];
    const difficultyMin = query.difficulty?.[0] ?? 1;
    const difficultyMax = query.difficulty?.[1] ?? 5;
    const perQueryK = Math.max(query.k, QUESTION_RETRIEVAL.perQueryK);
    const embedQuery = this.ports.embedQuery ?? ((text: string) => getEmbeddings().embedQuery(text));
    const embedModel = this.ports.embedModel ?? getEmbeddings().id;
    const searchVector = this.ports.searchVector ?? searchQuestionsByVector;
    const searchKeyword = this.ports.searchKeyword ?? searchQuestionsByKeyword;
    const listBySkills = this.ports.listBySkills ?? listQuestionsBySkills;
    const useKeyword = this.ports.keyword ?? QUESTION_RETRIEVAL.keyword;
    const filter = {
      difficultyMin,
      difficultyMax,
      ...(query.types ? { types: query.types } : {}),
      k: perQueryK,
    };

    const lists: RetrievedQuestion[][] = [];
    for (const skill of skills) {
      const text = `${skill} ${query.text ?? ''}`.trim();
      const vector = await embedQuery(text);
      lists.push(await searchVector({ ...filter, skills: [skill], vector, embedModel }));
      if (useKeyword) {
        lists.push(await searchKeyword({ ...filter, skills: [skill], keyword: text, like: skill }));
      }
    }

    const fused = lists.some((list) => list.length > 0)
      ? reciprocalRankFusion(lists, QUESTION_RETRIEVAL.rrfK)
      : await this.fallback(listBySkills, query, skills, difficultyMin, difficultyMax, perQueryK);

    const ranked = QUESTION_RETRIEVAL.rerank ? await rerankQuestions(fused) : fused;
    return ranked.slice(0, query.k);
  }

  private async fallback(
    listBySkills: typeof listQuestionsBySkills,
    query: QuestionQuery,
    skills: string[],
    difficultyMin: number,
    difficultyMax: number,
    limit: number,
  ): Promise<RetrievedQuestion[]> {
    const listed = await listBySkills({
      skills,
      difficultyMin,
      difficultyMax,
      ...(query.types ? { types: query.types } : {}),
      limit,
    });
    const ranked = rankByOverlap(
      `${query.text ?? ''} ${skills.join(' ')}`,
      listed.map((item) => ({
        ...item,
        text: `${item.content}\n${item.answerPoints.join('\n')}`,
      })),
      limit,
    );
    return ranked.map((item, index) => ({
      id: item.id,
      content: item.content,
      answerPoints: [...item.answerPoints],
      skillTags: [...item.skillTags],
      difficulty: item.difficulty,
      type: item.type,
      score: limit - index,
    }));
  }

  override async _getRelevantDocuments(query: string): Promise<Document[]> {
    const skills = findSkillTags(query).map((item) => item.tag);
    const hits = await this.retrieve({
      skills: skills.length > 0 ? skills : ['javascript'],
      text: query,
      k: 8,
    });
    return hits.map(
      (hit) =>
        new Document({
          pageContent: hit.content,
          metadata: { id: hit.id, skillTags: hit.skillTags, difficulty: hit.difficulty, score: hit.score },
        }),
    );
  }
}
