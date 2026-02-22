from pathlib import Path
from abc import ABC, abstractmethod

import fitz  # PyMuPDF
from docx import Document as DocxDocument
import chardet


class BaseParser(ABC):
    @abstractmethod
    def parse(self, file_path: Path) -> str:
        """Parse document and return text content."""
        pass

    @staticmethod
    def get_file_type(file_path: Path) -> str:
        """Get file type from extension."""
        suffix = file_path.suffix.lower()
        type_map = {
            ".pdf": "pdf",
            ".docx": "docx",
            ".doc": "doc",
            ".txt": "txt",
            ".md": "markdown",
            ".markdown": "markdown",
        }
        return type_map.get(suffix, "unknown")


class PDFParser(BaseParser):
    def parse(self, file_path: Path) -> str:
        """Parse PDF file using PyMuPDF."""
        text_parts = []
        with fitz.open(file_path) as doc:
            for page in doc:
                text = page.get_text()
                if text.strip():
                    text_parts.append(text)
        return "\n\n".join(text_parts)


class DocxParser(BaseParser):
    def parse(self, file_path: Path) -> str:
        """Parse Word document using python-docx."""
        doc = DocxDocument(file_path)
        text_parts = []
        for para in doc.paragraphs:
            if para.text.strip():
                text_parts.append(para.text)
        return "\n\n".join(text_parts)


class TextParser(BaseParser):
    def parse(self, file_path: Path) -> str:
        """Parse text/markdown file with encoding detection."""
        with open(file_path, "rb") as f:
            raw_data = f.read()

        # Detect encoding
        detected = chardet.detect(raw_data)
        encoding = detected.get("encoding", "utf-8") or "utf-8"

        try:
            return raw_data.decode(encoding)
        except UnicodeDecodeError:
            # Fallback to utf-8 with error handling
            return raw_data.decode("utf-8", errors="ignore")


class DocumentParser:
    """Unified document parser that selects appropriate parser based on file type."""

    _parsers: dict[str, BaseParser] = {
        "pdf": PDFParser(),
        "docx": DocxParser(),
        "txt": TextParser(),
        "markdown": TextParser(),
    }

    @classmethod
    def parse(cls, file_path: Path) -> tuple[str, str]:
        """
        Parse document and return (content, file_type).

        Args:
            file_path: Path to the document file

        Returns:
            Tuple of (extracted_text, file_type)

        Raises:
            ValueError: If file type is not supported
        """
        file_type = BaseParser.get_file_type(file_path)

        if file_type == "unknown":
            raise ValueError(f"Unsupported file type: {file_path.suffix}")

        if file_type == "doc":
            raise ValueError("Legacy .doc format not supported. Please convert to .docx")

        parser = cls._parsers.get(file_type)
        if not parser:
            raise ValueError(f"No parser available for file type: {file_type}")

        content = parser.parse(file_path)
        return content, file_type

    @classmethod
    def supported_extensions(cls) -> list[str]:
        """Return list of supported file extensions."""
        return [".pdf", ".docx", ".txt", ".md", ".markdown"]
