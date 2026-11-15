from pathlib import Path
from docx import Document
from docx.oxml.ns import qn
from docx.shared import RGBColor


DOCX_PATH = Path("docs/Duty Time Advice prd V1.docx")
TEMP_PATH = DOCX_PATH.with_name("Duty Time Advice prd V1.updated.docx")


def all_paragraphs(doc):
    for paragraph in doc.paragraphs:
        yield paragraph
    for table in doc.tables:
        for row in table.rows:
            for cell in row.cells:
                for paragraph in cell.paragraphs:
                    yield paragraph
    for section in doc.sections:
        for container in (section.header, section.footer):
            for paragraph in container.paragraphs:
                yield paragraph
            for table in container.tables:
                for row in table.rows:
                    for cell in row.cells:
                        for paragraph in cell.paragraphs:
                            yield paragraph


def replace_terms(paragraph):
    replacements = (
        ("UNAVAILABLE", "UNROSTERABLE"),
        ("AVAILABLE", "ROSTERABLE"),
        ("Unavailable", "Unrosterable"),
        ("Available", "Rosterable"),
        ("Availability", "Rosterability"),
        ("availability", "rosterability"),
        ("不可用时段", "不可排时段"),
        ("可用时段", "可排时段"),
        ("不可用", "不可排"),
        ("可用性", "可排性"),
    )
    for run in paragraph.runs:
        text = run.text
        for old, new in replacements:
            text = text.replace(old, new)
        run.text = text


def set_paragraph(paragraph, text):
    for run in paragraph.runs:
        run.text = ""
    run = paragraph.runs[0] if paragraph.runs else paragraph.add_run()
    run.text = text


def rewrite_start(doc, start, text):
    for paragraph in doc.paragraphs:
        if paragraph.text.strip().startswith(start):
            set_paragraph(paragraph, text)
            return True
    raise RuntimeError(f"Paragraph not found: {start}")


def rewrite_exact(doc, old, new):
    normalized_old = " ".join(old.split())
    for paragraph in doc.paragraphs:
        if " ".join(paragraph.text.split()) == normalized_old:
            set_paragraph(paragraph, new)
            return True
    raise RuntimeError(f"Paragraph not found: {old}")


def set_cell(doc, table_index, row_index, column_index, text):
    doc.tables[table_index].cell(row_index, column_index).text = text


def delete_row(table, row_index):
    row = table.rows[row_index]
    table._tbl.remove(row._tr)


doc = Document(DOCX_PATH)

for paragraph in all_paragraphs(doc):
    replace_terms(paragraph)

# Static TOC labels.
toc_rewrites = {
    "3.3 日期标签字典与特殊标记日 5": "3.3 特殊日期差异化预留 5",
    "4.5 特殊标记日差异化覆盖 7": "4.5 特殊日期差异化预留 7",
    "7 导入导出能力 10": "7 导入导出功能占位 10",
    "11 通知能力 13": "11 消息提醒对接说明 13",
}
for paragraph in doc.paragraphs:
    stripped = " ".join(paragraph.text.split())
    if stripped in toc_rewrites:
        set_paragraph(paragraph, toc_rewrites[stripped])

# Overview and scope.
rewrite_start(
    doc,
    "排班时间报备（Duty Time Advice）是",
    "排班时间报备（Duty Time Advice）是排班系统的前置约束数据收集模块。员工、主管及模板任务在排班前录入可排或不可排时段，供排班引擎和人工排班参考。",
)
rewrite_start(
    doc,
    "本模块为可配置化的标准产品能力",
    "本文档同时记录 Demo 边界和标准产品扩展方向。Demo 实现参数防呆、周期模板、定时生成、截止锁定、模拟班次冲突和审计留痕；导入导出、消息提醒、审批、场地和特殊日期差异化仅保留说明或字段。",
)
rewrite_start(
    doc,
    "通过周期模板",
    "通过周一至周日的固定周期模板、条件匹配与每周定时生成，将重复性报备转为一次性维护。",
)
rewrite_start(
    doc,
    "为排班主管提供日、周、月",
    "为排班主管提供日、周、月多维视图，并展示 Demo 模拟班次和可排性记录。",
)
rewrite_start(
    doc,
    "功能访问权限由平台标准角色",
    "Demo 使用 admin、manager、employee 三种 Mock 角色：员工仅维护本人未锁定记录，主管查看管辖范围并维护模拟班次，管理员维护参数、字典和模板。正式产品权限由平台标准角色体系统一管控。",
)

