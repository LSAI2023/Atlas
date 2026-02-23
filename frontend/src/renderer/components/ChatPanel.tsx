/**
 * 聊天面板组件
 *
 * 核心对话界面，包含：
 * - 顶部：模型选择下拉菜单
 * - 中部：消息气泡列表（使用 @ant-design/x Bubble 组件）
 *   - 用户消息：蓝色气泡，右对齐
 *   - 助手消息：Markdown 渲染 + 可折叠的思考过程 + 复制按钮
 *   - 流式生成中：实时更新气泡内容
 * - 底部：消息输入区（使用 @ant-design/x Sender 组件）
 *   - 知识库选择按钮：点击可勾选用于 RAG 的知识库
 *   - 已选知识库标签展示
 *
 * 消息发送流程：
 * 1. 用户输入消息并发送
 * 2. 如果没有当前对话，自动创建新对话
 * 3. 通过 SSE 流式接收模型回答，实时渲染到界面
 * 4. 生成完成后将完整消息添加到消息列表
 */

import { useState, useRef, useEffect, useMemo } from 'react'
import { message, Dropdown, Avatar, Tag } from 'antd'
import {
  RobotOutlined,
  UserOutlined,
  DownOutlined,
  CheckOutlined,
  BookOutlined,
} from '@ant-design/icons'
import { Bubble, Think, Actions, Sender } from '@ant-design/x'
import type { BubbleItemType } from '@ant-design/x'
import XMarkdown from '@ant-design/x-markdown'
import { useConversationStore } from '../stores/conversationStore'
import { useKnowledgeBaseStore } from '../stores/knowledgeBaseStore'
import { chatApi, modelsApi, Message, OllamaModel } from '../services/api'

interface ChatPanelProps {
  conversationId: string | null  // 当前对话 ID，为 null 表示未选择对话
}

