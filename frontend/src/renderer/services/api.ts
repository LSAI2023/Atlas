import axios from 'axios'

const API_BASE = '/api'

export interface KnowledgeBase {
  id: string
  name: string
  description: string
  created_at: string
  updated_at: string
}

export interface KnowledgeBaseDetail extends KnowledgeBase {
  documents: Document[]
}

export interface Document {
  id: string
  filename: string
  file_type: string
  file_size: number
  chunk_count: number
  knowledge_base_id: string
  created_at: string
}

export interface DocumentChunk {
  content: string
  metadata: {
    document_id: string
    filename: string
    chunk_index: number
    total_chunks: number
  }
}

export interface DocumentDetail extends Document {
  chunks: DocumentChunk[]
}

export interface Conversation {
  id: string
  title: string
  created_at: string
  updated_at: string
}

export interface Message {
  id: string
  conversation_id: string
  role: 'user' | 'assistant'
  content: string
  reasoning?: string
  created_at: string
}

export interface ChatRequest {
  message: string
  conversation_id?: string
  knowledge_base_ids?: string[]
  model?: string
}

export interface OllamaModel {
  name: string
  size: number
  modified_at: string | null
}

// Knowledge Base API
export const knowledgeBaseApi = {
  create: async (name: string, description: string = ''): Promise<KnowledgeBase> => {
    const response = await axios.post(`${API_BASE}/knowledge-bases`, { name, description })
    return response.data
  },

  list: async (): Promise<{ knowledge_bases: KnowledgeBase[] }> => {
    const response = await axios.get(`${API_BASE}/knowledge-bases`)
    return response.data
  },

  get: async (id: string): Promise<KnowledgeBaseDetail> => {
    const response = await axios.get(`${API_BASE}/knowledge-bases/${id}`)
    return response.data
  },

  update: async (id: string, data: { name?: string; description?: string }): Promise<KnowledgeBase> => {
    const response = await axios.put(`${API_BASE}/knowledge-bases/${id}`, data)
    return response.data
  },

  delete: async (id: string): Promise<void> => {
    await axios.delete(`${API_BASE}/knowledge-bases/${id}`)
  },
}

// Document API
export const documentApi = {
  upload: async (file: File, knowledgeBaseId: string): Promise<Document> => {
    const formData = new FormData()
    formData.append('file', file)
    formData.append('knowledge_base_id', knowledgeBaseId)
    const response = await axios.post(`${API_BASE}/documents/upload`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    return response.data
  },

  list: async (knowledgeBaseId?: string): Promise<{ documents: Document[] }> => {
    const params = knowledgeBaseId ? { knowledge_base_id: knowledgeBaseId } : {}
    const response = await axios.get(`${API_BASE}/documents`, { params })
    return response.data
  },

  get: async (id: string): Promise<DocumentDetail> => {
    const response = await axios.get(`${API_BASE}/documents/${id}`)
    return response.data
  },

  delete: async (id: string): Promise<void> => {
    await axios.delete(`${API_BASE}/documents/${id}`)
  },
}

// Conversation API
export const conversationApi = {
  create: async (title?: string): Promise<Conversation> => {
    const response = await axios.post(`${API_BASE}/chat/conversations`, { title })
    return response.data
  },

  list: async (): Promise<{ conversations: Conversation[] }> => {
    const response = await axios.get(`${API_BASE}/chat/conversations`)
    return response.data
  },

  get: async (id: string): Promise<Conversation & { messages: Message[] }> => {
    const response = await axios.get(`${API_BASE}/chat/conversations/${id}`)
    return response.data
  },

  delete: async (id: string): Promise<void> => {
    await axios.delete(`${API_BASE}/chat/conversations/${id}`)
  },

  update: async (id: string, title: string): Promise<Conversation> => {
    const response = await axios.put(`${API_BASE}/chat/conversations/${id}`, { title })
    return response.data
  },
}

// Chat API with SSE
export const chatApi = {
  sendMessage: (
    request: ChatRequest,
    onChunk: (content: string, reasoning: string) => void,
    onDone: () => void,
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
        let buffer = ''

        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n')
          buffer = lines.pop() || ''

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.slice(6))
                if (data.error) {
                  onError(data.error)
                } else if (data.done) {
                  onDone()
                } else {
                  onChunk(data.content || '', data.reasoning || '')
                }
              } catch (e) {
                // Ignore parse errors
              }
            }
          }
        }
      })
      .catch((error) => {
        if (error.name !== 'AbortError') {
          onError(error.message)
        }
      })

    return () => controller.abort()
  },
}

// Models API
export const modelsApi = {
  list: async (): Promise<{ models: OllamaModel[]; default: string }> => {
    const response = await axios.get(`${API_BASE}/chat/models`)
    return response.data
  },
}
