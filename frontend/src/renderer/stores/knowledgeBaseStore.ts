import { create } from 'zustand'
import {
  knowledgeBaseApi,
  documentApi,
  KnowledgeBase,
  Document,
  DocumentDetail,
} from '../services/api'

interface KnowledgeBaseState {
  knowledgeBases: KnowledgeBase[]
  currentKnowledgeBaseId: string | null
  currentDocuments: Document[]
  selectedKnowledgeBaseIds: string[]
  uploading: boolean
  previewDocument: DocumentDetail | null
  previewLoading: boolean
  loading: boolean
  error: string | null

  fetchKnowledgeBases: () => Promise<void>
  createKnowledgeBase: (name: string, description?: string) => Promise<KnowledgeBase>
  deleteKnowledgeBase: (id: string) => Promise<void>
  selectKnowledgeBase: (id: string) => Promise<void>
  clearCurrentKnowledgeBase: () => void
  toggleKnowledgeBaseSelection: (id: string) => void
  uploadDocument: (file: File) => Promise<Document>
  deleteDocument: (id: string) => Promise<void>
  fetchDocumentDetail: (id: string) => Promise<void>
  clearPreview: () => void
}

export const useKnowledgeBaseStore = create<KnowledgeBaseState>((set, get) => ({
  knowledgeBases: [],
  currentKnowledgeBaseId: null,
  currentDocuments: [],
  selectedKnowledgeBaseIds: [],
  uploading: false,
  previewDocument: null,
  previewLoading: false,
  loading: false,
  error: null,

  fetchKnowledgeBases: async () => {
    set({ loading: true, error: null })
    try {
      const data = await knowledgeBaseApi.list()
      set({ knowledgeBases: data.knowledge_bases, loading: false })
    } catch (error) {
      set({ error: (error as Error).message, loading: false })
    }
  },

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

  deleteKnowledgeBase: async (id: string) => {
    try {
      await knowledgeBaseApi.delete(id)
      set((state) => ({
        knowledgeBases: state.knowledgeBases.filter((kb) => kb.id !== id),
        selectedKnowledgeBaseIds: state.selectedKnowledgeBaseIds.filter((kid) => kid !== id),
        currentKnowledgeBaseId: state.currentKnowledgeBaseId === id ? null : state.currentKnowledgeBaseId,
        currentDocuments: state.currentKnowledgeBaseId === id ? [] : state.currentDocuments,
      }))
    } catch (error) {
      set({ error: (error as Error).message })
    }
  },

  selectKnowledgeBase: async (id: string) => {
    set({ currentKnowledgeBaseId: id, loading: true, error: null, previewDocument: null })
    try {
      const detail = await knowledgeBaseApi.get(id)
      set({ currentDocuments: detail.documents, loading: false })
    } catch (error) {
      set({ error: (error as Error).message, loading: false })
    }
  },

  clearCurrentKnowledgeBase: () => {
    set({ currentKnowledgeBaseId: null, currentDocuments: [], previewDocument: null })
  },

  toggleKnowledgeBaseSelection: (id: string) => {
    set((state) => {
      const isSelected = state.selectedKnowledgeBaseIds.includes(id)
      return {
        selectedKnowledgeBaseIds: isSelected
          ? state.selectedKnowledgeBaseIds.filter((kid) => kid !== id)
          : [...state.selectedKnowledgeBaseIds, id],
      }
    })
  },

  uploadDocument: async (file: File) => {
    const { currentKnowledgeBaseId } = get()
    if (!currentKnowledgeBaseId) {
      throw new Error('No knowledge base selected')
    }
    set({ uploading: true, error: null })
    try {
      const document = await documentApi.upload(file, currentKnowledgeBaseId)
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

  fetchDocumentDetail: async (id: string) => {
    set({ previewLoading: true })
    try {
      const detail = await documentApi.get(id)
      set({ previewDocument: detail, previewLoading: false })
    } catch (error) {
      set({ error: (error as Error).message, previewLoading: false })
    }
  },

  clearPreview: () => {
    set({ previewDocument: null })
  },
}))
