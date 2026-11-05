"""Render the editable Markdown source into a six-page owner-review candidate.
Run with .local/artifact-venv/bin/python; no external services or private data.
"""
from pathlib import Path
import re
from html import escape
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, PageBreak
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.colors import HexColor
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4
from pypdf import PdfReader

root = Path(__file__).resolve().parent.parent
source = (root/'docs/competition/PHASE1_TECHNICAL_REPORT.md').read_text()
output = root/'output/pdf/PHASE1_TECHNICAL_REPORT.pdf'
output.parent.mkdir(parents=True,exist_ok=True)
styles = getSampleStyleSheet()
styles.add(ParagraphStyle(name='ReportTitle',fontName='Helvetica-Bold',fontSize=22,leading=26,textColor=HexColor('#193d35'),spaceAfter=14))
styles.add(ParagraphStyle(name='ReportBody',fontName='Helvetica',fontSize=10.5,leading=14.5,spaceAfter=8,textColor=HexColor('#243530')))
styles.add(ParagraphStyle(name='ReportH2',fontName='Helvetica-Bold',fontSize=14,leading=18,spaceBefore=12,spaceAfter=8,textColor=HexColor('#193d35'),keepWithNext=True))
styles.add(ParagraphStyle(name='ReportH3',fontName='Helvetica-Bold',fontSize=11,leading=15,spaceBefore=8,spaceAfter=5,keepWithNext=True))
styles.add(ParagraphStyle(name='ReportRef',fontName='Helvetica',fontSize=8.7,leading=12,spaceAfter=8,wordWrap='CJK'))
# Manual section boundaries preserve readable six-page editorial structure.
markers=['## Related Work','### Commercial and artisan workflow','### Evaluation method','## Results and Discussion','## References']
parts=[]; remaining=source
for marker in markers:
 before,remaining=remaining.split(marker,1);parts.append(before);remaining=marker+remaining
parts.append(remaining)

def clean(text):
 text=text.replace('—','-').replace('–','-').replace('≤','at most ').replace('×',' x ').replace('’',"'").replace('“','"').replace('”','"')
 text=escape(text)
 text=re.sub(r'\*\*(.*?)\*\*',r'<b>\1</b>',text)
 text=text.replace('`','')
 return text

def footer(canvas,doc):
 canvas.setTitle('NASJ - Phase 1 technical report - review candidate')
 canvas.setAuthor('')
 canvas.setSubject('Synthetic software evaluation; owner approval and eligibility pending')
 canvas.setFont('Helvetica',8)
 canvas.setFillColor(HexColor('#52635b'))
 canvas.drawString(42,28,'REVIEW CANDIDATE | SYNTHETIC BUSINESS DATA | NOT SUBMITTED')
 canvas.drawRightString(A4[0]-42,28,f'{doc.page} / 6')
 canvas.setStrokeColor(HexColor('#d7dfda'));canvas.line(42,42,A4[0]-42,42)

story=[]
for index,part in enumerate(parts):
 if index:story.append(PageBreak())
 for block in re.split(r'\n\s*\n',part.strip()):
  if block.startswith('# '):style='ReportTitle';block=block[2:]
  elif block.startswith('## '):style='ReportH2';block=block[3:]
  elif block.startswith('### '):style='ReportH3';block=block[4:]
  else:style='ReportRef' if index==5 else 'ReportBody'
  story.append(Paragraph(clean(block.replace('\n',' ')),styles[style]))
SimpleDocTemplate(str(output),pagesize=A4,rightMargin=44,leftMargin=44,topMargin=40,bottomMargin=54,title='NASJ - Phase 1 technical report - review candidate',author='').build(story,onFirstPage=footer,onLaterPages=footer)
reader=PdfReader(output)
assert len(reader.pages)==6, f'Expected six readable pages, got {len(reader.pages)}'
print(f'Rendered {len(reader.pages)} pages: {output.relative_to(root)}')
