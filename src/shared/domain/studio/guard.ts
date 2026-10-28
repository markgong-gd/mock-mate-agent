/**
 * @file 【公共·domain】策划简历防编造
 * 新出现的公司、职位、学校、技能、电话、邮箱，以及任何数字和百分比，必须能在用户原话里找到。
 * 对不上的句子丢掉，已经接受过的字段保留。空白不会把已有内容擦掉。
 */
import type {
  StudioDocument,
  StudioEducation,
  StudioExperience,
  StudioProject,
} from '@/shared/schemas/studio';

const NUMBER_RE = /\d+(?:\.\d+)?%?/g;
const PHONE_RE = /(?<!\d)(?:\+?86[- ]?)?(1[3-9](?:[- ]?\d){9})(?!\d)/;
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;

export interface StudioGuardResult {
  document: StudioDocument;
  /** 被丢掉或退回旧值的字段数 */
  dropped: number;
}

export function mentionedIn(corpus: string, needle: string): boolean {
  const text = needle.trim();
  if (!text) return false;
  return corpus.toLowerCase().includes(text.toLowerCase());
}

function unknownNumbers(text: string, corpus: string): boolean {
  const nums = text.match(NUMBER_RE) ?? [];
  return nums.some((num) => !corpus.includes(num));
}

function keepText(prev: string, next: string, corpus: string, dropped: { n: number }): string {
  const value = next.trim();
  if (!value || value === prev.trim()) return prev;
  if (unknownNumbers(value, corpus)) {
    dropped.n += 1;
    return prev;
  }
  return value;
}

function keepGrounded(prev: string, next: string, corpus: string, dropped: { n: number }): string {
  const value = next.trim();
  if (!value || value === prev.trim()) return prev;
  if (!mentionedIn(corpus, value) || unknownNumbers(value, corpus)) {
    dropped.n += 1;
    return prev;
  }
  return value;
}

function keepBullets(prev: string[], next: string[], corpus: string, dropped: { n: number }): string[] {
  if (next.length === 0) return prev;
  const prevSet = new Set(prev);
  const kept: string[] = [];
  for (const bullet of next) {
    const value = bullet.trim();
    if (!value) continue;
    if (prevSet.has(value)) {
      if (!kept.includes(value)) kept.push(value);
      continue;
    }
    if (unknownNumbers(value, corpus)) {
      dropped.n += 1;
      continue;
    }
    if (!kept.includes(value)) kept.push(value);
  }
  return kept.slice(0, 8);
}

function keepSkills(prev: string[], next: string[], corpus: string, dropped: { n: number }): string[] {
  if (next.length === 0) return prev;
  const prevSet = new Set(prev);
  const kept: string[] = [];
  for (const skill of next) {
    const value = skill.trim();
    if (!value) continue;
    if (prevSet.has(value) || (mentionedIn(corpus, value) && !unknownNumbers(value, corpus))) {
      if (!kept.includes(value)) kept.push(value);
    } else {
      dropped.n += 1;
    }
  }
  return kept.slice(0, 24);
}

function align<T>(
  prev: T[],
  next: T[],
  merge: (prevItem: T | undefined, nextItem: T | undefined) => T | null,
): T[] {
  const out: T[] = [];
  const len = Math.max(prev.length, next.length);
  for (let i = 0; i < len; i += 1) {
    const merged = merge(prev[i], next[i]);
    if (merged) out.push(merged);
  }
  return out;
}

function mergeExperience(
  prev: StudioExperience | undefined,
  next: StudioExperience | undefined,
  corpus: string,
  dropped: { n: number },
): StudioExperience | null {
  if (!next) return prev ?? null;
  const org = keepGrounded(prev?.org ?? '', next.org, corpus, dropped);
  const title = keepGrounded(prev?.title ?? '', next.title, corpus, dropped);
  const start = keepGrounded(prev?.start ?? '', next.start, corpus, dropped);
  const end = keepGrounded(prev?.end ?? '', next.end, corpus, dropped);
  const bullets = keepBullets(prev?.bullets ?? [], next.bullets, corpus, dropped);
  if (!org && !title && !start && !end && bullets.length === 0) return prev ?? null;
  return { org, title, start, end, bullets };
}

function mergeProject(
  prev: StudioProject | undefined,
  next: StudioProject | undefined,
  corpus: string,
  dropped: { n: number },
): StudioProject | null {
  if (!next) return prev ?? null;
  const name = keepGrounded(prev?.name ?? '', next.name, corpus, dropped);
  const itemBullets = keepBullets(prev?.bullets ?? [], next.bullets, corpus, dropped);
  if (!name && itemBullets.length === 0) return prev ?? null;
  return { name, bullets: itemBullets };
}

function mergeEducation(
  prev: StudioEducation | undefined,
  next: StudioEducation | undefined,
  corpus: string,
  dropped: { n: number },
): StudioEducation | null {
  if (!next) return prev ?? null;
  const school = keepGrounded(prev?.school ?? '', next.school, corpus, dropped);
  const degree = keepGrounded(prev?.degree ?? '', next.degree, corpus, dropped);
  const start = keepGrounded(prev?.start ?? '', next.start, corpus, dropped);
  const end = keepGrounded(prev?.end ?? '', next.end, corpus, dropped);
  const itemBullets = keepBullets(prev?.bullets ?? [], next.bullets, corpus, dropped);
  if (!school && !degree && !start && !end && itemBullets.length === 0) return prev ?? null;
  return { school, degree, start, end, bullets: itemBullets };
}

export function studioDocumentsEqual(a: StudioDocument, b: StudioDocument): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function guardStudioDocument(
  previous: StudioDocument,
  proposed: StudioDocument,
  corpus: string,
): StudioGuardResult {
  const dropped = { n: 0 };
  const document: StudioDocument = {
    basics: {
      name: keepGrounded(previous.basics.name, proposed.basics.name, corpus, dropped),
      headline: keepText(previous.basics.headline, proposed.basics.headline, corpus, dropped),
      phone: keepGrounded(previous.basics.phone, proposed.basics.phone, corpus, dropped),
      email: keepGrounded(previous.basics.email, proposed.basics.email, corpus, dropped),
      location: keepGrounded(previous.basics.location, proposed.basics.location, corpus, dropped),
    },
    summary: keepText(previous.summary, proposed.summary, corpus, dropped),
    skills: keepSkills(previous.skills, proposed.skills, corpus, dropped),
    experiences: align(previous.experiences, proposed.experiences, (prev, next) =>
      mergeExperience(prev, next, corpus, dropped),
    ).slice(0, 8),
    projects: align(previous.projects, proposed.projects, (prev, next) =>
      mergeProject(prev, next, corpus, dropped),
    ).slice(0, 8),
    education: align(previous.education, proposed.education, (prev, next) =>
      mergeEducation(prev, next, corpus, dropped),
    ).slice(0, 6),
  };
  return { document, dropped: dropped.n };
}

/** 电话和邮箱不交给模型抄。用户原话里有，就补进还空着的栏 */
export function fillStudioContact(document: StudioDocument, corpus: string): StudioDocument {
  const phone = PHONE_RE.exec(corpus)?.[1]?.replace(/[- ]/g, '') ?? '';
  const email = EMAIL_RE.exec(corpus)?.[0] ?? '';
  if ((!phone || document.basics.phone) && (!email || document.basics.email)) return document;
  return {
    ...document,
    basics: {
      ...document.basics,
      phone: document.basics.phone || phone,
      email: document.basics.email || email,
    },
  };
}
