/**
 * @file 【后端·db】诊断报告、短板与技能得分历史
 * rubrics 是全局数据（不含 PII），按 version 做主键，同一时间只有一个 active。
 * diagnosis_reports 的 unique(session_id, rubric_version) 就是诊断的幂等键：
 * 面试结束时 insert ... on conflict do nothing，重复触发不会跑第二遍。
 * weaknesses / skill_score_history 要做统计和趋势，所以单独建表，不塞进 scores（jsonb）。
 */
import {
  boolean,
  index,
  jsonb,
  pgTable,
  real,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import type { DiagnosisScores, TrainingPlan } from '@/shared/schemas/diagnosis';
import type { RubricDefinition } from '@/shared/schemas/rubric';
import { interviewSessions, interviewTurns } from './interview';
import { users } from './users';

const userId = () =>
  uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' });

export const rubrics = pgTable('rubrics', {
  version: text('version').primaryKey(),
  definition: jsonb('definition').$type<RubricDefinition>().notNull(),
  active: boolean('active').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const diagnosisReports = pgTable(
  'diagnosis_reports',
  {
    id: uuid('id').primaryKey(),
    userId: userId(),
    sessionId: uuid('session_id')
      .notNull()
      .references(() => interviewSessions.id, { onDelete: 'cascade' }),
    /** 不建外键：Rubric 下线后旧报告仍要能读出自己的版本号 */
    rubricVersion: text('rubric_version').notNull(),
    status: text('status', { enum: ['pending', 'running', 'done', 'failed'] })
      .notNull()
      .default('pending'),
    error: text('error'),
    /** 单独一列，列表和成长曲线不必反序列化整份 scores */
    overall: real('overall'),
    scores: jsonb('scores').$type<DiagnosisScores>(),
    plan: jsonb('plan').$type<TrainingPlan>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('diagnosis_reports_session_rubric_idx').on(t.sessionId, t.rubricVersion),
    index('diagnosis_reports_user_created_idx').on(t.userId, t.createdAt.desc()),
  ],
);

export const weaknesses = pgTable(
  'weaknesses',
  {
    id: uuid('id').primaryKey(),
    userId: userId(),
    reportId: uuid('report_id')
      .notNull()
      .references(() => diagnosisReports.id, { onDelete: 'cascade' }),
    sessionId: uuid('session_id')
      .notNull()
      .references(() => interviewSessions.id, { onDelete: 'cascade' }),
    tag: text('tag').notNull(),
    title: text('title').notNull(),
    detail: text('detail').notNull(),
    severity: smallint('severity').notNull(),
    status: text('status', { enum: ['open', 'improving', 'closed'] })
      .notNull()
      .default('open'),
    /** 证据指向的那一轮回答；轮次被删时留下原话 */
    evidenceTurnId: uuid('evidence_turn_id').references(() => interviewTurns.id, { onDelete: 'set null' }),
    evidenceQuote: text('evidence_quote').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // 一份报告在同一个技能上只留一条：重试诊断时 upsert，不会越积越多
    uniqueIndex('weaknesses_report_tag_idx').on(t.reportId, t.tag),
    index('weaknesses_user_status_idx').on(t.userId, t.status, t.createdAt.desc()),
  ],
);

export const skillScoreHistory = pgTable(
  'skill_score_history',
  {
    id: uuid('id').primaryKey(),
    userId: userId(),
    reportId: uuid('report_id')
      .notNull()
      .references(() => diagnosisReports.id, { onDelete: 'cascade' }),
    sessionId: uuid('session_id')
      .notNull()
      .references(() => interviewSessions.id, { onDelete: 'cascade' }),
    tag: text('tag').notNull(),
    score: real('score').notNull(),
    /** 这个技能在本场被问到的题数 */
    sampleCount: smallint('sample_count').notNull(),
    rubricVersion: text('rubric_version').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('skill_score_history_report_tag_idx').on(t.reportId, t.tag),
    index('skill_score_history_user_tag_idx').on(t.userId, t.tag, t.createdAt),
  ],
);
