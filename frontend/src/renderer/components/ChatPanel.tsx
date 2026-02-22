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
  conversationId: string | null
}

function ChatPanel({ conversationId }: ChatPanelProps) {
  const [inputValue, setInputValue] = useState('')
  const [isGenerating, setIsGenerating] = useState(false)
  const [streamingContent, setStreamingContent] = useState('')
  const [streamingReasoning, setStreamingReasoning] = useState('')
  const [models, setModels] = useState<OllamaModel[]>([])
  const [selectedModel, setSelectedModel] = useState<string>('')
  const [kbDropdownOpen, setKbDropdownOpen] = useState(false)
  const abortRef = useRef<(() => void) | null>(null)

  const { messages, addMessage, createConversation } = useConversationStore()
  const {
    knowledgeBases,
    selectedKnowledgeBaseIds,
    fetchKnowledgeBases,
    toggleKnowledgeBaseSelection,
  } = useKnowledgeBaseStore()

  useEffect(() => {
    modelsApi.list().then((data) => {
      setModels(data.models)
      setSelectedModel(data.default)
    }).catch(() => {})
  }, [])

  useEffect(() => {
    fetchKnowledgeBases()
  }, [])

  const handleSend = async (content: string) => {
    const trimmed = content.trim()
    if (!trimmed || isGenerating) return

    setInputValue('')
    setIsGenerating(true)
    setStreamingContent('')
    setStreamingReasoning('')

    let currentConversationId = conversationId

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

    const userMessage: Message = {
      id: `temp-${Date.now()}`,
      conversation_id: currentConversationId,
      role: 'user',
      content: trimmed,
      created_at: new Date().toISOString(),
    }
    addMessage(userMessage)

    let fullContent = ''
    let fullReasoning = ''
    abortRef.current = chatApi.sendMessage(
      {
        message: trimmed,
        conversation_id: currentConversationId,
        knowledge_base_ids: selectedKnowledgeBaseIds.length > 0 ? selectedKnowledgeBaseIds : undefined,
        model: selectedModel || undefined,
      },
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
      (error) => {
        message.error(`生成失败: ${error}`)
        setStreamingContent('')
        setStreamingReasoning('')
        setIsGenerating(false)
        abortRef.current = null
      }
    )
  }

  const handleStop = () => {
    if (abortRef.current) {
      abortRef.current()
      abortRef.current = null
      setIsGenerating(false)
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
    // Show loading bubble when generating but no content yet
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
      {/* Header */}
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

      {/* Chat Area */}
      <div className="chat-area">
        {allMessages.length === 0 ? (
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
          <div className="chat-messages">
            <Bubble.List
              autoScroll
              items={bubbleItems}
              role={{
                user: {
                  placement: 'end',
                  avatar: <Avatar icon={<UserOutlined />} style={{ backgroundColor: '#1890ff' }} />,
                  variant: 'filled',
                  shape: 'round',
                  styles: {
                    content: { background: '#1890ff', color: '#fff' },
                  },
                },
                ai: {
                  placement: 'start',
                  avatar: <Avatar icon={<RobotOutlined />} style={{ backgroundColor: '#52c41a' }} />,
                  contentRender: (content, info) => {
                    const reasoning = info.extraInfo?.reasoning
                    const isStreaming = info.extraInfo?.isStreaming
                    return (
                      <>
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

      {/* Input Area - Sender */}
      <div className="input-area">
        <div className="sender-wrapper">
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
          <Sender
            value={inputValue}
            onChange={setInputValue}
            onSubmit={handleSend}
            onCancel={handleStop}
            loading={isGenerating}
            placeholder="有问题，尽管问"
            prefix={
              <Dropdown
                menu={{
                  items: kbMenuItems,
                  onClick: ({ key, domEvent }) => {
                    domEvent.stopPropagation()
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
