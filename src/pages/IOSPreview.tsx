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
        <div className="flex-1 overflow-hidden">
          {activeScreen === "chat" && <ChatScreen />}
          {activeScreen === "models" && <ModelsScreen />}
          {activeScreen === "memory" && <MemoryScreen />}
          {activeScreen === "share" && <ShareScreen />}
        </div>
        
        <div className="h-20 bg-gradient-to-t from-gray-900 via-gray-900/98 to-gray-900/95 backdrop-blur-xl border-t border-gray-700/50 flex items-center justify-around px-2 pb-5 relative">
          <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-gray-600 to-transparent" />
          {[
            { id: "chat", icon: "◐", label: "Chat" },
            { id: "models", icon: "◈", label: "Models" },
            { id: "memory", icon: "◊", label: "Memory" },
            { id: "share", icon: "◎", label: "Share" }
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveScreen(tab.id as any)}
              className={`relative flex flex-col items-center justify-center w-16 h-14 rounded-xl transition-all duration-200 ${
                activeScreen === tab.id
                  ? "bg-gray-800/80 text-white scale-105"
                  : "text-gray-500 hover:text-gray-300 active:scale-95"
              }`}
            >
              {activeScreen === tab.id && (
                <div className="absolute inset-0 bg-gray-800 rounded-xl opacity-0 animate-fadeIn" />
              )}
              <span className={`text-2xl mb-0.5 transition-transform relative z-10 ${
                activeScreen === tab.id ? "-translate-y-0.5" : ""
              }`}>
                {tab.icon}
              </span>
              <span className={`text-[10px] font-medium uppercase tracking-wider relative z-10 transition-all ${
                activeScreen === tab.id ? "font-semibold" : ""
              }`}>
                {tab.label}
              </span>
            </button>
          ))}
        </div>
      </PhoneContainer>
    </div>
  );
};

export default IOSPreview;
