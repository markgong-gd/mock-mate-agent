# src/

源码根目录，按 **前端 / 后端 / 智能体 / 公共底座** 四块物理划分：

| 目录 | 块 | 运行位置 | 一句话 |
|---|---|---|---|
| [frontend/](frontend/) | 前端 | 浏览器 | React SPA：页面、组件、请求 hooks、流式对话 |
| [backend/](backend/) | 后端 | Node 进程 | HTTP 入口、用例编排、数据访问、后台任务 |
| [agent/](agent/) | 智能体 | Node 进程内（由 backend/core 调用） | LangGraph 图、模型网关、Prompt |
| [shared/](shared/) | 公共底座 | 视文件而定 | 纯函数业务规则、Zod 定义、环境变量、错误码 / 日志 |

导入时统一使用 `@/` 别名，例如 `@/backend/core/dev.service`、`@/agent/llm/registry`。
层与层之间能否互相 import 由 `eslint.config.js` 的 `LAYER_DEPS` 强制。

完整代码地图见 [docs/04-code-map.md](../docs/04-code-map.md)。
