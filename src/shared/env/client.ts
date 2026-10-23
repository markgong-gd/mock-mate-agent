/**
 * @file 【公共·env】前端配置（浏览器可见）
 * 做什么：只解析 VITE_* 开头的非敏感变量；前端只能 import 这个文件。
 */
import { z } from 'zod';

const schema = z.object({
  VITE_APP_NAME: z.string().default('MockMate'),
});

/** 浏览器端只能读取 VITE_* 非敏感变量 */
export const clientEnv = schema.parse(import.meta.env);
