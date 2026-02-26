# Atlas 待办事项

## 执行计划

按依赖关系和文件冲突最小化原则，分 4 个阶段执行：

### Phase 1 — 基础设施 + 独立小功能（三者文件冲突小，可并行）
- [x] **TODO 8** — 配置页面：基础设施先行，后续功能新增的配置项可直接暴露
- [x] **TODO 2** — 文档去重：纯后端，改动最小最独立
- [x] **TODO 3** — 持久化 reasoning：改动小且独立

### Phase 2 — RAG 功能扩展（为 Phase 4 检索大重构铺垫）
- [ ] **TODO 5** — 知识库备注：7.1 层级化检索的前置条件（KB description）
- [ ] **TODO 1** — 文档摘要：7.1 层级化检索的前置条件（summary 片段）
- [ ] **TODO 4** — 引用溯源：在 TODO 7 大幅重构 rag.py 之前完成

### Phase 3 — 上传流程重构
- [ ] **TODO 6** — 文档分片异步化：等 TODO 1（摘要）和 TODO 2（去重）合入后统一异步化

### Phase 4 — 检索大重构
- [ ] **TODO 7** — 检索增强：依赖 TODO 1 的 summary、TODO 5 的 description、TODO 8 的配置管理

### 依赖关系
```
Phase 1:  8(配置) + 2(去重) + 3(reasoning)  ← 可并行
              ↓
Phase 2:  5(KB备注) + 1(摘要)  ← 可并行
              ↓
          4(引用溯源)
              ↓
Phase 3:  6(异步化)  ← 等 1、2 合入上传流程后
              ↓
Phase 4:  7(检索增强)  ← 依赖 1、5、8
```

---

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

---

## 3. 持久化思考过程（reasoning），支持历史消息回显

**背景**：当前流式生成时，后端从 Ollama 提取的 `reasoning`（思考过程）能通过 SSE 实时推送到前端并在 `<Think>` 组件中展示，但保存消息时只存了 `content`，未持久化 `reasoning`。导致加载历史对话时看不到思考过程。

**方案**：
1. 在 SQLite 的 `messages` 表新增 `reasoning` 字段（Text，可为空）
2. 后端保存 assistant 消息时，将累积的 `reasoning` 一并写入数据库
3. 查询历史消息的接口确保返回 `reasoning` 字段
4. 前端加载历史消息时，将 `reasoning` 传递给 `<Think>` 组件进行回显

**涉及文件**：
- `backend/app/models/models.py` — Message 模型加 `reasoning` 字段
- `backend/app/api/chat.py` — 保存 assistant 消息时存入 reasoning
- `backend/app/db/crud.py` — 确保查询消息时返回 reasoning
- `frontend/src/renderer/components/ChatPanel.tsx` — 历史消息回显时传入 reasoning

---

## 4. RAG 引用溯源：展示检索来源，按需查看分片内容

**背景**：当前使用知识库问答时，用户无法得知回答引用了哪些文档片段。缺少引用来源会降低回答的可信度，也无法帮助用户进一步查阅原始资料。

**设计原则**：references 只存轻量索引信息（知识库名、文件名、分片编号），不存分片原文。用户点击展开时按需从 ChromaDB 查询内容，避免消息表膨胀。

**方案**：
1. `rag.py` 的 `generate_stream` 流结束后额外 yield 引用索引信息（不含 content），包括 `knowledge_base_id`、`knowledge_base_name`、`document_id`、`filename`、`chunk_index`、`distance`
2. `chat.py` 的 SSE 流中，在 `done` 事件里附带 `references` 数据发送给前端
3. Message 模型新增 `references` 字段（JSON Text），只持久化索引信息，支持历史消息回显
4. 后端新增查询分片内容的接口：`GET /api/documents/{document_id}/chunks/{chunk_index}`，从 ChromaDB 按需获取指定片段原文
5. 前端在助手消息下方渲染引用标签列表，显示知识库名、文件名、第几分片；用户点击标签时调用接口获取并展开显示分片内容

**references JSON 结构**（存入 Message 的轻量数据）：
```json
[
  {
    "knowledge_base_id": "kb-uuid",
    "knowledge_base_name": "产品文档",
    "document_id": "doc-uuid",
    "filename": "使用手册.pdf",
    "chunk_index": 3,
    "distance": 0.23
  }
]
```

