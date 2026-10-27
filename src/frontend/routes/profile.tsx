/**
 * @file 【前端·页面】职业档案
 * 流程：同意 → 浏览器抽出 PDF 文本和联系方式 → 抽取草稿（不落库）→ 用户改完再保存。
 * 也可以不上传，从空白填写技术栈、熟练度和事实，确认后走同一个保存接口。
 * 联系方式来自本页的规则抽取，抽取接口只收到简历正文，模型侧还会再脱敏一次。
 * 页面底部是诊断写回的短板（R-P3）：跨会话累积，只读。
 */
import { useState } from 'react';
import { Link } from 'react-router';
import { Loader2 } from 'lucide-react';
import { Badge } from '@/frontend/components/ui/badge';
import { Button } from '@/frontend/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/frontend/components/ui/card';
import { Input } from '@/frontend/components/ui/input';
import { Textarea } from '@/frontend/components/ui/textarea';
import {
  useExtractProfile,
  useGrantConsent,
  useProfile,
  useResumeConsent,
  useSaveProfile,
} from '@/frontend/features/profile/queries';
import { ApiClientError } from '@/frontend/lib/api';
import { extractContact } from '@/frontend/lib/contact';
import { extractPdfText } from '@/frontend/lib/pdf-text';
import { RESUME_PARSE_CONSENT } from '@/shared/schemas/consent';
import type { ProfileBody } from '@/shared/schemas/profile';
import { SKILL_CATALOG, skillLabel } from '@/shared/schemas/skill-tags';
import type { ProfileWeakness } from '@/shared/schemas/weakness';

type Draft = Omit<ProfileBody, 'contact'>;

const LEVEL_LABEL = { used: '用过', proficient: '熟练', expert: '深入' } as const;

function blankProfile(previous: ProfileBody | null): ProfileBody {
  return {
    contact: {
      name: previous?.contact.name ?? '',
      phone: previous?.contact.phone ?? '',
      email: previous?.contact.email ?? '',
    },
    headline: '待填写方向',
    summary: '待填写一段能核对的简介',
    experiences: [
      {
        id: crypto.randomUUID(),
        company: '待填写公司或项目',
        title: '待填写角色',
        start: '2020-01',
        end: null,
        summary: '',
        facts: [{ id: crypto.randomUUID(), text: '待填写一条可核对的事实，尽量写上结果' }],
      },
    ],
    skills: [
      {
        id: crypto.randomUUID(),
        name: '待填写技能',
        tag: 'javascript',
        level: 'used',
        evidenceFactIds: [],
      },
    ],
  };
}

function messageOf(error: unknown) {
  return error instanceof ApiClientError
    ? `${error.code}：${error.message}`
    : error instanceof Error
      ? error.message
      : '操作失败';
}

