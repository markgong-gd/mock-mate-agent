# 05 · 简历策划

对话式「高级简历策划师」。和 [01](01-requirements.md) 里的 C1 定制简历分开：不读职业档案，不写 `resumes`，也不改原来的简历图。

## 做什么

策划师通过对话收集目标岗位、技能和经历，一次只做一件事：追问一个缺口，或根据你刚说的内容改一节并说明改了什么。页面左边是对话，右边是当前简历，改稿的数据事件先到，文字可以还在往外吐。你说「可以了」之后才能导出。导出打开打印页，用浏览器「另存为 PDF」。

材料只来自这场对话。新出现的公司、职位、学校、技能、电话、邮箱，以及数字和百分比，必须能在你的原话里找到。对不上的句子不会进预览，策划师改成追问。电话和邮箱由规则从原话补进空栏，不交给模型抄。

## 怎么走

```text
/studio                         列表。新建、继续或删除一场
/studio/:id                     左对话，右预览。退出回到列表，这场策划还在
/studio/:id/print               打印页，window.print()

POST   /api/studio              创建
GET    /api/studio/:id          轮次 + 当前稿。退出后再进来靠它继续
DELETE /api/studio/:id          删除这场策划，对话和简历稿一起去掉
POST   /api/studio/:id/chat     流式推进。空 message 表示开始或从失败节点续跑
GET    /api/studio/:id/export   打印页数据
```

图：`coach` → `speak` → `wait_user`（interrupt）→ `coach`。

- `coach` 用 `TASK: studio.coach` 出结构化提案，带 `nostream`，JSON 不进气泡。
- `shared/domain/studio` 决定这一轮是追问、改稿还是可以导出，并丢掉对不上的内容。
- 通过的稿写入 `studio_sessions`，同时用 `data-studio-resume` 推给预览。
- `speak` 用 `TASK: studio.speak` 把已经定下来的那句话说出来。
- 每一步通过 `data-studio-trace` 推到当次助手回复下面的「Agent 运行」，默认收起，展开后能看观察阶段、模型别名和具体模型、输入、输出、token、耗时，以及规则 `settleCoachTurn` / `fillStudioContact` 的判定。模型若返回思维链，单独作为「思考」一步，不进对话气泡。节点成功后步骤留在图状态里，刷新后还在。
- 用户的话先写入 `studio_turns`，幂等键和面试一样。失败后续跑不丢已写入的原话。

阶段由代码推进：没有岗位先问岗位；经历太空就请你贴经历；要点虚就追问一个数字；你确认之后才是 `ready`。

离线假模型认 `TASK: studio.coach` / `TASK: studio.speak`，没有 API Key 也能走「追问 → 改一节 → 预览」。
