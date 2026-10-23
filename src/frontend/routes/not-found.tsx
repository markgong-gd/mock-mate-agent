/**
 * @file 【前端·页面】404 页面
 */
import { Link } from 'react-router';
import { Button } from '@/frontend/components/ui/button';

export default function NotFoundPage() {
  return (
    <div className="flex flex-col items-center gap-4 py-24 text-center">
      <div className="text-4xl font-semibold">404</div>
      <p className="text-muted-foreground text-sm">页面不存在</p>
      <Button asChild variant="outline" size="sm">
        <Link to="/">返回首页</Link>
      </Button>
    </div>
  );
}
