/**
 * 知识库状态管理（Zustand Store）
 *
 * 管理知识库相关的全局状态：
 * - knowledgeBases: 知识库列表
 * - currentKnowledgeBaseId: 当前查看的知识库 ID（用于文档管理视图）
 * - selectedKnowledgeBaseIds: 勾选用于对话的知识库 ID 列表（用于 RAG 检索）
 * - currentDocuments: 当前知识库下的文档列表
 * - previewDocument: 正在预览的文档详情（含分片内容）
 *
 * 提供异步操作：知识库 CRUD、文档上传/删除/预览等。
 */

import { create } from 'zustand'
import {
  knowledgeBaseApi,
  documentApi,
  KnowledgeBase,
  Document,
  DocumentDetail,
} from '../services/api'

/** 知识库 Store 的状态和操作接口 */
interface KnowledgeBaseState {
  knowledgeBases: KnowledgeBase[]          // 知识库列表
  currentKnowledgeBaseId: string | null     // 当前查看的知识库 ID
  currentDocuments: Document[]              // 当前知识库下的文档列表
  selectedKnowledgeBaseIds: string[]        // 已勾选的知识库 ID（用于对话时的 RAG 检索范围）
  uploading: boolean                        // 文档上传中状态
  previewDocument: DocumentDetail | null    // 正在预览的文档详情
  previewLoading: boolean                   // 文档预览加载中状态
  loading: boolean                          // 通用加载状态
  error: string | null                      // 错误信息

  fetchKnowledgeBases: () => Promise<void>                              // 拉取知识库列表
  createKnowledgeBase: (name: string, description?: string) => Promise<KnowledgeBase>  // 创建知识库
  updateKnowledgeBase: (id: string, data: { name?: string; description?: string }) => Promise<void>  // 更新知识库
  deleteKnowledgeBase: (id: string) => Promise<void>                    // 删除知识库
  selectKnowledgeBase: (id: string) => Promise<void>                    // 选中知识库并加载文档
  clearCurrentKnowledgeBase: () => void                                 // 清除当前选中
  toggleKnowledgeBaseSelection: (id: string) => void                    // 切换知识库的勾选状态
  uploadDocument: (file: File) => Promise<Document>                     // 上传文档
  deleteDocument: (id: string) => Promise<void>                         // 删除文档
  reindexDocument: (id: string) => Promise<void>                        // 重新分片失败文档
  refreshDocuments: () => Promise<void>                                 // 刷新当前知识库文档列表
  fetchDocumentDetail: (id: string) => Promise<void>                    // 获取文档详情（预览）
  clearPreview: () => void                                              // 关闭预览
}

