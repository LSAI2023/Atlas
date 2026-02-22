import { useState, useRef, useEffect, useMemo } from 'react'
import { message, Dropdown, Avatar } from 'antd'
import {
  PlusOutlined,
  GlobalOutlined,
  ScissorOutlined,
  FontSizeOutlined,
  AudioOutlined,
  ArrowUpOutlined,
  RobotOutlined,
  UserOutlined,
  DownOutlined,
  StopOutlined,
  CheckOutlined,
  RedoOutlined,
} from '@ant-design/icons'
import { Bubble, Think, Actions } from '@ant-design/x'
import type { BubbleItemType } from '@ant-design/x'
import XMarkdown from '@ant-design/x-markdown'
import { useConversationStore } from '../stores/conversationStore'
import { useDocumentStore } from '../stores/documentStore'
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
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const abortRef = useRef<(() => void) | null>(null)

  const { messages, addMessage, createConversation } = useConversationStore()
  const { selectedDocumentIds } = useDocumentStore()

  useEffect(() => {
    modelsApi.list().then((data) => {
      setModels(data.models)
      setSelectedModel(data.default)
    }).catch(() => {
      // Ollama not available, keep empty
    })
  }, [])

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`
    }
  }, [inputValue])

  const handleSend = async () => {
    const content = inputValue.trim()
    if (!content || isGenerating) return

    setInputValue('')
    setIsGenerating(true)
    setStreamingContent('')
    setStreamingReasoning('')

    let currentConversationId = conversationId

    if (!currentConversationId) {
      try {
        const conv = await createConversation(content.slice(0, 30))
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
      content,
      created_at: new Date().toISOString(),
    }
    addMessage(userMessage)

    let fullContent = ''
    let fullReasoning = ''
    abortRef.current = chatApi.sendMessage(
      {
        message: content,
        conversation_id: currentConversationId,
        document_ids: selectedDocumentIds.length > 0 ? selectedDocumentIds : undefined,
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

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
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
    return allMessages.map((msg) => ({
      key: msg.id,
      role: msg.role === 'user' ? 'user' : 'ai',
      content: msg.content,
      extraInfo: {
        reasoning: msg.reasoning,
        isStreaming: msg.id === 'streaming',
      },
    }))
  }, [allMessages])

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
              {selectedDocumentIds.length > 0
                ? `已选择 ${selectedDocumentIds.length} 个文档作为知识库`
                : '上传文档后可基于文档内容问答'}
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
                          {
                            key: 'retry',
                            icon: <RedoOutlined />,
                            label: '重试',
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

      {/* Input Area */}
      <div className="input-area">
        <div className="input-container">
          <div className="input-actions-top">
            <button className="input-action-btn" title="添加附件">
              <PlusOutlined />
            </button>
            <button className="input-action-btn" title="搜索网络">
              <GlobalOutlined />
            </button>
            <button className="input-action-btn" title="Canvas">
              <ScissorOutlined />
            </button>
            <button className="input-action-btn" title="格式">
              <FontSizeOutlined />
            </button>
          </div>
          <div className="input-main">
            <textarea
              ref={textareaRef}
              className="input-textarea"
              placeholder="有问题，尽管问"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              rows={1}
              disabled={isGenerating}
            />
            <button className="input-action-btn" title="语音输入">
              <AudioOutlined />
            </button>
            {isGenerating ? (
              <button className="send-btn" onClick={handleStop} title="停止">
                <StopOutlined />
              </button>
            ) : (
              <button
                className="send-btn"
                onClick={handleSend}
                disabled={!inputValue.trim()}
                title="发送"
              >
                <ArrowUpOutlined />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default ChatPanel
