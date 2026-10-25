/**
 * @file 【测试】诊断图：并行打分、聚合、证据校验、没有回答、打分失败后续跑
 * 只注入 IO（load / persist），模型照常走假模型，这样 Send 的 map-reduce 和 reducer 都是真跑的。
 */
import { MemorySaver } from '@langchain/langgraph';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  buildDiagnosisGraph,
  type DiagnosisGraphDeps,
  type DiagnosisLoaded,
} from '@/agent/graphs/diagnosis/graph';
import type { ScoreTask } from '@/agent/graphs/diagnosis/state';
import type { SaveDiagnosisInput } from '@/backend/db/repos/diagnosis';
import type { ExistingWeakness } from '@/shared/domain/weakness/merge';
import type { RubricDefinition } from '@/shared/schemas/rubric';
import { useTestEnv } from '../../../../tests/helpers/env';

const REPORT_ID = '00000000-0000-4000-8000-00000000d001';
const SESSION_ID = '00000000-0000-4000-8000-00000000d002';
const TURN_1 = '00000000-0000-4000-8000-00000000d101';
const TURN_2 = '00000000-0000-4000-8000-00000000d102';

const anchors = [
  { score: 1, text: '几乎没答到' },
  { score: 5, text: '有做法与取舍' },
];

const rubric: RubricDefinition = {
  version: 'v1',
  title: '测试标准',
  notes: [],
  dimensions: [
    { key: 'tech_depth', label: '技术深度', description: '掌握程度', weight: 0.4, anchors },
    { key: 'structure', label: '结构化表达', description: '是否有结构', weight: 0.2, anchors },
    { key: 'job_fit', label: '岗位匹配度', description: '是否契合', weight: 0.25, anchors },
    { key: 'communication', label: '沟通流畅度', description: '是否清晰', weight: 0.15, anchors },
  ],
};

const DEEP = '我把列表 key 换成稳定的业务 id，插入排序后行状态不会串，首屏也从 4 秒降到 1 秒。';

const task = (over: Partial<ScoreTask> = {}): ScoreTask => ({
  turnId: TURN_1,
  seq: 2,
  questionId: 'fe-react-001',
  question: 'React 渲染列表时 key 为什么要稳定？',
  answerPoints: ['key 对应同一个组件实例'],
  skillTags: ['react'],
  answer: DEEP,
  ...over,
});

const shallowTask = task({
  turnId: TURN_2,
  seq: 4,
  questionId: 'fe-performance-001',
  question: '首屏变慢先看什么？',
  skillTags: ['performance'],
  answer: '不知道',
});

function deps(
  over: {
    tasks?: ScoreTask[];
    roleTitle?: string;
    history?: ExistingWeakness[];
  } & Partial<DiagnosisGraphDeps> = {},
): DiagnosisGraphDeps & { saved: SaveDiagnosisInput[] } {
  const saved: SaveDiagnosisInput[] = [];
  const loaded: DiagnosisLoaded = {
    sessionId: SESSION_ID,
    roleTitle: over.roleTitle ?? '前端工程师',
    requirementTags: ['react', 'performance'],
    rubric,
    tasks: over.tasks ?? [task(), shallowTask],
  };
  return {
    saved,
    load: async () => loaded,
    loadHistory: async () => over.history ?? [],
    persist: async (input) => {
      saved.push(input);
    },
    ...(over.beforeScore ? { beforeScore: over.beforeScore } : {}),
  };
}

const historyRow = (
  id: string,
  tag: string,
  status: ExistingWeakness['status'],
): ExistingWeakness => ({
  id,
  tag,
  title: `${tag} 以前就是短板`,
  detail: '历史记录',
  severity: 2,
  status,
  reportId: '00000000-0000-4000-8000-00000000d900',
  sessionId: '00000000-0000-4000-8000-00000000d901',
  evidenceQuote: '旧证据',
  seenAt: 1,
});

const cfg = (threadId: string) => ({
  configurable: { thread_id: threadId, userId: 'user-1', requestId: 'req-1' },
});

async function run(graph: ReturnType<typeof buildDiagnosisGraph>, threadId: string, input: unknown) {
  const stream = await graph.stream(input as never, { ...cfg(threadId), streamMode: 'updates' });
  for await (const _chunk of stream) {
    /* 跑到结束或抛错 */
  }
}

