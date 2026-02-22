import { useEffect, useState } from 'react'
import { Input, message, Popconfirm } from 'antd'
import {
  SearchOutlined,
  PlusOutlined,
  MessageOutlined,
  DeleteOutlined,
  SettingOutlined,
} from '@ant-design/icons'
import { useConversationStore } from '../stores/conversationStore'

interface SidebarProps {
  onNewChat: () => void
  onOpenSettings: () => void
}

function Sidebar({ onNewChat, onOpenSettings }: SidebarProps) {
  const [searchText, setSearchText] = useState('')

  const {
    conversations,
    currentConversationId,
    fetchConversations,
    selectConversation,
    createConversation,
    deleteConversation,
  } = useConversationStore()

  useEffect(() => {
    fetchConversations()
  }, [])

  const handleNewChat = async () => {
    try {
      await createConversation()
      onNewChat()
    } catch {
      message.error('创建对话失败')
    }
  }

  const filteredConversations = conversations.filter((c) =>
    c.title.toLowerCase().includes(searchText.toLowerCase())
  )

  // Group conversations by time period
  const groupConversations = () => {
    const now = new Date()
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const yesterdayStart = new Date(todayStart.getTime() - 86400000)
    const sevenDaysAgo = new Date(todayStart.getTime() - 7 * 86400000)
    const thirtyDaysAgo = new Date(todayStart.getTime() - 30 * 86400000)

    const groups: { label: string; items: typeof filteredConversations }[] = []
    const today: typeof filteredConversations = []
    const yesterday: typeof filteredConversations = []
    const sevenDays: typeof filteredConversations = []
    const thirtyDays: typeof filteredConversations = []
    const older: typeof filteredConversations = []

    for (const conv of filteredConversations) {
      const date = new Date(conv.updated_at || conv.created_at)
      if (date >= todayStart) {
        today.push(conv)
      } else if (date >= yesterdayStart) {
        yesterday.push(conv)
      } else if (date >= sevenDaysAgo) {
        sevenDays.push(conv)
      } else if (date >= thirtyDaysAgo) {
        thirtyDays.push(conv)
      } else {
        older.push(conv)
      }
    }

    if (today.length) groups.push({ label: '今天', items: today })
    if (yesterday.length) groups.push({ label: '昨天', items: yesterday })
    if (sevenDays.length) groups.push({ label: '7 天内', items: sevenDays })
    if (thirtyDays.length) groups.push({ label: '30 天内', items: thirtyDays })
    if (older.length) groups.push({ label: '更早', items: older })

    return groups
  }

  const groups = groupConversations()

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
        {/* New Chat Button */}
        <div className="new-chat-btn" onClick={handleNewChat}>
          <PlusOutlined />
          <span>开启新对话</span>
        </div>

        {/* Grouped Conversations List */}
        {groups.map((group) => (
          <div key={group.label} className="sidebar-section">
            <div className="sidebar-section-title">{group.label}</div>
            {group.items.map((conv) => (
              <div
                key={conv.id}
                className={`conversation-item ${currentConversationId === conv.id ? 'active' : ''}`}
                onClick={() => selectConversation(conv.id)}
              >
                <span className="conversation-item-title">{conv.title}</span>
                <div className="conversation-item-actions">
                  <Popconfirm
                    title="删除对话"
                    description="确定要删除这个对话吗？"
                    onConfirm={(e) => {
                      e?.stopPropagation()
                      deleteConversation(conv.id)
                    }}
                    okText="删除"
                    cancelText="取消"
                  >
                    <DeleteOutlined
                      onClick={(e) => e.stopPropagation()}
                      style={{ color: '#999' }}
                    />
                  </Popconfirm>
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>

      {/* Footer - Settings button */}
      <div className="sidebar-footer">
        <div className="settings-btn" onClick={onOpenSettings}>
          <SettingOutlined />
          <span>设置</span>
        </div>
      </div>
    </div>
  )
}

export default Sidebar
