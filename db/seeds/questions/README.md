# 题库规范

初版题在 `frontend.jsonl`（216 题，`node db/seeds/questions/build-bank.mjs` 可重新生成）。字段、标签、难度、版权和文件格式以本文件为准。导入：`pnpm db:seed`。

校验代码在 `src/shared/schemas/question.ts` 的 `questionSeedSchema`。一条录完可以用它 parse；不通过就不要入库。

## 1. 一条题目长什么样

JSONL：一行一个 JSON 对象，UTF-8，不要包在数组里。

| 字段 | 必填 | 说明 |
|---|---|---|
| `id` | 是 | 稳定主键，重复导入时 upsert。只允许小写字母、数字、连字符，如 `fe-react-001` |
| `content` | 是 | 题干。面试官会照这个问，写成口语，不要写成考卷 |
| `answerPoints` | 是 | 参考要点，1–8 条。给评估用，不直接当“标准答案”念给用户 |
| `skillTags` | 是 | 技能标签，至少 1 个。只能取下面的目录，和 JD 抽取用的是同一套 |
| `difficulty` | 是 | 整数 1–5，见 §3 |
| `type` | 是 | `concept` / `scenario` / `project` / `behavior` |
| `source` | 是 | 来源。自写题写 `original`；否则写清书名、文章或链接 |
| `license` | 是 | 版权。自写题写 `internal-original`。不收录许可不明的面经原文 |
| `searchText` | 否 | 给以后的关键词召回用。缺省时导入脚本会用题干加要点拼出来 |

和数据库列的对应（P2a 建表时用，不要另起字段名）：

| JSONL | 列 |
|---|---|
| `answerPoints` | `answer_points` |
| `skillTags` | `skill_tags text[]` |
| `searchText` | `search_text` |
| 其余同名，蛇形 | `content`、`difficulty`、`type`、`source`、`license` |

`embedding` 和 `embed_model` 不写进 JSONL。导入时向量为空，再由 `embed-questions` 补上。

## 2. 技能标签

必须使用 `src/shared/schemas/skill-tags.ts` 里的 tag。JD 抽取、档案技能、题目三者用同一套，后面的出题才能按缺口命中。

当前目录：`javascript`、`typescript`、`html`、`css`、`react`、`vue`、`nextjs`、`node`、`performance`、`engineering`、`testing`、`accessibility`、`state`、`network`、`browser`、`collaboration`、`project`。

新增技能先改目录和本表，再打题。不要在题目里写目录之外的标签。

初版覆盖建议：上面每个 tag 至少 8 题，`react`、`typescript`、`javascript`、`performance`、`browser` 可以更多。一道题可以打多个 tag，但不要超过 3 个，否则检索时什么都能召回。

## 3. 难度

| 分 | 含义 | 例子 |
|---|---|---|
| 1 | 识记 | “CSS 选择器优先级的顺序是什么？” |
| 2 | 理解 | “为什么列表渲染需要稳定的 key？” |
| 3 | 应用 | “一个输入框每次按键都请求接口，你会怎么处理？” |
| 4 | 分析 | “线上首屏变慢，你会按什么顺序查？” |
| 5 | 设计与权衡 | “状态放在 URL、内存还是服务端，边界怎么划？” |

同一 tag 里 1 和 5 都要有，后面分配题目时才能做难度梯度。不要把所有题都标成 3。

## 4. 题型

| type | 什么时候用 |
|---|---|
| `concept` | 概念、机制、API 行为 |
| `scenario` | 给一个具体故障或需求，问怎么处理 |
| `project` | 挖一段项目经历。题干可以写成“请结合你做过的……”，不要预设候选人没做过的公司 |
| `behavior` | 协作、推进、取舍。不问性别、年龄、婚育、民族 |

## 5. 来源与版权

- 优先自己写。`source` 写 `original`，`license` 写 `internal-original`。
- 可以改写公开许可的材料（例如 CC-BY）。`source` 写原标题和链接，`license` 写许可证名称，`content` 用自己的话，不要大段粘贴。
- 不收录：来源不明的面经截图、付费题库、个人博客里未授权的原文。
- 题目里不要出现真实候选人的姓名、公司内部项目代号、手机号。

## 6. 示例

```json
{"id":"fe-react-001","content":"React 渲染列表时，key 为什么要稳定，不能用数组下标凑合？","answerPoints":["key 用来在两次渲染之间对应同一个组件实例","下标在插入或排序后会变，状态会串到别的行上","稳定 id 让协调只更新真正变化的节点"],"skillTags":["react"],"difficulty":2,"type":"concept","source":"original","license":"internal-original"}
{"id":"fe-performance-014","content":"用户反馈首屏突然变慢。你会先看哪些信号，怎样判断是包体、接口还是渲染的问题？","answerPoints":["先看 LCP 和长任务，而不是先改代码","用网络瀑布区分接口阻塞和资源阻塞","用性能面板看提交和绘制，确认是不是主线程被长任务占住"],"skillTags":["performance","browser"],"difficulty":4,"type":"scenario","source":"original","license":"internal-original"}
```

## 7. 录入时的自检

- `questionSeedSchema` 能 parse。
- `skillTags` 都在目录里。
- 难度不是清一色。
- 题干不包含“标准答案如下”。
- 不出现受保护特征（性别、年龄、民族、婚育）作为评分条件。
- id 在文件之间也不重复。
