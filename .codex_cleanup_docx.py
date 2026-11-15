from pathlib import Path

from docx import Document
from docx.enum.table import WD_CELL_VERTICAL_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Inches, Pt


path = Path("docs/Duty Time Advice prd V1.docx")
temp = path.with_name("Duty Time Advice prd V1.finalized.docx")
doc = Document(path)

LATIN_FONT = "Liberation Sans"
CJK_FONT = "Heiti SC"


def iter_paragraphs():
    yield from doc.paragraphs
    for table in doc.tables:
        for row in table.rows:
            for cell in row.cells:
                yield from cell.paragraphs
    for section in doc.sections:
        for container in (section.header, section.footer):
            yield from container.paragraphs
            for table in container.tables:
                for row in table.rows:
                    for cell in row.cells:
                        yield from cell.paragraphs


def set_run_fonts(run):
    run.font.name = LATIN_FONT
    r_pr = run._element.get_or_add_rPr()
    r_fonts = r_pr.rFonts
    if r_fonts is None:
        r_fonts = OxmlElement("w:rFonts")
        r_pr.insert(0, r_fonts)
    r_fonts.set(qn("w:ascii"), LATIN_FONT)
    r_fonts.set(qn("w:hAnsi"), LATIN_FONT)
    r_fonts.set(qn("w:cs"), LATIN_FONT)
    r_fonts.set(qn("w:eastAsia"), CJK_FONT)


def clear_and_set(paragraph, text):
    p = paragraph._p
    for child in list(p):
        if child.tag != qn("w:pPr"):
            p.remove(child)
    run = paragraph.add_run(text)
    set_run_fonts(run)


def set_cell(table_index, row_index, column_index, text):
    cell = doc.tables[table_index].cell(row_index, column_index)
    clear_and_set(cell.paragraphs[0], text)


def set_cell_width(cell, width):
    cell.width = width
    tc_pr = cell._tc.get_or_add_tcPr()
    tc_w = tc_pr.first_child_found_in("w:tcW")
    if tc_w is None:
        tc_w = OxmlElement("w:tcW")
        tc_pr.append(tc_w)
    tc_w.set(qn("w:w"), str(int(width / 635)))
    tc_w.set(qn("w:type"), "dxa")


# Preserve the bilingual title while rendering the English product name exactly.
clear_and_set(doc.paragraphs[4], "排班时间报备（Duty Time Advice）")

# Align the business-facing Word PRD with the final Demo boundaries.
set_cell(4, 4, 3, "标准产品预留来源，Demo 不实现接口同步")
set_cell(4, 5, 3, "标准产品预留来源，Demo 导入仅为界面占位")
set_cell(10, 2, 1, "三类 Demo 来源启用；EXTERNAL_SYNC 与 BULK_IMPORT 预留但关闭")
set_cell(10, 6, 1, "Demo 固定强拦截；豁免模式仅作标准产品预留")
set_cell(10, 6, 2, "标准产品后续按业务需求评估是否参数化")
set_cell(10, 6, 3, "Demo 无豁免入口")

# Assign Latin and CJK fonts independently for stable cross-renderer output.
for style in doc.styles:
    if not hasattr(style, "font"):
        continue
    style.font.name = LATIN_FONT
    r_pr = style._element.get_or_add_rPr()
    r_fonts = r_pr.rFonts
    if r_fonts is None:
        r_fonts = OxmlElement("w:rFonts")
        r_pr.insert(0, r_fonts)
    r_fonts.set(qn("w:ascii"), LATIN_FONT)
    r_fonts.set(qn("w:hAnsi"), LATIN_FONT)
    r_fonts.set(qn("w:cs"), LATIN_FONT)
    r_fonts.set(qn("w:eastAsia"), CJK_FONT)

for paragraph in iter_paragraphs():
    for run in paragraph.runs:
        set_run_fonts(run)

# Fit the status table within the 6.3-inch printable width and keep the long
# status codes on one line at a readable size.
status_table = doc.tables[3]
status_table.autofit = False
status_widths = [1.30, 0.65, 0.90, 0.85, 0.80, 1.80]
for row in status_table.rows:
    for index, width in enumerate(status_widths):
        cell = row.cells[index]
        set_cell_width(cell, Inches(width))
        cell.vertical_alignment = WD_CELL_VERTICAL_ALIGNMENT.CENTER
        for paragraph in cell.paragraphs:
            paragraph.alignment = (
                WD_ALIGN_PARAGRAPH.LEFT if index == 5 else WD_ALIGN_PARAGRAPH.CENTER
            )
            for run in paragraph.runs:
                run.font.size = Pt(8.5)

doc.save(temp)
temp.replace(path)
print(f"Finalized {path}")
