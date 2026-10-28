/**
 * @file 【智能体·graphs】策划图状态
 * materials 是用户原话拼接，防编造只对照它。document 是当前简历稿。
 */
import { Annotation, MessagesAnnotation } from '@langchain/langgraph';
import {
  emptyStudioDocument,
  type StudioDocument,
  type StudioFocus,
  type StudioStatus,
  type StudioTraceStep,
} from '@/shared/schemas/studio';

export const StudioState = Annotation.Root({
  ...MessagesAnnotation.spec,
  document: Annotation<StudioDocument>({
    reducer: (_prev, next) => next,
    default: () => emptyStudioDocument(),
  }),
  targetRole: Annotation<string>({ reducer: (_prev, next) => next, default: () => '' }),
  materials: Annotation<string>({ reducer: (_prev, next) => next, default: () => '' }),
  focus: Annotation<StudioFocus>({ reducer: (_prev, next) => next, default: () => 'basics' }),
  status: Annotation<StudioStatus>({ reducer: (_prev, next) => next, default: () => 'active' }),
  lastUserText: Annotation<string>({ reducer: (_prev, next) => next, default: () => '' }),
  say: Annotation<string>({ reducer: (_prev, next) => next, default: () => '' }),
  /** 只追加已完成的步骤。图节点返回本轮新增的几步，不回传整段历史 */
  traces: Annotation<StudioTraceStep[]>({
    reducer: (prev, next) => {
      const merged = [...prev, ...next];
      return merged.length > 200 ? merged.slice(-200) : merged;
    },
    default: () => [],
  }),
});

export type StudioStateType = typeof StudioState.State;

export interface StudioInterruptValue {
  type: 'await_user';
}
