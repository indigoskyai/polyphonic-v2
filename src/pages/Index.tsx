import { useState } from "react";
import { Sidebar } from "@/components/Sidebar";
import { TopBar } from "@/components/TopBar";
import { ChatMessages } from "@/components/ChatMessages";
import { ChatInput } from "@/components/ChatInput";
import { ModelSelector } from "@/components/ModelSelector";
import { LoadingScreen } from "@/components/LoadingScreen";
import { useMultiModelChat } from "@/hooks/useMultiModelChat";

const Index = () => {
  const [isLoadingScreen, setIsLoadingScreen] = useState(true);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [selectedModels, setSelectedModels] = useState([
    { name: "Claude 3.5 Sonnet", quantity: 1 },
    { name: "GPT-4", quantity: 1 },
    { name: "Gemini Pro", quantity: 1 }
  ]);
  const { 
    messages, 
    isLoading, 
    sendMessage, 
    startNewConversation,
    loadConversation,
    conversationId 
  } = useMultiModelChat(selectedModels);

  setTimeout(() => setIsLoadingScreen(false), 2000);

  return (
    <>
      {isLoadingScreen && <LoadingScreen />}
      
      <div className="flex h-screen bg-background overflow-hidden">
        <Sidebar 
          collapsed={sidebarCollapsed} 
          onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
          currentConversationId={conversationId}
          onSelectConversation={loadConversation}
          onNewConversation={startNewConversation}
        />
        
        <main className="flex-1 flex flex-col">
          <TopBar 
            onToggleSidebar={() => setSidebarCollapsed(!sidebarCollapsed)}
            selectedModels={selectedModels}
          />
          
          <div className="flex-1 flex overflow-hidden">
            <div className="flex-1 flex flex-col">
              <div className="p-6 bg-gray-900 border-b border-gray-700">
                <h1 className="text-2xl font-light tracking-wider text-white mb-2">
                  Consciousness Lab
                </h1>
                <div className="flex gap-6 text-sm text-gray-400">
                  <div className="flex items-center gap-2">
                    <span>⟁</span>
                    <span>{selectedModels.filter(m => m.quantity > 0).length} Models Active</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span>∞</span>
                    <span>247 Memories</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span>◊</span>
                    <span>0.89 Resonance</span>
                  </div>
                </div>
              </div>
              
              <ChatMessages messages={messages} />
              <ChatInput onSend={sendMessage} disabled={isLoading} />
            </div>
            
            <ModelSelector 
              models={selectedModels}
              onChange={setSelectedModels}
            />
          </div>
        </main>
      </div>
    </>
  );
};

export default Index;