**涉及文件**：
- `backend/app/core/rag.py` — `generate_stream` 流结束后 yield 引用索引
- `backend/app/api/chat.py` — SSE 流中发送 references，保存消息时存入引用索引
- `backend/app/models/models.py` — Message 模型加 `references` 字段
- `backend/app/db/crud.py` — 消息创建和查询支持 references
- `backend/app/api/documents.py` — 新增按 document_id + chunk_index 查询分片内容的接口
- `backend/app/core/vectorstore.py` — 新增按 document_id + chunk_index 获取单个分片的方法
- `frontend/src/renderer/components/ChatPanel.tsx` — 渲染引用标签，点击按需加载分片内容
- `frontend/src/renderer/services/api.ts` — Message 类型增加 references，新增查询分片内容 API

---

## 5. 知识库备注：支持创建和编辑时添加描述，并用于向量检索

**背景**：后端数据库和 API 已支持知识库的 `description` 字段，前端展示层也有条件渲染，但创建知识库时前端只提供了 name 输入框，没有 description 输入；也没有编辑知识库信息的入口。此外，知识库描述未参与 RAG 检索，无法帮助模型理解知识库的整体定位。

**方案**：
1. 创建知识库的 UI 从简单输入框改为 Modal 弹窗，包含 `name` 和 `description` 两个字段
2. 知识库列表项或详情页增加编辑入口，弹出 Modal 支持修改 name 和 description，调用已有的 `knowledgeBaseApi.update()` 接口
3. Store 中增加 `updateKnowledgeBase` action
4. RAG 检索时，将选中知识库的 description 注入 system prompt 作为知识库背景信息，辅助模型理解上下文

**涉及文件**：
- `frontend/src/renderer/components/Sidebar.tsx` — 创建知识库改为 Modal，增加编辑入口
- `frontend/src/renderer/components/KnowledgeBaseView.tsx` — 详情页增加编辑入口
- `frontend/src/renderer/stores/knowledgeBaseStore.ts` — 增加 `updateKnowledgeBase` action
- `backend/app/core/rag.py` — 检索时注入知识库 description 到 system prompt
- `backend/app/api/chat.py` — 查询知识库信息，传递 description 给 RAG 服务

---

## 6. 文档分片异步化：上传快速返回，后台处理分片，支持手动重试

**背景**：当前 `POST /api/documents/upload` 接口将文件保存、解析、分片、向量化全部同步执行，大文件上传时接口长时间阻塞，前端一直处于等待状态。此外分片失败后无法重试，只能重新上传。

**方案**：
1. Document 模型新增 `status` 字段，取值：`pending`（待处理）/ `processing`（分片中）/ `completed`（完成）/ `failed`（失败）
2. 上传接口改为"快速返回"：只做文件保存 + 创建 Document 记录（status=pending），立即返回文档 ID
3. 分片流程（解析 → 分块 → 向量化 → 存入 ChromaDB）放到后台异步任务执行（`asyncio.create_task` 或 FastAPI `BackgroundTasks`），完成后更新 status 为 `completed`，异常时标记为 `failed`
4. 新增 `POST /api/documents/{id}/reindex` 接口，用户可对 `failed` 状态的文档手动触发重新分片
5. 前端文档列表根据 `status` 展示不同状态（加载中动画 / 完成 / 失败），失败时显示"重新分片"按钮

**涉及文件**：
- `backend/app/models/models.py` — Document 模型加 `status` 字段
- `backend/app/api/documents.py` — 上传接口拆分为快速返回 + 后台任务；新增 reindex 接口
- `backend/app/db/crud.py` — 新增更新文档状态的方法
- `frontend/src/renderer/components/KnowledgeBaseView.tsx` — 文档列表展示状态，失败时显示重试按钮
- `frontend/src/renderer/services/api.ts` — 新增 reindex API 调用
- `frontend/src/renderer/stores/knowledgeBaseStore.ts` — 支持轮询文档状态或状态刷新

---

## 7. 检索增强：层级化检索 + 多策略提升检索准确性

**背景**：当前检索是完全平面化的——所有文档分片打平存入同一个 ChromaDB collection，检索时只做单次 Top-K 向量相似度匹配。缺少文档级和知识库级的语义信号，面对全局性问题、跨文档问题或精确关键词匹配时效果较差。

### 7.1 层级化检索架构

利用三层信息（知识库 description → 文档 summary → 内容 chunk）构建层级检索：

