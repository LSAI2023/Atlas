/**
 * 侧边栏组件
 *
 * 应用的左侧导航面板，支持两种模式切换：
 * 1. 对话模式（conversations）：使用 @ant-design/x Conversations 组件展示对话列表
 *    - 支持按时间分组（今天、昨天、7天内、30天内、更早）
 *    - 支持搜索过滤
 *    - 支持右键菜单删除
 *    - 支持创建新对话
 * 2. 知识库模式（knowledgeBases）：展示知识库列表
 *    - 支持创建/删除知识库
 *    - 支持勾选知识库（用于对话时的 RAG 检索范围）
 *    - 点击知识库查看文档详情
 *
 * 底部有模式切换按钮，可在「对话」和「知识库」之间切换。
 */

import { useEffect, useMemo, useState } from 'react'
import { Input, message, Popconfirm, Modal } from 'antd'
import {
  SearchOutlined,
  DeleteOutlined,
  MessageOutlined,
  BookOutlined,
  PlusOutlined,
  CheckCircleFilled,
  SettingOutlined,
  EditOutlined,
} from '@ant-design/icons'
import { Conversations } from '@ant-design/x'
import type { ConversationsProps } from '@ant-design/x'
import type { GetProp } from 'antd'
import { useConversationStore } from '../stores/conversationStore'
import { useKnowledgeBaseStore } from '../stores/knowledgeBaseStore'

/** 侧边栏模式类型 */
export type SidebarMode = 'conversations' | 'knowledgeBases'

interface SidebarProps {
  mode: SidebarMode                       // 当前模式
  onModeChange: (mode: SidebarMode) => void  // 模式切换回调
  onNewChat: () => void                    // 新建对话回调
  onOpenSettings: () => void               // 打开设置页面回调
}

type ConversationItem = GetProp<ConversationsProps, 'items'>[number]

