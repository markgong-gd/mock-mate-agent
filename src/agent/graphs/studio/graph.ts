/**
 * @file 【智能体·graphs】简历策划图
 * coach（结构化，不进气泡）→ speak（把定稿的话说出来）→ wait_user(interrupt) → coach。
 * 改稿先过 domain 防编造，再把简历事件写进流，预览不用等这轮文字结束。
 * 观察、模型、思考和规则通过 data-studio-trace 推给页面，完成后留在图状态里。
 */
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import {
  interrupt,
  START,
  StateGraph,
  type BaseCheckpointSaver,
  type LangGraphRunnableConfig,
} from '@langchain/langgraph';
import { saveStudioSession, insertStudioAssistantTurn } from '@/backend/db/repos/studio';
import { getGraphCtx } from '@/agent/graphs/config';
import { pickStructuredMethod } from '@/agent/llm/caps';
import { redactText } from '@/agent/llm/redact';
import { getChatModel } from '@/agent/llm/registry';
import { getChatRunnable, llmTimeoutSignal } from '@/agent/llm/resilience';
import { generateStructured } from '@/agent/llm/structured';
import {
  coachHuman,
  coachSystem,
  speakHuman,
  speakSystem,
  STUDIO_COACH_PROMPT_VERSION,
  STUDIO_SPEAK_PROMPT_VERSION,
} from '@/agent/prompts/studio';
import { fillStudioContact } from '@/shared/domain/studio/guard';
import { settleCoachTurn, studioPhase, type StudioPhase } from '@/shared/domain/studio/phase';
import {
  studioCoachProposalSchema,
  type StudioCoachProposal,
  type StudioDocument,
  type StudioFocus,
  type StudioStatus,
} from '@/shared/schemas/studio';
import { StudioState, type StudioInterruptValue, type StudioStateType } from './state';
import {
  createStudioTracer,
  errorNote,
  formatMessages,
  jsonText,
  messageText,
  nextTraceSeq,
  reasoningOf,
  StudioModelCapture,
  usageOf,
  type StudioModelReport,
  type StudioModelStart,
} from './trace';

const PHASE_NOTE: Record<StudioPhase, string> = {
  need_role: '还没有目标岗位。这一轮只问岗位和级别。',
  need_materials: '还没有能写进简历的经历。这一轮请用户提供材料。',
  clarify: '经历里有空结果或含糊表述。这一轮追问一个可核对的数字。',
  revise: '材料够用。这一轮可以改简历。',
  confirm: '用户确认这版可以。这一轮准备导出。',
};

export interface StudioProposeInput {
  phase: StudioPhase;
  document: StudioDocument;
  targetRole: string;
  materials: string;
  userText: string;
  sessionId: string;
  signal?: AbortSignal;
  /** 模型开始调用时回调，页面可以先看到模型和输入 */
  onModelStart?: (start: StudioModelStart) => void;
  /** 模型结束或失败时回调，带上实际输入、输出和 token */
  reportModel?: (report: StudioModelReport) => void;
}

export interface StudioGraphDeps {
  propose(input: StudioProposeInput): Promise<StudioCoachProposal>;
  recordAssistant(input: { userId: string; sessionId: string; content: string }): Promise<void>;
  saveSession(input: {
    userId: string;
    sessionId: string;
    document: StudioDocument;
    targetRole: string;
    focus: StudioFocus;
    status: StudioStatus;
  }): Promise<void>;
}

export async function proposeWithModel(input: StudioProposeInput): Promise<StudioCoachProposal> {
  const resolved = getChatModel('chat');
  const messages = [
    new SystemMessage(coachSystem()),
    new HumanMessage(
      coachHuman({
        phase: input.phase,
        targetRole: input.targetRole,
        userText: redactText(input.userText).text,
        materials: redactText(input.materials).text,
        document: redactText(JSON.stringify(input.document)).text,
      }),
    ),
  ];
  const capture = new StudioModelCapture();
  const started = Date.now();
  const base: StudioModelStart = {
    alias: resolved.alias,
    provider: resolved.provider,
    model: resolved.id,
    method: pickStructuredMethod(resolved.caps),
    functionId: 'studio.coach',
    promptVersion: STUDIO_COACH_PROMPT_VERSION,
    input: formatMessages(messages),
  };
  input.onModelStart?.(base);
  const finish = (patch: { status: 'ok' | 'error'; output: string; note?: string }) => {
    const note = [capture.fallbackNote(), patch.note].filter(Boolean).join(' ');
    input.reportModel?.({
      ...base,
      status: patch.status,
      output: patch.output,
      latencyMs: Date.now() - started,
      alias: capture.alias || base.alias,
      provider: capture.provider || base.provider,
      model: capture.model || base.model,
      method: capture.method || base.method,
      input: capture.input || base.input,
      inputTokens: capture.inputTokens,
      outputTokens: capture.outputTokens,
      attempts: capture.attempts,
      reasoning: capture.reasoning,
      ...(note ? { note } : {}),
    });
  };
  try {
    const proposal = await generateStructured(
      'chat',
      studioCoachProposalSchema,
      messages,
      {
        functionId: 'studio.coach',
        promptVersion: STUDIO_COACH_PROMPT_VERSION,
        sessionId: input.sessionId,
      },
      { tags: ['nostream'], signal: input.signal, callbacks: [capture] },
    );
    finish({ status: 'ok', output: jsonText(proposal) });
    return proposal;
  } catch (error) {
    finish({ status: 'error', output: capture.rawText, note: errorNote(error) });
    throw error;
  }
}

