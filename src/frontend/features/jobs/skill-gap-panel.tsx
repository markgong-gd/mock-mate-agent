/**
 * @file 【前端·组件】匹配度与缺口
 */
import { Badge } from '@/frontend/components/ui/badge';

export interface SkillGapView {
  score: number;
  mustScore: number | null;
  matched: { tag: string; label: string; importance: 'must' | 'nice' }[];
  missing: { tag: string; label: string; importance: 'must' | 'nice' }[];
}

export function SkillGapPanel({ match }: { match: SkillGapView }) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-4 text-sm">
        <span>
          匹配度 <strong>{match.score}%</strong>
        </span>
        <span>
          必备项 <strong>{match.mustScore === null ? '无' : `${match.mustScore}%`}</strong>
        </span>
      </div>
      <div className="flex flex-wrap gap-2">
        {match.matched.map((item) => (
          <Badge key={`ok-${item.tag}`} variant="success">
            {item.label}
            {item.importance === 'must' ? ' · 必备' : ''}
          </Badge>
        ))}
        {match.missing.map((item) => (
          <Badge key={`gap-${item.tag}`} variant="destructive">
            缺 {item.label}
            {item.importance === 'must' ? ' · 必备' : ''}
          </Badge>
        ))}
      </div>
    </div>
  );
}
