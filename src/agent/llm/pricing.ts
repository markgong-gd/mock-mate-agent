/**
 * @file 【智能体·llm】模型单价与成本估算（N-12、02 §5.6）
 * 做什么：按 `provider:model` 配单价（元 / 百万 token），estimateCost 把 token 换成钱。
 * 为什么不落库：单价会调整，把当时算出的钱存进 llm_calls 就对不上账；读的时候现算，口径永远一致。
 * 约定：单价没配就返回 null（页面显示“未配置单价”），**不要默认 0** —— 0 会被误读成“不花钱”。
 * 维护：价格需要人工跟 provider 的价目表同步，改动请在本文件注释里留日期。
 */

/** 元 / 百万 token */
export interface ModelPrice {
  input: number;
  output: number;
}

export const PRICE_UNIT_TOKENS = 1_000_000;

export const PRICE_CURRENCY = 'CNY' as const;

/**
 * key 为 `provider:model`（与 MODEL_* 的写法一致），`provider:*` 作为该 provider 的兜底。
 * provider 名字是 .env 里自定义的，所以这里只能覆盖常用写法，其余按 `*` 兜底或留空。
 * 价格核对日期：2026-10-25。
 */
export const MODEL_PRICES: Readonly<Record<string, ModelPrice>> = {
  // 本地与离线：不产生费用
  'fake:*': { input: 0, output: 0 },
  'ollama:*': { input: 0, output: 0 },
  // DeepSeek 官方（标准时段）
  'deepseek:deepseek-chat': { input: 2, output: 8 },
  'deepseek:deepseek-reasoner': { input: 4, output: 16 },
  // 阿里云百炼（OpenAI 兼容）
  'bailian:qwen-plus': { input: 0.8, output: 2 },
  'bailian:qwen-turbo': { input: 0.3, output: 0.6 },
  'bailian:qwen-max': { input: 2.4, output: 9.6 },
  // 智谱 GLM Flash 系列免费
  'zhipu:glm-4-flash': { input: 0, output: 0 },
  'zhipu:glm-4.5-flash': { input: 0, output: 0 },
};

/** 先精确匹配 provider:model，再退到 provider:*；都没有就是没配单价 */
export function priceOf(provider: string, model: string): ModelPrice | undefined {
  return MODEL_PRICES[`${provider}:${model}`] ?? MODEL_PRICES[`${provider}:*`];
}

export interface CostInput {
  provider: string;
  model: string;
  inputTokens?: number | null;
  outputTokens?: number | null;
}

/** 返回元；单价未配置时返回 null。保留 6 位小数，单次调用的金额很小 */
export function estimateCost(input: CostInput): number | null {
  const price = priceOf(input.provider, input.model);
  if (!price) return null;
  const cost =
    ((input.inputTokens ?? 0) * price.input + (input.outputTokens ?? 0) * price.output) / PRICE_UNIT_TOKENS;
  return Math.round(cost * 1e6) / 1e6;
}

/** 汇总多次调用：只要有一条没配单价，整笔就返回 null（宁可不显示，也不给错数） */
export function sumCost(items: readonly CostInput[]): number | null {
  let total = 0;
  for (const item of items) {
    const cost = estimateCost(item);
    if (cost === null) return null;
    total += cost;
  }
  return Math.round(total * 1e6) / 1e6;
}
