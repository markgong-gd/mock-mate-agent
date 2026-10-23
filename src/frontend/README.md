# src/frontend/ —— 前端

浏览器端 React SPA（Vite 构建 → `dist/client`）。

| 路径 | 职责 |
|---|---|
| `main.tsx` | 入口：QueryClient + RouterProvider |
| `router.tsx` | 路由表（按路由懒加载） |
| `nav.ts` | 侧边栏菜单与各页面计划上线阶段 |
| `index.css` | Tailwind 与主题变量 |
| [routes/](routes/) | 页面：一个文件 = 一个 URL |
| [features/](features/) | 按业务领域组织的数据 hooks 与业务组件 |
| [components/](components/) | 通用 UI 组件（shadcn/ui） |
| [lib/](lib/) | 前端基础设施：API 客户端、流式 transport、工具函数 |

**规则**
- 只能通过 HTTP 调后端；对后端代码只允许 `import type { AppType } from '@/backend/server/app'`。
- 不得 import Node API 与服务端 SDK（`pg`、`@langchain/*`、`pino` 等）。
- 可用的共享代码：`@/shared/common/errors`、`@/shared/env/client`、`@/shared/schemas/*`。

**数据流**：页面 → `features/*/queries.ts` → `lib/api.ts`（hc<AppType>）→ `/api/*`；流式对话用 `useChat` + `lib/chat-transport.ts`。

完整代码地图见 [docs/04-code-map.md](../../docs/04-code-map.md)。