export const useKnowledgeBaseStore = create<KnowledgeBaseState>((set, get) => ({
  // 初始状态
  knowledgeBases: [],
  currentKnowledgeBaseId: null,
  currentDocuments: [],
  selectedKnowledgeBaseIds: [],
  uploading: false,
  previewDocument: null,
  previewLoading: false,
  loading: false,
  error: null,

  /** 从后端拉取知识库列表 */
  fetchKnowledgeBases: async () => {
    set({ loading: true, error: null })
    try {
      const data = await knowledgeBaseApi.list()
      set({ knowledgeBases: data.knowledge_bases, loading: false })
    } catch (error) {
      set({ error: (error as Error).message, loading: false })
    }
  },

  /** 创建新知识库并添加到列表头部 */
  createKnowledgeBase: async (name: string, description?: string) => {
    set({ loading: true, error: null })
    try {
      const kb = await knowledgeBaseApi.create(name, description)
      set((state) => ({
        knowledgeBases: [kb, ...state.knowledgeBases],
        loading: false,
      }))
      return kb
    } catch (error) {
      set({ error: (error as Error).message, loading: false })
      throw error
    }
  },

  /** 更新知识库名称和描述 */
  updateKnowledgeBase: async (id: string, data: { name?: string; description?: string }) => {
    try {
      const updated = await knowledgeBaseApi.update(id, data)
      set((state) => ({
        knowledgeBases: state.knowledgeBases.map((kb) => kb.id === id ? updated : kb),
      }))
    } catch (error) {
      set({ error: (error as Error).message })
      throw error
    }
  },

  /** 删除知识库：同时清理选中状态和当前查看状态 */
  deleteKnowledgeBase: async (id: string) => {
    try {
      await knowledgeBaseApi.delete(id)
      set((state) => ({
        knowledgeBases: state.knowledgeBases.filter((kb) => kb.id !== id),
        // 从勾选列表中移除
        selectedKnowledgeBaseIds: state.selectedKnowledgeBaseIds.filter((kid) => kid !== id),
        // 如果删除的是当前查看的知识库，清除当前状态
        currentKnowledgeBaseId: state.currentKnowledgeBaseId === id ? null : state.currentKnowledgeBaseId,
        currentDocuments: state.currentKnowledgeBaseId === id ? [] : state.currentDocuments,
      }))
    } catch (error) {
      set({ error: (error as Error).message })
    }
  },

  /** 选中知识库：设为当前查看并加载其文档列表 */
  selectKnowledgeBase: async (id: string) => {
    set({ currentKnowledgeBaseId: id, loading: true, error: null, previewDocument: null })
    try {
      const detail = await knowledgeBaseApi.get(id)
      set({ currentDocuments: detail.documents, loading: false })
    } catch (error) {
      set({ error: (error as Error).message, loading: false })
    }
  },

  /** 清除当前知识库的查看状态 */
  clearCurrentKnowledgeBase: () => {
    set({ currentKnowledgeBaseId: null, currentDocuments: [], previewDocument: null })
  },

  /** 切换知识库的勾选状态（用于对话时选择 RAG 检索范围） */
  toggleKnowledgeBaseSelection: (id: string) => {
    set((state) => {
      const isSelected = state.selectedKnowledgeBaseIds.includes(id)
      return {
        selectedKnowledgeBaseIds: isSelected
          ? state.selectedKnowledgeBaseIds.filter((kid) => kid !== id)  // 取消勾选
          : [...state.selectedKnowledgeBaseIds, id],                    // 添加勾选
      }
    })
  },

  /** 上传文档到当前知识库 */
  uploadDocument: async (file: File) => {
    const { currentKnowledgeBaseId } = get()
    if (!currentKnowledgeBaseId) {
      throw new Error('No knowledge base selected')
    }
    set({ uploading: true, error: null })
    try {
      const document = await documentApi.upload(file, currentKnowledgeBaseId)
      // 上传成功后添加到文档列表头部
      set((state) => ({
        currentDocuments: [document, ...state.currentDocuments],
        uploading: false,
      }))
      return document
    } catch (error) {
      set({ error: (error as Error).message, uploading: false })
      throw error
    }
  },

  /** 删除文档：从列表中移除，如果正在预览该文档则关闭预览 */
  deleteDocument: async (id: string) => {
    try {
      await documentApi.delete(id)
      set((state) => ({
        currentDocuments: state.currentDocuments.filter((d) => d.id !== id),
        previewDocument: state.previewDocument?.id === id ? null : state.previewDocument,
      }))
    } catch (error) {
      set({ error: (error as Error).message })
    }
  },

  /** 重新分片失败的文档 */
  reindexDocument: async (id: string) => {
    try {
      await documentApi.reindex(id)
      // 更新本地状态为 pending
      set((state) => ({
        currentDocuments: state.currentDocuments.map((d) =>
          d.id === id ? { ...d, status: 'pending' as const } : d
        ),
      }))
    } catch (error) {
      set({ error: (error as Error).message })
    }
  },

  /** 刷新当前知识库的文档列表（用于轮询更新处理状态） */
  refreshDocuments: async () => {
    const { currentKnowledgeBaseId } = get()
    if (!currentKnowledgeBaseId) return
    try {
      const detail = await knowledgeBaseApi.get(currentKnowledgeBaseId)
      set({ currentDocuments: detail.documents })
    } catch {
      // 静默失败，不影响用户操作
    }
  },

  /** 获取文档详情（含分片内容），用于预览抽屉展示 */
  fetchDocumentDetail: async (id: string) => {
    set({ previewLoading: true })
    try {
      const detail = await documentApi.get(id)
      set({ previewDocument: detail, previewLoading: false })
    } catch (error) {
      set({ error: (error as Error).message, previewLoading: false })
    }
  },

  /** 关闭文档预览 */
  clearPreview: () => {
    set({ previewDocument: null })
  },
}))
