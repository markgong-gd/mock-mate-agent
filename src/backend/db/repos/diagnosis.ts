/**
 * @file 【后端·db】诊断报告、短板与技能得分历史仓储
 * rubrics 是全局表，没有 userId；其余每个方法都带 userId 并写进 where。
 * ensureReport 用 unique(session_id, rubric_version) 做幂等：面试结束触发几次都只有一份报告。
 * saveDiagnosis 在一个事务里写报告、短板和技能得分，诊断图的 persist 节点因此可以重跑。
 */
import { and, asc, desc, eq, sql } from 'drizzle-orm';
import { newId } from '@/shared/common/ids';
import type { DiagnosisScores, DiagnosisStatus, TrainingPlan } from '@/shared/schemas/diagnosis';
import type { RubricDefinition, RubricSeed } from '@/shared/schemas/rubric';
import type { WeaknessStatus } from '@/shared/schemas/weakness';
import { getDb } from '../client';
import {
  diagnosisReports,
  interviewSessions,
  jobTargets,
  rubrics,
  skillScoreHistory,
  weaknesses,
} from '../schema';

export interface RubricRow {
  version: string;
  active: boolean;
  definition: RubricDefinition;
}

export async function upsertRubrics(seeds: readonly RubricSeed[]): Promise<void> {
  const db = getDb();
  await db.transaction(async (tx) => {
    await tx.update(rubrics).set({ active: false });
    for (const seed of seeds) {
      await tx
        .insert(rubrics)
        .values({ version: seed.definition.version, definition: seed.definition, active: seed.active })
        .onConflictDoUpdate({
          target: rubrics.version,
          set: { definition: sql`excluded.definition`, active: sql`excluded.active` },
        });
    }
  });
}

export async function getRubric(version: string): Promise<RubricRow | null> {
  const [row] = await getDb()
    .select({ version: rubrics.version, active: rubrics.active, definition: rubrics.definition })
    .from(rubrics)
    .where(eq(rubrics.version, version));
  return row ?? null;
}

export async function getActiveRubric(): Promise<RubricRow | null> {
  const [row] = await getDb()
    .select({ version: rubrics.version, active: rubrics.active, definition: rubrics.definition })
    .from(rubrics)
    .where(eq(rubrics.active, true))
    .orderBy(desc(rubrics.createdAt))
    .limit(1);
  return row ?? null;
}

export interface ReportRow {
  id: string;
  sessionId: string;
  jobId: string;
  jobTitle: string;
  rubricVersion: string;
  status: DiagnosisStatus;
  error: string | null;
  overall: number | null;
  scores: DiagnosisScores | null;
  plan: TrainingPlan | null;
  createdAt: Date;
  updatedAt: Date;
}

const reportColumns = {
  id: diagnosisReports.id,
  sessionId: diagnosisReports.sessionId,
  jobId: interviewSessions.jobTargetId,
  jobTitle: jobTargets.title,
  rubricVersion: diagnosisReports.rubricVersion,
  status: diagnosisReports.status,
  error: diagnosisReports.error,
  overall: diagnosisReports.overall,
  scores: diagnosisReports.scores,
  plan: diagnosisReports.plan,
  createdAt: diagnosisReports.createdAt,
  updatedAt: diagnosisReports.updatedAt,
};

function reportQuery(userId: string) {
  return getDb()
    .select(reportColumns)
    .from(diagnosisReports)
    .innerJoin(interviewSessions, eq(interviewSessions.id, diagnosisReports.sessionId))
    .innerJoin(
      jobTargets,
      and(eq(jobTargets.id, interviewSessions.jobTargetId), eq(jobTargets.userId, userId)),
    );
}

export async function getReport(userId: string, reportId: string): Promise<ReportRow | null> {
  const [row] = await reportQuery(userId).where(
    and(eq(diagnosisReports.userId, userId), eq(diagnosisReports.id, reportId)),
  );
  return row ?? null;
}

export async function findReportBySession(userId: string, sessionId: string): Promise<ReportRow | null> {
  const [row] = await reportQuery(userId)
    .where(and(eq(diagnosisReports.userId, userId), eq(diagnosisReports.sessionId, sessionId)))
    .orderBy(desc(diagnosisReports.createdAt))
    .limit(1);
  return row ?? null;
}

export async function listReports(userId: string, limit = 20): Promise<ReportRow[]> {
  return reportQuery(userId)
    .where(eq(diagnosisReports.userId, userId))
    .orderBy(desc(diagnosisReports.createdAt))
    .limit(limit);
}

