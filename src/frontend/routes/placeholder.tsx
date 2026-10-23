/**
 * @file 【前端·页面】未上线页面占位
 * 做什么：根据当前路径在 nav.ts 中找到对应条目，提示计划上线阶段。
 */
import { Construction } from 'lucide-react';
import { useLocation } from 'react-router';
import { Card, CardContent } from '@/frontend/components/ui/card';
import { NAV_ITEMS } from '../nav';

export default function PlaceholderPage() {
  const { pathname } = useLocation();
  const item = NAV_ITEMS.find((n) => n.to === pathname);
  return (
    <Card className="py-14">
      <CardContent className="text-muted-foreground flex flex-col items-center gap-3 text-center">
        <Construction className="size-8" />
        <div className="text-foreground text-lg font-medium">{item?.label ?? '页面'}</div>
        <p className="text-sm">计划在 {item?.phase ?? '后续阶段'} 上线，详见 docs/03-delivery-plan.md。</p>
      </CardContent>
    </Card>
  );
}
