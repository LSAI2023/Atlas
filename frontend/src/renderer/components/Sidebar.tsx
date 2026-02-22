import { useEffect, useMemo, useState } from 'react'
import { Input, message, Popconfirm } from 'antd'
import {
  SearchOutlined,
  DeleteOutlined,
  MessageOutlined,
  BookOutlined,
  PlusOutlined,
  CheckCircleFilled,
} from '@ant-design/icons'
import { Conversations } from '@ant-design/x'
import type { ConversationsProps } from '@ant-design/x'
import type { GetProp } from 'antd'
import { useConversationStore } from '../stores/conversationStore'
import { useKnowledgeBaseStore } from '../stores/knowledgeBaseStore'

export type SidebarMode = 'conversations' | 'knowledgeBases'

interface SidebarProps {
  mode: SidebarMode
  onModeChange: (mode: SidebarMode) => void
  onNewChat: () => void
}

type ConversationItem = GetProp<ConversationsProps, 'items'>[number]

function Sidebar({ mode, onModeChange, onNewChat }: SidebarProps) {
  const [searchText, setSearchText] = useState('')
  const [kbNameInput, setKbNameInput] = useState('')
  const [showKbCreate, setShowKbCreate] = useState(false)

  const {
    conversations,
    currentConversationId,
    fetchConversations,
    selectConversation,
    createConversation,
    deleteConversation,
  } = useConversationStore()

  const {
    knowledgeBases,
    currentKnowledgeBaseId,
    selectedKnowledgeBaseIds,
    fetchKnowledgeBases,
    createKnowledgeBase,
    deleteKnowledgeBase,
    selectKnowledgeBase,
    toggleKnowledgeBaseSelection,
  } = useKnowledgeBaseStore()

  useEffect(() => {
    fetchConversations()
    fetchKnowledgeBases()
  }, [])

  const handleNewChat = async () => {
    try {
      await createConversation()
      onNewChat()
    } catch {
      message.error('创建对话失败')
    }
  }

  const handleCreateKB = async () => {
    const name = kbNameInput.trim()
    if (!name) return
    try {
      const kb = await createKnowledgeBase(name)
      setKbNameInput('')
      setShowKbCreate(false)
      selectKnowledgeBase(kb.id)
    } catch {
      message.error('创建知识库失败')
    }
  }

  const getTimeGroup = (dateStr: string): string => {
    const now = new Date()
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const yesterdayStart = new Date(todayStart.getTime() - 86400000)
    const sevenDaysAgo = new Date(todayStart.getTime() - 7 * 86400000)
    const thirtyDaysAgo = new Date(todayStart.getTime() - 30 * 86400000)

    const date = new Date(dateStr)
    if (date >= todayStart) return '今天'
    if (date >= yesterdayStart) return '昨天'
    if (date >= sevenDaysAgo) return '7 天内'
    if (date >= thirtyDaysAgo) return '30 天内'
    return '更早'
  }

  const groupOrder = ['今天', '昨天', '7 天内', '30 天内', '更早']

  const items: ConversationItem[] = useMemo(() => {
    const filtered = conversations.filter((c) =>
      c.title.toLowerCase().includes(searchText.toLowerCase())
    )
    const mapped = filtered.map((conv) => ({
      key: conv.id,
      label: conv.title,
      group: getTimeGroup(conv.updated_at || conv.created_at),
    }))
    // Sort by group order so Conversations component renders groups in correct sequence
    mapped.sort((a, b) => groupOrder.indexOf(a.group) - groupOrder.indexOf(b.group))
    return mapped
  }, [conversations, searchText])

  const menuConfig: ConversationsProps['menu'] = (conversation) => ({
    items: [
      {
        key: 'delete',
        label: '删除',
        icon: <DeleteOutlined />,
        danger: true,
      },
    ],
    onClick: ({ key }) => {
      if (key === 'delete') {
        deleteConversation(conversation.key as string)
      }
    },
  })

  const filteredKBs = knowledgeBases.filter((kb) =>
    kb.name.toLowerCase().includes(searchText.toLowerCase())
  )

  return (
    <div className="sidebar">
      {/* Header */}
      <div className="sidebar-header">
        <div className="sidebar-search">
          <Input
            prefix={<SearchOutlined style={{ color: '#999' }} />}
            placeholder="搜索"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            allowClear
          />
        </div>
      </div>

      {/* Content */}
      <div className="sidebar-content">
        {mode === 'conversations' ? (
          <Conversations
            items={items}
            activeKey={currentConversationId || undefined}
            onActiveChange={(key) => selectConversation(key)}
            menu={menuConfig}
            groupable
            creation={{
              onClick: handleNewChat,
              label: '开启新对话',
            }}
            style={{
              background: 'transparent',
              height: '100%',
            }}
          />
        ) : (
          <div className="kb-list">
            {/* Create KB button */}
            {showKbCreate ? (
              <div className="kb-create-input">
                <Input
                  placeholder="知识库名称"
                  value={kbNameInput}
                  onChange={(e) => setKbNameInput(e.target.value)}
                  onPressEnter={handleCreateKB}
                  onBlur={() => {
                    if (!kbNameInput.trim()) setShowKbCreate(false)
                  }}
                  autoFocus
                  size="small"
                />
              </div>
            ) : (
              <div className="kb-create-btn" onClick={() => setShowKbCreate(true)}>
                <PlusOutlined />
                <span>新建知识库</span>
              </div>
            )}

            {/* KB items */}
            {filteredKBs.map((kb) => {
              const isSelected = selectedKnowledgeBaseIds.includes(kb.id)
              const isActive = currentKnowledgeBaseId === kb.id
              return (
                <div
                  key={kb.id}
                  className={`kb-list-item ${isActive ? 'active' : ''}`}
                  onClick={() => selectKnowledgeBase(kb.id)}
                >
                  <div
                    className={`kb-list-item-check ${isSelected ? 'checked' : ''}`}
                    onClick={(e) => {
                      e.stopPropagation()
                      toggleKnowledgeBaseSelection(kb.id)
                    }}
                    title={isSelected ? '取消选择' : '选择用于对话'}
                  >
                    {isSelected ? (
                      <CheckCircleFilled style={{ color: '#52c41a', fontSize: 16 }} />
                    ) : (
                      <BookOutlined style={{ color: '#999', fontSize: 14 }} />
                    )}
                  </div>
                  <div className="kb-list-item-info">
                    <div className="kb-list-item-name">{kb.name}</div>
                    {kb.description && (
                      <div className="kb-list-item-desc">{kb.description}</div>
                    )}
                  </div>
                  <div className="kb-list-item-actions">
                    <Popconfirm
                      title="删除知识库"
                      description="将同时删除所有文档，确定删除吗？"
                      onConfirm={(e) => {
                        e?.stopPropagation()
                        deleteKnowledgeBase(kb.id)
                      }}
                      okText="删除"
                      cancelText="取消"
                    >
                      <DeleteOutlined
                        onClick={(e) => e.stopPropagation()}
                        style={{ color: '#999', fontSize: 12 }}
                      />
                    </Popconfirm>
                  </div>
                </div>
              )
            })}
            {filteredKBs.length === 0 && !showKbCreate && (
              <div style={{ padding: 24, textAlign: 'center', color: '#999', fontSize: 13 }}>
                暂无知识库
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer - Mode toggle */}
      <div className="sidebar-footer">
        <div className="sidebar-mode-toggle">
          <div
            className={`sidebar-mode-btn ${mode === 'conversations' ? 'active' : ''}`}
            onClick={() => onModeChange('conversations')}
          >
            <MessageOutlined />
            <span>对话</span>
          </div>
          <div
            className={`sidebar-mode-btn ${mode === 'knowledgeBases' ? 'active' : ''}`}
            onClick={() => onModeChange('knowledgeBases')}
          >
            <BookOutlined />
            <span>知识库</span>
          </div>
        </div>
      </div>
    </div>
  )
}

export default Sidebar