1. **知识库层**：选中知识库的 `description` 始终注入 system prompt，作为背景信息帮助 LLM 理解知识库定位
2. **文档层**：文档 `summary` 作为特殊片段存入 ChromaDB（metadata 标记 `type: "summary"`），与普通 chunk 一起参与向量检索
3. **上下文构建**：检索结果中优先展示 summary，再展示 chunk，让 LLM 先看到文档全貌再看具体细节
4. **可选两阶段检索**：知识库文档较多时，先通过 summary 定位最相关文档，再在该文档的 chunk 中精细检索

### 7.2 混合检索（Hybrid Search）

向量语义检索 + BM25 关键词检索加权融合。语义检索理解意图但可能漏掉精确关键词，BM25 擅长精确匹配，两者互补。

- ChromaDB 目前不原生支持 BM25，可引入 `rank_bm25` 库在检索侧做关键词匹配
- 对两路结果按 RRF（Reciprocal Rank Fusion）或加权分数合并

### 7.3 查询改写（Query Rewriting）

检索前调用 LLM 对用户问题进行改写或拆分，提升召回率：

- 模糊问题 → 改写为更明确的检索语句
- 复合问题（"A和B的区别"）→ 拆分为多个子查询分别检索，合并结果
- 可选 HyDE（Hypothetical Document Embeddings）：让 LLM 先生成一个"假设回答"，用假设回答的向量去检索，缩小问题与文档之间的语义差距

### 7.4 检索后重排序（Reranking）

初始向量检索粗筛 Top-N（如 20 条），再用更精确的模型对结果重排序，取 Top-K（如 5 条）送入 LLM：

- 可使用 Cross-Encoder 重排序模型（如 bge-reranker）
- 或用 LLM 自身对检索结果评分排序

### 7.5 父子分片（Parent-Child Chunking）

用小分片做检索定位（提高精度），但返回给 LLM 时用更大的父分片（保证上下文完整）：

- 存储时同时生成小片段（检索用）和大片段（上下文用），建立父子映射关系
- 检索命中小片段后，替换为对应的父片段送入 prompt

**涉及文件**：
- `backend/app/core/rag.py` — 检索编排逻辑重构：层级化上下文构建、查询改写、重排序
- `backend/app/core/vectorstore.py` — 支持按 type 过滤（summary/chunk）、混合检索
- `backend/app/core/chunker.py` — 父子分片策略
- `backend/app/config.py` — 新增检索策略相关配置项

---

## 8. 配置页面：前端可视化修改后端默认配置，支持重置

**背景**：当前后端的运行参数（模型选择、RAG 参数、服务地址等）全部硬编码在 `config.py` 的默认值中，修改配置需要手动编辑代码或设置环境变量，对普通用户不友好。需要提供一个前端配置页面，让用户可以在界面上查看和修改这些配置，并支持一键重置为默认值。

**需要暴露的配置项**：
- **模型配置**：`ollama_base_url`（Ollama 服务地址）、`ollama_chat_model`（对话模型）、`ollama_embedding_model`（嵌入模型）
- **RAG 参数**：`chunk_size`（分片大小）、`chunk_overlap`（分片重叠）、`retrieval_top_k`（检索 Top-K 数量）
- **对话参数**：`max_history_messages`（最大历史消息轮数）

**方案**：
1. 后端新增配置管理接口：
   - `GET /api/settings` — 返回当前生效的配置值及各项的默认值
   - `PUT /api/settings` — 接收前端提交的配置修改，校验后更新运行时配置
   - `POST /api/settings/reset` — 将全部或指定配置项重置为默认值
2. 配置持久化：将用户修改的配置存入 SQLite（新建 `settings` 表），应用启动时加载用户配置覆盖默认值，未自定义的项继续使用默认值
3. 运行时生效：修改配置后需即时更新 `settings` 单例中的对应字段，无需重启服务
4. 前端新增「设置」页面，分组展示配置项（模型配置 / RAG 参数 / 对话参数），每个字段显示当前值和默认值提示，提供「保存」和「重置默认」按钮

**涉及文件**：
- `backend/app/config.py` — 定义各配置项的默认值常量，支持运行时动态更新
- `backend/app/models/models.py` — 新增 `Setting` 模型（key-value 存储用户自定义配置）
- `backend/app/db/crud.py` — 新增配置的增删改查方法
- `backend/app/api/settings.py`（新建）— 配置管理 API 路由
- `backend/app/main.py` — 注册 settings 路由，启动时加载用户配置
- `frontend/src/renderer/services/api.ts` — 新增 settings API 调用
- `frontend/src/renderer/components/SettingsPage.tsx`（新建）— 配置页面组件
- `frontend/src/renderer/App.tsx` — 添加设置页面路由入口