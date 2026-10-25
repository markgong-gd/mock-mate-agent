/**
 * @file 【前端·组件】Rubric 雷达图
 * 手写 SVG，不引图表库：维度只有 4 到 8 个，画网格 + 一个多边形就够，省掉一个运行时依赖。
 * 分数区间固定 1–5，与 RUBRIC_SCORE 对齐；0 分表示这个维度本场没被问到，落在圆心。
 */
import { RUBRIC_SCORE } from '@/shared/schemas/rubric';

export interface RadarDatum {
  label: string;
  score: number;
}

const SIZE = 260;
const CENTER = SIZE / 2;
const RADIUS = 86;
const RINGS = RUBRIC_SCORE.max - RUBRIC_SCORE.min + 1;

/** 第一个轴指向正上方，顺时针排开 */
function point(index: number, total: number, ratio: number) {
  const angle = (Math.PI * 2 * index) / total - Math.PI / 2;
  return {
    x: CENTER + Math.cos(angle) * RADIUS * ratio,
    y: CENTER + Math.sin(angle) * RADIUS * ratio,
  };
}

const polygon = (points: { x: number; y: number }[]) =>
  points.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');

export function RubricRadar({ data }: { data: RadarDatum[] }) {
  if (data.length < 3) return null;
  const total = data.length;
  const ratioOf = (score: number) => Math.max(0, Math.min(1, score / RUBRIC_SCORE.max));
  const shape = data.map((item, index) => point(index, total, ratioOf(item.score)));

  return (
    <svg
      viewBox={`0 0 ${SIZE} ${SIZE}`}
      className="h-[260px] w-full"
      role="img"
      aria-label="各维度得分雷达图"
    >
      {Array.from({ length: RINGS }, (_, ring) => (
        <polygon
          key={ring}
          points={polygon(data.map((_item, index) => point(index, total, (ring + 1) / RINGS)))}
          className="fill-none stroke-border"
          strokeWidth={1}
        />
      ))}
      {data.map((item, index) => {
        const edge = point(index, total, 1);
        return (
          <line
            key={item.label}
            x1={CENTER}
            y1={CENTER}
            x2={edge.x}
            y2={edge.y}
            className="stroke-border"
            strokeWidth={1}
          />
        );
      })}
      <polygon points={polygon(shape)} className="fill-primary/20 stroke-primary" strokeWidth={2} />
      {shape.map((p, index) => (
        <circle key={index} cx={p.x} cy={p.y} r={3} className="fill-primary" />
      ))}
      {data.map((item, index) => {
        const label = point(index, total, 1.28);
        const anchor = label.x > CENTER + 4 ? 'start' : label.x < CENTER - 4 ? 'end' : 'middle';
        return (
          <text
            key={item.label}
            x={label.x}
            y={label.y}
            textAnchor={anchor}
            dominantBaseline="middle"
            className="fill-muted-foreground text-[11px]"
          >
            {item.label} {item.score.toFixed(1)}
          </text>
        );
      })}
    </svg>
  );
}
