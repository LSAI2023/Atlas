/**
 * 应用根组件
 *
 * 负责整体布局和视图切换：
 * - 左侧：Sidebar（侧边栏）- 对话列表 / 知识库列表
 * - 右侧：ChatPanel（对话面板）或 KnowledgeBaseView（知识库文档管理）
 *
 * 视图切换逻辑：
 * - 当侧边栏处于「知识库」模式且选中了某个知识库时，显示知识库文档管理视图
 * - 其他情况下显示对话面板
 */

import { useState } from 'react'
import Sidebar from './components/Sidebar'
import type { SidebarMode } from './components/Sidebar'
import ChatPanel from './components/ChatPanel'
import KnowledgeBaseView from './components/KnowledgeBaseView'
import SettingsPage from './components/SettingsPage'
import { useConversationStore } from './stores/conversationStore'
import { useKnowledgeBaseStore } from './stores/knowledgeBaseStore'

function App() {
  const { currentConversationId, clearMessages } = useConversationStore()
  const { currentKnowledgeBaseId } = useKnowledgeBaseStore()
  const [sidebarMode, setSidebarMode] = useState<SidebarMode>('conversations')
  const [showSettings, setShowSettings] = useState(false)

  /** 创建新对话时清空当前消息列表 */
  const handleNewChat = () => {
    clearMessages()
  }

  // 判断是否显示知识库管理视图
  const showKnowledgeBaseView = sidebarMode === 'knowledgeBases' && currentKnowledgeBaseId

  // 渲染主视图
  const renderMainView = () => {
    if (showSettings) {
      return <SettingsPage onBack={() => setShowSettings(false)} />
    }
    if (showKnowledgeBaseView) {
      return <KnowledgeBaseView />
    }
    return <ChatPanel conversationId={currentConversationId} />
  }

  return (
    <div className="app-layout">
      <Sidebar
        mode={sidebarMode}
        onModeChange={(mode) => {
          setSidebarMode(mode)
          setShowSettings(false)
        }}
        onNewChat={handleNewChat}
        onOpenSettings={() => setShowSettings(true)}
      />
      {renderMainView()}
    </div>
  )
}

export default App
