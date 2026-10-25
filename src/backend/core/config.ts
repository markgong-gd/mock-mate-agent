/**
 * @file 【后端·core】业务开关
 * 文本长度和向量批次放这里，不散落在路由里。面试题数、Token 上限等以后也加在这个文件。
 */
export const limits = {
  profileTextMaxChars: 50_000,
  jdTextMaxChars: 20_000,
  embedBatchSize: 16,
} as const;
