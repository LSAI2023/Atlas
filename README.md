# Atlas - 本地知识库智能问答助手

基于 RAG（检索增强生成）的本地知识库问答助手，完全本地化部署，数据不出本机。

## 功能特性

- **知识库管理**：创建、编辑、删除知识库，支持添加描述用于辅助检索
- **文档管理**：上传 PDF/DOCX/TXT/MD 文档，自动解析、分块、向量化，支持文件去重
- **异步处理**：文档上传即时返回，后台异步完成分片和向量化，失败可手动重试
- **文档摘要**：上传时自动生成文档摘要，支持全局性/概括性问答
- **智能问答**：基于知识库的 RAG 问答 + 不依赖知识库的通用对话，自动切换
- **引用溯源**：回答附带引用来源标签，显示知识库、文件名、分片编号，点击按需加载原文
- **思考过程**：展示模型推理链路（reasoning），支持历史消息回显
- **检索增强**：可选启用查询改写、BM25+向量混合检索、LLM 重排序、上下文扩展
- **流式输出**：SSE 逐 token 推送，首字符延迟低
- **多知识库联合检索**：单次对话可同时关联多个知识库
- **模型切换**：支持在多个本地 Ollama 模型间动态切换
- **可视化配置**：前端设置页面修改模型、RAG 参数、检索增强策略，支持一键重置
- **一键安装**：前后端打包为 macOS .dmg 安装包

## 技术栈

| 层次 | 技术 |
|------|------|
| **前端** | Electron 28 + React 18 + TypeScript + Ant Design 6 + @ant-design/x + Zustand |
| **后端** | Python + FastAPI + SQLAlchemy (async) + aiosqlite |
| **LLM** | Ollama (默认 qwen3:14b 对话 / qwen3-embedding:4b 嵌入) |
| **向量库** | ChromaDB |
| **关系库** | SQLite |
| **混合检索** | rank_bm25 + jieba 分词 |
| **构建工具** | Vite 5 + PyInstaller + electron-builder |

## 快速开始

### 前置要求

