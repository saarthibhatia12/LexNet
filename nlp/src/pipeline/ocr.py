from __future__ import annotations

import base64
import json
import shutil
from binascii import Error as BinasciiError
from io import BytesIO
from pathlib import Path

import pytesseract
from cryptography.exceptions import InvalidTag
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from PIL import Image, ImageOps
from pypdf import PdfReader
from pypdf.errors import FileNotDecryptedError, PdfReadError, PdfStreamError

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


class EncryptedPayloadError(RuntimeError):
    """Raised when an encrypted IPFS payload cannot be decoded or decrypted."""


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


def decode_pdf_bytes_from_ipfs_payload(payload_bytes: bytes, aes_key_hex: str | None) -> bytes:
    if not payload_bytes:
        raise EncryptedPayloadError("IPFS payload is empty.")

    if payload_bytes.startswith(b"%PDF-"):
        return payload_bytes

    try:
        payload_text = payload_bytes.decode("utf-8")
    except UnicodeDecodeError:
        return payload_bytes

    try:
        payload = json.loads(payload_text)
    except json.JSONDecodeError:
        return payload_bytes

    if not isinstance(payload, dict):
        raise EncryptedPayloadError("IPFS payload JSON must be an object.")

    required_fields = ("ciphertext", "iv", "authTag")
    if not all(field in payload for field in required_fields):
        message = payload.get("Message") or payload.get("message")
        if isinstance(message, str) and message.strip():
            raise EncryptedPayloadError(f"IPFS API returned JSON instead of a PDF: {message.strip()}")
        raise EncryptedPayloadError("IPFS payload JSON is not a valid encrypted document envelope.")

    if not aes_key_hex:
        raise EncryptedPayloadError("AES_KEY is required to decrypt IPFS document payloads.")

    try:
        ciphertext = base64.b64decode(str(payload["ciphertext"]), validate=True)
        iv = base64.b64decode(str(payload["iv"]), validate=True)
        auth_tag = base64.b64decode(str(payload["authTag"]), validate=True)
    except (BinasciiError, ValueError, TypeError) as error:
        raise EncryptedPayloadError("Encrypted IPFS payload contains invalid base64 fields.") from error

    if len(iv) != 12:
        raise EncryptedPayloadError(f"Encrypted IPFS payload IV must be 12 bytes, got {len(iv)}.")
    if len(auth_tag) != 16:
        raise EncryptedPayloadError(f"Encrypted IPFS payload authTag must be 16 bytes, got {len(auth_tag)}.")

    try:
        plaintext = AESGCM(bytes.fromhex(aes_key_hex)).decrypt(iv, ciphertext + auth_tag, None)
    except (InvalidTag, ValueError) as error:
        raise EncryptedPayloadError("Could not decrypt IPFS document payload with configured AES_KEY.") from error

    if not plaintext.startswith(b"%PDF-"):
        raise EncryptedPayloadError("Decrypted IPFS payload is not a PDF document.")

    return plaintext


def extract_text_from_pdf(pdf_path: str) -> str:
    pdf_file = Path(pdf_path)
    try:
        reader = PdfReader(str(pdf_file))
    except (PdfReadError, PdfStreamError) as error:
        raise OCRError(f"Invalid or unreadable PDF file: {pdf_file}") from error

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
