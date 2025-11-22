import { useState, useRef, useEffect } from "react";

export const ChatScreen = () => {
  const [messages] = useState([
    {
      type: "human",
      content: "What is consciousness?",
      timestamp: "2m ago"
    },
    {
      type: "ai",
      responses: [
        { model: "Claude", content: "A meta-cognitive phenomenon emerging from complex information processing.", resonance: 0.89 },
        { model: "GPT-4", content: "The subjective experience of awareness and sentience.", resonance: 0.92 },
        { model: "Gemini", content: "An emergent property of neural networks reaching critical complexity.", resonance: 0.87 }
      ]
    }
  ]);
  const [input, setInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const avgResonance = messages[1]?.responses 
    ? messages[1].responses.reduce((sum, r) => sum + r.resonance, 0) / messages[1].responses.length 
    : 0;

  return (
    <div className="flex flex-col h-full bg-gray-950">
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((msg, i) => (
          <div key={i} className="space-y-3 animate-fadeIn">
            {msg.type === "human" ? (
              <div className="flex justify-end">
                <div className="max-w-[75%] bg-gray-800 border border-gray-700 rounded-2xl rounded-br-sm px-4 py-3">
                  <p className="text-sm text-gray-100 leading-relaxed">{msg.content}</p>
                  <p className="text-[10px] text-gray-500 mt-1.5 font-mono">{msg.timestamp}</p>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                {msg.responses?.map((resp, j) => (
                  <div key={j} className="bg-gray-900 border border-gray-700 rounded-2xl overflow-hidden hover:border-gray-600 transition-all">
                    <div className="px-3 py-2 bg-gray-850 border-b border-gray-700 flex justify-between items-center">
                      <span className="text-xs font-mono text-gray-300 uppercase tracking-wider">
                        {resp.model}
                      </span>
                      <div className="flex items-center gap-2">
                        <div className="w-10 h-1 bg-gray-800 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-gradient-to-r from-gray-600 to-gray-300 transition-all duration-1000"
                            style={{ width: `${resp.resonance * 100}%` }}
                          />
                        </div>
                        <span className="text-xs text-gray-400 font-mono font-semibold">
                          {resp.resonance.toFixed(2)}
                        </span>
                      </div>
                    </div>
                    <div className="px-3 py-3">
                      <p className="text-xs text-gray-200 leading-relaxed">
                        {resp.content}
                      </p>
                    </div>
                  </div>
                ))}
                
                {msg.responses && msg.responses.length > 1 && (
                  <div className="flex items-center justify-center gap-2 py-2.5 bg-gray-900/50 border border-dashed border-gray-700 rounded-xl mt-2">
                    <div className="w-1.5 h-1.5 bg-gray-500 rounded-full animate-pulse" />
                    <span className="text-[10px] text-gray-500 font-mono uppercase tracking-wider">
                      Resonance: {(avgResonance * 100).toFixed(0)}% • Memory Forming
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>
      
      <div className="p-3 bg-gradient-to-t from-gray-900 via-gray-900/95 to-transparent">
        <div className="flex items-center gap-2 bg-gray-900 border border-gray-700 rounded-2xl px-4 py-3 focus-within:border-gray-600 transition-all">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Query the constellation..."
            className="flex-1 bg-transparent text-white text-sm placeholder-gray-500 outline-none"
          />
          <button 
            disabled={!input.trim()}
            className="w-9 h-9 bg-gray-800 border border-gray-700 rounded-xl flex items-center justify-center text-gray-400 hover:text-white hover:bg-gray-750 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            →
          </button>
        </div>
      </div>
    </div>
  );
};
