/**
 * @file 【智能体·llm】发送给模型前的 PII 脱敏
 * 做什么：把手机号、邮箱、18 位身份证号替换成占位符。
 * 为什么 P1 就要有：档案抽取的验收要求是发给模型的文本里没有手机号和邮箱。
 * P3 会把同一函数接到日志和所有模型入口；这里先覆盖抽取这条必经路径。
 * 局限：规则盖不住变体（全角数字、护照号、写在图片里的信息）。联系方式仍应在前端先抽走。
 */
export interface PiiHits {
  phone: number;
  email: number;
  idCard: number;
}

export interface RedactedText {
  text: string;
  hits: PiiHits;
}

const count = (pattern: RegExp, text: string) => (text.match(pattern) ?? []).length;

const ID_CARD = /(?<!\d)\d{17}[\dXx](?!\d)/g;
const PHONE = /(?<!\d)(?:\+?86[- ]?)?1[3-9](?:[- ]?\d){9}(?!\d)/g;
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;

/** 先证件号再手机号，避免 18 位证件号被截成一段手机号 */
export function redactPii(input: string): RedactedText {
  const hits: PiiHits = {
    idCard: count(ID_CARD, input),
    phone: count(PHONE, input),
    email: count(EMAIL, input),
  };
  const text = input.replace(ID_CARD, '[ID]').replace(PHONE, '[PHONE]').replace(EMAIL, '[EMAIL]');
  return { text, hits };
}

/** 抽取图使用的名字。counts 只记命中次数，不记原文 */
export function redactText(input: string) {
  const { text, hits } = redactPii(input);
  return { text, counts: hits };
}