function ChatPanel({ conversationId }: ChatPanelProps) {
  const [inputValue, setInputValue] = useState('')               // 输入框内容
  const [isGenerating, setIsGenerating] = useState(false)        // 是否正在生成回答
  const [streamingContent, setStreamingContent] = useState('')   // 流式生成中的回答内容
  const [streamingReasoning, setStreamingReasoning] = useState('') // 流式生成中的思考过程
  const [models, setModels] = useState<OllamaModel[]>([])        // 可用模型列表
  const [selectedModel, setSelectedModel] = useState<string>('')  // 当前选中的模型
  const [kbDropdownOpen, setKbDropdownOpen] = useState(false)     // 知识库下拉菜单是否展开
  const abortRef = useRef<(() => void) | null>(null)             // SSE 请求的中止函数引用

  const { messages, addMessage, createConversation } = useConversationStore()
  const {
    knowledgeBases,
    selectedKnowledgeBaseIds,
    fetchKnowledgeBases,
    toggleKnowledgeBaseSelection,
  } = useKnowledgeBaseStore()

  // 初始化：加载模型列表
  useEffect(() => {
    modelsApi.list().then((data) => {
      setModels(data.models)
      setSelectedModel(data.default)
    }).catch(() => {})
  }, [])

  // 初始化：加载知识库列表
  useEffect(() => {
    fetchKnowledgeBases()
  }, [])

  /**
   * 发送消息处理函数
   *
   * 流程：创建对话（如需）→ 添加用户消息 → SSE 流式接收回答 → 保存助手消息
   */
  const handleSend = async (content: string) => {
    const trimmed = content.trim()
    if (!trimmed || isGenerating) return

    setInputValue('')
    setIsGenerating(true)
    setStreamingContent('')
    setStreamingReasoning('')

    let currentConversationId = conversationId

    // 没有当前对话时，自动创建新对话（标题取消息前 30 个字符）
    if (!currentConversationId) {
      try {
        const conv = await createConversation(trimmed.slice(0, 30))
        currentConversationId = conv.id
      } catch {
        message.error('创建对话失败')
        setIsGenerating(false)
        return
      }
    }

    // 先将用户消息添加到界面（使用临时 ID）
    const userMessage: Message = {
      id: `temp-${Date.now()}`,
      conversation_id: currentConversationId,
      role: 'user',
      content: trimmed,
      created_at: new Date().toISOString(),
    }
    addMessage(userMessage)

    // 通过 SSE 发送消息并流式接收回答
    let fullContent = ''
    let fullReasoning = ''
    abortRef.current = chatApi.sendMessage(
      {
        message: trimmed,
        conversation_id: currentConversationId,
        knowledge_base_ids: selectedKnowledgeBaseIds.length > 0 ? selectedKnowledgeBaseIds : undefined,
        model: selectedModel || undefined,
      },
      // onChunk: 每收到一个片段，累积并更新流式显示
      (chunkContent, chunkReasoning) => {
        if (chunkContent) {
          fullContent += chunkContent
          setStreamingContent(fullContent)
        }
        if (chunkReasoning) {
          fullReasoning += chunkReasoning
          setStreamingReasoning(fullReasoning)
        }
      },
      // onDone: 生成完成，将完整回答添加为正式消息
      () => {
        const assistantMessage: Message = {
          id: `temp-${Date.now()}-assistant`,
          conversation_id: currentConversationId!,
          role: 'assistant',
          content: fullContent,
          reasoning: fullReasoning || undefined,
          created_at: new Date().toISOString(),
        }
        addMessage(assistantMessage)
        setStreamingContent('')
        setStreamingReasoning('')
        setIsGenerating(false)
        abortRef.current = null
      },
      // onError: 生成出错
      (error) => {
        message.error(`生成失败: ${error}`)
        setStreamingContent('')
        setStreamingReasoning('')
        setIsGenerating(false)
        abortRef.current = null
      }
    )
  }

  /** 停止生成：中止 SSE 请求并保存已生成的部分内容 */
  const handleStop = () => {
    if (abortRef.current) {
      abortRef.current()
      abortRef.current = null
      setIsGenerating(false)
      // 如果已经有部分内容，保存为消息
      if (streamingContent || streamingReasoning) {
        const assistantMessage: Message = {
          id: `temp-${Date.now()}-assistant`,
          conversation_id: conversationId!,
          role: 'assistant',
          content: streamingContent,
          reasoning: streamingReasoning || undefined,
          created_at: new Date().toISOString(),
        }
        addMessage(assistantMessage)
        setStreamingContent('')
        setStreamingReasoning('')
      }
    }
  }

  /**
   * 合并已有消息和流式生成中的消息
   * 流式内容以临时 'streaming' ID 显示在消息列表末尾
   */
  const allMessages = useMemo(() => {
    const msgs = [...messages]
    if (streamingContent || streamingReasoning) {
      msgs.push({
        id: 'streaming',
        conversation_id: conversationId || '',
        role: 'assistant',
        content: streamingContent,
        reasoning: streamingReasoning,
        created_at: new Date().toISOString(),
      })
    }
    return msgs
  }, [messages, streamingContent, streamingReasoning, conversationId])

  /** 将消息数据转换为 Bubble 组件所需的 items 格式 */
  const bubbleItems: BubbleItemType[] = useMemo(() => {
    const items: BubbleItemType[] = allMessages.map((msg) => ({
      key: msg.id,
      role: msg.role === 'user' ? 'user' : 'ai',
      content: msg.content,
      extraInfo: {
        reasoning: msg.reasoning,
        isStreaming: msg.id === 'streaming',
      },
    }))
    // 正在生成但尚无内容时，显示加载中的占位气泡
    if (isGenerating && !streamingContent && !streamingReasoning) {
      items.push({
        key: 'loading',
        role: 'ai',
        content: '',
        loading: true,
      } as BubbleItemType)
    }
    return items
  }, [allMessages, isGenerating, streamingContent, streamingReasoning])

  // 模型选择下拉菜单项（当前选中的模型显示勾号）
  const modelMenuItems = models.map((m) => ({
    key: m.name,
    label: (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', minWidth: 180 }}>
        <span>{m.name}</span>
        {m.name === selectedModel && <CheckOutlined style={{ color: '#1890ff', marginLeft: 8 }} />}
      </div>
    ),
  }))

  const displayModelName = selectedModel || 'Atlas'

  // 知识库选择下拉菜单项（已勾选的知识库显示绿色勾号）
  const kbMenuItems = knowledgeBases.map((kb) => ({
    key: kb.id,
    label: (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', minWidth: 160 }}>
        <span>{kb.name}</span>
        {selectedKnowledgeBaseIds.includes(kb.id) && (
          <CheckOutlined style={{ color: '#52c41a', marginLeft: 8 }} />
        )}
      </div>
    ),
  }))

  const hasSelectedKB = selectedKnowledgeBaseIds.length > 0

  return (
    <div className="main-content">
      {/* 顶部：模型选择器 */}
      <div className="main-header">
        <Dropdown
          menu={{
            items: modelMenuItems,
            onClick: ({ key }) => setSelectedModel(key),
          }}
          trigger={['click']}
          placement="bottomLeft"
        >
          <div className="model-selector">
            <span>{displayModelName}</span>
            <DownOutlined style={{ fontSize: 10 }} />
          </div>
        </Dropdown>
      </div>

      {/* 中部：消息列表区域 */}
      <div className="chat-area">
        {allMessages.length === 0 ? (
          /* 空状态：没有消息时显示引导文案 */
          <div className="empty-state">
            <RobotOutlined className="empty-state-icon" />
            <div style={{ fontSize: 16, marginBottom: 8 }}>有问题，尽管问</div>
            <div style={{ fontSize: 13 }}>
              {hasSelectedKB
                ? `已选择 ${selectedKnowledgeBaseIds.length} 个知识库`
                : '选择知识库后可基于文档内容问答'}
            </div>
          </div>
        ) : (
          /* 消息气泡列表 */
          <div className="chat-messages">
            <Bubble.List
              autoScroll
              items={bubbleItems}
              role={{
                /* 用户消息样式：蓝色气泡，右对齐 */
                user: {
                  placement: 'end',
                  avatar: <Avatar icon={<UserOutlined />} style={{ backgroundColor: '#1890ff' }} />,
                  variant: 'filled',
                  shape: 'round',
                  styles: {
                    content: { background: '#1890ff', color: '#fff' },
                  },
                },
                /* 助手消息样式：左对齐，支持 Markdown 渲染和思考过程折叠 */
                ai: {
                  placement: 'start',
                  avatar: <Avatar icon={<RobotOutlined />} style={{ backgroundColor: '#52c41a' }} />,
                  contentRender: (content, info) => {
                    const reasoning = info.extraInfo?.reasoning
                    const isStreaming = info.extraInfo?.isStreaming
                    return (
                      <>
                        {/* 思考过程折叠面板 */}
                        {reasoning && (
                          <Think
                            title="思考过程"
                            loading={isStreaming && !content}
                            defaultExpanded={isStreaming}
                            style={{ marginBottom: content ? 8 : 0 }}
                          >
                            {reasoning}
                          </Think>
                        )}
                        {/* 回答内容（Markdown 渲染，支持流式动画） */}
                        {content && (
                          <XMarkdown
                            content={content as string}
                            streaming={isStreaming ? {
                              hasNextChunk: true,
                              enableAnimation: true,
                            } : undefined}
                          />
                        )}
                      </>
                    )
                  },
                  /* 消息底部操作栏：复制按钮 */
                  footer: (content) => {
                    if (!content) return null
                    return (
                      <Actions
                        items={[
                          {
                            key: 'copy',
                            label: '复制',
                            actionRender: () => (
                              <Actions.Copy text={content as string} />
                            ),
                          },
                        ]}
                      />
                    )
                  },
                },
              }}
            />
          </div>
        )}
      </div>

      {/* 底部：消息输入区 */}
      <div className="input-area">
        <div className="sender-wrapper">
          {/* 已选知识库标签展示 */}
          {hasSelectedKB && (
            <div className="sender-selected-kbs">
              {knowledgeBases
                .filter((kb) => selectedKnowledgeBaseIds.includes(kb.id))
                .map((kb) => (
                  <Tag
                    key={kb.id}
                    closable
                    onClose={() => toggleKnowledgeBaseSelection(kb.id)}
                    style={{ margin: 0 }}
                  >
                    <BookOutlined style={{ marginRight: 4 }} />
                    {kb.name}
                  </Tag>
                ))}
            </div>
          )}
          {/* 消息输入组件 */}
          <Sender
            value={inputValue}
            onChange={setInputValue}
            onSubmit={handleSend}
            onCancel={handleStop}
            loading={isGenerating}
            placeholder="有问题，尽管问"
            prefix={
              /* 知识库选择按钮（输入框左侧） */
              <Dropdown
                menu={{
                  items: kbMenuItems,
                  onClick: ({ key, domEvent }) => {
                    domEvent.stopPropagation()  // 阻止冒泡，防止关闭下拉菜单
                    toggleKnowledgeBaseSelection(key)
                  },
                  selectable: false,
                }}
                trigger={['click']}
                placement="topLeft"
                open={kbDropdownOpen}
                onOpenChange={setKbDropdownOpen}
              >
                <span className={`sender-kb-btn ${hasSelectedKB ? 'active' : ''}`}>
                  <BookOutlined />
                </span>
              </Dropdown>
            }
          />
        </div>
      </div>
    </div>
  )
}

export default ChatPanel
