"""
文本分块模块

将长文本按语义边界切分为适合向量化的小片段。

使用 LangChain 的 RecursiveCharacterTextSplitter：
- 按优先级递归尝试不同的分隔符（段落 > 句子 > 逗号 > 字符）
- 针对中英文混合内容优化了分隔符顺序
- 相邻片段保留重叠部分，确保语义上下文的连贯性
"""

from typing import Optional, List, Dict
from langchain_text_splitters import RecursiveCharacterTextSplitter

from app.config import settings


class TextChunker:
    """文本分块器，使用递归字符分割策略将长文本切分为小片段。"""

    def __init__(
        self,
        chunk_size: Optional[int] = None,
        chunk_overlap: Optional[int] = None,
    ):
        self.chunk_size = chunk_size or settings.chunk_size       # 每个片段的最大字符数
        self.chunk_overlap = chunk_overlap or settings.chunk_overlap  # 相邻片段的重叠字符数

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

        self.splitter = RecursiveCharacterTextSplitter(
            chunk_size=self.chunk_size,
            chunk_overlap=self.chunk_overlap,
            separators=self.separators,
            length_function=len,
            is_separator_regex=False,
        )

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

        chunks = self.splitter.split_text(text)
        # 过滤掉空白片段
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
        import re

        # 将连续 3 个以上的换行合并为双换行
        text = re.sub(r"\n{3,}", "\n\n", text)
        # 将连续多个空格合并为单个空格
        text = re.sub(r" {2,}", " ", text)
        # 去除首尾空白
        text = text.strip()
        return text


# 全局默认分块器实例
text_chunker = TextChunker()
