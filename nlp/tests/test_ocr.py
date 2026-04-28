from __future__ import annotations

from pathlib import Path

import pytest
from PIL import Image, ImageDraw, ImageFont
from pypdf import PdfReader, PdfWriter
from reportlab.pdfgen import canvas

from src.pipeline.ocr import EncryptedPDFError, extract_text_from_pdf


def create_native_pdf(target_path: Path, text: str) -> Path:
    pdf_canvas = canvas.Canvas(str(target_path), pagesize=(612, 792))
    pdf_canvas.setFont("Helvetica", 12)
    text_object = pdf_canvas.beginText(72, 720)
    for line in text.splitlines():
        text_object.textLine(line)
    pdf_canvas.drawText(text_object)
    pdf_canvas.save()
    return target_path


def create_scanned_pdf(target_path: Path, text: str) -> Path:
    image_path = target_path.with_suffix(".png")
    image = Image.new("RGB", (1600, 500), color="white")
    draw = ImageDraw.Draw(image)

    try:
        font = ImageFont.truetype("DejaVuSans.ttf", 88)
    except OSError:
        font = ImageFont.load_default()

    draw.multiline_text((80, 120), text, fill="black", font=font, spacing=24)
    image.save(image_path)

    pdf_canvas = canvas.Canvas(str(target_path), pagesize=(1600, 500))
    pdf_canvas.drawImage(str(image_path), 0, 0, width=1600, height=500)
    pdf_canvas.save()
    return target_path


def create_encrypted_pdf(target_path: Path, text: str, password: str) -> Path:
    plaintext_path = target_path.with_name(f"{target_path.stem}_plain.pdf")
    create_native_pdf(plaintext_path, text)

    writer = PdfWriter()
    reader = PdfReader(str(plaintext_path))
    for page in reader.pages:
        writer.add_page(page)
    writer.encrypt(password)

    with target_path.open("wb") as encrypted_file:
        writer.write(encrypted_file)

    return target_path


def test_extract_text_from_native_pdf(tmp_path: Path) -> None:
    pdf_path = create_native_pdf(
        tmp_path / "native.pdf",
        (
            "LexNet sale deed for Property ID PROP-12345.\n"
            "Buyer: Asha Rao.\n"
            "Seller: Vikram Rao.\n"
            "Jurisdiction: Bengaluru Urban.\n"
            "Document date: 2026-04-05."
        ),
    )

    extracted_text = extract_text_from_pdf(str(pdf_path))

    assert "LexNet sale deed" in extracted_text
    assert "PROP-12345" in extracted_text
    assert "Bengaluru Urban" in extracted_text


def test_extract_text_from_scanned_pdf(tmp_path: Path) -> None:
    pdf_path = create_scanned_pdf(
        tmp_path / "scanned.pdf",
        "LEXNET SCANNED\nPROPERTY RECORD",
    )

    extracted_text = extract_text_from_pdf(str(pdf_path)).upper()

    assert "LEXNET" in extracted_text
    assert "PROPERTY" in extracted_text


def test_extract_text_from_encrypted_pdf_raises_error(tmp_path: Path) -> None:
    pdf_path = create_encrypted_pdf(
        tmp_path / "encrypted.pdf",
        "Encrypted LexNet document that should not be processed.",
        password="lexnet-secret",
    )

    with pytest.raises(EncryptedPDFError):
        extract_text_from_pdf(str(pdf_path))
