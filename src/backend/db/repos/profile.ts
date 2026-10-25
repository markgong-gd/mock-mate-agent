/**
 * @file 【后端·db】档案仓储
 * 做什么：按 userId 读写档案。saveProfile 在一个事务里整份替换经历、事实和技能。
 * 为什么整份替换：确认页提交的是用户看过的完整快照。按 id 增量合并更容易把用户删掉的事实留在库里。
 * 代价：保存时向量会清空，要重新 embed。个人档案规模很小，可以接受。
 */
import { and, asc, eq, isNull, ne, or } from 'drizzle-orm';
import { newId } from '@/shared/common/ids';
import type { ProfileBody } from '@/shared/schemas/profile';
import { getDb } from '../client';
import { experiences, facts, profiles, skills } from '../schema';

const emptyToNull = (value: string) => {
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
};

export async function getProfile(userId: string): Promise<ProfileBody | null> {
  const db = getDb();
  const [profile] = await db.select().from(profiles).where(eq(profiles.userId, userId));
  if (!profile) return null;
  const expRows = await db
    .select()
    .from(experiences)
    .where(eq(experiences.userId, userId))
    .orderBy(asc(experiences.sortOrder));
  const factRows = await db.select().from(facts).where(eq(facts.userId, userId)).orderBy(asc(facts.sortOrder));
  const skillRows = await db.select().from(skills).where(eq(skills.userId, userId));
  return {
    contact: { name: profile.name, phone: profile.phone ?? '', email: profile.email ?? '' },
    headline: profile.headline,
    summary: profile.summary,
    experiences: expRows.map((exp) => ({
      id: exp.id,
      company: exp.company,
      title: exp.title,
      start: exp.startDate,
      end: exp.endDate,
      summary: exp.summary,
      facts: factRows
        .filter((fact) => fact.experienceId === exp.id)
        .map((fact) => ({ id: fact.id, text: fact.text })),
    })),
    skills: skillRows.map((skill) => ({
      id: skill.id,
      name: skill.name,
      tag: skill.tag as ProfileBody['skills'][number]['tag'],
    })),
  };
}

/** 确认后的整份档案。事实 id 沿用客户端传来的值，这样改字不会打断已有简历的引用 */
export async function saveProfile(userId: string, body: ProfileBody): Promise<ProfileBody> {
  const db = getDb();
  await db.transaction(async (tx) => {
    const [existing] = await tx.select({ id: profiles.id }).from(profiles).where(eq(profiles.userId, userId));
    const profileId = existing?.id ?? newId();
    const row = {
      name: body.contact.name,
      headline: body.headline,
      summary: body.summary,
      phone: emptyToNull(body.contact.phone),
      email: emptyToNull(body.contact.email),
      updatedAt: new Date(),
    };
    if (existing) {
      await tx.update(profiles).set(row).where(and(eq(profiles.id, profileId), eq(profiles.userId, userId)));
      await tx.delete(experiences).where(eq(experiences.userId, userId));
      await tx.delete(skills).where(eq(skills.userId, userId));
    } else {
      await tx.insert(profiles).values({ id: profileId, userId, ...row });
    }
    if (body.experiences.length > 0) {
      await tx.insert(experiences).values(
        body.experiences.map((exp, index) => ({
          id: exp.id,
          userId,
          profileId,
          company: exp.company,
          title: exp.title,
          startDate: exp.start,
          endDate: exp.end,
          summary: exp.summary,
          sortOrder: index,
        })),
      );
      const factValues = body.experiences.flatMap((exp) =>
        exp.facts.map((fact, index) => ({
          id: fact.id,
          userId,
          experienceId: exp.id,
          text: fact.text,
          sortOrder: index,
        })),
      );
      if (factValues.length > 0) await tx.insert(facts).values(factValues);
    }
    if (body.skills.length > 0) {
      const seen = new Set<string>();
      const skillValues = body.skills.flatMap((skill) => {
        if (seen.has(skill.tag)) return [];
        seen.add(skill.tag);
        return [{ id: skill.id, userId, profileId, name: skill.name, tag: skill.tag }];
      });
      if (skillValues.length > 0) await tx.insert(skills).values(skillValues);
    }
  });
  const saved = await getProfile(userId);
  if (!saved) throw new Error('档案保存后读不到');
  return saved;
}

export interface FactSnippet {
  id: string;
  experienceId: string;
  text: string;
}

export async function listFactSnippets(userId: string): Promise<FactSnippet[]> {
  const rows = await getDb()
    .select({ id: facts.id, experienceId: facts.experienceId, text: facts.text })
    .from(facts)
    .where(eq(facts.userId, userId))
    .orderBy(asc(facts.sortOrder));
  return rows;
}

export async function listFactsNeedingEmbed(userId: string, embedModel: string, limit: number) {
  return getDb()
    .select({ id: facts.id, text: facts.text })
    .from(facts)
    .where(
      and(
        eq(facts.userId, userId),
        or(isNull(facts.embedding), isNull(facts.embedModel), ne(facts.embedModel, embedModel)),
      ),
    )
    .limit(limit);
}

export async function writeFactEmbedding(input: {
  userId: string;
  id: string;
  embedding: number[];
  embedModel: string;
}) {
  await getDb()
    .update(facts)
    .set({ embedding: input.embedding, embedModel: input.embedModel })
    .where(and(eq(facts.id, input.id), eq(facts.userId, input.userId)));
}
