# Duty Time Advice 排班时间报备 Demo

版本：V1.0 Final Demo  
用途：HKJC 劳动力系统的排班前置报备演示模块，不是独立上线产品。

## 核心口径

- 英文业务名词统一使用 `Rosterability`。
- 核心状态为 `ROSTERABLE` 可排、`UNROSTERABLE` 不可排和 `PRIORITY_ROSTERABLE` 优先排；`STANDBY` 仅作正式产品预留。
- `locked` 是截止后的只读标记，不覆盖原有可排性状态。
- 跨午夜时段归属开始日期。
- 周期模板按周一至周日配置；经理点击生成按钮后，按参数与员工匹配的模板生成未来 1 至 12 周记录。
- 模板条件只使用组织、员工类型和岗位。
- 同一员工同业务日存在时长大于 0 的模拟班次时，禁止保存 `UNROSTERABLE` 记录。

## Demo 边界

Demo 实现：参数防呆、周期模板、条件匹配、经理手动生成、员工报备、截止锁定、模拟班次冲突和主管日历。定时生成及审计/操作日志仅保留标准产品扩展说明。

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

- `docs/prd.md`：唯一需求读写入口，包含从 Word PRD 整理后的完整业务口径。
- `docs/db-schema.md`：数据模型目标。
- `docs/TASKS.md`：任务、验收标准和进度。
- `docs/AGENTS.md`：AI 开发约束和会话协议。
- `docs/Duty Time Advice prd V1.docx`：面向业务的需求来源与归档材料，日常开发直接读取 `docs/prd.md`。

## 界面规范

- 页面主色：`#0C336A`。
- 菜单归属：排班管理 > 排班时间报备。
- 仅浅色模式，复用主系统的表格、弹窗、筛选和分页样式。
- 业务色：`ROSTERABLE #4a90e2`、`UNROSTERABLE #a9a9a9`、`PRIORITY_ROSTERABLE #2e8b57`；锁定另用只读视觉标记。

## 本地数据库

Demo 使用 SQLite，数据文件为 `backend/prisma/dev.db`，不入版本库。`backend/.env.example` 为配置样例；重建数据可执行迁移和种子脚本，不影响任何外部系统。

## 本地运行

后端在 `backend/` 执行 `npm install`、`npm run dev`，默认监听 `http://localhost:3001`。前端在 `frontend/` 执行 `npm install`、`npm run dev`，打开 `http://localhost:5173`；Vite 将 `/api` 代理到后端。前端可通过 `VITE_API_BASE_URL` 指定其他后端地址。

## 组织参数方案操作

管理员切换到“组织参数”后，在“组织应用”页选择一个或多个组织，并在“应用方案”下拉框中选择参数方案。页面下方显示每个选中组织全职、兼职规则的变化；核对后点击“应用到 N 个组织”并确认，配置立即生效。搜索框可缩小组织列表，表头复选框选中当前筛选结果。

更换方案使用同样步骤：选中已绑定组织、改选另一个方案、核对变化后应用。方案创建后只读；需要微调时转到“参数方案”页，点击“复制为新方案”，分别修改员工类型规则并创建，再回“组织应用”分配新方案。未重新分配的组织保持原方案。

种子提供 2 个已有参数与员工的组织，以及 8 个未绑定方案、无员工的组织。后者用于练习首次绑定和更换方案；它们在应用方案前显示“未配置”。本地 `dev.db` 不入版本库，重新运行种子会重置演示数据。

## 继续开发指令

> 读取 `docs/AGENTS.md` 和 `docs/TASKS.md`，复述当前 `🟢 Current` 任务与验收标准，等待确认后继续；不得跳任务或擅自扩大 Demo 范围。
