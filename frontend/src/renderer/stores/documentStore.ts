import { create } from 'zustand'
import { documentApi, Document, DocumentDetail } from '../services/api'

interface DocumentState {
  documents: Document[]
  selectedDocumentIds: string[]
  loading: boolean
  uploading: boolean
  error: string | null
  previewDocument: DocumentDetail | null
  previewLoading: boolean

  fetchDocuments: () => Promise<void>
  uploadDocument: (file: File) => Promise<Document>
  deleteDocument: (id: string) => Promise<void>
  toggleDocumentSelection: (id: string) => void
  clearSelection: () => void
  selectAll: () => void
  fetchDocumentDetail: (id: string) => Promise<void>
  clearPreview: () => void
}

export const useDocumentStore = create<DocumentState>((set) => ({
  documents: [],
  selectedDocumentIds: [],
  loading: false,
  uploading: false,
  error: null,
  previewDocument: null,
  previewLoading: false,

  fetchDocuments: async () => {
    set({ loading: true, error: null })
    try {
      const data = await documentApi.list()
      set({ documents: data.documents, loading: false })
    } catch (error) {
      set({ error: (error as Error).message, loading: false })
    }
  },

  uploadDocument: async (file: File) => {
    set({ uploading: true, error: null })
    try {
      const document = await documentApi.upload(file)
      set((state) => ({
        documents: [document, ...state.documents],
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
        documents: state.documents.filter((d) => d.id !== id),
        selectedDocumentIds: state.selectedDocumentIds.filter((did) => did !== id),
        previewDocument: state.previewDocument?.id === id ? null : state.previewDocument,
      }))
    } catch (error) {
      set({ error: (error as Error).message })
    }
  },

  toggleDocumentSelection: (id: string) => {
    set((state) => {
      const isSelected = state.selectedDocumentIds.includes(id)
      return {
        selectedDocumentIds: isSelected
          ? state.selectedDocumentIds.filter((did) => did !== id)
          : [...state.selectedDocumentIds, id],
      }
    })
  },

  clearSelection: () => {
    set({ selectedDocumentIds: [] })
  },

  selectAll: () => {
    set((state) => ({
      selectedDocumentIds: state.documents.map((d) => d.id),
    }))
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
