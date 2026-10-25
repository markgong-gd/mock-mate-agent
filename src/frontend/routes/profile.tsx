/**
 * @file 【前端·页面】职业档案
 * 流程：同意 → 浏览器抽出 PDF 文本和联系方式 → 抽取草稿（不落库）→ 用户改完再保存。
 * 联系方式来自本页的规则抽取，抽取接口只收到简历正文，模型侧还会再脱敏一次。
 */
import { useState } from 'react';
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

type Draft = Omit<ProfileBody, 'contact'>;

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
          简历在浏览器里转成文本。确认之后才入库，之后的定制简历只能引用这里的事实。
        </p>
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
              {profile.skills.map((skill, index) => (
                <div key={skill.id} className="flex gap-2">
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
                </div>
              ))}
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
              </div>
            ))}
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
        <p className="text-muted-foreground text-sm">还没有档案。先解析一份简历。</p>
      )}
    </div>
  );
}
