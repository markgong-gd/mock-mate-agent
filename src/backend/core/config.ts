/**
 * @file 【后端·core】业务开关
 * 文本长度和向量批次放这里，不散落在路由里。题数和追问上限在 shared/schemas/interview.ts。
 */
export const limits = {
  profileTextMaxChars: 50_000,
  jdTextMaxChars: 20_000,
  embedBatchSize: 16,
} as const;
