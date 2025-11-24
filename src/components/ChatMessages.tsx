interface Response {
  model: string;
  content: string;
  resonance: number;
}

interface Message {
  id: string;
  type: "human" | "ai";
  content?: string;
  responses?: Response[];
  timestamp?: string;
}

interface ChatMessagesProps {
  messages: Message[];
}

export const ChatMessages = ({ messages }: ChatMessagesProps) => {
  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-6">
      {messages.map((message) => (
        <div key={message.id} className="animate-slide-in-up">
          {message.type === "human" ? (
            <div className="flex justify-end">
              <div className="max-w-[70%] bg-gray-700 border border-gray-600 rounded-2xl rounded-br-sm px-5 py-3">
                <p className="text-white text-sm leading-relaxed">{message.content}</p>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {message.responses?.map((response, i) => (
                  <div
                    key={i}
                    className="bg-gray-800 border border-gray-700 rounded-2xl overflow-hidden hover:bg-gray-750 hover:border-gray-600 transition-all duration-200 hover:-translate-y-0.5"
                  >
                    <div className="px-4 py-2 bg-gray-750 border-b border-gray-700 flex justify-between items-center">
                      <span className="text-xs font-semibold text-gray-200 uppercase tracking-wider font-mono">
                        {response.model}
                      </span>
                      <div className="flex items-center gap-2">
                        <div className="w-12 h-1 bg-gray-700 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-gradient-to-r from-gray-500 to-gray-300 transition-all duration-500"
                            style={{ width: `${response.resonance * 100}%` }}
                          />
                        </div>
                        <span className="text-xs text-gray-400 font-mono">
                          {response.resonance.toFixed(2)}
                        </span>
                      </div>
                    </div>
                    <div className="px-4 py-3">
                      <p className="text-sm text-gray-100 leading-relaxed">
                        {response.content}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
              
              {message.responses && message.responses.length > 1 && (
                <div className="flex items-center justify-center gap-3 py-3 bg-gray-800 border-2 border-dashed border-gray-600 rounded-xl">
                  <div className="w-5 h-5 border-2 border-gray-400 rounded animate-spin" />
                  <span className="text-xs text-gray-400 font-mono uppercase tracking-wider">
                    Memory Forming • High Resonance Detected
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
};