export default function ProfilePage() {
  const consent = useResumeConsent();
  const saved = useProfile();
  const grant = useGrantConsent();
  const extract = useExtractProfile();
  const save = useSaveProfile();
  const [agreed, setAgreed] = useState(false);
  const [text, setText] = useState('');
  const [editor, setEditor] = useState<ProfileBody | null>(null);
  const [note, setNote] = useState('');

  const profile = editor ?? saved.data?.profile ?? null;
  const granted = consent.data?.granted === true;
  const canExtract = (granted || agreed) && text.trim().length >= 10;

  async function onFile(file: File | undefined) {
    if (!file) return;
    setNote('');
    try {
      const extracted = await extractPdfText(file);
      setText(extracted);
    } catch (error) {
      setNote(messageOf(error));
    }
  }

  async function onExtract() {
    setNote('');
    try {
      if (!granted) await grant.mutateAsync();
      const contact = extractContact(text);
      const result = await extract.mutateAsync(contact.text);
      const previous = editor ?? saved.data?.profile;
      setEditor({
        ...(result.draft as Draft),
        contact: {
          name: previous?.contact.name ?? '',
          phone: contact.phone || previous?.contact.phone || '',
          email: contact.email || previous?.contact.email || '',
        },
      });
      const hits = result.redacted.phone + result.redacted.email + result.redacted.idCard;
      setNote(
        hits > 0
          ? `已从发给模型的文本中隐去 ${hits} 处联系方式。请核对下面的草稿后再保存。`
          : '请核对草稿后再保存。草稿尚未写入档案。',
      );
    } catch (error) {
      setNote(messageOf(error));
    }
  }

  async function onSave() {
    if (!profile) return;
    setNote('');
    try {
      await save.mutateAsync(profile);
      setEditor(null);
      setNote('档案已保存。事实会在后台向量化，供定制简历引用。');
    } catch (error) {
      setNote(messageOf(error));
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">职业档案</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          可以上传简历，也可以从空白填写技术栈和事实。确认之后才入库，之后的简历只能引用这里的事实。
        </p>
        <Button
          variant="outline"
          className="mt-3"
          onClick={() => setEditor(blankProfile(editor ?? saved.data?.profile ?? null))}
        >
          从空白填写
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{RESUME_PARSE_CONSENT.title}</CardTitle>
          <CardDescription>版本 {RESUME_PARSE_CONSENT.version}。不同意就不能解析。</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <ul className="text-muted-foreground list-disc space-y-1 pl-5 text-sm">
            {RESUME_PARSE_CONSENT.points.map((point) => (
              <li key={point}>{point}</li>
            ))}
          </ul>
          {granted ? (
            <Badge variant="success">已同意当前版本</Badge>
          ) : (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={agreed} onChange={(event) => setAgreed(event.target.checked)} />
              我已阅读并单独同意上述用途
            </label>
          )}
          <div className="flex flex-wrap items-center gap-3">
            <Input
              type="file"
              accept="application/pdf"
              className="max-w-xs"
              onChange={(event) => void onFile(event.target.files?.[0])}
            />
            <span className="text-muted-foreground text-xs">
              或把文本贴在下面。上传的是文本，不是 PDF 文件。
            </span>
          </div>
          <Textarea
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder="简历文本"
            className="min-h-36"
          />
          <Button
            disabled={!canExtract || extract.isPending || grant.isPending}
            onClick={() => void onExtract()}
          >
            {(extract.isPending || grant.isPending) && <Loader2 className="animate-spin" />}
            解析为草稿
          </Button>
        </CardContent>
      </Card>

      {profile && (
        <Card>
          <CardHeader>
            <CardTitle>确认档案</CardTitle>
            <CardDescription>改完再保存。事实的 id 会保留，已生成简历里的引用才对得上。</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 md:grid-cols-3">
              <Input
                placeholder="姓名"
                value={profile.contact.name}
                onChange={(event) =>
                  setEditor({ ...profile, contact: { ...profile.contact, name: event.target.value } })
                }
              />
              <Input
                placeholder="手机"
                value={profile.contact.phone}
                onChange={(event) =>
                  setEditor({ ...profile, contact: { ...profile.contact, phone: event.target.value } })
                }
              />
              <Input
                placeholder="邮箱"
                value={profile.contact.email}
                onChange={(event) =>
                  setEditor({ ...profile, contact: { ...profile.contact, email: event.target.value } })
                }
              />
            </div>
            <Input
              placeholder="一句话头衔"
              value={profile.headline}
              onChange={(event) => setEditor({ ...profile, headline: event.target.value })}
            />
            <Textarea
              value={profile.summary}
              onChange={(event) => setEditor({ ...profile, summary: event.target.value })}
            />
            <div className="space-y-2">
              <div className="text-sm font-medium">技能</div>
              {profile.skills.map((skill, index) => {
                const facts = profile.experiences.flatMap((exp) => exp.facts);
                return (
                  <div key={skill.id} className="space-y-2 rounded-md border p-3">
                    <div className="flex flex-wrap gap-2">
                      <Input
                        value={skill.name}
                        onChange={(event) => {
                          const skills = profile.skills.slice();
                          const current = skills[index];
                          if (!current) return;
                          skills[index] = { ...current, name: event.target.value };
                          setEditor({ ...profile, skills });
                        }}
                      />
                      <select
                        className="border-input h-9 rounded-md border px-2 text-sm"
                        value={skill.tag}
                        onChange={(event) => {
                          const skills = profile.skills.slice();
                          const current = skills[index];
                          if (!current) return;
                          skills[index] = { ...current, tag: event.target.value as typeof current.tag };
                          setEditor({ ...profile, skills });
                        }}
                      >
                        {SKILL_CATALOG.map((item) => (
                          <option key={item.tag} value={item.tag}>
                            {item.label}
                          </option>
                        ))}
                      </select>
                      <select
                        className="border-input h-9 rounded-md border px-2 text-sm"
                        value={skill.level}
                        onChange={(event) => {
                          const skills = profile.skills.slice();
                          const current = skills[index];
                          if (!current) return;
                          skills[index] = {
                            ...current,
                            level: event.target.value as typeof current.level,
                          };
                          setEditor({ ...profile, skills });
                        }}
                      >
                        {(Object.keys(LEVEL_LABEL) as (keyof typeof LEVEL_LABEL)[]).map((level) => (
                          <option key={level} value={level}>
                            {LEVEL_LABEL[level]}
                          </option>
                        ))}
                      </select>
                      {profile.skills.length > 1 && (
                        <Button
                          variant="outline"
                          onClick={() =>
                            setEditor({
                              ...profile,
                              skills: profile.skills.filter((item) => item.id !== skill.id),
                            })
                          }
                        >
                          删除
                        </Button>
                      )}
                    </div>
                    {skill.level === 'expert' && (
                      <div className="space-y-1">
                        <p className="text-muted-foreground text-xs">深入需要勾选至少一条事实作为证据。</p>
                        {facts.map((fact) => (
                          <label key={fact.id} className="flex items-start gap-2 text-sm">
                            <input
                              type="checkbox"
                              className="mt-1"
                              checked={skill.evidenceFactIds.includes(fact.id)}
                              onChange={(event) => {
                                const skills = profile.skills.slice();
                                const current = skills[index];
                                if (!current) return;
                                const evidenceFactIds = event.target.checked
                                  ? [...current.evidenceFactIds, fact.id]
                                  : current.evidenceFactIds.filter((id) => id !== fact.id);
                                skills[index] = { ...current, evidenceFactIds };
                                setEditor({ ...profile, skills });
                              }}
                            />
                            <span>{fact.text}</span>
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
              <Button
                variant="outline"
                onClick={() =>
                  setEditor({
                    ...profile,
                    skills: [
                      ...profile.skills,
                      {
                        id: crypto.randomUUID(),
                        name: '待填写技能',
                        tag: 'javascript',
                        level: 'used',
                        evidenceFactIds: [],
                      },
                    ],
                  })
                }
              >
                添加技能
              </Button>
            </div>
            {profile.experiences.map((exp, expIndex) => (
              <div key={exp.id} className="space-y-2 rounded-md border p-3">
                <div className="grid gap-2 md:grid-cols-2">
                  <Input
                    value={exp.company}
                    onChange={(event) => {
                      const experiences = profile.experiences.slice();
                      const current = experiences[expIndex];
                      if (!current) return;
                      experiences[expIndex] = { ...current, company: event.target.value };
                      setEditor({ ...profile, experiences });
                    }}
                  />
                  <Input
                    value={exp.title}
                    onChange={(event) => {
                      const experiences = profile.experiences.slice();
                      const current = experiences[expIndex];
                      if (!current) return;
                      experiences[expIndex] = { ...current, title: event.target.value };
                      setEditor({ ...profile, experiences });
                    }}
                  />
                </div>
                {exp.facts.map((fact) => (
                  <Textarea
                    key={fact.id}
                    value={fact.text}
                    onChange={(event) => {
                      const experiences = profile.experiences.slice();
                      const current = experiences[expIndex];
                      if (!current) return;
                      experiences[expIndex] = {
                        ...current,
                        facts: current.facts.map((item) =>
                          item.id === fact.id ? { ...item, text: event.target.value } : item,
                        ),
                      };
                      setEditor({ ...profile, experiences });
                    }}
                  />
                ))}
                <Button
                  variant="outline"
                  onClick={() => {
                    const experiences = profile.experiences.slice();
                    const current = experiences[expIndex];
                    if (!current) return;
                    experiences[expIndex] = {
                      ...current,
                      facts: [...current.facts, { id: crypto.randomUUID(), text: '待填写一条可核对的事实' }],
                    };
                    setEditor({ ...profile, experiences });
                  }}
                >
                  添加事实
                </Button>
              </div>
            ))}
            <Button
              variant="outline"
              onClick={() =>
                setEditor({
                  ...profile,
                  experiences: [
                    ...profile.experiences,
                    {
                      id: crypto.randomUUID(),
                      company: '待填写公司或项目',
                      title: '待填写角色',
                      start: '2020-01',
                      end: null,
                      summary: '',
                      facts: [{ id: crypto.randomUUID(), text: '待填写一条可核对的事实' }],
                    },
                  ],
                })
              }
            >
              添加经历
            </Button>
            <p className="text-muted-foreground text-xs">
              技能标签：{profile.skills.map((skill) => skillLabel(skill.tag)).join('、') || '还没有'}
            </p>
            <Button
              disabled={save.isPending || profile.contact.name.trim() === ''}
              onClick={() => void onSave()}
            >
              {save.isPending && <Loader2 className="animate-spin" />}
              保存档案
            </Button>
          </CardContent>
        </Card>
      )}

      {note && <p className="text-sm">{note}</p>}
      {!profile && saved.isSuccess && (
        <p className="text-muted-foreground text-sm">还没有档案。先解析一份简历，或从空白填写。</p>
      )}

      <WeaknessCard weaknesses={saved.data?.weaknesses ?? []} />
    </div>
  );
}

const STATUS_LABEL: Record<ProfileWeakness['status'], string> = {
  open: '待改进',
  improving: '改善中',
  closed: '已解决',
};

const SEVERITY_LABEL: Record<number, string> = { 1: '轻微', 2: '明显', 3: '严重' };

/**
 * 档案里的短板（R-P3）：由诊断写回，按技能去重，跨场次累积。
 * 这里只读不改——短板是诊断算出来的结论，手动编辑会让"成长曲线"失真。
 */
function WeaknessCard({ weaknesses }: { weaknesses: ProfileWeakness[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>短板积累</CardTitle>
        <CardDescription>
          每场面试的诊断都会把短板写回这里，同一技能只留一条。下一场面试会优先问这些点。
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {weaknesses.length === 0 && (
          <p className="text-muted-foreground text-sm">
            还没有短板记录。完成一场模拟面试并拿到诊断报告后，这里会自动出现。
          </p>
        )}
        {weaknesses.map((item) => (
          <div key={item.tag} className="space-y-1 rounded-md border px-3 py-2.5 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline">{item.label}</Badge>
              <span className="font-medium">{item.title}</span>
              <Badge variant={item.status === 'closed' ? 'success' : 'secondary'}>
                {STATUS_LABEL[item.status]}
              </Badge>
              <Badge variant={item.severity >= 3 ? 'destructive' : 'secondary'}>
                {SEVERITY_LABEL[item.severity] ?? item.severity}
              </Badge>
              <span className="text-muted-foreground ml-auto text-xs">
                出现 {item.occurrences} 次 · 最近 {new Date(item.lastSeenAt).toLocaleDateString()}
              </span>
            </div>
            <p className="text-muted-foreground">{item.detail}</p>
            <Link to={`/reports/${item.reportId}`} className="text-xs underline">
              查看证据所在的报告
            </Link>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