export const defaultStudioDeps: StudioGraphDeps = {
  propose: proposeWithModel,
  async recordAssistant(input) {
    await insertStudioAssistantTurn(input);
  },
  async saveSession(input) {
    await saveStudioSession(input);
  },
};

function emit(
  config: LangGraphRunnableConfig,
  payload: { document: StudioDocument; focus: StudioFocus; status: StudioStatus; targetRole: string },
) {
  config.writer?.({ type: 'studio-resume', ...payload });
}

function modelStep(report: StudioModelReport) {
  return {
    status: report.status,
    alias: report.alias,
    provider: report.provider,
    model: report.model,
    ...(report.method ? { method: report.method } : {}),
    functionId: report.functionId,
    promptVersion: report.promptVersion,
    latencyMs: report.latencyMs,
    inputTokens: report.inputTokens,
    outputTokens: report.outputTokens,
    ...(report.attempts > 0 ? { attempts: report.attempts } : {}),
    input: report.input,
    output: report.output,
    ...(report.note ? { note: report.note } : {}),
  };
}

export function buildStudioGraph(
  checkpointer: BaseCheckpointSaver,
  deps: StudioGraphDeps = defaultStudioDeps,
) {
  async function coach(state: StudioStateType, config: LangGraphRunnableConfig) {
    const { userId, thread_id } = getGraphCtx(config);
    const tracer = createStudioTracer(config, nextTraceSeq(state.traces));
    const phase = studioPhase({
      targetRole: state.targetRole,
      document: state.document,
      userText: state.lastUserText,
    });
    tracer.add({
      kind: 'observe',
      status: 'ok',
      title: `观察：${phase}`,
      input: jsonText({
        targetRole: state.targetRole,
        userText: state.lastUserText,
        materialsChars: state.materials.length,
        focus: state.focus,
        status: state.status,
      }),
      output: jsonText({ phase, meaning: PHASE_NOTE[phase] }),
      note: PHASE_NOTE[phase],
    });

    let modelId: string | undefined;
    let report: StudioModelReport | undefined;
    let proposal: StudioCoachProposal;
    try {
      proposal = studioCoachProposalSchema.parse(
        await deps.propose({
          phase,
          document: state.document,
          targetRole: state.targetRole,
          materials: state.materials,
          userText: state.lastUserText,
          sessionId: thread_id,
          signal: config.signal,
          onModelStart(start) {
            modelId = tracer.begin({
              kind: 'model',
              status: 'running',
              title: `模型 ${start.functionId}`,
              alias: start.alias,
              provider: start.provider,
              model: start.model,
              ...(start.method ? { method: start.method } : {}),
              functionId: start.functionId,
              promptVersion: start.promptVersion,
              input: start.input,
            });
          },
          reportModel(next) {
            report = next;
          },
        }),
      );
    } catch (error) {
      const note = report?.note || errorNote(error);
      if (modelId) tracer.complete(modelId, { ...(report ? modelStep(report) : {}), status: 'error', note });
      else {
        tracer.add({
          kind: 'model',
          status: 'error',
          title: '模型 studio.coach',
          functionId: 'studio.coach',
          note,
        });
      }
      throw error;
    }

    if (modelId && report) tracer.complete(modelId, modelStep(report));
    else {
      tracer.add({
        kind: 'model',
        status: 'ok',
        title: '模型 studio.coach',
        functionId: 'studio.coach',
        promptVersion: STUDIO_COACH_PROMPT_VERSION,
        output: jsonText(proposal),
        note: '这次提案没有带回模型调用明细。',
      });
    }

    tracer.add({
      kind: 'think',
      status: 'ok',
      title: '思考',
      output: report?.reasoning
        ? report.reasoning
        : jsonText({
            action: proposal.action,
            focus: proposal.focus,
            targetRole: proposal.targetRole,
            say: proposal.say,
          }),
      note: report?.reasoning
        ? '从模型输出里拆出的思维链，不会念给用户。'
        : '这次模型没有返回思维链。这里是结构化提案里的结论，完整 JSON 在模型输出里。',
    });

    const settled = settleCoachTurn({
      phase,
      proposal,
      corpus: state.materials,
      previous: state.document,
      userText: state.lastUserText,
      targetRole: state.targetRole,
    });
    tracer.add({
      kind: 'tool',
      status: 'ok',
      title: '工具 settleCoachTurn',
      input: jsonText({
        phase,
        proposal: {
          action: proposal.action,
          focus: proposal.focus,
          targetRole: proposal.targetRole,
          say: proposal.say,
        },
      }),
      output: jsonText({
        action: settled.action,
        focus: settled.focus,
        status: settled.status,
        targetRole: settled.targetRole,
        dropped: settled.dropped,
        proposedAction: settled.proposedAction,
        say: settled.say,
      }),
      note: settled.reason,
    });

    const document = fillStudioContact(settled.document, state.materials);
    const contactChanged =
      document.basics.phone !== settled.document.basics.phone ||
      document.basics.email !== settled.document.basics.email;
    tracer.add({
      kind: 'tool',
      status: 'ok',
      title: '工具 fillStudioContact',
      input: jsonText({ phone: settled.document.basics.phone, email: settled.document.basics.email }),
      output: jsonText({
        phone: document.basics.phone,
        email: document.basics.email,
        changed: contactChanged,
      }),
      note: contactChanged
        ? '原话里的电话或邮箱补进了还空着的栏。模型不抄联系方式。'
        : '电话和邮箱不交给模型抄。这一轮没有新的联系方式要补。',
    });

    const next = {
      document,
      targetRole: settled.targetRole,
      focus: settled.focus,
      status: settled.status,
      say: settled.say,
    };
    await deps.saveSession({
      userId,
      sessionId: thread_id,
      document,
      targetRole: settled.targetRole,
      focus: settled.focus,
      status: settled.status,
    });
    emit(config, next);
    return { ...next, traces: tracer.finished() };
  }

  async function speak(state: StudioStateType, config: LangGraphRunnableConfig) {
    const { userId, thread_id } = getGraphCtx(config);
    const tracer = createStudioTracer(config, nextTraceSeq(state.traces));
    const resolved = getChatModel('chat');
    const messages = [new SystemMessage(speakSystem()), new HumanMessage(speakHuman(state.say))];
    const modelId = tracer.begin({
      kind: 'model',
      status: 'running',
      title: '模型 studio.speak',
      alias: resolved.alias,
      provider: resolved.provider,
      model: resolved.id,
      functionId: 'studio.speak',
      promptVersion: STUDIO_SPEAK_PROMPT_VERSION,
      input: formatMessages(messages),
    });
    const started = Date.now();
    try {
      const model = getChatRunnable('chat');
      const res = await model.invoke(messages, {
        ...config,
        signal: llmTimeoutSignal(config.signal),
        metadata: {
          ...config.metadata,
          functionId: 'studio.speak',
          promptVersion: STUDIO_SPEAK_PROMPT_VERSION,
        },
      });
      const text = messageText(res).trim();
      const usage = usageOf(res);
      const reasoning = reasoningOf(res);
      tracer.complete(modelId, {
        status: 'ok',
        latencyMs: Date.now() - started,
        output: text || state.say,
        inputTokens: usage.input,
        outputTokens: usage.output,
        note: !text
          ? '模型没有开口，对话里改用已经定下来的那句。'
          : text !== state.say.trim()
            ? '开口文本和定稿不完全一样，对话里用的是模型输出。'
            : '开口文本按定稿说出。',
      });
      if (reasoning) {
        tracer.add({
          kind: 'think',
          status: 'ok',
          title: '思考',
          output: reasoning,
          note: '开口模型附带的思维链，不会念给用户。',
        });
      }
      const content = text || state.say;
      await deps.recordAssistant({ userId, sessionId: thread_id, content });
      return { messages: [res], traces: tracer.finished() };
    } catch (error) {
      tracer.complete(modelId, {
        status: 'error',
        latencyMs: Date.now() - started,
        note: errorNote(error),
      });
      throw error;
    }
  }

  function waitUser(state: StudioStateType, config: LangGraphRunnableConfig) {
    emit(config, {
      document: state.document,
      focus: state.focus,
      status: state.status,
      targetRole: state.targetRole,
    });
    const answer = interrupt<StudioInterruptValue, { turnId: string; text: string }>({ type: 'await_user' });
    const text = answer.text.trim();
    const materials = [state.materials, text].filter(Boolean).join('\n');
    return {
      lastUserText: text,
      materials,
      ...(text ? { messages: [new HumanMessage({ content: text, id: answer.turnId })] } : {}),
    };
  }

  return new StateGraph(StudioState)
    .addNode('coach', coach)
    .addNode('speak', speak)
    .addNode('wait_user', waitUser)
    .addEdge(START, 'coach')
    .addEdge('coach', 'speak')
    .addEdge('speak', 'wait_user')
    .addEdge('wait_user', 'coach')
    .compile({ checkpointer, name: 'studio' });
}

export type StudioGraph = ReturnType<typeof buildStudioGraph>;
