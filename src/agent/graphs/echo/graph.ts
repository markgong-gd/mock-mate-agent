/**
 * @file 【智能体·graphs】回声图（P0 验证用，未来面试图的缩小版）
 * 结构：START → ask → wait_answer(interrupt) → reply →(shared/domain 判断) ask | finish → END
 * 要点：节点调模型统一走 agent/llm；interrupt 放在无副作用的独立节点；条件边判断在 shared/domain 纯函数中。
 */
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import {
  END,
  interrupt,
  START,
  StateGraph,
  type BaseCheckpointSaver,
  type LangGraphRunnableConfig,
} from '@langchain/langgraph';
import { routeAfterEchoReply } from '@/shared/domain/dev/echo-route';
import { getChatRunnable } from '@/agent/llm/resilience';
import { ECHO_ASK_SYSTEM, ECHO_PROMPT_VERSION, ECHO_REPLY_SYSTEM } from '@/agent/prompts/dev-echo';
import { EchoState, type EchoStateType } from './state';

/** interrupt 的载荷：告诉调用方“正在等待回答” */
export interface EchoInterruptValue {
  type: 'await_answer';
  round: number;
}

const withMeta = (config: LangGraphRunnableConfig, functionId: string): LangGraphRunnableConfig => ({
  ...config,
  metadata: { ...config.metadata, functionId, promptVersion: ECHO_PROMPT_VERSION },
});

const emitState = (
  config: LangGraphRunnableConfig,
  state: Pick<EchoStateType, 'round' | 'maxRounds'>,
  phase: string,
) => config.writer?.({ type: 'echo-state', round: state.round, maxRounds: state.maxRounds, phase });

async function ask(state: EchoStateType, config: LangGraphRunnableConfig) {
  emitState(config, state, 'asking');
  const model = getChatRunnable('chat');
  const res = await model.invoke(
    [new SystemMessage(ECHO_ASK_SYSTEM), ...state.messages],
    withMeta(config, 'dev.echo.ask'),
  );
  return { messages: [res] };
}

/** 只做 interrupt，无副作用：恢复时本节点会从头重新执行（02 §1.2 约定 3） */
function waitAnswer(state: EchoStateType, config: LangGraphRunnableConfig) {
  emitState(config, state, 'waiting');
  const answer = interrupt<EchoInterruptValue, string>({ type: 'await_answer', round: state.round });
  return { messages: [new HumanMessage(answer)] };
}

async function reply(state: EchoStateType, config: LangGraphRunnableConfig) {
  emitState(config, state, 'replying');
  const model = getChatRunnable('chat');
  const res = await model.invoke(
    [new SystemMessage(ECHO_REPLY_SYSTEM), ...state.messages],
    withMeta(config, 'dev.echo.reply'),
  );
  return { messages: [res], round: state.round + 1 };
}

function finish(state: EchoStateType, config: LangGraphRunnableConfig) {
  emitState(config, state, 'finished');
  return { status: 'finished' as const };
}

/** ask → wait_answer(interrupt) → reply → (ask | finish) */
export function buildEchoGraph(checkpointer: BaseCheckpointSaver) {
  return new StateGraph(EchoState)
    .addNode('ask', ask)
    .addNode('wait_answer', waitAnswer)
    .addNode('reply', reply)
    .addNode('finish', finish)
    .addEdge(START, 'ask')
    .addEdge('ask', 'wait_answer')
    .addEdge('wait_answer', 'reply')
    .addConditionalEdges('reply', (s) => routeAfterEchoReply(s), { ask: 'ask', finish: 'finish' })
    .addEdge('finish', END)
    .compile({ checkpointer, name: 'echo' });
}

export type EchoGraph = ReturnType<typeof buildEchoGraph>;
