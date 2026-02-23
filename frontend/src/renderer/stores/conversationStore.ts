/**
 * 对话状态管理（Zustand Store）
 *
 * 管理对话相关的全局状态：
 * - conversations: 对话列表
 * - currentConversationId: 当前选中的对话 ID
 * - messages: 当前对话的消息列表
 *
 * 提供异步操作：获取列表、选中对话、创建/删除对话等。
 */

import { create } from 'zustand'
import { conversationApi, Conversation, Message } from '../services/api'

/** 对话 Store 的状态和操作接口 */
interface ConversationState {
  conversations: Conversation[]        // 对话列表
  currentConversationId: string | null  // 当前选中的对话 ID
  messages: Message[]                  // 当前对话的消息列表
  loading: boolean                     // 加载中状态
  error: string | null                 // 错误信息

  fetchConversations: () => Promise<void>             // 拉取对话列表
  selectConversation: (id: string) => Promise<void>   // 选中对话并加载消息
  createConversation: (title?: string) => Promise<Conversation>  // 创建新对话
  deleteConversation: (id: string) => Promise<void>   // 删除对话
  addMessage: (message: Message) => void              // 添加消息到当前列表
  clearMessages: () => void                           // 清空消息列表
  setCurrentConversationId: (id: string | null) => void  // 设置当前对话 ID
}

export const useConversationStore = create<ConversationState>((set) => ({
  // 初始状态
  conversations: [],
  currentConversationId: null,
  messages: [],
  loading: false,
  error: null,

  /** 从后端拉取对话列表 */
  fetchConversations: async () => {
    set({ loading: true, error: null })
    try {
      const data = await conversationApi.list()
      set({ conversations: data.conversations, loading: false })
    } catch (error) {
      set({ error: (error as Error).message, loading: false })
    }
  },

  /** 选中对话：设置当前对话 ID 并加载该对话的消息记录 */
  selectConversation: async (id: string) => {
    set({ loading: true, error: null, currentConversationId: id })
    try {
      const data = await conversationApi.get(id)
      set({ messages: data.messages, loading: false })
    } catch (error) {
      set({ error: (error as Error).message, loading: false })
    }
  },

  /** 创建新对话：添加到列表头部并设为当前对话 */
  createConversation: async (title?: string) => {
    set({ loading: true, error: null })
    try {
      const conversation = await conversationApi.create(title)
      set((state) => ({
        conversations: [conversation, ...state.conversations],  // 新对话放在列表最前面
        currentConversationId: conversation.id,
        messages: [],  // 新对话没有消息
        loading: false,
      }))
      return conversation
    } catch (error) {
      set({ error: (error as Error).message, loading: false })
      throw error
    }
  },

  /** 删除对话：从列表中移除，如果删除的是当前对话则自动切换到下一个 */
  deleteConversation: async (id: string) => {
    try {
      await conversationApi.delete(id)
      set((state) => {
        const newConversations = state.conversations.filter((c) => c.id !== id)
        // 如果删除的是当前选中的对话，自动切到列表中的第一个
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

  /** 添加一条消息到当前消息列表末尾 */
  addMessage: (message: Message) => {
    set((state) => ({
      messages: [...state.messages, message],
    }))
  },

  /** 清空当前消息列表 */
  clearMessages: () => {
    set({ messages: [] })
  },

  /** 手动设置当前对话 ID 并清空消息 */
  setCurrentConversationId: (id: string | null) => {
    set({ currentConversationId: id, messages: [] })
  },
}))
