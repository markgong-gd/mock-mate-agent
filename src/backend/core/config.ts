/**
 * @file 【后端·core】业务开关
 * 文本长度和向量批次放这里，不散落在路由里。题数和追问上限在 shared/schemas/interview.ts。
 */
export const limits = {
  profileTextMaxChars: 50_000,
  jdTextMaxChars: 20_000,
  embedBatchSize: 16,
  /**
   * 单场面试的 Token 上限（输入 + 输出，含这场的诊断）。超过就不再推进，返回 BUDGET_EXCEEDED（N-12、02 §5.6）。
   * 估算：12 题 + 追问 + 诊断逐题打分，按便宜模型算大约 6 万 token，留 2 倍余量。
   */
  sessionTokenBudget: 120_000,
} as const;
