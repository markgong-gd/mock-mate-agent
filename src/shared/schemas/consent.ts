/**
 * @file 【公共·schemas】上传前同意
 * 做什么：定义简历解析的同意目的与版本。版本变了，旧同意失效，需要重新确认。
 * 为什么单独一条：简历可能含证件号，属于敏感个人信息，不同意就不能解析（N-4）。
 */
import { z } from 'zod';

export const RESUME_PARSE_CONSENT = {
  purpose: 'resume_parse',
  version: '2026-10-24',
  title: '简历解析用途说明',
  points: [
    '只把浏览器提取出的文本发给模型，不上传、不保存 PDF 原文件。',
    '手机号、邮箱、证件号会在发送前脱敏；联系方式由你在确认页填写，不经过模型。',
    '解析结果需你确认后才写入职业档案，用于定制简历和之后的模拟面试。',
    '个人使用阶段如果选用境外模型，这段文本会出境。对外开放前不会这样做。',
  ],
} as const;

export const consentGrantSchema = z.object({
  purpose: z.literal(RESUME_PARSE_CONSENT.purpose),
  version: z.literal(RESUME_PARSE_CONSENT.version),
});

export type ConsentGrant = z.infer<typeof consentGrantSchema>;
