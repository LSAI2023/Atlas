"""
文本分块模块

将长文本按语义边界切分为适合向量化的小片段。

使用 LangChain 的 RecursiveCharacterTextSplitter：
- 按优先级递归尝试不同的分隔符（段落 > 句子 > 逗号 > 字符）
- 针对中英文混合内容优化了分隔符顺序
- 相邻片段保留重叠部分，确保语义上下文的连贯性
"""

from typing import Optional, List, Dict
import re
from langchain_text_splitters import RecursiveCharacterTextSplitter

from app.config import settings


class TextChunker:
    """文本分块器，使用递归字符分割策略将长文本切分为小片段。"""

    def __init__(
        self,
        chunk_size: Optional[int] = None,
        chunk_overlap: Optional[int] = None,
    ):
        # 允许构造时覆盖；未覆盖时每次 split 动态读取 settings，确保运行时配置立即生效。
        self.chunk_size = chunk_size
        self.chunk_overlap = chunk_overlap

        # 分隔符优先级列表（从粗粒度到细粒度），针对中英文混合内容优化
        self.separators = [
            "\n\n",      # 段落分隔
            "\n",        # 换行
            "。",        # 中文句号
            "！",        # 中文感叹号
            "？",        # 中文问号
            "；",        # 中文分号
            ". ",        # 英文句号
            "! ",        # 英文感叹号
            "? ",        # 英文问号
            "; ",        # 英文分号
            "，",        # 中文逗号
            ", ",        # 英文逗号
            " ",         # 空格
            "",          # 单字符级别（最终兜底）
        ]

    def _current_chunk_size(self) -> int:
        return int(self.chunk_size) if self.chunk_size is not None else int(settings.chunk_size)

    def _current_chunk_overlap(self) -> int:
        return int(self.chunk_overlap) if self.chunk_overlap is not None else int(settings.chunk_overlap)

    def _current_chunk_min_chars(self) -> int:
        return int(settings.chunk_min_chars)

    def split(self, text: str) -> List[str]:
        """
        将文本切分为多个片段。

        Args:
            text: 待切分的长文本

        Returns:
            切分后的文本片段列表
        """
        # 预处理：清理多余空白
        text = self._clean_text(text)

        if not text:
            return []

        splitter = RecursiveCharacterTextSplitter(
            chunk_size=self._current_chunk_size(),
            chunk_overlap=self._current_chunk_overlap(),
            separators=self.separators,
            length_function=len,
            is_separator_regex=False,
        )

        chunks = splitter.split_text(text)
        try:
            processed = self._post_process_chunks(chunks)
            return self._ensure_overlap(processed, self._current_chunk_overlap())
        except Exception:
            # 后处理异常时回退到基础分片，避免文档整体处理失败
            return [chunk.strip() for chunk in chunks if chunk.strip()]

    def split_with_metadata(
        self, text: str, base_metadata: Optional[Dict] = None
    ) -> List[Dict]:
        """
        切分文本并附带元数据（片段索引、总片段数等）。

        Args:
            text: 待切分的长文本
            base_metadata: 附加到每个片段的基础元数据

        Returns:
            字典列表，每项包含 content（片段内容）和 metadata（元数据）
        """
        chunks = self.split(text)
        base_metadata = base_metadata or {}

        return [
            {
                "content": chunk,
                "metadata": {
                    **base_metadata,
                    "chunk_index": i,        # 当前片段索引
                    "total_chunks": len(chunks),  # 总片段数
                },
            }
            for i, chunk in enumerate(chunks)
        ]

    def _clean_text(self, text: str) -> str:
        """预处理文本：合并多余空行和空格。"""
        # 将连续 3 个以上的换行合并为双换行
        text = re.sub(r"\n{3,}", "\n\n", text)
        # 将连续多个空格合并为单个空格
        text = re.sub(r" {2,}", " ", text)
        # 去除首尾空白
        text = text.strip()
        return text

    def _post_process_chunks(self, chunks: List[str]) -> List[str]:
        """
        分片后处理：
        1. 去空、去噪声片段
        2. 将过短片段合并到相邻片段
        """
        cleaned: List[str] = []

        for chunk in chunks:
            text = chunk.strip()
            if not text:
                continue
            # 仅包含符号/分隔线的片段直接丢弃
            if not re.search(r"[A-Za-z0-9\u4e00-\u9fff]", text):
                continue

            cleaned.append(text)

        if not cleaned:
            return []

        merged: List[str] = []
        pending_short = ""
        min_chars = max(1, self._current_chunk_min_chars())

        for text in cleaned:
            if len(text) < min_chars:
                pending_short = f"{pending_short}\n{text}".strip() if pending_short else text
                continue

            if pending_short:
                text = f"{pending_short}\n{text}"
                pending_short = ""
            merged.append(text)

        if pending_short:
            if merged:
                merged[-1] = f"{merged[-1]}\n{pending_short}"
            else:
                merged.append(pending_short)

        return [m.strip() for m in merged if m.strip()]

    def _ensure_overlap(self, chunks: List[str], overlap: int) -> List[str]:
        """
        LangChain 在某些分隔边界下可能出现可见重叠不明显的情况。
        若相邻分片没有公共前后缀，则补上前一片尾部 overlap 字符，确保重叠存在。
        """
        if overlap <= 0 or len(chunks) <= 1:
            return chunks

        ensured = [chunks[0]]
        for i in range(1, len(chunks)):
            prev = ensured[-1]
            curr = chunks[i]
            prev_tail = prev[-overlap:].strip()
            if not prev_tail:
                ensured.append(curr)
                continue

            max_check = min(len(prev_tail), len(curr), overlap)
            has_overlap = False
            for n in range(max_check, 0, -1):
                if prev_tail[-n:] == curr[:n]:
                    has_overlap = True
                    break

            if has_overlap:
                ensured.append(curr)
            else:
                ensured.append(f"{prev_tail}\n{curr}".strip())
        return ensured


# 全局默认分块器实例
text_chunker = TextChunker()
