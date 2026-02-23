"""
文档解析模块

支持多种文档格式的文本提取：
- PDF: 使用 PyMuPDF (fitz) 逐页提取文本
- DOCX: 使用 python-docx 提取段落文本
- TXT/MD: 自动检测编码后读取纯文本

采用策略模式：BaseParser 定义解析接口，各格式实现具体解析逻辑，
DocumentParser 作为统一入口自动选择对应的解析器。
"""

from pathlib import Path
from abc import ABC, abstractmethod

import fitz  # PyMuPDF
from docx import Document as DocxDocument
import chardet


class BaseParser(ABC):
    """文档解析器基类，定义解析接口。"""

    @abstractmethod
    def parse(self, file_path: Path) -> str:
        """解析文档并返回提取的文本内容。"""
        pass

    @staticmethod
    def get_file_type(file_path: Path) -> str:
        """根据文件扩展名识别文档类型。"""
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
    """PDF 文档解析器，使用 PyMuPDF 逐页提取文本。"""

    def parse(self, file_path: Path) -> str:
        text_parts = []
        with fitz.open(file_path) as doc:
            for page in doc:
                text = page.get_text()
                if text.strip():
                    text_parts.append(text)
        return "\n\n".join(text_parts)


class DocxParser(BaseParser):
    """Word 文档解析器，使用 python-docx 提取段落文本。"""

    def parse(self, file_path: Path) -> str:
        doc = DocxDocument(file_path)
        text_parts = []
        for para in doc.paragraphs:
            if para.text.strip():
                text_parts.append(para.text)
        return "\n\n".join(text_parts)


class TextParser(BaseParser):
    """纯文本/Markdown 解析器，自动检测文件编码。"""

    def parse(self, file_path: Path) -> str:
        with open(file_path, "rb") as f:
            raw_data = f.read()

        # 使用 chardet 自动检测文件编码
        detected = chardet.detect(raw_data)
        encoding = detected.get("encoding", "utf-8") or "utf-8"

        try:
            return raw_data.decode(encoding)
        except UnicodeDecodeError:
            # 检测失败时回退到 UTF-8，忽略无法解码的字符
            return raw_data.decode("utf-8", errors="ignore")


class DocumentParser:
    """
    统一文档解析入口。

    根据文件扩展名自动选择对应的解析器，
    返回提取的文本内容和文件类型。
    """

    # 文件类型 → 解析器实例的映射表
    _parsers: dict[str, BaseParser] = {
        "pdf": PDFParser(),
        "docx": DocxParser(),
        "txt": TextParser(),
        "markdown": TextParser(),
    }

    @classmethod
    def parse(cls, file_path: Path) -> tuple[str, str]:
        """
        解析文档文件。

        Args:
            file_path: 文档文件路径

        Returns:
            (提取的文本内容, 文件类型)

        Raises:
            ValueError: 不支持的文件格式
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
        """返回支持的文件扩展名列表。"""
        return [".pdf", ".docx", ".txt", ".md", ".markdown"]
