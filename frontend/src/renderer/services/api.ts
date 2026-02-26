/**
 * API 服务层
 *
 * 封装所有与后端 FastAPI 的 HTTP 交互，按功能分组：
 * - knowledgeBaseApi: 知识库 CRUD
 * - documentApi: 文档上传/查询/删除
 * - conversationApi: 对话 CRUD
 * - chatApi: 聊天消息发送（SSE 流式）
 * - modelsApi: 模型列表查询
 *
 * 同时定义了所有 TypeScript 接口类型。
 */

import axios from 'axios'

/**
 * API 基础路径
 * - 生产环境：通过 Electron preload 获取后端端口，直连 127.0.0.1
 * - 开发环境：使用 /api，由 Vite 代理转发到后端
 */
function getApiBase(): string {
  if (window.electronAPI?.backendPort) {
    return `http://127.0.0.1:${window.electronAPI.backendPort}/api`
  }
  return '/api'
}

const API_BASE = getApiBase()

// ===========================
//  TypeScript 类型定义
// ===========================

/** 知识库 */
export interface KnowledgeBase {
  id: string
  name: string
  description: string
  created_at: string
  updated_at: string
}

/** 知识库详情（含文档列表） */
export interface KnowledgeBaseDetail extends KnowledgeBase {
  documents: Document[]
}

/** 文档 */
export interface Document {
  id: string
  filename: string
  file_type: string
  file_size: number
  chunk_count: number
  status: 'pending' | 'processing' | 'completed' | 'failed'  // 文档处理状态
  knowledge_base_id: string
  created_at: string
}

/** 文档分片 */
export interface DocumentChunk {
  content: string
  metadata: {
    document_id: string
    filename: string
    chunk_index: number
    total_chunks: number
  }
}

/** 文档详情（含分片内容） */
export interface DocumentDetail extends Document {
  chunks: DocumentChunk[]
}

/** 对话 */
export interface Conversation {
  id: string
  title: string
  created_at: string
  updated_at: string
}

/** 引用信息 */
export interface Reference {
  knowledge_base_id: string
  knowledge_base_name: string
  document_id: string
  filename: string
  chunk_index: number
  distance: number
}

/** 消息 */
export interface Message {
  id: string
  conversation_id: string
  role: 'user' | 'assistant'
  content: string
  reasoning?: string       // 模型的思考过程（可选）
  references?: Reference[] // 引用溯源信息（可选）
  created_at: string
}

/** 聊天请求体 */
export interface ChatRequest {
  message: string
  conversation_id?: string
  knowledge_base_ids?: string[]  // 关联的知识库 ID，用于 RAG 检索
  model?: string                 // 指定模型
}

/** Ollama 模型信息 */
export interface OllamaModel {
  name: string
  size: number
  modified_at: string | null
}

// ===========================
//  知识库 API
// ===========================
export const knowledgeBaseApi = {
  /** 创建知识库 */
  create: async (name: string, description: string = ''): Promise<KnowledgeBase> => {
    const response = await axios.post(`${API_BASE}/knowledge-bases`, { name, description })
    return response.data
  },

  /** 获取知识库列表 */
  list: async (): Promise<{ knowledge_bases: KnowledgeBase[] }> => {
    const response = await axios.get(`${API_BASE}/knowledge-bases`)
    return response.data
  },

  /** 获取知识库详情（含文档列表） */
  get: async (id: string): Promise<KnowledgeBaseDetail> => {
    const response = await axios.get(`${API_BASE}/knowledge-bases/${id}`)
    return response.data
  },

  /** 更新知识库信息 */
  update: async (id: string, data: { name?: string; description?: string }): Promise<KnowledgeBase> => {
    const response = await axios.put(`${API_BASE}/knowledge-bases/${id}`, data)
    return response.data
  },

  /** 删除知识库 */
  delete: async (id: string): Promise<void> => {
    await axios.delete(`${API_BASE}/knowledge-bases/${id}`)
  },
}