function Sidebar({ mode, onModeChange, onNewChat, onOpenSettings }: SidebarProps) {
  const [searchText, setSearchText] = useState('')        // 搜索关键词
  const [kbModalOpen, setKbModalOpen] = useState(false)    // 知识库创建/编辑弹窗
  const [kbModalMode, setKbModalMode] = useState<'create' | 'edit'>('create')
  const [editingKbId, setEditingKbId] = useState<string | null>(null)
  const [kbNameInput, setKbNameInput] = useState('')       // 弹窗中的名称
  const [kbDescInput, setKbDescInput] = useState('')       // 弹窗中的描述

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
    updateKnowledgeBase,
    deleteKnowledgeBase,
    selectKnowledgeBase,
    toggleKnowledgeBaseSelection,
  } = useKnowledgeBaseStore()

  // 初始化：加载对话列表和知识库列表
  useEffect(() => {
    fetchConversations()
    fetchKnowledgeBases()
  }, [])

  /** 创建新对话 */
  const handleNewChat = async () => {
    try {
      await createConversation()
      onNewChat()
    } catch {
      message.error('创建对话失败')
    }
  }

  /** 创建新知识库 */
  const handleCreateKB = async () => {
    const name = kbNameInput.trim()
    if (!name) return
    try {
      const kb = await createKnowledgeBase(name, kbDescInput.trim() || undefined)
      setKbNameInput('')
      setKbDescInput('')
      setKbModalOpen(false)
      selectKnowledgeBase(kb.id)  // 创建后自动选中
    } catch {
      message.error('创建知识库失败')
    }
  }

  /** 编辑知识库 */
  const handleEditKB = async () => {
    if (!editingKbId || !kbNameInput.trim()) return
    try {
      await updateKnowledgeBase(editingKbId, {
        name: kbNameInput.trim(),
        description: kbDescInput.trim(),
      })
      setKbModalOpen(false)
      setKbNameInput('')
      setKbDescInput('')
      setEditingKbId(null)
      message.success('知识库已更新')
    } catch {
      message.error('更新知识库失败')
    }
  }

  /** 打开创建弹窗 */
  const openCreateModal = () => {
    setKbModalMode('create')
    setKbNameInput('')
    setKbDescInput('')
    setEditingKbId(null)
    setKbModalOpen(true)
  }

  /** 打开编辑弹窗 */
  const openEditModal = (kb: { id: string; name: string; description: string }) => {
    setKbModalMode('edit')
    setKbNameInput(kb.name)
    setKbDescInput(kb.description || '')
    setEditingKbId(kb.id)
    setKbModalOpen(true)
  }

  /**
   * 根据日期字符串返回时间分组标签
   * 用于对话列表的分组展示
   */
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

  /** 分组排序优先级 */
  const groupOrder = ['今天', '昨天', '7 天内', '30 天内', '更早']

  /** 将对话数据转换为 Conversations 组件的 items 格式，支持搜索过滤和时间分组 */
  const items: ConversationItem[] = useMemo(() => {
    // 搜索过滤
    const filtered = conversations.filter((c) =>
      c.title.toLowerCase().includes(searchText.toLowerCase())
    )
    // 转换格式并添加分组
    const mapped = filtered.map((conv) => ({
      key: conv.id,
      label: conv.title,
      group: getTimeGroup(conv.updated_at || conv.created_at),
    }))
    // 按分组排序，确保「今天」在最前面
    mapped.sort((a, b) => groupOrder.indexOf(a.group) - groupOrder.indexOf(b.group))
    return mapped
  }, [conversations, searchText])

  /** 对话右键菜单配置 */
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

  /** 搜索过滤后的知识库列表 */
  const filteredKBs = knowledgeBases.filter((kb) =>
    kb.name.toLowerCase().includes(searchText.toLowerCase())
  )

  return (
    <div className="sidebar">
      {/* 顶部：搜索框 */}
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

      {/* 中部：内容区域（对话列表 / 知识库列表） */}
      <div className="sidebar-content">
        {mode === 'conversations' ? (
          /* 对话列表模式 */
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
          /* 知识库列表模式 */
          <div className="kb-list">
            {/* 创建知识库按钮 */}
            <div className="kb-create-btn" onClick={openCreateModal}>
              <PlusOutlined />
              <span>新建知识库</span>
            </div>

            {/* 知识库列表项 */}
            {filteredKBs.map((kb) => {
              const isSelected = selectedKnowledgeBaseIds.includes(kb.id)  // 是否被勾选（用于 RAG）
              const isActive = currentKnowledgeBaseId === kb.id            // 是否是当前查看的
              return (
                <div
                  key={kb.id}
                  className={`kb-list-item ${isActive ? 'active' : ''}`}
                  onClick={() => selectKnowledgeBase(kb.id)}
                >
                  {/* 勾选按钮：控制是否在对话时使用该知识库 */}
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
                  {/* 知识库名称和描述 */}
                  <div className="kb-list-item-info">
                    <div className="kb-list-item-name">{kb.name}</div>
                    {kb.description && (
                      <div className="kb-list-item-desc">{kb.description}</div>
                    )}
                  </div>
                  {/* 操作按钮（编辑 + 删除） */}
                  <div className="kb-list-item-actions">
                    <EditOutlined
                      onClick={(e) => {
                        e.stopPropagation()
                        openEditModal(kb)
                      }}
                      style={{ color: '#999', fontSize: 12, marginRight: 6 }}
                      title="编辑"
                    />
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
                        title="删除"
                      />
                    </Popconfirm>
                  </div>
                </div>
              )
            })}
            {/* 空状态提示 */}
            {filteredKBs.length === 0 && (
              <div style={{ padding: 24, textAlign: 'center', color: '#999', fontSize: 13 }}>
                暂无知识库
              </div>
            )}

            {/* 创建/编辑知识库弹窗 */}
            <Modal
              title={kbModalMode === 'create' ? '新建知识库' : '编辑知识库'}
              open={kbModalOpen}
              onOk={kbModalMode === 'create' ? handleCreateKB : handleEditKB}
              onCancel={() => setKbModalOpen(false)}
              okText={kbModalMode === 'create' ? '创建' : '保存'}
              cancelText="取消"
              okButtonProps={{ disabled: !kbNameInput.trim() }}
            >
              <div style={{ marginBottom: 16 }}>
                <div style={{ marginBottom: 6, fontSize: 13, color: '#333' }}>名称</div>
                <Input
                  placeholder="知识库名称"
                  value={kbNameInput}
                  onChange={(e) => setKbNameInput(e.target.value)}
                  autoFocus
                />
              </div>
              <div>
                <div style={{ marginBottom: 6, fontSize: 13, color: '#333' }}>描述（可选）</div>
                <Input.TextArea
                  placeholder="描述知识库的内容和用途，有助于 AI 更好地理解和检索"
                  value={kbDescInput}
                  onChange={(e) => setKbDescInput(e.target.value)}
                  rows={3}
                />
              </div>
            </Modal>
          </div>
        )}
      </div>

      {/* 底部：模式切换按钮和设置入口 */}
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
          <div
            className="sidebar-mode-btn"
            onClick={onOpenSettings}
          >
            <SettingOutlined />
            <span>设置</span>
          </div>
        </div>
      </div>
    </div>
  )
}

export default Sidebar
