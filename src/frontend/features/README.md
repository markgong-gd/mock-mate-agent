# src/frontend/features/ —— 按业务领域组织

每个业务领域一个子目录，约定结构：

```text
features/<领域>/
├── queries.ts      TanStack Query hooks（useQuery / useMutation），通过 lib/api.ts 调后端
├── components/     该领域专用组件（可选）
└── hooks/          该领域专用 hooks（可选）
```

| 子目录 | 说明 |
|---|---|
| `system/` | 系统状态：useMeta / useHealth / useReady / usePing |
| `dev-echo/` | 回声图：useEchoThread（从存档恢复对话） |
| `profile/` | 同意、抽取、保存档案 |
| `jobs/` | 岗位列表、创建、匹配度展示 |
| `resumes/` | 版本列表和预览。生成流不走这里，页面直接用 useObject |

以后：`interview/`、`reports/`、`growth/`。
