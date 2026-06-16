import io
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from ..database import get_db
from ..models import ChecklistTask, HighValueItem, FlightItinerary, Document, User
from ..auth.dependencies import get_current_user

router = APIRouter()

VALID_SECTIONS = {"tasks", "items", "travel", "documents"}


class ExportRequest(BaseModel):
    sections: list[str]
    title: Optional[str] = "PCS Move Export"


@router.post("/pdf")
async def export_pdf(
    body: ExportRequest,
    _: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    sections = [s for s in body.sections if s in VALID_SECTIONS]
    if not sections:
        raise HTTPException(status_code=400, detail="At least one valid section required")

    try:
        from reportlab.lib.pagesizes import letter
        from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
        from reportlab.lib import colors
        from reportlab.platypus import (
            SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, HRFlowable
        )
        from reportlab.lib.units import inch
    except ImportError:
        raise HTTPException(
            status_code=500,
            detail="reportlab is required for PDF export. Add reportlab to requirements.txt.",
        )

    PRIMARY = colors.HexColor("#1e3a5f")
    ACCENT = colors.HexColor("#c9a84c")
    TEXT_SECONDARY = colors.HexColor("#5a6378")
    BORDER = colors.HexColor("#dde1e8")
    SUCCESS = colors.HexColor("#2d7a3a")
    LIGHT_BG = colors.HexColor("#f8f9fb")

    styles = getSampleStyleSheet()

    title_style = ParagraphStyle(
        "DocTitle", parent=styles["Normal"],
        fontSize=24, textColor=PRIMARY, fontName="Helvetica-Bold",
        spaceAfter=4, leading=28,
    )
    subtitle_style = ParagraphStyle(
        "DocSubtitle", parent=styles["Normal"],
        fontSize=10, textColor=TEXT_SECONDARY, fontName="Helvetica",
        spaceAfter=10,
    )
    section_style = ParagraphStyle(
        "SectionHeader", parent=styles["Normal"],
        fontSize=14, textColor=PRIMARY, fontName="Helvetica-Bold",
        spaceBefore=18, spaceAfter=8, leading=18,
    )
    cat_style = ParagraphStyle(
        "CatHeader", parent=styles["Normal"],
        fontSize=10, textColor=colors.HexColor("#1a1f2e"), fontName="Helvetica-Bold",
        spaceBefore=10, spaceAfter=4,
    )
    caption_style = ParagraphStyle(
        "Caption", parent=styles["Normal"],
        fontSize=9, textColor=TEXT_SECONDARY, fontName="Helvetica", spaceAfter=4,
    )
    footer_style = ParagraphStyle(
        "Footer", parent=styles["Normal"],
        fontSize=8, textColor=TEXT_SECONDARY, fontName="Helvetica",
        spaceBefore=8,
    )

    base_table_style = TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), PRIMARY),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, 0), 9),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ("TOPPADDING", (0, 0), (-1, 0), 7),
        ("BOTTOMPADDING", (0, 0), (-1, 0), 7),
        ("TOPPADDING", (0, 1), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 1), (-1, -1), 6),
        ("FONTNAME", (0, 1), (-1, -1), "Helvetica"),
        ("FONTSIZE", (0, 1), (-1, -1), 9),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, LIGHT_BG]),
        ("GRID", (0, 0), (-1, -1), 0.4, BORDER),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("ALIGN", (0, 0), (-1, 0), "LEFT"),
    ])

    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf,
        pagesize=letter,
        rightMargin=0.75 * inch,
        leftMargin=0.75 * inch,
        topMargin=0.75 * inch,
        bottomMargin=0.75 * inch,
        title=body.title or "PCS Move Export",
    )

    story = []

    story.append(Paragraph(body.title or "PCS Move Export", title_style))
    story.append(Paragraph(
        f"Generated {datetime.utcnow().strftime('%B %d, %Y at %H:%M UTC')}",
        subtitle_style,
    ))
    story.append(HRFlowable(width="100%", thickness=2, color=ACCENT, spaceAfter=6))

    usable_width = letter[0] - 1.5 * inch

    if "tasks" in sections:
        result = await db.execute(
            select(ChecklistTask).order_by(ChecklistTask.category, ChecklistTask.created_at)
        )
        tasks = result.scalars().all()

        story.append(Paragraph("Task Checklist", section_style))

        if not tasks:
            story.append(Paragraph("No tasks recorded.", caption_style))
        else:
            by_cat: dict[str, list] = {}
            for t in tasks:
                by_cat.setdefault(t.category, []).append(t)

            for cat, cat_tasks in by_cat.items():
                completed = sum(1 for t in cat_tasks if t.is_completed)
                cat_label = cat.replace("_", " ").title()
                story.append(Paragraph(
                    f"{cat_label}  —  {completed} of {len(cat_tasks)} complete",
                    cat_style,
                ))

                data = [["", "Task", "Assigned To", "Due Date", "Status"]]
                for t in cat_tasks:
                    check = "✓" if t.is_completed else "○"
                    due = t.due_date.strftime("%m/%d/%Y") if t.due_date else "—"
                    assigned = t.assigned_to_name or t.assigned_to_email or "—"
                    status_str = "Complete" if t.is_completed else "Pending"
                    data.append([check, t.title, assigned, due, status_str])

                col_widths = [0.25 * inch, 3.4 * inch, 1.45 * inch, 0.9 * inch, 0.9 * inch]
                tbl = Table(data, colWidths=col_widths, repeatRows=1)
                ts = TableStyle(base_table_style.getCommands())
                for i, t in enumerate(cat_tasks, 1):
                    color = SUCCESS if t.is_completed else TEXT_SECONDARY
                    ts.add("TEXTCOLOR", (0, i), (0, i), color)
                    ts.add("TEXTCOLOR", (4, i), (4, i), color)
                    ts.add("FONTNAME", (0, i), (0, i), "Helvetica-Bold")
                tbl.setStyle(ts)
                story.append(tbl)
                story.append(Spacer(1, 6))

        story.append(Spacer(1, 8))

    if "items" in sections:
        result = await db.execute(
            select(HighValueItem).order_by(HighValueItem.created_at)
        )
        items = result.scalars().all()

        story.append(Paragraph("High-Value Items", section_style))

        if not items:
            story.append(Paragraph("No items logged.", caption_style))
        else:
            total = sum(i.price or 0 for i in items)
            story.append(Paragraph(
                f"{len(items)} items  ·  Estimated total value: ${total:,.2f}",
                caption_style,
            ))
            story.append(Spacer(1, 4))

            data = [["Item Name", "Description", "Value", "Serial #", "Notes"]]
            for item in items:
                value = f"${item.price:,.2f}" if item.price is not None else "—"
                data.append([
                    item.name,
                    item.description or "—",
                    value,
                    item.serial_number or "—",
                    item.notes or "—",
                ])

            col_widths = [1.7 * inch, 2.0 * inch, 0.85 * inch, 1.1 * inch, 1.25 * inch]
            tbl = Table(data, colWidths=col_widths, repeatRows=1)
            tbl.setStyle(base_table_style)
            story.append(tbl)

        story.append(Spacer(1, 8))

    if "travel" in sections:
        result = await db.execute(
            select(FlightItinerary).order_by(FlightItinerary.created_at)
        )
        itineraries = result.scalars().all()

        story.append(Paragraph("Travel Itineraries", section_style))

        if not itineraries:
            story.append(Paragraph("No travel itineraries recorded.", caption_style))
        else:
            data = [["Flight", "Date", "From", "To", "Airline", "Notes"]]
            for itin in itineraries:
                dep = itin.departure_airport or "—"
                if itin.departure_time:
                    dep += f"\n{itin.departure_time}"
                arr = itin.arrival_airport or "—"
                if itin.arrival_time:
                    arr += f"\n{itin.arrival_time}"
                data.append([
                    itin.flight_number,
                    itin.flight_date or "—",
                    dep,
                    arr,
                    itin.airline or "—",
                    itin.notes or "—",
                ])

            col_widths = [0.75 * inch, 0.85 * inch, 1.25 * inch, 1.25 * inch, 1.1 * inch, 1.7 * inch]
            tbl = Table(data, colWidths=col_widths, repeatRows=1)
            tbl.setStyle(base_table_style)
            story.append(tbl)

        story.append(Spacer(1, 8))

    if "documents" in sections:
        result = await db.execute(
            select(Document).order_by(Document.category, Document.created_at)
        )
        docs = result.scalars().all()

        story.append(Paragraph("Documents on File", section_style))

        if not docs:
            story.append(Paragraph("No documents uploaded.", caption_style))
        else:
            story.append(Paragraph(f"{len(docs)} document(s) stored", caption_style))
            story.append(Spacer(1, 4))

            data = [["Document Name", "Category", "Filename", "Size", "Uploaded"]]
            for d in docs:
                cat_label = d.category.replace("_", " ").title()
                size_str = (
                    f"{d.file_size / 1024:.0f} KB" if d.file_size and d.file_size < 1024 * 1024
                    else f"{d.file_size / (1024 * 1024):.1f} MB" if d.file_size
                    else "—"
                )
                uploaded = d.created_at.strftime("%m/%d/%Y") if d.created_at else "—"
                data.append([d.name, cat_label, d.original_filename, size_str, uploaded])

            col_widths = [2.2 * inch, 1.0 * inch, 2.0 * inch, 0.7 * inch, 0.9 * inch]
            tbl = Table(data, colWidths=col_widths, repeatRows=1)
            tbl.setStyle(base_table_style)
            story.append(tbl)

        story.append(Spacer(1, 8))

    story.append(HRFlowable(width="100%", thickness=0.5, color=BORDER, spaceBefore=12))
    story.append(Paragraph(
        "Generated by PCS Tracker · Verify all information against original source documents before official use.",
        footer_style,
    ))

    doc.build(story)
    buf.seek(0)

    export_date = datetime.utcnow().strftime("%Y%m%d")
    return StreamingResponse(
        buf,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="pcs-export-{export_date}.pdf"'},
    )
