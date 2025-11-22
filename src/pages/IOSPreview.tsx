import { useState } from "react";
import { Link } from "react-router-dom";
import { PhoneContainer } from "@/components/ios/PhoneContainer";
import { ChatScreen } from "@/components/ios/ChatScreen";
import { ModelsScreen } from "@/components/ios/ModelsScreen";
import { MemoryScreen } from "@/components/ios/MemoryScreen";
import { ShareScreen } from "@/components/ios/ShareScreen";

const IOSPreview = () => {
  const [activeScreen, setActiveScreen] = useState<"chat" | "models" | "memory" | "share">("chat");

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-8 relative">
      <div className="absolute inset-0 bg-gradient-to-br from-gray-950 via-black to-gray-900 opacity-50" />
      
      <Link
        to="/"
        className="absolute top-8 left-8 flex items-center gap-2 px-6 py-3 bg-gray-800 hover:bg-gray-700 border border-gray-600 rounded-xl text-gray-100 transition-all duration-200 hover:scale-105 z-10"
      >
        <span>💻</span>
        <span className="font-mono text-sm tracking-wider">Desktop View</span>
      </Link>

      <PhoneContainer>
        {activeScreen === "chat" && <ChatScreen />}
        {activeScreen === "models" && <ModelsScreen />}
        {activeScreen === "memory" && <MemoryScreen />}
        {activeScreen === "share" && <ShareScreen />}
        
        <div className="absolute bottom-0 left-0 right-0 h-20 bg-gradient-to-t from-gray-900 to-transparent backdrop-blur-xl border-t border-gray-700 flex justify-around items-center pb-5">
          {[
            { id: "chat", icon: "⟁", label: "Chat" },
            { id: "models", icon: "◊", label: "Models" },
            { id: "memory", icon: "∞", label: "Memory" },
            { id: "share", icon: "⟲", label: "Share" }
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveScreen(tab.id as any)}
              className={`flex flex-col items-center gap-1 transition-all duration-200 ${
                activeScreen === tab.id 
                  ? "text-white scale-105" 
                  : "text-gray-400 hover:text-gray-200"
              }`}
            >
              <span className="text-2xl">{tab.icon}</span>
              <span className="text-xs font-mono tracking-wider uppercase">{tab.label}</span>
            </button>
          ))}
        </div>
      </PhoneContainer>
    </div>
  );
};

export default IOSPreview;
