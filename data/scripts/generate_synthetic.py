from __future__ import annotations

import argparse
from dataclasses import dataclass
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle


PROJECT_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_OUTPUT_DIR = PROJECT_ROOT / "data" / "sample-documents"


@dataclass(frozen=True)
class SyntheticDocument:
    filename: str
    title: str
    subtitle: str
    metadata: list[tuple[str, str]]
    recitals: list[str]
    clauses: list[str]
    signatories: list[str]


DOCUMENTS: tuple[SyntheticDocument, ...] = (
    SyntheticDocument(
        filename="sale_deed_01.pdf",
        title="Sale Deed",
        subtitle="Transfer of immovable property recorded for LexNet demo flow",
        metadata=[
            ("Document Type", "sale_deed"),
            ("Property ID", "PROP_KA_BLR_001"),
            ("Survey Number", "SY-123/4A"),
            ("Location", "Indiranagar, Bengaluru, Karnataka"),
            ("Buyer", "Ram Kumar"),
            ("Seller", "Sita Ayyer"),
            ("Value", "INR 58,00,000"),
            ("Execution Date", "2024-01-10"),
        ],
        recitals=[
            "This deed records the transfer of a residential parcel identified as PROP_KA_BLR_001 from Sita Ayyer to Ram Kumar.",
            "The parties confirm that the seller has clear title over Survey No. SY-123/4A and that possession is handed over on execution.",
        ],
        clauses=[
            "The seller transfers all rights, title, easements, and appurtenant interests in the scheduled property to the buyer.",
            "The consideration of INR 58,00,000 has been received in full prior to registration of this deed.",
            "The buyer shall be entitled to seek mutation of revenue records and municipal records in the buyer's own name.",
            "This deed may be referred to for any subsequent verification, mortgage, or dispute resolution process.",
        ],
        signatories=[
            "Seller: Sita Ayyer",
            "Buyer: Ram Kumar",
            "Witness 1: Neeraj Joshi",
            "Witness 2: Meera Iyer",
        ],
    ),
    SyntheticDocument(
        filename="court_order_01.pdf",
        title="Interim Court Order",
        subtitle="Illustrative property dispute order for conflict-detection testing",
        metadata=[
            ("Document Type", "court_order"),
            ("Case ID", "CASE_2025_014"),
            ("Court", "Bengaluru Urban District Court"),
            ("Property ID", "PROP_KA_BLR_001"),
            ("Survey Number", "SY-123/4A"),
            ("Plaintiff", "Arjun Rao"),
            ("Defendant", "Ram Kumar"),
            ("Order Date", "2025-02-11"),
        ],
        recitals=[
            "This interim order concerns competing ownership claims over property PROP_KA_BLR_001 situated in Indiranagar, Bengaluru.",
            "The court has reviewed the sale deed, mutation entry, and supporting revenue extracts referenced by the parties.",
        ],
        clauses=[
            "Status quo shall be maintained with respect to alienation, transfer, or encumbrance of the scheduled property until the next date of hearing.",
            "The defendant shall not create third-party rights pending disposal of the injunction application.",
            "The plaintiff shall file certified copies of the challenged registration entries within seven working days.",
            "List the matter for further hearing after service completion and documentary verification.",
        ],
        signatories=[
            "Presiding Judge: Bengaluru Urban District Court",
            "Plaintiff Counsel: Priya Sharma",
            "Defendant Counsel: Farhan Khan",
        ],
    ),
    SyntheticDocument(
        filename="land_record_01.pdf",
        title="Record of Rights Extract",
        subtitle="Synthetic land record designed for OCR, NER, and timeline tests",
        metadata=[
            ("Document Type", "land_record"),
            ("Property ID", "PROP_TS_HYD_005"),
            ("Survey Number", "SY-17/11C"),
            ("Jurisdiction", "Gachibowli, Hyderabad, Telangana"),
            ("Registered Holder", "Priya Sharma"),
            ("Area", "3200 sqft"),
            ("Issuing Authority", "Telangana Revenue Authority"),
            ("Record Date", "2025-11-21"),
        ],
        recitals=[
            "This extract is a synthetic revenue record used to validate LexNet's OCR and downstream graph enrichment pipeline.",
            "The record reflects current possession and ownership fields as maintained by the Telangana Revenue Authority.",
        ],
        clauses=[
            "Holder name recorded as Priya Sharma for property PROP_TS_HYD_005 corresponding to Survey No. SY-17/11C.",
            "No active dispute, mortgage, or adverse possession notation is entered in the present extract.",
            "Any transfer, succession, or court order affecting the record must be produced before the competent revenue authority.",
            "This document is intended for local demo and academic testing only.",
        ],
        signatories=[
            "Issuing Officer: Telangana Revenue Authority",
            "Record Clerk: Divya Nair",
        ],
    ),
)


