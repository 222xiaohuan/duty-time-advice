# Duty Time Advice 数据库字段清单

版本：V1.0 Final Demo  
状态：需在 T001 中同步到 `backend/prisma/schema.prisma` 后再执行迁移。  
数据库：本地 SQLite 文件（`backend/prisma/dev.db`），通过 Prisma 访问。

## 1. 通用约定

1. 业务表前缀统一为 `dta_`。
2. 数据库字段使用下划线命名，TypeScript 字段使用驼峰命名。
3. 可排性相关名称统一使用 `Rosterability`。
4. `is_deleted=1` 表示软删除，普通查询默认只返回 `is_deleted=0`。
5. 租户内编码唯一约束必须包含 `tenant_id`。
6. 数据库为 SQLite。字段类型约定：主键与外键 ID 用 `int`（自增整数）；布尔开关用 `int`（0/1）；文本用 `text`，表中括号内数字为长度上限，由服务层校验；业务日期用 `text`，格式 `YYYY-MM-DD`；周期模板的日内时间用 `text`，格式 `HH:mm`；时间点用 `datetime`（存 UTC 时刻，按香港时间解释）；JSON 快照用 `text`。
7. 业务时间和截止计算统一按 `Asia/Hong_Kong`。
8. 审计表为追加写入的不可变数据，不使用软删除业务流程。

## 2. 公共枚举

### 2.1 DtaRosterabilityStatus

- `ROSTERABLE`
- `UNROSTERABLE`
- `STANDBY`（标准产品预留，Demo 默认不启用）

`locked` 是独立的只读标记，不属于该枚举。

### 2.2 DtaSourceCode

- `EMP_SUBMIT`
- `MGR_MAINTENANCE`
- `TEMPLATE_GEN`
- `EXTERNAL_SYNC`（预留）
- `BULK_IMPORT`（预留）

### 2.3 DtaBaselineRule

- `BASE_ROSTERABLE`
- `BASE_UNROSTERABLE`

### 2.4 DtaSubmitMode

- `MODE_ONLY_UNROSTERABLE`
- `MODE_ONLY_ROSTERABLE`
- `MODE_ALL_STATUS`
- `MODE_NO_SUBMIT`

### 2.5 DtaConflictCheckMode

- `STRONG_BLOCK`（Demo 固定）
- `WARN_WITH_EXEMPT`（标准产品预留）

### 2.6 DtaApprovalStatus

- `PENDING`
- `APPROVED`
- `REJECTED`

本枚举仅作结构预留，Demo 不写入。

### 2.7 DtaAuditActionCode

- `CREATE`
- `UPDATE`
- `DELETE`
- `PARAM_CHANGE`
- `TEMPLATE_GEN`
- `BULK_IMPORT`（预留）
- `EXTERNAL_SYNC`（预留）
- `SUBMIT_APPROVAL`（预留）
- `APPROVE_PASS`（预留）
- `APPROVE_REJECT`（预留）

## 3. dta_tenant 租户表

| 字段 | 类型 | 约束与说明 |
| --- | --- | --- |
| id | int | 主键自增 |
| tenant_name | text(100) | 租户名称 |
| is_deleted | int | 默认 0 |
| created_at | datetime | 默认当前时间 |
| updated_at | datetime | 更新时自动刷新 |
| created_by | int | 创建人 ID |
| updated_by | int | 更新人 ID |

## 4. dta_org 组织表

| 字段 | 类型 | 约束与说明 |
| --- | --- | --- |
| id | int | 主键自增 |
| tenant_id | int | 租户 ID |
| org_name | text(100) | 组织名称 |
| is_deleted | int | 默认 0 |
| created_at | datetime | 创建时间 |
| updated_at | datetime | 更新时间 |
| created_by | int | 创建人 ID |
| updated_by | int | 更新人 ID |

## 5. dta_employee 模拟员工表

| 字段 | 类型 | 约束与说明 |
| --- | --- | --- |
| id | int | 主键自增 |
| tenant_id | int | 租户 ID |
| org_id | int | 组织 ID |
| emp_name | text(100) | 员工姓名 |
| emp_type_code | text(50) | 员工类型编码 |
| post_code | text(50) | 岗位编码 |
| is_deleted | int | 默认 0 |
| created_at | datetime | 创建时间 |
| updated_at | datetime | 更新时间 |
| created_by | int | 创建人 ID |
| updated_by | int | 更新人 ID |

Demo 不增加班组、职级或自定义字段。

## 6. dta_rosterability_status_dict 可排性状态字典

