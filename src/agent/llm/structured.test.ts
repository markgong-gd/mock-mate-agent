/**
 * @file 【测试】结构化输出：JSON 提取、修复重试、fallback、最终失败
 */
import { HumanMessage, type BaseMessage } from '@langchain/core/messages';
import type { ChatResult } from '@langchain/core/outputs';
import { FakeListChatModel } from '@langchain/core/utils/testing';
import { afterEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { setServerEnvForTesting } from '@/shared/env/server';
import { useTestEnv } from '../../../tests/helpers/env';
import { DEFAULT_CAPS, type ModelCaps } from './caps';
import { setChatModelForTesting } from './registry';
import { extractJson, generateStructured } from './structured';

class RecordingFake extends FakeListChatModel {
  calls: BaseMessage[][] = [];
  override async _generate(messages: BaseMessage[], options: this['ParsedCallOptions']): Promise<ChatResult> {
    this.calls.push(messages);
    return super._generate(messages, options);
  }
}

const Person = z.object({ name: z.string().min(1), years: z.number().int().min(0) });
const meta = { functionId: 'test.extract', promptVersion: 'test@1' };

function inject(
  alias: 'extract' | 'fallback',
  responses: string[],
  caps: Partial<ModelCaps>,
  id = `fake:${alias}`,
) {
  const model = new RecordingFake({ responses });
  setChatModelForTesting(alias, {
    id,
    provider: 'fake',
    kind: 'openai-compatible',
    modelName: alias,
    model,
    caps: { ...DEFAULT_CAPS, ...caps },
    jsonModeOptions: { response_format: { type: 'json_object' } },
  });
  return model;
}

afterEach(() => setServerEnvForTesting(undefined));

describe('extractJson', () => {
  it('剥离思考内容与代码块', () => {
    expect(extractJson('<think>嗯</think>```json\n{"a":1}\n```')).toEqual({ ok: true, value: { a: 1 } });
    expect(extractJson('结果如下：{"a":[1,2]} 完毕')).toEqual({ ok: true, value: { a: [1, 2] } });
    expect(extractJson('没有 JSON').ok).toBe(false);
  });
});

describe('generateStructured', () => {
  it('仅支持 json_mode 的模型：首次输出不合法 → 携带校验错误修复重试 → 通过', async () => {
    useTestEnv();
    const m = inject('extract', ['{"name":"张三","years":"三"}', '{"name":"张三","years":3}'], {
      jsonMode: true,
    });
    const out = await generateStructured('extract', Person, [new HumanMessage('提取')], meta);
    expect(out).toEqual({ name: '张三', years: 3 });
    expect(m.calls).toHaveLength(2);
    const firstSystem = String(m.calls[0]![0]!.content);
    expect(firstSystem).toContain('JSON Schema');
    const repair = String(m.calls[1]!.at(-1)!.content);
    expect(repair).toContain('years');
    expect(repair).toContain('没有通过校验');
  });

  it('Prompt 方式：非 JSON 输出也能修复', async () => {
    useTestEnv();
    const m = inject('extract', ['抱歉我不会', '{"name":"李四","years":0}'], {});
    await expect(generateStructured('extract', Person, [new HumanMessage('x')], meta)).resolves.toEqual({
      name: '李四',
      years: 0,
    });
    expect(String(m.calls[1]!.at(-1)!.content)).toContain('没有 JSON');
  });

  it('修复后仍失败 → 切 fallback 再试一次', async () => {
    useTestEnv({ MODEL_FALLBACK: 'fake:fb' });
    inject('extract', ['bad', 'still bad'], { jsonMode: true });
    const fb = inject('fallback', ['{"name":"王五","years":5}'], { jsonMode: true }, 'fake:fb');
    await expect(generateStructured('extract', Person, [new HumanMessage('x')], meta)).resolves.toEqual({
      name: '王五',
      years: 5,
    });
    expect(fb.calls).toHaveLength(1);
  });

  it('无 fallback 且修复失败 → LLM_SCHEMA_INVALID', async () => {
    useTestEnv();
    inject('extract', ['bad', 'bad again'], { jsonMode: true });
    await expect(generateStructured('extract', Person, [new HumanMessage('x')], meta)).rejects.toMatchObject({
      code: 'LLM_SCHEMA_INVALID',
    });
  });
});
