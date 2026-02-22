import { useState } from 'react'
import Sidebar from './components/Sidebar'
import type { SidebarMode } from './components/Sidebar'
import ChatPanel from './components/ChatPanel'
import KnowledgeBaseView from './components/KnowledgeBaseView'
import { useConversationStore } from './stores/conversationStore'
import { useKnowledgeBaseStore } from './stores/knowledgeBaseStore'

function App() {
  const { currentConversationId, clearMessages } = useConversationStore()
  const { currentKnowledgeBaseId } = useKnowledgeBaseStore()
  const [sidebarMode, setSidebarMode] = useState<SidebarMode>('conversations')

  const handleNewChat = () => {
    clearMessages()
  }

  const showKnowledgeBaseView = sidebarMode === 'knowledgeBases' && currentKnowledgeBaseId

  return (
    <div className="app-layout">
      <Sidebar
        mode={sidebarMode}
        onModeChange={setSidebarMode}
        onNewChat={handleNewChat}
      />
      {showKnowledgeBaseView ? (
        <KnowledgeBaseView />
      ) : (
        <ChatPanel conversationId={currentConversationId} />
      )}
    </div>
  )
}

export default App
