# src/frontend/routes/ —— 页面

一个文件对应一个 URL，默认导出页面组件，在 `../router.tsx` 中注册（懒加载）。

| 文件 | URL | 说明 |
|---|---|---|
| `root-layout.tsx` | （外壳） | 侧边栏 + `<Outlet/>` |
| `home.tsx` | `/` | 系统状态：healthz / readyz / 模型 Ping |
| `dev-echo.tsx` | `/dev/echo` | 回声图调试页（流式对话 + 存档恢复），以后面试页的样板 |
| `profile.tsx` | `/profile` | 用途同意、抽文本、确认档案；底部是诊断写回的短板（只读） |
| `jobs.tsx` | `/jobs` | 粘贴 JD，看匹配度 |
| `job-detail.tsx` | `/jobs/:jobId` | 单个岗位的要求和缺口 |
| `resumes.tsx` | `/resumes` | 选择岗位并流式生成 |
| `resume-editor.tsx` | `/resumes/:resumeId` | 编辑；保存成为新版本 |
| `resume-print.tsx` | `/resumes/:resumeId/print` | 浏览器打印。未溯源时接口返回 409 |
| `interviews.tsx` | `/interviews`、`/interviews/:interviewId` | 选设置、文字面试。刷新后从已落库轮次恢复；drill 场次带"专项训练"标记 |
| `reports.tsx` | `/reports`、`/reports/:reportId` | 报告列表与详情：雷达图、逐题点评、短板证据（可一键专项训练）、复训计划、单场用量、Rubric |
| `growth.tsx` | `/growth` | 成长曲线：按技能的得分趋势 + 总分趋势 |
| `placeholder.tsx` | 未上线页面 | 显示计划上线阶段 |
| `not-found.tsx` | `*` | 404 |

**放什么**：页面级组件（布局、组合 features 中的组件与 hooks）。
**不放什么**：请求逻辑（放 `features/<领域>/queries.ts`）、通用 UI（放 `components/ui`）。

**新增页面**：写 `xxx.tsx` → `router.tsx` 注册 → `nav.ts` 去掉对应条目的 `phase`。
