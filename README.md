# Atlas - 本地知识库助手

基于 RAG（检索增强生成）的本地知识库问答助手。

## 技术栈

- **前端**: Electron + React + Ant Design + Zustand
- **后端**: Python + FastAPI
- **LLM**: Ollama (qwen3:14b)
- **Embedding**: Ollama (qwen3-embedding:4b)
- **向量库**: ChromaDB
- **关系库**: SQLite

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

# 创建虚拟环境（如果尚未创建）
python3 -m venv .venv

# 激活虚拟环境
source .venv/bin/activate  # macOS/Linux
# 或
.venv\Scripts\activate  # Windows

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

## API 端点

### 文档管理

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/documents/upload` | 上传并索引文档 |
| GET | `/api/documents` | 获取文档列表 |
| GET | `/api/documents/{id}` | 获取文档详情 |
| DELETE | `/api/documents/{id}` | 删除文档 |

### 聊天

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/chat` | 发送消息（SSE 流式返回） |
| POST | `/api/chat/conversations` | 创建新对话 |
| GET | `/api/chat/conversations` | 获取对话列表 |
| GET | `/api/chat/conversations/{id}` | 获取对话详情 |
| DELETE | `/api/chat/conversations/{id}` | 删除对话 |

## 项目结构

```
Atlas/
├── frontend/                 # Electron + React 前端
│   ├── src/
│   │   ├── main/            # Electron 主进程
│   │   ├── renderer/        # React 渲染进程
│   │   │   ├── components/  # UI 组件
│   │   │   ├── services/    # API 调用
│   │   │   └── stores/      # Zustand 状态管理
│   │   └── preload/         # preload 脚本
│   └── package.json
│
├── backend/                  # Python FastAPI 后端
│   ├── app/
│   │   ├── main.py          # FastAPI 入口
│   │   ├── api/             # API 路由
│   │   ├── core/            # 核心逻辑
│   │   ├── models/          # 数据模型
│   │   └── db/              # 数据库
│   └── requirements.txt
│
└── data/                     # 数据目录
    ├── chroma/              # ChromaDB 持久化
    ├── sqlite/              # SQLite 数据库
    └── uploads/             # 上传的文件
```

## 支持的文档格式

- PDF (.pdf)
- Word (.docx)
- 文本 (.txt)
- Markdown (.md)

## 许可证

MIT