# Main data and reserved capabilities.
rewrite_exact(doc, "3.3 日期标签字典与特殊标记日", "3.3 特殊日期差异化预留")
rewrite_start(
    doc,
    "租户可自定义维护日期标签",
    "Demo 不建立日期标签字典、日期绑定或特殊日期参数，仅保留 special_tag_diff_enable 开关且固定关闭。",
)
rewrite_start(
    doc,
    "标签值由客户自定义",
    "正式产品如需赛事日、节假日等差异化规则，应对接公司现有日历设置，不在 Demo 中自建日历主数据。",
)

# Parameters and cutoff.
rewrite_start(
    doc,
    "所有业务参数以组织与员工类型",
    "所有 Demo 业务参数以租户、组织与员工类型为配置单元。生成范围为 1 至 10 周，生成任务按预设星期和香港时间运行。",
)
rewrite_start(
    doc,
    "报备截止时长按组织与员工类型",
    "报备截止按组织与员工类型配置。系统按香港时间计算 lock_at = business_date 00:00 - cutoff_days 个自然日。到达截止时间后，员工和主管均只读，locked 不改变原有可排性状态。",
)
rewrite_exact(doc, "4.5 特殊标记日差异化覆盖", "4.5 特殊日期差异化预留")
rewrite_start(
    doc,
    "启用特殊标记日差异化规则后",
    "Demo 中 special_tag_diff_enable 固定为关闭，不实现特殊日期配置、覆盖、筛选或专项视图。正式产品需要时对接公司标准日历设置。",
)

# Weekly template.
rewrite_start(
    doc,
    "系统支持两类模板",
    "Demo 只实现周固定周期模板。模板覆盖周一至周日，每天可配置零条或多条可排或不可排时段。",
)
rewrite_start(
    doc,
    "模板需具备以下属性",
    "模板包含名称、启用状态、生效起止日期及周明细。每条周明细包含星期值、开始时间、结束时间、跨日偏移、可排性状态和备注。",
)
rewrite_start(
    doc,
    "模板挂载采用条件自动匹配",
    "Demo 模板按组织、员工类型和岗位三个员工属性自动匹配，不使用班组、职级或自定义字段。",
)
rewrite_start(
    doc,
    "多条模板同时命中同一员工时",
    "多条模板同时命中员工时，先按条件优先级升序，再按模板更新时间和主键倒序选择，保证匹配结果确定。",
)
rewrite_start(
    doc,
    "系统自动周期生成",
    "系统每周在参数预设的星期和时间执行任务，生成未来 1 至 10 周的可排性记录，来源标记为模板任务生成。",
)
rewrite_start(
    doc,
    "主管手动生成",
    "主管可以手动补生成指定员工与日期范围的模板记录，仍标记为 TEMPLATE_GEN，并在审计日志中记录主管操作人。",
)
rewrite_start(
    doc,
    "导入批量生成",
    "导入导出在 Demo 中仅保留界面按钮和未开放提示，不解析文件、不写入数据。标准产品后续提供批量导入导出。",
)
rewrite_start(
    doc,
    "模板生成的是基础数据",
    "模板生成必须幂等，不得重复写入相同员工、模板和起止时间的记录。员工或主管已人工修改的记录不被后续周期任务覆盖。",
)

# Time model and conflict.
rewrite_start(
    doc,
    "一条可排性记录由日期",
    "一条可排性记录由员工、业务日期、开始时间、结束时间、可排性状态、来源、备注、锁定标记和审计字段构成。",
)
rewrite_start(
    doc,
    "系统支持单日拆分多个独立时间窗口",
    "系统支持单日多时段和跨午夜时段。例如周一 22:00 至周二 02:00，business_date 记为周一，即跨午夜后的凌晨部分归属前一个自然日。",
)

# Import/export and employee experience.
rewrite_exact(doc, "7 导入导出能力", "7 导入导出功能占位")
rewrite_start(
    doc,
    "模块内所有可批量录入与可查阅的数据",
    "Demo 只在相关页放置导入和导出按钮，点击后提示功能未开放；不提供文件上传、解析、数据写入、下载或导入任务。标准产品应保留批量导入导出能力说明。",
)
rewrite_start(
    doc,
    "导入文件统一使用状态编码",
    "正式产品导入导出时应使用状态编码和来源编码作为稳定键值，并逐行返回校验结果。Demo 不实现该逻辑。",
)
rewrite_start(
    doc,
    "一键批量标记同一标签下",
    "批量勾选多个普通日期，统一设置可排性状态。",
)
rewrite_start(
    doc,
    "未到报备截止时间的记录可编辑",
    "未到截止时间的记录可编辑；到达 business_date 00:00 - cutoff_days 后自动只读。创建或修改 UNROSTERABLE 时，若同员工同业务日存在时长大于 0 的模拟班次，后端禁止保存并提示“该员工当日已存在工作班次，不能调整为不可排”。",
)
rewrite_start(
    doc,
    "所有视图支持筛选、搜索、导出",
    "Demo 视图支持按组织、员工类型、岗位、来源和状态筛选，并展示模拟班次。导出只保留按钮与未开放提示，不生成文件。",
)
rewrite_start(
    doc,
    "场地与审批状态的筛选条件",
    "场地、审批和特殊日期筛选在 Demo 中不展示。正式产品如需特殊日期规则，对接公司标准日历设置。",
)

