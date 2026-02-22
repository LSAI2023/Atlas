import { useEffect, useMemo, useState } from 'react'
import { Input, message } from 'antd'
import {
  SearchOutlined,
  DeleteOutlined,
  SettingOutlined,
} from '@ant-design/icons'
import { Conversations } from '@ant-design/x'
import type { ConversationsProps } from '@ant-design/x'
import type { GetProp } from 'antd'
import { useConversationStore } from '../stores/conversationStore'

interface SidebarProps {
  onNewChat: () => void
  onOpenSettings: () => void
}

type ConversationItem = GetProp<ConversationsProps, 'items'>[number]

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

      {/* Conversations List */}
      <div className="sidebar-content">
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
