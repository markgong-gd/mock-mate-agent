# src/frontend/routes/ —— 页面

一个文件对应一个 URL，默认导出页面组件，在 `../router.tsx` 中注册（懒加载）。

| 文件 | URL | 说明 |
|---|---|---|
| `root-layout.tsx` | （外壳） | 侧边栏 + `<Outlet/>` |
| `home.tsx` | `/` | 系统状态：healthz / readyz / 模型 Ping |
| `dev-echo.tsx` | `/dev/echo` | 回声图调试页（流式对话 + 存档恢复），未来面试页的样板 |
| `placeholder.tsx` | 未上线页面 | 显示计划上线阶段 |
| `not-found.tsx` | `*` | 404 |

**放什么**：页面级组件（布局、组合 features 中的组件与 hooks）。
**不放什么**：请求逻辑（放 `features/<领域>/queries.ts`）、通用 UI（放 `components/ui`）。

**新增页面**：写 `xxx.tsx` → `router.tsx` 注册 → `nav.ts` 去掉对应条目的 `phase`。
