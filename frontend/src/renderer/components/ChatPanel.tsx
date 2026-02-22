import { useState, useRef, useEffect } from 'react'
import { message, Dropdown, Collapse } from 'antd'
import {
  PlusOutlined,
  GlobalOutlined,
  ScissorOutlined,
  FontSizeOutlined,
  AudioOutlined,
  ArrowUpOutlined,
  RobotOutlined,
  DownOutlined,
  StopOutlined,
  CheckOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons'
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
  const messagesEndRef = useRef<HTMLDivElement>(null)
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
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streamingContent, streamingReasoning])

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

  const renderReasoning = (reasoning: string, isStreaming: boolean) => {
    if (!reasoning) return null
    return (
      <Collapse
        size="small"
        className="reasoning-collapse"
        defaultActiveKey={isStreaming ? ['1'] : []}
        items={[{
          key: '1',
          label: (
            <span className="reasoning-label">
              <ThunderboltOutlined />
              <span>思考过程</span>
              {isStreaming && <span className="reasoning-streaming">思考中...</span>}
            </span>
          ),
          children: (
            <div className="reasoning-content">{reasoning}</div>
          ),
        }]}
      />
    )
  }

  const allMessages = [...messages]
  if (streamingContent || streamingReasoning) {
    allMessages.push({
      id: 'streaming',
      conversation_id: conversationId || '',
      role: 'assistant',
      content: streamingContent,
      reasoning: streamingReasoning,
      created_at: new Date().toISOString(),
    })
  }

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
            {allMessages.map((msg) => (
              <div
                key={msg.id}
                className={`message ${msg.role === 'user' ? 'message-user' : 'message-assistant'}`}
              >
                {msg.role === 'assistant' && (
                  <div className="message-avatar">
                    <RobotOutlined />
                  </div>
                )}
                <div className="message-content">
                  {msg.role === 'assistant' && renderReasoning(
                    msg.reasoning || '',
                    msg.id === 'streaming'
                  )}
                  {msg.content}
                  {msg.id === 'streaming' && !msg.content && msg.reasoning && (
                    <span className="typing-cursor" />
                  )}
                  {msg.id === 'streaming' && msg.content && (
                    <span className="typing-cursor" />
                  )}
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
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

      <style>{`
        @keyframes blink {
          0%, 50% { opacity: 1; }
          51%, 100% { opacity: 0; }
        }
        .typing-cursor {
          display: inline-block;
          width: 2px;
          height: 16px;
          background: #000;
          margin-left: 2px;
          vertical-align: text-bottom;
          animation: blink 1s infinite;
        }
      `}</style>
    </div>
  )
}

export default ChatPanel
