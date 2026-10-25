/**
 * @file 【前端·组件】成长折线图
 * 和雷达图一样手写 SVG：点很少、只要一条折线，不值得为此加一个图表库运行时依赖。
 * 纵轴固定 1–5（与 RUBRIC_SCORE 对齐），这样不同技能之间可以横向对比，不会被自动缩放骗到。
 */
import { RUBRIC_SCORE } from '@/shared/schemas/rubric';

export interface TrendPoint {
  label: string;
  score: number;
}

const WIDTH = 520;
const HEIGHT = 140;
const PAD = { left: 26, right: 12, top: 10, bottom: 18 };

export function TrendLine({ data, ariaLabel }: { data: TrendPoint[]; ariaLabel: string }) {
  if (data.length === 0) return null;
  const innerW = WIDTH - PAD.left - PAD.right;
  const innerH = HEIGHT - PAD.top - PAD.bottom;
  const x = (index: number) =>
    PAD.left + (data.length === 1 ? innerW / 2 : (innerW * index) / (data.length - 1));
  const y = (score: number) => {
    const ratio = (score - RUBRIC_SCORE.min) / (RUBRIC_SCORE.max - RUBRIC_SCORE.min);
    return PAD.top + innerH * (1 - Math.max(0, Math.min(1, ratio)));
  };
  const points = data.map((item, index) => ({ ...item, x: x(index), y: y(item.score) }));
  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');

  return (
    <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="h-[140px] w-full" role="img" aria-label={ariaLabel}>
      {[RUBRIC_SCORE.min, 3, RUBRIC_SCORE.max].map((tick) => (
        <g key={tick}>
          <line
            x1={PAD.left}
            x2={WIDTH - PAD.right}
            y1={y(tick)}
            y2={y(tick)}
            className="stroke-border"
            strokeWidth={1}
          />
          <text x={4} y={y(tick)} dominantBaseline="middle" className="fill-muted-foreground text-[10px]">
            {tick}
          </text>
        </g>
      ))}
      {data.length > 1 && <path d={path} className="fill-none stroke-primary" strokeWidth={2} />}
      {points.map((p, index) => (
        <g key={index}>
          <circle cx={p.x} cy={p.y} r={3.5} className="fill-primary" />
          <title>
            {p.label}：{p.score.toFixed(1)}
          </title>
        </g>
      ))}
      {points.map((p, index) =>
        // 点多了标签会糊成一团，只标首尾
        index === 0 || index === points.length - 1 ? (
          <text
            key={`label-${index}`}
            x={p.x}
            y={HEIGHT - 4}
            textAnchor={index === 0 ? 'start' : 'end'}
            className="fill-muted-foreground text-[10px]"
          >
            {p.label}
          </text>
        ) : null,
      )}
    </svg>
  );
}