describe('diagnosis graph', () => {
  beforeEach(() => {
    useTestEnv({ FAKE_LLM_DELAY_MS: '0' });
  });

  it('每题并行打分后聚合出维度分与总分，短板带证据，计划只针对短板', async () => {
    const graphDeps = deps();
    const graph = buildDiagnosisGraph(new MemorySaver(), graphDeps);
    await run(graph, 'diag-happy', { reportId: REPORT_ID });

    const [saved] = graphDeps.saved;
    expect(saved).toBeTruthy();
    expect(saved!.reportId).toBe(REPORT_ID);
    expect(saved!.rubricVersion).toBe('v1');

    // 两题各打一次分，顺序按轮次 seq 归位
    expect(saved!.scores.answers.map((a) => a.turnId)).toEqual([TURN_1, TURN_2]);
    expect(saved!.scores.answers.every((a) => a.dimensions.length === 4)).toBe(true);
    expect(saved!.scores.dimensions.map((d) => d.key)).toEqual([
      'tech_depth',
      'structure',
      'job_fit',
      'communication',
    ]);
    expect(saved!.scores.overall).toBeGreaterThan(0);
    // 具体回答分高于“不知道”
    const deep = saved!.scores.answers.find((a) => a.turnId === TURN_1)!;
    const shallow = saved!.scores.answers.find((a) => a.turnId === TURN_2)!;
    expect(deep.score).toBeGreaterThan(shallow.score);
    // 技能分最差的排最前面
    expect(saved!.scores.skills[0]?.tag).toBe('performance');

    expect(saved!.weaknesses.length).toBeGreaterThan(0);
    for (const weakness of saved!.weaknesses) {
      expect(weakness.evidenceTurnId).toBeTruthy();
      expect(weakness.evidenceQuote.length).toBeGreaterThan(0);
      expect(['react', 'performance']).toContain(weakness.tag);
    }
    const tags = new Set(saved!.weaknesses.map((w) => w.tag));
    expect(saved!.plan.items.every((item) => tags.has(item.tag))).toBe(true);
  });

  it('模型改写的原话换成真实摘录，引用不存在的轮次被丢掉', async () => {
    const graphDeps = deps({ roleTitle: '前端工程师 __bad_evidence__' });
    const graph = buildDiagnosisGraph(new MemorySaver(), graphDeps);
    await run(graph, 'diag-evidence', { reportId: REPORT_ID });

    const saved = graphDeps.saved[0]!;
    expect(saved.weaknesses).toHaveLength(1);
    expect(saved.weaknesses[0]!.evidenceTurnId).toBe(TURN_1);
    expect(saved.weaknesses[0]!.evidenceQuote).toBe(DEEP);
  });

  it('一场面试没有可打分的回答时，报告仍然生成，总分为 0、没有短板', async () => {
    const graphDeps = deps({ tasks: [] });
    const graph = buildDiagnosisGraph(new MemorySaver(), graphDeps);
    await run(graph, 'diag-empty', { reportId: REPORT_ID });

    const saved = graphDeps.saved[0]!;
    expect(saved.scores.overall).toBe(0);
    expect(saved.scores.answers).toEqual([]);
    expect(saved.scores.dimensions.map((d) => d.score)).toEqual([0, 0, 0, 0]);
    expect(saved.weaknesses).toEqual([]);
    expect(saved.plan.items).toEqual([]);
  });

  it('短板写回档案：本次又出现的标回 open，本场没考好的退回 open，没考到的不动', async () => {
    const graphDeps = deps({
      history: [
        // 上次标成已解决，这次 react 又被判成短板
        historyRow('w-react', 'react', 'closed'),
        // 本场 performance 只有一句"不知道"，分数很低，不能继续算在改善中
        historyRow('w-perf', 'performance', 'improving'),
        // 本场完全没问到 testing：没问到 != 已解决，状态不动
        historyRow('w-testing', 'testing', 'open'),
      ],
    });
    const graph = buildDiagnosisGraph(new MemorySaver(), graphDeps);
    await run(graph, 'diag-merge', { reportId: REPORT_ID });

    const saved = graphDeps.saved[0]!;
    const changes = [...(saved.weaknessStatusChanges ?? [])].sort((a, b) => a.id.localeCompare(b.id));
    expect(changes).toEqual([
      { id: 'w-perf', status: 'open' },
      { id: 'w-react', status: 'open' },
    ]);
  });

  it('某一题打分失败后用同一存档续跑，已经打好的分不会重复', async () => {
    let failures = 1;
    const graphDeps = deps({
      beforeScore: (turnId) => {
        if (turnId === TURN_2 && failures > 0) {
          failures -= 1;
          throw new Error('score failed');
        }
      },
    });
    const saver = new MemorySaver();
    const graph = buildDiagnosisGraph(saver, graphDeps);
    await expect(run(graph, 'diag-retry', { reportId: REPORT_ID })).rejects.toThrow(/score failed/);
    expect(graphDeps.saved).toHaveLength(0);

    const resumed = buildDiagnosisGraph(saver, graphDeps);
    await run(resumed, 'diag-retry', null);

    const saved = graphDeps.saved[0]!;
    expect(saved.scores.answers.map((a) => a.turnId)).toEqual([TURN_1, TURN_2]);
    const snap = await resumed.getState(cfg('diag-retry'));
    expect(snap.next).toEqual([]);
  });
});