1. 安装 [Ollama](https://ollama.ai/)
2. 拉取所需模型：
   ```bash
   ollama pull qwen3:14b
   ollama pull qwen3-embedding:4b
   ```

### 启动后端

```bash
cd backend

# 创建虚拟环境
python3 -m venv .venv
source .venv/bin/activate  # macOS/Linux
# 或 .venv\Scripts\activate  # Windows

# 安装依赖
pip install -r requirements.txt

# 启动服务
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### 启动前端

```bash
cd frontend

# 安装依赖
npm install

# 开发模式（仅 Web）
npm run dev

# 开发模式（Electron）
npm run electron:dev
```

### 一键打包

```bash
./build.sh
# 输出：frontend/out/*.dmg
```

## API 端点

### 知识库管理

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/knowledge-bases` | 创建知识库（含描述） |
| GET | `/api/knowledge-bases` | 获取知识库列表 |
| GET | `/api/knowledge-bases/{id}` | 获取知识库详情（含文档列表） |
| PUT | `/api/knowledge-bases/{id}` | 更新知识库信息 |
| DELETE | `/api/knowledge-bases/{id}` | 删除知识库（级联删除文档和向量） |

### 文档管理

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/documents/upload` | 上传文档（异步处理，即时返回） |
| GET | `/api/documents` | 获取文档列表（支持按知识库过滤） |
| GET | `/api/documents/{id}` | 获取文档详情（含分片内容） |
| GET | `/api/documents/{id}/chunks/{index}` | 获取单个分片内容（按需加载） |
| POST | `/api/documents/{id}/reindex` | 重新分片（用于失败重试） |
| DELETE | `/api/documents/{id}` | 删除文档（同时清理向量和文件） |

### 聊天

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/chat` | 发送消息（SSE 流式返回，含引用信息） |
| POST | `/api/chat/conversations` | 创建新对话 |
| GET | `/api/chat/conversations` | 获取对话列表 |
| GET | `/api/chat/conversations/{id}` | 获取对话详情（含消息、reasoning、references） |
| PUT | `/api/chat/conversations/{id}` | 更新对话标题 |
| DELETE | `/api/chat/conversations/{id}` | 删除对话 |
| GET | `/api/chat/models` | 获取可用模型列表 |

### 配置管理

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/settings` | 获取当前配置及默认值 |
| PUT | `/api/settings` | 修改配置项 |
| POST | `/api/settings/reset` | 重置为默认值 |

## 项目结构

```
Atlas/
├── frontend/                     # Electron + React 前端
│   ├── src/
│   │   ├── main/index.js         # Electron 主进程（后端进程管理、动态端口）
│   │   ├── preload/preload.js    # 预加载脚本（安全桥接）
│   │   └── renderer/             # React 渲染进程
│   │       ├── App.tsx           # 根组件（布局与视图切换）
│   │       ├── components/
│   │       │   ├── ChatPanel.tsx          # 对话面板（流式渲染、引用展示）
│   │       │   ├── Sidebar.tsx            # 侧边栏（对话/知识库列表）
│   │       │   ├── KnowledgeBaseView.tsx  # 知识库文档管理（状态展示、重试）
│   │       │   └── SettingsPage.tsx       # 配置页面
│   │       ├── services/api.ts   # API 服务层（HTTP + SSE 流式解析）
│   │       └── stores/           # Zustand 状态管理
│   │           ├── conversationStore.ts
│   │           └── knowledgeBaseStore.ts
│   ├── build/entitlements.mac.plist  # macOS 权限声明
│   └── package.json              # 依赖与 electron-builder 打包配置
│
├── backend/                      # Python FastAPI 后端
│   ├── app/
│   │   ├── main.py               # FastAPI 入口（生命周期、中间件、路由）
│   │   ├── config.py             # 全局配置（pydantic-settings，支持前端可视化修改）
│   │   ├── api/
│   │   │   ├── chat.py           # 对话 API（SSE 流式、引用溯源）
│   │   │   ├── documents.py      # 文档 API（异步上传、去重、重试）
│   │   │   ├── knowledge_bases.py # 知识库 API
│   │   │   ├── settings.py       # 配置管理 API
│   │   │   └── history.py        # 历史消息 API
│   │   ├── core/
│   │   │   ├── rag.py            # RAG 编排（查询改写、混合检索、重排序、上下文扩展）
│   │   │   ├── vectorstore.py    # ChromaDB 封装（语义检索、BM25 语料获取）
│   │   │   ├── ollama.py         # Ollama 模型服务（对话 + 嵌入）
│   │   │   ├── parser.py         # 多格式文档解析（PDF/DOCX/TXT/MD）
│   │   │   └── chunker.py        # 文本分块（中英文优化的递归分割）
│   │   ├── models/models.py      # ORM 模型（KnowledgeBase, Document, Conversation, Message, Setting）
│   │   └── db/
│   │       ├── database.py       # 异步引擎、会话管理、增量迁移
│   │       └── crud.py           # CRUD 操作
│   ├── run.py                    # PyInstaller 入口
│   ├── atlas-backend.spec        # PyInstaller 打包配置
│   └── requirements.txt
│
├── data/                         # 运行时数据（自动生成）
│   ├── chroma/                   # ChromaDB 向量库
│   ├── sqlite/atlas.db           # SQLite 数据库
│   └── uploads/                  # 上传的文档
│
├── build.sh                      # 一键构建脚本
└── TODO.md                       # 开发任务追踪
```

## 支持的文档格式

- PDF (.pdf) — PyMuPDF 逐页提取
- Word (.docx) — python-docx 段落提取
- 文本 (.txt) — 自动检测编码
- Markdown (.md)

## 配置项

通过前端设置页面或 `PUT /api/settings` 接口可调整：

| 分组 | 配置项 | 默认值 | 说明 |
|------|--------|--------|------|
| 模型配置 | ollama_base_url | http://127.0.0.1:11434 | Ollama 服务地址 |
| 模型配置 | ollama_chat_model | qwen3:14b | 对话模型 |
| 模型配置 | ollama_embedding_model | qwen3-embedding:4b | 嵌入模型 |
| RAG 参数 | chunk_size | 600 | 分片大小（字符数） |
| RAG 参数 | chunk_overlap | 100 | 分片重叠（字符数） |
| RAG 参数 | retrieval_top_k | 5 | 检索 Top-K |
| 对话参数 | max_history_messages | 10 | 最大历史消息轮数 |
| 检索增强 | enable_query_rewrite | false | 启用查询改写 |
| 检索增强 | enable_hybrid_search | false | 启用 BM25+向量混合检索 |
| 检索增强 | enable_reranking | false | 启用 LLM 重排序 |
| 检索增强 | bm25_weight | 0.3 | BM25 权重（0-1） |
| 检索增强 | rerank_top_n | 15 | 重排序初筛数量 |

## 许可证

MIT
