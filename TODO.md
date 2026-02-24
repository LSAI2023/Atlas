# Atlas 待办事项

## 1. 文档入库时生成摘要，支持全局性问答

**背景**：当前 RAG 只能做"问题→相关片段"的点对点语义检索，无法回答"请解释一下知识库的内容"这类全局性问题。

**方案**：
1. 文档上传并分片后，额外调用 LLM 对全文（或分批对片段）生成一份文档摘要
2. 在 SQLite 的 `documents` 表新增 `summary` 字段存储摘要
3. 同时将摘要作为一个特殊片段存入 ChromaDB（metadata 标记 `type: "summary"`）
4. 检索时，如果判断用户问题是全局性/概括性的，优先匹配摘要片段；或者在 system prompt 中始终附带关联文档的摘要信息

**涉及文件**：
- `backend/app/models/models.py` — Document 模型加 summary 字段
- `backend/app/api/documents.py` — 上传流程中增加摘要生成步骤
- `backend/app/core/rag.py` — 检索/上下文构建逻辑调整
- `backend/app/core/vectorstore.py` — 摘要片段的存储与检索

---

## 2. 文档上传去重：基于文件哈希保证唯一性

**背景**：当前用户可以重复上传同一份文件到同一个知识库，导致重复分片和向量存储，浪费空间并影响检索质量。

**方案**：
1. 上传文件时计算文件内容的 SHA-256 哈希值
2. 在 SQLite 的 `documents` 表新增 `file_hash` 字段（加唯一索引，范围为同一知识库内）
3. 上传前先查询同知识库下是否已存在相同哈希的文档，存在则拒绝上传并返回提示
4. 可考虑跨知识库的策略：同一文件在不同知识库中允许存在，但底层向量可复用（进阶优化）

**涉及文件**：
- `backend/app/models/models.py` — Document 模型加 `file_hash` 字段
- `backend/app/db/crud.py` — 新增按哈希查询文档的方法
- `backend/app/api/documents.py` — 上传接口增加哈希计算和去重检查
