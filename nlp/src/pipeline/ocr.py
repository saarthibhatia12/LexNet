from __future__ import annotations

import shutil
from io import BytesIO
from pathlib import Path

import pytesseract
from PIL import Image, ImageOps
from pypdf import PdfReader
from pypdf.errors import FileNotDecryptedError

from src.config import get_settings

MIN_NATIVE_TEXT_LENGTH = 50


class OCRError(Exception):
    """Base error for OCR pipeline failures."""


class EncryptedPDFError(OCRError):
    """Raised when the PDF cannot be read because it is encrypted."""


class EmptyPDFError(OCRError):
    """Raised when a PDF contains no pages."""


class TesseractNotFoundError(OCRError):
    """Raised when the configured Tesseract binary is not available."""


class OCRImageExtractionError(OCRError):
    """Raised when OCR fallback cannot obtain renderable images from the PDF."""


def normalize_text(text: str) -> str:
    return "\n".join(
        line.strip()
        for line in text.replace("\r\n", "\n").replace("\r", "\n").splitlines()
        if line.strip()
    ).strip()


def configure_tesseract() -> str:
    settings = get_settings()
    pytesseract.pytesseract.tesseract_cmd = settings.tesseract_cmd

    configured_command = settings.tesseract_cmd
    if Path(configured_command).is_absolute():
        if not Path(configured_command).exists():
            raise TesseractNotFoundError(
                f"Tesseract binary does not exist at configured path: {configured_command}"
            )
        return configured_command

    if shutil.which(configured_command) is None:
        raise TesseractNotFoundError(
            f"Tesseract binary was not found on PATH: {configured_command}"
        )
    return configured_command


def extract_native_text(reader: PdfReader) -> str:
    page_texts: list[str] = []
    for page in reader.pages:
        page_text = page.extract_text() or ""
        if page_text.strip():
            page_texts.append(page_text)
    return normalize_text("\n".join(page_texts))


def iter_page_images(reader: PdfReader) -> list[Image.Image]:
    extracted_images: list[Image.Image] = []
    for page in reader.pages:
        for image_file in page.images:
            with Image.open(BytesIO(image_file.data)) as image:
                extracted_images.append(image.convert("RGB"))
    return extracted_images


def preprocess_image(image: Image.Image) -> Image.Image:
    grayscale = ImageOps.grayscale(image)
    return ImageOps.autocontrast(grayscale)


def perform_ocr(images: list[Image.Image]) -> str:
    ocr_chunks: list[str] = []
    for image in images:
        prepared_image = preprocess_image(image)
        page_text = pytesseract.image_to_string(prepared_image, config="--psm 6")
        if page_text.strip():
            ocr_chunks.append(page_text)
    return normalize_text("\n".join(ocr_chunks))


def extract_text_from_pdf(pdf_path: str) -> str:
    pdf_file = Path(pdf_path)
    reader = PdfReader(str(pdf_file))

    if reader.is_encrypted:
        raise EncryptedPDFError(f"Encrypted PDF files are not supported: {pdf_file}")

    if not reader.pages:
        raise EmptyPDFError(f"PDF contains no pages: {pdf_file}")

    native_text = extract_native_text(reader)
    if len(native_text) >= MIN_NATIVE_TEXT_LENGTH:
        return native_text

    configure_tesseract()

    try:
        images = iter_page_images(reader)
    except FileNotDecryptedError as error:
        raise EncryptedPDFError(f"Encrypted PDF files are not supported: {pdf_file}") from error

    if not images:
        if native_text:
            return native_text
        raise OCRImageExtractionError(f"No embedded page images found for OCR fallback: {pdf_file}")

    ocr_text = perform_ocr(images)
    combined_text = normalize_text("\n".join([native_text, ocr_text]))
    if combined_text:
        return combined_text

    raise OCRImageExtractionError(f"OCR could not extract text from PDF: {pdf_file}")

