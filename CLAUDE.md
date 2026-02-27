# CLAUDE.md

## 项目概述

Atlas 是一个基于 RAG（检索增强生成）的本地知识库智能问答助手。采用 Electron 桌面应用 + React 前端 + Python FastAPI 后端架构，通过 Ollama 进行本地大模型推理。所有数据完全存储在用户本机，不依赖任何云端服务。

## 技术架构

- **前端**：Electron 28 + React 18 + TypeScript + Ant Design 6 + Zustand（状态管理）
- **后端**：Python 3.9+ + FastAPI（异步）+ SQLAlchemy + aiosqlite
- **大模型**：Ollama（默认 qwen3:14b 对话 / qwen2.5:14b 摘要 / qwen3-embedding:4b 嵌入）
- **向量库**：ChromaDB（余弦相似度）
- **关系库**：SQLite
- **混合检索**：rank_bm25 + jieba（中文分词）

## 目录结构

```
Atlas/
├── frontend/                     # Electron + React 前端
│   ├── src/main/index.js         # Electron 主进程（后端进程管理、动态端口）
│   ├── src/preload/preload.js    # 预加载脚本（安全桥接）
│   └── src/renderer/             # React 渲染进程
│       ├── components/           # ChatPanel, Sidebar, KnowledgeBaseView, SettingsPage
│       ├── services/api.ts       # HTTP + SSE 客户端
│       └── stores/               # Zustand 状态管理
├── backend/                      # Python FastAPI 后端
│   └── app/
│       ├── main.py               # 应用入口、路由注册、生命周期
│       ├── config.py             # pydantic-settings 配置，CONFIGURABLE_KEYS 字典
│       ├── api/                  # REST 路由（chat, documents, knowledge_bases, settings, history）
│       ├── core/                 # 核心逻辑（rag, vectorstore, ollama, parser, chunker）
│       ├── models/models.py      # ORM 模型（5 张表）
│       └── db/                   # database.py（引擎 + 增量迁移）、crud.py
└── data/                         # 运行时数据（自动创建）
    ├── chroma/                   # ChromaDB 持久化
    ├── sqlite/atlas.db           # SQLite 数据库
    └── uploads/                  # 上传的文档
```

## 开发环境

### 后端
```bash
cd backend
source .venv/bin/activate        # Python 虚拟环境位于 backend/.venv
pip install -r requirements.txt
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### 前端
```bash
cd frontend
npm install
npm run dev                      # Web 开发模式，localhost:5173（代理到 :8000）
npm run electron:dev             # Electron 开发模式
```

### 打包
```bash
./build.sh                       # PyInstaller → Vite → electron-builder → .dmg
```

## 关键技术细节

### 数据库迁移
不使用 Alembic。增量迁移定义在 `backend/app/db/database.py` 的 `_MIGRATIONS` 列表中，每条格式为 `(表名, 列名, 类型)`。启动时通过 `PRAGMA table_info` 检查缺失列，自动执行 `ALTER TABLE ADD COLUMN`。

### 配置管理
`backend/app/config.py` 定义了 `CONFIGURABLE_KEYS` 字典和 `Settings` 类（pydantic-settings）。用户自定义配置持久化到 SQLite 的 `settings` 表，修改即时生效无需重启。前端配置页面在 `SettingsPage.tsx`。
当前关键配置项包括：`ollama_chat_model`、`ollama_summary_model`、`ollama_embedding_model`、`chunk_size`、`chunk_overlap`、`chunk_min_chars`。

### RAG 检索管线（backend/app/core/rag.py）
1. 查询改写（可选，LLM 将模糊问题改写为精确检索语句）
2. 混合检索：向量检索（ChromaDB）+ BM25 关键词检索（rank_bm25 + jieba），通过 RRF 融合
3. 重排序（可选，LLM 对结果打分 0-10）
4. 上下文扩展（获取命中片段的相邻片段 ±1）
5. 层级化上下文构建：知识库 description → 文档 summary → 内容 chunk
6. SSE 流式生成，分离思考过程（reasoning）和回答内容

### 文档处理（backend/app/api/documents.py）
- 上传即时返回（status=pending），不阻塞
- 分片和向量化通过 `asyncio.create_task` 后台异步执行，使用独立 DB 会话
- 基于 SHA-256 哈希的同知识库内文件去重
- DOCX 解析主流程为 `mammoth -> markdown`，失败时回退 `python-docx`
- 失败文档可通过 `/api/documents/{id}/reindex` 手动重试

### SSE 流式通信（backend/app/api/chat.py）
格式：`data: {"content": "...", "reasoning": "...", "done": false}\n\n`
完成事件包含 `references` 数组，携带引用溯源信息。

### 前端状态管理
- `conversationStore.ts`：对话列表、消息、流式生成状态
- `knowledgeBaseStore.ts`：知识库、文档列表、处理中文档的轮询刷新（3 秒间隔）

## 重要模式

- 全部源码注释为中文
- 后端全面使用 async/await（aiosqlite、async SQLAlchemy）
- 前端 SSE 流式使用 Fetch API（非 axios），见 `chatApi.sendMessage`
- 文档状态生命周期：pending → processing → completed | failed
- 引用信息以轻量 JSON 索引存储在消息中（不含原文），点击时按需从 ChromaDB 加载（再次点击同一引用可收起）
- `GET /api/documents/{id}/chunks/{index}` 支持 `index=-1` 查询摘要分片
- 打包模式通过 `sys.frozen`（PyInstaller）检测，数据目录切换到 `~/Library/Application Support/Atlas/data/`

## 测试验证

### 后端
```bash
cd backend
source .venv/bin/activate
python -c "from app.config import settings; print(settings.data_dir)"  # 验证配置
```

### 前端
```bash
cd frontend
npx tsc --noEmit                 # TypeScript 类型检查
npm run build                    # 完整构建（tsc + vite）
```

## 常见开发任务

- **新增可配置项**：在 config.py 的 `CONFIGURABLE_KEYS` 中添加条目，在 `Settings` 类中添加字段，前端设置页面会根据 type 自动渲染对应控件
- **新增 API 路由**：在 `backend/app/api/` 下创建文件，在 `backend/app/main.py` 中注册路由
- **新增数据库字段**：在 models.py 的模型中添加列，在 database.py 的 `_MIGRATIONS` 中添加迁移条目，在 `to_dict()` 中添加序列化
- **新增前端组件**：在 `frontend/src/renderer/components/` 下创建，在 App.tsx 中接入