/** 幂等建档：已有同一 (session, rubric) 的报告时原样返回，created 为 false */
export async function ensureReport(input: {
  userId: string;
  sessionId: string;
  rubricVersion: string;
}): Promise<{ id: string; status: DiagnosisStatus; created: boolean }> {
  const [inserted] = await getDb()
    .insert(diagnosisReports)
    .values({
      id: newId(),
      userId: input.userId,
      sessionId: input.sessionId,
      rubricVersion: input.rubricVersion,
      status: 'pending',
    })
    .onConflictDoNothing({ target: [diagnosisReports.sessionId, diagnosisReports.rubricVersion] })
    .returning({ id: diagnosisReports.id, status: diagnosisReports.status });
  if (inserted) return { ...inserted, created: true };

  const [existing] = await getDb()
    .select({ id: diagnosisReports.id, status: diagnosisReports.status })
    .from(diagnosisReports)
    .where(
      and(
        eq(diagnosisReports.userId, input.userId),
        eq(diagnosisReports.sessionId, input.sessionId),
        eq(diagnosisReports.rubricVersion, input.rubricVersion),
      ),
    );
  if (!existing) throw new Error('诊断报告写入后读不到');
  return { ...existing, created: false };
}

export async function setReportStatus(
  userId: string,
  reportId: string,
  status: DiagnosisStatus,
  error?: string | null,
): Promise<void> {
  await getDb()
    .update(diagnosisReports)
    .set({ status, error: error ?? null, updatedAt: new Date() })
    .where(and(eq(diagnosisReports.userId, userId), eq(diagnosisReports.id, reportId)));
}

export interface WeaknessRow {
  id: string;
  tag: string;
  title: string;
  detail: string;
  severity: number;
  status: WeaknessStatus;
  evidenceTurnId: string | null;
  evidenceQuote: string;
}

export async function listWeaknessesByReport(userId: string, reportId: string): Promise<WeaknessRow[]> {
  return getDb()
    .select({
      id: weaknesses.id,
      tag: weaknesses.tag,
      title: weaknesses.title,
      detail: weaknesses.detail,
      severity: weaknesses.severity,
      status: weaknesses.status,
      evidenceTurnId: weaknesses.evidenceTurnId,
      evidenceQuote: weaknesses.evidenceQuote,
    })
    .from(weaknesses)
    .where(and(eq(weaknesses.userId, userId), eq(weaknesses.reportId, reportId)))
    .orderBy(desc(weaknesses.severity), asc(weaknesses.tag));
}

export interface SaveDiagnosisInput {
  userId: string;
  reportId: string;
  sessionId: string;
  rubricVersion: string;
  scores: DiagnosisScores;
  plan: TrainingPlan;
  weaknesses: readonly {
    tag: string;
    title: string;
    detail: string;
    severity: number;
    evidenceTurnId: string | null;
    evidenceQuote: string;
  }[];
}

/** 单事务：报告 + 短板 + 技能得分历史。重跑时按唯一键 upsert，不会重复累加 */
export async function saveDiagnosis(input: SaveDiagnosisInput): Promise<void> {
  const db = getDb();
  await db.transaction(async (tx) => {
    await tx
      .update(diagnosisReports)
      .set({
        status: 'done',
        error: null,
        overall: input.scores.overall,
        scores: input.scores,
        plan: input.plan,
        updatedAt: new Date(),
      })
      .where(and(eq(diagnosisReports.userId, input.userId), eq(diagnosisReports.id, input.reportId)));

    await tx
      .delete(weaknesses)
      .where(and(eq(weaknesses.userId, input.userId), eq(weaknesses.reportId, input.reportId)));
    if (input.weaknesses.length > 0) {
      await tx.insert(weaknesses).values(
        input.weaknesses.map((item) => ({
          id: newId(),
          userId: input.userId,
          reportId: input.reportId,
          sessionId: input.sessionId,
          tag: item.tag,
          title: item.title,
          detail: item.detail,
          severity: item.severity,
          evidenceTurnId: item.evidenceTurnId,
          evidenceQuote: item.evidenceQuote,
        })),
      );
    }

    await tx
      .delete(skillScoreHistory)
      .where(and(eq(skillScoreHistory.userId, input.userId), eq(skillScoreHistory.reportId, input.reportId)));
    if (input.scores.skills.length > 0) {
      await tx.insert(skillScoreHistory).values(
        input.scores.skills.map((skill) => ({
          id: newId(),
          userId: input.userId,
          reportId: input.reportId,
          sessionId: input.sessionId,
          tag: skill.tag,
          score: skill.score,
          sampleCount: skill.count,
          rubricVersion: input.rubricVersion,
        })),
      );
    }
  });
}
