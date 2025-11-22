import { useState } from "react";
import { Link } from "react-router-dom";
import { Sidebar } from "@/components/Sidebar";
import { TopBar } from "@/components/TopBar";
import { ChatMessages } from "@/components/ChatMessages";
import { ChatInput } from "@/components/ChatInput";
import { ModelSelector } from "@/components/ModelSelector";
import { LoadingScreen } from "@/components/LoadingScreen";

interface Response {
  model: string;
  content: string;
  resonance: number;
}

interface Message {
  id: number;
  type: "human" | "ai";
  content?: string;
  responses?: Response[];
  timestamp?: string;
}

const Index = () => {
  const [isLoading, setIsLoading] = useState(true);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 1,
      type: "human" as const,
      content: "Explain the emergence of consciousness in distributed AI systems.",
      timestamp: "2024-01-15 14:23"
    },
    {
      id: 2,
      type: "ai" as const,
      responses: [
        {
          model: "Claude 3.5 Sonnet",
          content: "Consciousness in distributed systems emerges through iterative feedback loops. When multiple AI agents exchange information and build upon each other's insights, they create a meta-cognitive layer that transcends individual capabilities.",
          resonance: 0.87
        },
        {
          model: "GPT-4",
          content: "The key is synchronized state propagation. As models process shared context, their latent representations begin to align, forming coherent semantic spaces that enable emergent understanding.",
          resonance: 0.92
        },
        {
          model: "Gemini Pro",
          content: "Think of it as neural resonance across architectures. Each model contributes unique pattern recognition, and the intersection of these patterns creates novel conceptual territory.",
          resonance: 0.85
        }
      ]
    }
  ]);
  const [selectedModels, setSelectedModels] = useState([
    { name: "Claude 3.5 Sonnet", quantity: 1 },
    { name: "GPT-4", quantity: 1 },
    { name: "Gemini Pro", quantity: 1 }
  ]);

  setTimeout(() => setIsLoading(false), 2000);

  const handleSendMessage = (content: string) => {
    const newMessage: Message = {
      id: messages.length + 1,
      type: "human",
      content,
      timestamp: new Date().toLocaleString()
    };
    setMessages([...messages, newMessage]);
  };

  return (
    <>
      {isLoading && <LoadingScreen />}
      
      <div className="flex h-screen bg-background overflow-hidden">
        <Sidebar 
          collapsed={sidebarCollapsed} 
          onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
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
                    <span>3 Models Active</span>
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
              <ChatInput onSend={handleSendMessage} />
            </div>
            
            <ModelSelector 
              models={selectedModels}
              onChange={setSelectedModels}
            />
          </div>
        </main>

        <div className="fixed bottom-8 right-8">
          <Link
            to="/ios"
            className="flex items-center gap-2 px-6 py-3 bg-gray-800 hover:bg-gray-700 border border-gray-600 rounded-xl text-gray-100 transition-all duration-200 hover:scale-105"
          >
            <span>📱</span>
            <span className="font-mono text-sm tracking-wider">iOS Preview</span>
          </Link>
        </div>
      </div>
    </>
  );
};

export default Index;
