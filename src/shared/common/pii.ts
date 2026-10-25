/**
 * @file 【公共·common】PII 脱敏规则（零依赖，前后端共用）
 * 做什么：把手机号、邮箱、18 位证件号替换成占位符；redactPiiDeep 供日志按对象整体脱敏。
 * 为什么放 common：脱敏有两类出口——发给模型（agent/llm/redact.ts）和写日志（common/logger.ts）。
 *   logger 属于 shared/common，不允许依赖 agent，所以规则下沉到这里，由上层各自包一层（N-3）。
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

export const piiHitCount = (hits: PiiHits): number => hits.phone + hits.email + hits.idCard;

export const hasPii = (input: string): boolean => piiHitCount(redactPii(input).hits) > 0;

/** 只认“字面量对象”：Date / Buffer / 类实例不递归，避免把它们拍平成普通对象 */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null) return false;
  const proto = Object.getPrototypeOf(value) as unknown;
  return proto === Object.prototype || proto === null;
}

/**
 * 递归脱敏：字符串替换占位符，数组与字面量对象逐项处理。
 * Error 转成 pino 标准 err 形状（type / message / stack），这样栈里的 PII 也会被盖掉。
 * depth 用完后原样返回，防止深层结构把日志调用拖慢。
 */
export function redactPiiDeep(value: unknown, depth = 4): unknown {
  if (typeof value === 'string') return redactPii(value).text;
  if (depth <= 0) return value;
  if (Array.isArray(value)) return value.map((item) => redactPiiDeep(item, depth - 1));
  if (value instanceof Error) {
    return {
      type: value.name,
      message: redactPii(value.message).text,
      ...(value.stack ? { stack: redactPii(value.stack).text } : {}),
    };
  }
  if (isPlainObject(value)) {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) out[key] = redactPiiDeep(item, depth - 1);
    return out;
  }
  return value;
}
