# Duty Time Advice 排班时间报备 Demo

版本：V1.0 Final Demo  
用途：HKJC 劳动力系统的排班前置报备演示模块，不是独立上线产品。

## 核心口径

- 英文业务名词统一使用 `Rosterability`。
- 核心状态为 `ROSTERABLE` 可排和 `UNROSTERABLE` 不可排；`STANDBY` 仅作正式产品预留。
- `locked` 是截止后的只读标记，不覆盖原有可排性状态。
- 跨午夜时段归属开始日期。
- 周期模板按周一至周日配置，每周在预设时间生成未来 1至10 周记录。
- 模板条件只使用组织、员工类型和岗位。
- 同一员工同业务日存在时长大于 0 的模拟班次时，禁止保存 `UNROSTERABLE` 记录。

## Demo 边界

Demo 实现：参数防呆、周期模板、条件匹配、定时生成、员工报备、截止锁定、模拟班次冲突、主管日历和审计留痕。

Demo 不实现：

- 导入导出文件处理，页面只放占位按钮与未开放提示。
- 消息发送，正式产品对接公司独立消息提醒模块。
- 特殊日期差异化，只保留关闭状态开关，正式产品按需要对接公司日历设置。
- 审批、场地校验、真实排班引擎和生产级 RBAC。

## 技术栈

- 后端：Node.js 24 + Express + TypeScript + Prisma 7 + SQLite（本地文件，无需数据库服务）。
- 前端：Vite + React + TypeScript + shadcn/ui + TailwindCSS + FullCalendar。
- Demo 角色：`admin / manager / employee`。

## 文档

- `docs/prd.md`：Demo 业务需求权威文档。
- `docs/db-schema.md`：数据模型目标。
- `docs/TASKS.md`：任务、验收标准和进度。
- `docs/AGENTS.md`：AI 开发约束和会话协议。
- `docs/Duty Time Advice prd V1.docx`：面向业务的 Word PRD。

## 界面规范

- 页面主色：`#0C336A`。
- 菜单归属：出勤管理 > 排班时间报备。
- 仅浅色模式，复用主系统的表格、弹窗、筛选和分页样式。
- 业务色：`ROSTERABLE #228B22`、`UNROSTERABLE #dc2626`、`STANDBY #f59e0b`（预留），锁定使用灰色只读视觉。

## 本地数据库

Demo 使用 SQLite，数据文件为 `backend/prisma/dev.db`，不入版本库。`backend/.env.example` 为配置样例；重建数据可执行迁移和种子脚本，不影响任何外部系统。

## 继续开发指令

> 读取 `docs/AGENTS.md` 和 `docs/TASKS.md`，复述当前 `🟢 Current` 任务与验收标准，等待确认后继续；不得跳任务或擅自扩大 Demo 范围。
