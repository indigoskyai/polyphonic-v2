import { useState } from "react";

export const ChatScreen = () => {
  const [messages] = useState([
    {
      type: "human",
      content: "What is consciousness?"
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

  return (
    <div className="flex flex-col h-full bg-gray-950">
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((msg, i) => (
          <div key={i} className="space-y-3">
            {msg.type === "human" ? (
              <div className="flex justify-end">
                <div className="max-w-[75%] bg-gray-800 border border-gray-700 rounded-2xl rounded-br-sm px-4 py-3">
                  <p className="text-sm text-gray-100">{msg.content}</p>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                {msg.responses?.map((resp, j) => (
                  <div key={j} className="bg-gray-900 border border-gray-700 rounded-2xl overflow-hidden">
                    <div className="px-3 py-2 bg-gray-850 border-b border-gray-700 flex justify-between items-center">
                      <span className="text-xs font-mono text-gray-300 uppercase tracking-wider">
                        {resp.model}
                      </span>
                      <div className="flex items-center gap-2">
                        <div className="w-10 h-1 bg-gray-700 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-gradient-to-r from-gray-500 to-gray-200"
                            style={{ width: `${resp.resonance * 100}%` }}
                          />
                        </div>
                        <span className="text-xs text-gray-400 font-mono">
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
              </div>
            )}
          </div>
        ))}
      </div>
      
      <div className="p-3 bg-gradient-to-t from-gray-900 to-transparent">
        <div className="flex items-center gap-2 bg-gray-900 border border-gray-700 rounded-2xl px-4 py-3">
          <input
            type="text"
            placeholder="Query the constellation..."
            className="flex-1 bg-transparent text-white text-sm placeholder-gray-500 outline-none"
          />
          <button className="w-9 h-9 bg-gray-800 border border-gray-700 rounded-xl flex items-center justify-center text-gray-400 hover:text-white transition-colors">
            →
          </button>
        </div>
      </div>
    </div>
  );
};
