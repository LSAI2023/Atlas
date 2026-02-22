from typing import Optional, List, Dict
from langchain_text_splitters import RecursiveCharacterTextSplitter

from app.config import settings


class TextChunker:
    """Text chunking using RecursiveCharacterTextSplitter for semantic splitting."""

    def __init__(
        self,
        chunk_size: Optional[int] = None,
        chunk_overlap: Optional[int] = None,
    ):
        self.chunk_size = chunk_size or settings.chunk_size
        self.chunk_overlap = chunk_overlap or settings.chunk_overlap

        # Separators optimized for Chinese and English mixed content
        self.separators = [
            "\n\n",      # Paragraph breaks
            "\n",        # Line breaks
            "。",        # Chinese period
            "！",        # Chinese exclamation
            "？",        # Chinese question mark
            "；",        # Chinese semicolon
            ". ",        # English sentence end
            "! ",        # English exclamation
            "? ",        # English question mark
            "; ",        # English semicolon
            "，",        # Chinese comma
            ", ",        # English comma
            " ",         # Space
            "",          # Character level fallback
        ]

        self.splitter = RecursiveCharacterTextSplitter(
            chunk_size=self.chunk_size,
            chunk_overlap=self.chunk_overlap,
            separators=self.separators,
            length_function=len,
            is_separator_regex=False,
        )

    def split(self, text: str) -> List[str]:
        """
        Split text into chunks.

        Args:
            text: The text to split

        Returns:
            List of text chunks
        """
        # Clean up text
        text = self._clean_text(text)

        if not text:
            return []

        chunks = self.splitter.split_text(text)
        # Filter out empty or whitespace-only chunks
        return [chunk.strip() for chunk in chunks if chunk.strip()]

    def split_with_metadata(
        self, text: str, base_metadata: Optional[Dict] = None
    ) -> List[Dict]:
        """
        Split text and return chunks with metadata.

        Args:
            text: The text to split
            base_metadata: Base metadata to include with each chunk

        Returns:
            List of dicts with 'content' and 'metadata' keys
        """
        chunks = self.split(text)
        base_metadata = base_metadata or {}

        return [
            {
                "content": chunk,
                "metadata": {
                    **base_metadata,
                    "chunk_index": i,
                    "total_chunks": len(chunks),
                },
            }
            for i, chunk in enumerate(chunks)
        ]

    def _clean_text(self, text: str) -> str:
        """Clean text before splitting."""
        # Replace multiple newlines with double newline
        import re

        text = re.sub(r"\n{3,}", "\n\n", text)
        # Replace multiple spaces with single space
        text = re.sub(r" {2,}", " ", text)
        # Remove leading/trailing whitespace
        text = text.strip()
        return text


# Default chunker instance
text_chunker = TextChunker()