| 字段 | 类型 | 约束与说明 |
| --- | --- | --- |
| id | int | 主键自增 |
| tenant_id | int | 租户 ID |
| status_code | enum | `DtaRosterabilityStatus` |
| status_name | text(100) | 中文名称 |
| name_i18n | text(200) | 多语言占位 |
| color_hex | text(20) | 日历色值 |
| allow_schedule | int | 是否允许排班 |
| emp_self_edit | int | 是否允许员工选择 |
| enabled | int | 是否启用 |
| is_deleted | int | 默认 0 |
| created_at / updated_at | datetime | 创建与更新时间 |
| created_by / updated_by | int | 创建与更新人 |

唯一约束：`tenant_id + status_code`。

## 7. dta_rosterability_source_dict 可排性来源字典

| 字段 | 类型 | 约束与说明 |
| --- | --- | --- |
| id | int | 主键自增 |
| tenant_id | int | 租户 ID |
| source_code | enum | `DtaSourceCode` |
| source_name | text(100) | 中文名称 |
| name_i18n | text(200) | 多语言占位 |
| icon_key | text(100) | 前端图标 key |
| enabled | int | 是否启用 |
| is_deleted | int | 默认 0 |
| created_at / updated_at | datetime | 创建与更新时间 |
| created_by / updated_by | int | 创建与更新人 |

唯一约束：`tenant_id + source_code`。

## 8. dta_param_group 参数组

| 字段 | 类型 | 约束与说明 |
| --- | --- | --- |
| id | int | 主键自增 |
| tenant_id | int | 租户 ID |
| org_id | int | 组织 ID |
| emp_type_code | text(50) | 员工类型编码 |
| cutoff_days | int | 0至30 |
| baseline_rule | enum | `DtaBaselineRule` |
| submit_mode | enum | `DtaSubmitMode` |
| emp_edit_enable | int | 员工自主编辑开关 |
| template_auto_gen_enable | int | 定时生成预留；Demo 固定为 0 |
| auto_gen_range_week | int | 经理手动生成周数，Demo 必填，1 至 12；沿用现有字段名 |
| auto_gen_weekday | int | 定时生成预留；Demo 固定为 null |
| auto_gen_time | text(HH:mm) | 定时生成预留；Demo 固定为 null |
| conflict_check_mode | enum | Demo 固定 `STRONG_BLOCK` |
| field_site_enable | int | 预留，默认 0 |
| enable_approval | int | 预留，默认 0 |
| special_tag_diff_enable | int | 预留，默认 0 |
| is_deleted | int | 默认 0 |
| created_at / updated_at | datetime | 创建与更新时间 |
| created_by / updated_by | int | 创建与更新人 |

唯一约束：`tenant_id + org_id + emp_type_code`。软删除后再创建相同组合时，服务层应恢复原记录而不是插入新记录。

## 9. dta_template 周期模板主表

| 字段 | 类型 | 约束与说明 |
| --- | --- | --- |
| id | int | 主键自增 |
| tenant_id | int | 租户 ID |
| template_name | text(100) | 模板名称 |
| name_i18n | text(200) | 多语言占位 |
| start_date | text(YYYY-MM-DD) | 生效日期 |
| end_date | text(YYYY-MM-DD) | 失效日期，可为 null |
| enabled | int | 是否启用 |
| is_deleted | int | 默认 0 |
| created_at / updated_at | datetime | 创建与更新时间 |
| created_by / updated_by | int | 创建与更新人 |

## 10. dta_template_item 模板周明细

| 字段 | 类型 | 约束与说明 |
| --- | --- | --- |
| id | int | 主键自增 |
| tenant_id | int | 租户 ID |
| template_id | int | 模板 ID |
| weekday | int | 1至7 |
| status_code | enum | `DtaRosterabilityStatus` |
| start_time | text(HH:mm) | 开始时间 |
| end_time | text(HH:mm) | 结束时间 |
| end_day_offset | int | 0 同日，1 次日 |
| remark | text(500) | 备注，可为 null |
| site_code | text(50) | 场地预留，可为 null |
| is_deleted | int | 默认 0 |
| created_at / updated_at | datetime | 创建与更新时间 |
| created_by / updated_by | int | 创建与更新人 |

校验：`weekday` 及 `end_day_offset` 必须在规定范围内，转换为实际时间点后结束时间必须晚于开始时间。

## 11. dta_template_condition 模板匹配条件

| 字段 | 类型 | 约束与说明 |
| --- | --- | --- |
| id | int | 主键自增 |
| tenant_id | int | 租户 ID |
| template_id | int | 模板 ID |
| priority | int | 数字越小优先级越高 |
| org_id | int | 组织条件，可为 null |
| emp_type_code | text(50) | 员工类型条件，可为 null |
| post_code | text(50) | 岗位条件，可为 null |
| is_deleted | int | 默认 0 |
| created_at / updated_at | datetime | 创建与更新时间 |
| created_by / updated_by | int | 创建与更新人 |

