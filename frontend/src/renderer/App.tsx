import { useState } from 'react'
import Sidebar from './components/Sidebar'
import ChatPanel from './components/ChatPanel'
import SettingsDrawer from './components/SettingsDrawer'
import { useConversationStore } from './stores/conversationStore'

function App() {
  const { currentConversationId, clearMessages } = useConversationStore()
  const [settingsOpen, setSettingsOpen] = useState(false)

  const handleNewChat = () => {
    clearMessages()
  }

  return (
    <div className="app-layout">
      <Sidebar
        onNewChat={handleNewChat}
        onOpenSettings={() => setSettingsOpen(true)}
      />
      <ChatPanel conversationId={currentConversationId} />
      <SettingsDrawer
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
      />
    </div>
  )
}

export default App
