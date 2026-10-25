/**
 * @file 【前端·基础】从简历文本里用规则抽出联系方式
 * 做什么：手机号和邮箱留在浏览器，随确认请求写入档案，不作为抽取接口以外的模型输入。
 * 为什么不复用后端 redact.ts：前端按分层不能引用 agent。两份正则各管一件事：
 * 这里是“抽出来给人看”，后端是“发给模型之前盖住”。
 */
export interface ExtractedContact {
  phone: string;
  email: string;
  /** 去掉联系方式后的文本。发给后端的是这一份 */
  text: string;
}

const PHONE = /(?<!\d)(?:\+?86[-\s]?)?(1[3-9](?:[-\s]?\d){9})(?!\d)/g;
const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;

export function extractContact(raw: string): ExtractedContact {
  const phone = new RegExp(PHONE.source, 'g').exec(raw)?.[1]?.replace(/[-\s]/g, '') ?? '';
  const email = new RegExp(EMAIL.source, 'i').exec(raw)?.[0] ?? '';
  const text = raw
    .replace(PHONE, ' ')
    .replace(EMAIL, ' ')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
  return { phone, email, text };
}
