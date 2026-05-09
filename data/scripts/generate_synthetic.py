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
    SyntheticDocument(
        filename="property_claim_01.pdf",
        title="Registered Sale Deed",
        subtitle="Primary ownership claim for risk-scoring and dispute detection",
        metadata=[
            ("Document Type", "sale_deed"),
            ("Property ID", "PROP_KA_BLR_042"),
            ("Survey Number", "SY-88/2B"),
            ("Location", "Jayanagar, Bengaluru, Karnataka"),
            ("Buyer", "Ananya Rao"),
            ("Seller", "Suresh Bhat"),
            ("Consideration", "INR 94,00,000"),
            ("Execution Date", "2025-03-04"),
            ("Registration No", "REG-2025-044"),
        ],
        recitals=[
            "The seller states that he holds clear and marketable title over property PROP_KA_BLR_042 and transfers all rights to the buyer.",
            "The parties represent that the property is free from competing claims, encumbrances, and pending litigation at the time of execution.",
        ],
        clauses=[
            "The seller conveys title, possession, and all appurtenant rights in the scheduled property to the buyer.",
            "The consideration of INR 94,00,000 is acknowledged as fully received before presentation for registration.",
            "The buyer may seek mutation, municipal record updates, and utility transfer in the buyer's own name.",
            "This deed may be used for verification, registration, and downstream legal review.",
        ],
        signatories=[
            "Seller: Suresh Bhat",
            "Buyer: Ananya Rao",
            "Witness 1: Neha Kulkarni",
            "Witness 2: Arvind Shetty",
        ],
    ),
    SyntheticDocument(
        filename="property_claim_conflict_01.pdf",
        title="Objection Affidavit and Prior Claim Notice",
        subtitle="Conflicting ownership claim over the same property for risk scoring",
        metadata=[
            ("Document Type", "objection_affidavit"),
            ("Property ID", "PROP_KA_BLR_042"),
            ("Survey Number", "SY-88/2B"),
            ("Location", "Jayanagar, Bengaluru, Karnataka"),
            ("Claimant", "Meera Iyer"),
            ("Opposing Party", "Ananya Rao"),
            ("Filing Date", "2025-03-06"),
            ("Case ID", "CASE_2025_044"),
            ("Court", "Bengaluru Urban Civil Court"),
        ],
        recitals=[
            "The deponent states that property PROP_KA_BLR_042 was already agreed to be sold to Meera Iyer before a rival registration was executed in favour of Ananya Rao.",
            "The deponent alleges duplicate registration, forged no-objection papers, and a parallel claim over the same survey number SY-88/2B.",
            "The matter is said to be pending before the Bengaluru Urban Civil Court and an urgent injunction is requested.",
        ],
        clauses=[
            "No transfer, mutation, or third-party encumbrance should be permitted until the rival claims are resolved.",
            "The same property cannot be exclusively owned by two persons at the same time and the disputed registration should be examined.",
            "The claimant requests police verification, court scrutiny, and preservation of all title records.",
            "This notice is intended to preserve rights in a live ownership conflict for local demo and testing.",
        ],
        signatories=[
            "Deponent: Meera Iyer",
            "Advocate: Rahul Menon",
            "Witness 1: Pooja Nair",
            "Witness 2: Kiran Rao",
        ],
    ),
    SyntheticDocument(
        filename="rapid_transfer_stack_01.pdf",
        title="Rapid Transfer Stack Deed Bundle",
        subtitle="Compressed ownership chain designed to trigger rapid-transfer and graph-complexity alerts",
        metadata=[
            ("Document Type", "sale_deed_bundle"),
            ("Property ID", "PROP_KA_BLR_077"),
            ("Survey Number", "Sy.No.45/7A"),
            ("Location", "Whitefield, Bengaluru, Karnataka"),
            ("Transfer Chain", "Kavya Nair -> Rohan Das -> Punit Arora -> Leena Thomas -> Dev Malhotra"),
            ("Registrar Office", "Bengaluru East Registrar Office"),
            ("Consideration", "INR 9,85,00,000"),
            ("Timeline", "14 January 2025 to 02 March 2025"),
        ],
        recitals=[
            "Kavya Nair sold property PROP_KA_BLR_077 to Rohan Das on 14 January 2025.",
            "Rohan Das transferred property PROP_KA_BLR_077 to Punit Arora on 03 February 2025.",
            "Punit Arora conveyed property PROP_KA_BLR_077 to Leena Thomas on 19 February 2025.",
            "Leena Thomas sold property PROP_KA_BLR_077 to Dev Malhotra on 02 March 2025.",
            "The same survey parcel Sy.No.45/7A was repeatedly presented before Bengaluru East Registrar Office within seven weeks.",
        ],
        clauses=[
            "Metropolitan Bank Limited recorded a pending mortgage review even as the transfer chain continued without cooling-off period.",
            "This bundle refers to Section 17 of Registration Act and Section 52 of Transfer of Property Act for downstream verification review.",
            "The parties acknowledge that repeated transfer execution on the same parcel may invite enhanced scrutiny from court and revenue authorities.",
            "This synthetic bundle is intended to generate a dense graph around one property, five parties, and multiple legal references.",
        ],
        signatories=[
            "Seller 1: Kavya Nair",
            "Buyer 1 / Seller 2: Rohan Das",
            "Buyer 2 / Seller 3: Punit Arora",
            "Buyer 3 / Seller 4: Leena Thomas",
            "Final Buyer: Dev Malhotra",
        ],
    ),
    SyntheticDocument(
        filename="duplicate_title_injunction_01.pdf",
        title="Duplicate Title Injunction Petition",
        subtitle="Rival ownership pleading with forged-paper allegations and invalid legal references",
        metadata=[
            ("Document Type", "injunction_petition"),
            ("Property ID", "PROP_KA_BLR_077"),
            ("Survey Number", "Sy.No.45/7A"),
            ("Court", "Bengaluru Urban Civil Court"),
            ("Case ID", "CASE-2025-077"),
            ("Primary Claimant", "Meera Iyer"),
            ("Opposing Parties", "Dev Malhotra, Rohan Das"),
            ("Filing Date", "08 March 2025"),
        ],
        recitals=[
            "Meera Iyer filed objection before Bengaluru Urban Civil Court claiming that Dev Malhotra and Rohan Das cannot both own property PROP_KA_BLR_077.",
            "The petition alleges forged tax clearance, duplicate registration presentation, and fabricated no-objection papers for survey parcel Sy.No.45/7A.",
            "The pleading references Section 17 of Registration Act, Section 52 of Transfer of Property Act, and Section 999 of Urban Title Integrity Act.",
        ],
        clauses=[
            "No transfer, mutation, lease, mortgage, or encumbrance should be permitted until the rival ownership claims are adjudicated.",
            "The claimant states that duplicate title papers were produced after a suspicious rapid transfer stack involving the same property.",
            "The court is requested to preserve all registrar logs, bank notices, and document bundles connected with PROP_KA_BLR_077.",
            "This petition is intended to trigger ownership-conflict and invalid-reference signals in the LexNet demo graph.",
        ],
        signatories=[
            "Petitioner: Meera Iyer",
            "Counsel: Rahul Menon",
            "Respondent 1: Dev Malhotra",
            "Respondent 2: Rohan Das",
        ],
    ),
    SyntheticDocument(
        filename="benami_foreclosure_notice_01.pdf",
        title="Benami Foreclosure and Tribunal Notice",
        subtitle="Bank, registrar, tribunal, and proxy-holder narrative for high-risk graph enrichment",
        metadata=[
            ("Document Type", "foreclosure_notice"),
            ("Property ID", "PROP_KA_BLR_077"),
            ("Survey Number", "Sy.No.45/7A"),
            ("Institution", "Metropolitan Bank Limited"),
            ("Tribunal", "Debt Recovery Tribunal Bengaluru"),
            ("Borrower", "Dev Malhotra"),
            ("Proxy Holder", "Aarav Sen"),
            ("Notice Date", "12 March 2025"),
        ],
        recitals=[
            "Metropolitan Bank Limited issued foreclosure notice against Dev Malhotra regarding property PROP_KA_BLR_077 after payment defaults under the same title chain.",
            "Dev Malhotra sold property PROP_KA_BLR_077 to proxy holder Aarav Sen before the mortgage review was completed.",
            "Aarav Sen transferred property PROP_KA_BLR_077 to Nidhi Kapoor under a benami settlement while Debt Recovery Tribunal Bengaluru and Bengaluru Urban Civil Court considered competing claims.",
        ],
        clauses=[
            "Registrar Office and municipal authorities were informed that the same survey parcel may have been used in a sham and fraudulent reassignment chain.",
            "The notice states that forged disclosures, duplicate filings, and benami possession arrangements affected the enforceability of the mortgage records.",
            "The bank relies on Section 52 of Transfer of Property Act and seeks restraint against any additional transfer pending tribunal review.",
            "This synthetic notice is intended to create a dense cross-document graph of persons, organisations, courts, and the same disputed property.",
        ],
        signatories=[
            "Issuing Bank: Metropolitan Bank Limited",
            "Borrower: Dev Malhotra",
            "Proxy Holder: Aarav Sen",
            "Subsequent Holder: Nidhi Kapoor",
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


def generate_synthetic_documents(
    output_dir: str | Path = DEFAULT_OUTPUT_DIR,
    filenames: list[str] | None = None,
) -> list[Path]:
    destination = Path(output_dir)
    destination.mkdir(parents=True, exist_ok=True)

    selected_filenames = {filename.casefold() for filename in filenames} if filenames else None
    selected_documents = [
        document
        for document in DOCUMENTS
        if selected_filenames is None or document.filename.casefold() in selected_filenames
    ]
    if selected_filenames is not None:
        found_filenames = {document.filename.casefold() for document in selected_documents}
        missing_filenames = sorted(filename for filename in selected_filenames if filename not in found_filenames)
        if missing_filenames:
            raise ValueError(f"Unknown sample document filename(s): {', '.join(missing_filenames)}")

    generated_paths: list[Path] = []
    for document in selected_documents:
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
    parser.add_argument(
        "--filenames",
        nargs="*",
        help="Optional list of specific PDF filenames to generate without touching the rest.",
    )
    args = parser.parse_args()

    generated = generate_synthetic_documents(args.output_dir, args.filenames)
    for path in generated:
        print(f"Generated {path}")


if __name__ == "__main__":
    main()