单条条件至少一个匹配字段非空。非空字段之间使用 AND 关系。

## 12. dta_rosterability_record 可排性记录

| 字段 | 类型 | 约束与说明 |
| --- | --- | --- |
| id | int | 主键自增 |
| tenant_id | int | 租户 ID |
| org_id | int | 组织 ID |
| emp_id | int | 员工 ID |
| emp_type_code | text(50) | 员工类型快照 |
| business_date | text(YYYY-MM-DD) | 开始时间所在日期 |
| status_code | enum | `DtaRosterabilityStatus` |
| source_code | enum | `DtaSourceCode` |
| start_time | datetime | 开始时间 |
| end_time | datetime | 结束时间，可跨午夜 |
| remark | text(500) | 备注，可为 null |
| site_code | text(50) | 场地预留，可为 null |
| approval_status | enum | 审批预留，可为 null |
| approver_id | int | 审批人预留，可为 null |
| approved_at | datetime | 审批时间预留，可为 null |
| approve_comment | text(500) | 审批意见预留，可为 null |
| locked | int | 截止后只读的展示用缓存，默认 0；是否只读以后端按香港时间实时计算为准 |
| template_id | int | 来源模板 ID，可为 null |
| template_item_id | int | 来源模板明细 ID，可为 null，用于生成去重 |
| external_sync_id | text(100) | 外部同步预留，可为 null |
| is_deleted | int | 默认 0 |
| created_at / updated_at | datetime | 创建与更新时间 |
| created_by / updated_by | int | 创建与更新人 |

建议索引：`tenant_id + emp_id + business_date + is_deleted`；`tenant_id + emp_id + business_date + template_item_id`（模板生成去重）。

模板去重由服务层按 `tenant_id + emp_id + business_date + template_item_id` 校验，且不区分 `is_deleted`：已存在（含已软删除、已人工修改）的记录不再重新生成。

## 13. dta_mock_shift Demo 模拟工作班次

| 字段 | 类型 | 约束与说明 |
| --- | --- | --- |
| id | int | 主键自增 |
| tenant_id | int | 租户 ID |
| org_id | int | 组织 ID |
| emp_id | int | 员工 ID |
| business_date | text(YYYY-MM-DD) | 班次开始日期 |
| shift_name | text(100) | 班次名称 |
| start_time | datetime | 班次开始 |
| end_time | datetime | 班次结束 |
| duration_minutes | int | 工作时长，必须大于或等于 0 |
| is_deleted | int | 默认 0 |
| created_at / updated_at | datetime | 创建与更新时间 |
| created_by / updated_by | int | 创建与更新人 |

创建或修改 `UNROSTERABLE` 记录时，若同一员工同一 `business_date` 存在 `duration_minutes > 0` 的未删除班次，必须禁止保存。

## 14. dta_audit_log 审计日志

| 字段 | 类型 | 约束与说明 |
| --- | --- | --- |
| id | int | 主键自增 |
| tenant_id | int | 租户 ID |
| org_id | int | 组织 ID，可为 null |
| emp_id | int | 员工 ID，可为 null |
| business_date | text(YYYY-MM-DD) | 业务日期，可为 null |
| target_type | text(50) | `record` / `param` / `template` / `condition` / `mock_shift` |
| target_id | int | 操作对象 ID |
| action_code | enum | `DtaAuditActionCode` |
| status_code | enum | `DtaRosterabilityStatus`，仅 `target_type=record` 时填写，可为 null，用于筛选 |
| source_code | enum | `DtaSourceCode`，仅 `target_type=record` 时填写，可为 null，用于筛选 |
| before_json | text | 变更前 JSON，可为 null |
| after_json | text | 变更后 JSON，可为 null |
| operator_id | int | 操作人 ID；系统任务使用固定系统账号 ID |
| operate_time | datetime | 操作时间 |
| operate_source | text(50) | `employee` / `manager` / `admin` / `system` |
| remark | text(500) | 备注，可为 null |
| site_code | text(50) | 场地预留，可为 null |
| approval_related | int | 审批预留，默认 0 |
| created_at | datetime | 创建时间 |

审计日志不提供修改、软删除或物理删除接口。建议索引：`tenant_id + operate_time`、`tenant_id + org_id + emp_id`。

`before_json` / `after_json` 使用 `text` 保存 JSON 字符串；序列化时日期统一输出 ISO 字符串。

## 15. 本期不建表的能力

- 不建日期标签和特殊日期差异参数表；只保留 `special_tag_diff_enable=0`。
- 不建导入任务表；导入导出仅为界面占位。
- 不建消息模板和调度表；标准产品对接公司消息提醒模块。
- 不建场地主数据表和审批任务表。