# Audit and notifications.
rewrite_start(
    doc,
    "以下动作全部写入不可删除日志",
    "以下 Demo 动作全部写入不可修改的追加日志：可排性记录变更、主管或管理员编辑、模板与条件变更、系统或手动生成、参数变更及模拟班次变更。导入和外部同步动作编码仅作正式产品预留。",
)
rewrite_start(
    doc,
    "日志需记录操作人",
    "日志需记录操作人、操作时间、组织、员工、业务日期、操作对象、变更前后内容、状态、来源、备注及操作入口。",
)
rewrite_start(
    doc,
    "日志支持按时间、人员、组织",
    "日志支持按时间、员工、组织、状态、来源和动作查询。导出在 Demo 中仅为界面占位，日志不提供修改和删除接口。",
)
rewrite_exact(doc, "11 通知能力", "11 消息提醒对接说明")
rewrite_start(
    doc,
    "通知采用标准化框架",
    "Demo 不实现消息发送、消息模板或调度逻辑，页面只保留说明性占位。正式产品将对接公司独立消息提醒模块。",
)
rewrite_start(
    doc,
    "框架预留扩展位",
    "正式产品的消息模块应支持报备提醒、截止预警、可排性变更和模板生成通知，但不在 Demo 中建表或开发接口。",
)

# Tables.
set_cell(doc, 0, 5, 1, "按 Demo 口径修订")
set_cell(doc, 1, 1, 1, "标准产品中由公司日历设置维护的特殊日期；Demo 不建主数据，仅保留关闭状态开关。")
set_cell(doc, 1, 2, 1, "某一时段对排班的许可含义，Demo 使用可排和不可排；后备待命仅预留。")
set_cell(doc, 1, 3, 1, "一条可排性记录的生成方，如员工提交、主管维护或模板任务生成。")
set_cell(doc, 1, 7, 1, "排班日期前 N 个自然日 00:00 锁定，按香港时间计算。")
set_cell(doc, 2, 1, 1, "可排性状态字典、可排性来源字典；公司日历和场地仅作正式产品对接说明")
set_cell(doc, 2, 2, 1, "组织与员工类型参数；三个预留开关固定关闭")
set_cell(doc, 2, 3, 1, "员工可排性记录、周期模板、模拟班次及审批预留字段")
delete_row(doc.tables[3], 4)
set_cell(doc, 3, 1, 0, "ROSTERABLE")
set_cell(doc, 3, 1, 1, "可排")
set_cell(doc, 3, 1, 2, "Rosterable")
set_cell(doc, 3, 2, 0, "UNROSTERABLE")
set_cell(doc, 3, 2, 1, "不可排")
set_cell(doc, 3, 2, 2, "Unrosterable")
set_cell(doc, 3, 3, 4, "否（正式产品预留）")
set_cell(doc, 3, 3, 5, "Demo 不启用；locked 为独立只读标记")
set_cell(doc, 5, 1, 2, "0至30 个自然日")
set_cell(doc, 5, 1, 3, "business_date 00:00 - N 天起只读，按香港时间")
set_cell(doc, 5, 6, 1, "自动生成周数")
set_cell(doc, 5, 6, 2, "1至10 周")
set_cell(doc, 5, 6, 3, "每周生成未来指定周数的记录")
set_cell(doc, 5, 7, 2, "Demo 固定强拦截")
set_cell(doc, 5, 7, 3, "同员工同日有正时长工作班次时禁止设为不可排")
set_cell(doc, 5, 8, 1, "每周生成时点")
set_cell(doc, 5, 8, 2, "星期 1至7 + 时间")
set_cell(doc, 5, 8, 3, "按 Asia/Hong_Kong 运行")
set_cell(doc, 5, 11, 2, "Demo 固定关闭")
set_cell(doc, 5, 11, 3, "只保留开关；正式产品对接公司日历")

set_cell(doc, 7, 0, 1, "Demo 导入")
set_cell(doc, 7, 0, 2, "Demo 导出")
set_cell(doc, 7, 0, 3, "正式产品说明")
for row_index in range(1, len(doc.tables[7].rows)):
    set_cell(doc, 7, row_index, 1, "界面占位")
    set_cell(doc, 7, row_index, 2, "界面占位")