def build_styles() -> dict[str, ParagraphStyle]:
    styles = getSampleStyleSheet()
    return {
        "title": ParagraphStyle(
            "LexNetTitle",
            parent=styles["Title"],
            alignment=TA_CENTER,
            fontSize=20,
            leading=24,
            spaceAfter=10,
            textColor=colors.HexColor("#1F2937"),
        ),
        "subtitle": ParagraphStyle(
            "LexNetSubtitle",
            parent=styles["BodyText"],
            alignment=TA_CENTER,
            fontSize=10,
            leading=14,
            spaceAfter=12,
            textColor=colors.HexColor("#4B5563"),
        ),
        "heading": ParagraphStyle(
            "LexNetHeading",
            parent=styles["Heading2"],
            fontSize=12,
            leading=14,
            textColor=colors.HexColor("#111827"),
            spaceBefore=8,
            spaceAfter=6,
        ),
        "body": ParagraphStyle(
            "LexNetBody",
            parent=styles["BodyText"],
            fontSize=10,
            leading=14,
            spaceAfter=6,
        ),
    }


def build_metadata_table(metadata: list[tuple[str, str]]) -> Table:
    table = Table(metadata, colWidths=[48 * mm, 120 * mm], hAlign="LEFT")
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#E5E7EB")),
                ("BACKGROUND", (0, 0), (0, -1), colors.HexColor("#F3F4F6")),
                ("BOX", (0, 0), (-1, -1), 0.6, colors.HexColor("#9CA3AF")),
                ("INNERGRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#D1D5DB")),
                ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
                ("FONTNAME", (1, 0), (1, -1), "Helvetica"),
                ("FONTSIZE", (0, 0), (-1, -1), 9),
                ("LEADING", (0, 0), (-1, -1), 12),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 6),
                ("RIGHTPADDING", (0, 0), (-1, -1), 6),
                ("TOPPADDING", (0, 0), (-1, -1), 5),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
            ]
        )
    )
    return table


def build_story(document: SyntheticDocument) -> list[object]:
    styles = build_styles()
    story: list[object] = [
        Paragraph(document.title, styles["title"]),
        Paragraph(document.subtitle, styles["subtitle"]),
        Spacer(1, 4),
        Paragraph("Document Metadata", styles["heading"]),
        build_metadata_table(document.metadata),
        Spacer(1, 10),
        Paragraph("Recitals", styles["heading"]),
    ]

    for recital in document.recitals:
        story.append(Paragraph(recital, styles["body"]))

    story.append(Paragraph("Operative Clauses", styles["heading"]))
    for index, clause in enumerate(document.clauses, start=1):
        story.append(Paragraph(f"{index}. {clause}", styles["body"]))

    story.append(Paragraph("Signatories", styles["heading"]))
    for line in document.signatories:
        story.append(Paragraph(line, styles["body"]))

    story.append(Spacer(1, 12))
    story.append(
        Paragraph(
            "Generated by LexNet sample-data tooling for local development, OCR validation, and UI demonstrations.",
            styles["subtitle"],
        )
    )
    return story


def render_document(document: SyntheticDocument, output_path: Path) -> None:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    pdf = SimpleDocTemplate(
        str(output_path),
        pagesize=A4,
        leftMargin=18 * mm,
        rightMargin=18 * mm,
        topMargin=18 * mm,
        bottomMargin=18 * mm,
        title=document.title,
        author="LexNet",
    )
    pdf.build(build_story(document))


def generate_synthetic_documents(output_dir: str | Path = DEFAULT_OUTPUT_DIR) -> list[Path]:
    destination = Path(output_dir)
    destination.mkdir(parents=True, exist_ok=True)

    generated_paths: list[Path] = []
    for document in DOCUMENTS:
        output_path = destination / document.filename
        render_document(document, output_path)
        generated_paths.append(output_path)

    return generated_paths


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate LexNet sample legal PDFs.")
    parser.add_argument(
        "--output-dir",
        default=str(DEFAULT_OUTPUT_DIR),
        help="Directory where the sample PDF files will be written.",
    )
    args = parser.parse_args()

    generated = generate_synthetic_documents(args.output_dir)
    for path in generated:
        print(f"Generated {path}")


if __name__ == "__main__":
    main()