// ===========================
//  文档 API
// ===========================
export const documentApi = {
  /** 上传文档到指定知识库（自动解析、分块、向量化） */
  upload: async (file: File, knowledgeBaseId: string): Promise<Document> => {
    const formData = new FormData()
    formData.append('file', file)
    formData.append('knowledge_base_id', knowledgeBaseId)
    const response = await axios.post(`${API_BASE}/documents/upload`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    return response.data
  },

  /** 获取文档列表（可按知识库 ID 过滤） */
  list: async (knowledgeBaseId?: string): Promise<{ documents: Document[] }> => {
    const params = knowledgeBaseId ? { knowledge_base_id: knowledgeBaseId } : {}
    const response = await axios.get(`${API_BASE}/documents`, { params })
    return response.data
  },

  /** 获取文档详情（含分片内容） */
  get: async (id: string): Promise<DocumentDetail> => {
    const response = await axios.get(`${API_BASE}/documents/${id}`)
    return response.data
  },

  /** 删除文档 */
  delete: async (id: string): Promise<void> => {
    await axios.delete(`${API_BASE}/documents/${id}`)
  },

  /** 对失败的文档重新触发分片处理 */
  reindex: async (id: string): Promise<{ message: string; document_id: string }> => {
    const response = await axios.post(`${API_BASE}/documents/${id}/reindex`)
    return response.data
  },

  /** 获取单个分片内容（按需加载，用于引用溯源） */
  getChunk: async (documentId: string, chunkIndex: number): Promise<{ content: string; metadata: Record<string, unknown> }> => {
    const response = await axios.get(`${API_BASE}/documents/${documentId}/chunks/${chunkIndex}`)
    return response.data
  },
}

// ===========================
//  对话 API
// ===========================
export const conversationApi = {
  /** 创建新对话 */
  create: async (title?: string): Promise<Conversation> => {
    const response = await axios.post(`${API_BASE}/chat/conversations`, { title })
    return response.data
  },

  /** 获取对话列表 */
  list: async (): Promise<{ conversations: Conversation[] }> => {
    const response = await axios.get(`${API_BASE}/chat/conversations`)
    return response.data
  },

  /** 获取对话详情（含消息记录） */
  get: async (id: string): Promise<Conversation & { messages: Message[] }> => {
    const response = await axios.get(`${API_BASE}/chat/conversations/${id}`)
    return response.data
  },

  /** 删除对话 */
  delete: async (id: string): Promise<void> => {
    await axios.delete(`${API_BASE}/chat/conversations/${id}`)
  },

  /** 更新对话标题 */
  update: async (id: string, title: string): Promise<Conversation> => {
    const response = await axios.put(`${API_BASE}/chat/conversations/${id}`, { title })
    return response.data
  },
}

// ===========================
//  聊天 API（SSE 流式）
// ===========================
export const chatApi = {
  /**
   * 发送聊天消息并通过 SSE 接收流式响应。
   *
   * 使用 Fetch API（而非 axios）手动解析 SSE 流，
   * 因为 axios 不原生支持流式响应的逐块处理。
   *
   * @param request   - 聊天请求参数
   * @param onChunk   - 每收到一个片段时的回调（content, reasoning）
   * @param onDone    - 生成完成时的回调
   * @param onError   - 发生错误时的回调
   * @returns 中止函数，调用可取消当前请求
   */
  sendMessage: (
    request: ChatRequest,
    onChunk: (content: string, reasoning: string) => void,
    onDone: (references?: Reference[]) => void,
    onError: (error: string) => void
  ): (() => void) => {
    const controller = new AbortController()

    fetch(`${API_BASE}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`)
        }

        const reader = response.body?.getReader()
        if (!reader) {
          throw new Error('No response body')
        }

        const decoder = new TextDecoder()
        let buffer = ''  // 缓冲区，处理跨 chunk 的不完整行

        // 循环读取流式数据
        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          // 将二进制数据解码并追加到缓冲区
          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n')
          buffer = lines.pop() || ''  // 最后一行可能不完整，保留到下次处理

          // 逐行解析 SSE 数据
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.slice(6))
                if (data.error) {
                  onError(data.error)
                } else if (data.done) {
                  onDone(data.references)
                } else {
                  onChunk(data.content || '', data.reasoning || '')
                }
              } catch (e) {
                // 忽略 JSON 解析错误（可能是不完整的数据）
              }
            }
          }
        }
      })
      .catch((error) => {
        // AbortError 是用户主动取消，不需要报错
        if (error.name !== 'AbortError') {
          onError(error.message)
        }
      })

    // 返回中止函数
    return () => controller.abort()
  },
}

/** 配置项信息 */
export interface SettingItem {
  current: string | number | boolean
  default: string | number | boolean
  type: 'string' | 'int' | 'float' | 'bool'
  label: string
  group: string
  is_custom: boolean
}

/** 配置列表响应 */
export interface SettingsResponse {
  settings: Record<string, SettingItem>
}

// ===========================
//  模型 API
// ===========================
export const modelsApi = {
  /** 获取可用的 Ollama 对话模型列表及默认模型 */
  list: async (): Promise<{ models: OllamaModel[]; default: string }> => {
    const response = await axios.get(`${API_BASE}/chat/models`)
    return response.data
  },
}

// ===========================
//  配置 API
// ===========================
export const settingsApi = {
  /** 获取当前配置及默认值 */
  get: async (): Promise<SettingsResponse> => {
    const response = await axios.get(`${API_BASE}/settings`)
    return response.data
  },

  /** 更新配置项 */
  update: async (settings: Record<string, string | number | boolean>): Promise<void> => {
    await axios.put(`${API_BASE}/settings`, { settings })
  },

  /** 重置配置项为默认值 */
  reset: async (keys?: string[]): Promise<void> => {
    await axios.post(`${API_BASE}/settings/reset`, { keys: keys || null })
  },
}
