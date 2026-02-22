import { create } from 'zustand'
import { conversationApi, Conversation, Message } from '../services/api'

interface ConversationState {
  conversations: Conversation[]
  currentConversationId: string | null
  messages: Message[]
  loading: boolean
  error: string | null

  fetchConversations: () => Promise<void>
  selectConversation: (id: string) => Promise<void>
  createConversation: (title?: string) => Promise<Conversation>
  deleteConversation: (id: string) => Promise<void>
  addMessage: (message: Message) => void
  clearMessages: () => void
  setCurrentConversationId: (id: string | null) => void
}

export const useConversationStore = create<ConversationState>((set, get) => ({
  conversations: [],
  currentConversationId: null,
  messages: [],
  loading: false,
  error: null,

  fetchConversations: async () => {
    set({ loading: true, error: null })
    try {
      const data = await conversationApi.list()
      set({ conversations: data.conversations, loading: false })
    } catch (error) {
      set({ error: (error as Error).message, loading: false })
    }
  },

  selectConversation: async (id: string) => {
    set({ loading: true, error: null, currentConversationId: id })
    try {
      const data = await conversationApi.get(id)
      set({ messages: data.messages, loading: false })
    } catch (error) {
      set({ error: (error as Error).message, loading: false })
    }
  },

  createConversation: async (title?: string) => {
    set({ loading: true, error: null })
    try {
      const conversation = await conversationApi.create(title)
      set((state) => ({
        conversations: [conversation, ...state.conversations],
        currentConversationId: conversation.id,
        messages: [],
        loading: false,
      }))
      return conversation
    } catch (error) {
      set({ error: (error as Error).message, loading: false })
      throw error
    }
  },

  deleteConversation: async (id: string) => {
    try {
      await conversationApi.delete(id)
      set((state) => {
        const newConversations = state.conversations.filter((c) => c.id !== id)
        const newCurrentId =
          state.currentConversationId === id
            ? newConversations[0]?.id || null
            : state.currentConversationId
        return {
          conversations: newConversations,
          currentConversationId: newCurrentId,
          messages: state.currentConversationId === id ? [] : state.messages,
        }
      })
    } catch (error) {
      set({ error: (error as Error).message })
    }
  },

  addMessage: (message: Message) => {
    set((state) => ({
      messages: [...state.messages, message],
    }))
  },

  clearMessages: () => {
    set({ messages: [] })
  },

  setCurrentConversationId: (id: string | null) => {
    set({ currentConversationId: id, messages: [] })
  },
}))