set_cell(doc, 7, 1, 3, "正式产品支持可排性记录批量处理")
set_cell(doc, 7, 2, 3, "正式产品支持周期模板批量处理")
set_cell(doc, 7, 3, 3, "正式产品支持模板条件批量处理")
set_cell(doc, 7, 4, 3, "正式产品支持参数批量处理")
set_cell(doc, 7, 5, 0, "特殊日期报表（正式产品）")
set_cell(doc, 7, 5, 3, "对接公司日历设置后提供")

set_cell(doc, 8, 5, 0, "连续双月视图（正式产品）")
set_cell(doc, 8, 6, 0, "特殊日期专项视图（正式产品）")
set_cell(doc, 8, 6, 1, "对接公司日历后的标准产品维度")

set_cell(doc, 9, 2, 0, "模拟班次冲突")
set_cell(doc, 9, 2, 1, "创建或修改 UNROSTERABLE 时")
set_cell(doc, 9, 2, 2, "同员工同业务日有 duration_minutes > 0 的班次则禁止保存并返回明确提示")
set_cell(doc, 9, 3, 1, "到达 business_date 00:00 - cutoff_days")
set_cell(doc, 9, 3, 2, "记录只读，保留原可排性状态")
set_cell(doc, 9, 5, 2, "幂等生成，不覆盖已人工修改记录")

set_cell(doc, 10, 1, 1, "启用 ROSTERABLE、UNROSTERABLE；STANDBY 预留关闭；locked 为独立只读标记")
set_cell(doc, 10, 3, 1, "Demo 仅保留差异开关且固定关闭")
set_cell(doc, 10, 3, 2, "正式产品对接公司日历设置")
set_cell(doc, 10, 3, 3, "Demo 不建日期标签和差异参数表")
set_cell(doc, 10, 7, 1, "Demo 不实现消息发送")
set_cell(doc, 10, 7, 2, "正式产品对接公司独立消息提醒模块")
set_cell(doc, 10, 7, 3, "对现有 Demo 无影响")

set_cell(doc, 11, 4, 1, "英文业务术语统一使用 Rosterability；中文统一使用可排、不可排和可排性。")

set_cell(doc, 12, 1, 1, "组织与员工类型")
set_cell(doc, 12, 1, 2, "0至30 个自然日")
set_cell(doc, 12, 1, 3, "business_date 00:00 - N 天起只读")
set_cell(doc, 12, 6, 2, "1至10 周")
set_cell(doc, 12, 8, 2, "Demo 固定强拦截")
set_cell(doc, 12, 8, 3, "强拦截")
set_cell(doc, 12, 9, 0, "每周生成时点")
set_cell(doc, 12, 9, 1, "组织与员工类型")
set_cell(doc, 12, 9, 2, "星期 1至7 + 时间")
set_cell(doc, 12, 9, 3, "按 Asia/Hong_Kong")
set_cell(doc, 12, 12, 1, "组织与员工类型")
set_cell(doc, 12, 12, 2, "Demo 固定关闭")
set_cell(doc, 12, 12, 3, "关闭；正式产品对接公司日历")

set_cell(doc, 13, 2, 0, "可排性状态")
set_cell(doc, 13, 2, 1, "Rosterability Status")
set_cell(doc, 13, 3, 0, "可排性来源")
set_cell(doc, 13, 3, 1, "Rosterability Source")
set_cell(doc, 13, 4, 0, "特殊日期（正式产品）")
set_cell(doc, 13, 4, 1, "Special Date Integration")

# Normalize fonts so Chinese text renders in the bundled LibreOffice environment.
for style in doc.styles:
    if hasattr(style, "font"):
        style.font.name = "Arial Unicode MS"
        style._element.get_or_add_rPr().rFonts.set(qn("w:ascii"), "Arial Unicode MS")
        style._element.get_or_add_rPr().rFonts.set(qn("w:hAnsi"), "Arial Unicode MS")
        style._element.get_or_add_rPr().rFonts.set(qn("w:eastAsia"), "Arial Unicode MS")
for paragraph in all_paragraphs(doc):
    for run in paragraph.runs:
        run.font.name = "Arial Unicode MS"
        run._element.get_or_add_rPr().rFonts.set(qn("w:ascii"), "Arial Unicode MS")
        run._element.get_or_add_rPr().rFonts.set(qn("w:hAnsi"), "Arial Unicode MS")
        run._element.get_or_add_rPr().rFonts.set(qn("w:eastAsia"), "Arial Unicode MS")
        if paragraph.style and paragraph.style.name in {"Title", "Subtitle", "Heading 1", "Heading 2", "Heading 3"}:
            run.font.color.rgb = RGBColor(0, 0, 0)

doc.save(TEMP_PATH)
TEMP_PATH.replace(DOCX_PATH)
print(f"Updated {DOCX_PATH}")
