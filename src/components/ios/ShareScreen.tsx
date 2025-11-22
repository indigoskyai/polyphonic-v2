const conversations = [
  { title: "Consciousness Theory", models: 3, messages: 24, date: "Today" },
  { title: "Emergence Patterns", models: 4, messages: 18, date: "Yesterday" },
  { title: "Collective Intelligence", models: 2, messages: 32, date: "2 days ago" }
];

export const ShareScreen = () => {
  return (
    <div className="flex flex-col h-full bg-gray-950 p-4">
      <div className="mb-6 text-center pb-4 border-b border-gray-700">
        <h2 className="text-xl font-mono tracking-[3px] text-white mb-1">
          SHARE & EXPORT
        </h2>
        <p className="text-xs text-gray-400 uppercase tracking-wider">
          Collaborative Artifacts
        </p>
      </div>
      
      <div className="mb-4 flex gap-2">
        {["Public", "Private", "Collaborative"].map((format) => (
          <button
            key={format}
            className="flex-1 py-2 bg-gray-800 border border-gray-700 rounded-xl text-xs text-gray-300 hover:bg-gray-700 hover:border-gray-600 transition-all font-mono uppercase tracking-wider"
          >
            {format}
          </button>
        ))}
      </div>
      
      <div className="flex-1 overflow-y-auto space-y-3">
        {conversations.map((conv, i) => (
          <div
            key={i}
            className="bg-gray-900 border border-gray-700 rounded-2xl p-4 hover:bg-gray-850 hover:border-gray-600 transition-all"
          >
            <h3 className="text-sm font-medium text-gray-100 mb-2">
              {conv.title}
            </h3>
            <div className="flex items-center gap-3 text-xs text-gray-400 mb-3 font-mono">
              <span>{conv.models} models</span>
              <span>•</span>
              <span>{conv.messages} messages</span>
              <span>•</span>
              <span>{conv.date}</span>
            </div>
            
            <div className="flex gap-2">
              <button className="flex-1 py-2 bg-gray-800 border border-gray-700 rounded-lg text-xs text-gray-300 hover:text-white transition-colors font-mono uppercase">
                Share
              </button>
              <button className="flex-1 py-2 bg-gray-800 border border-gray-700 rounded-lg text-xs text-gray-300 hover:text-white transition-colors font-mono uppercase">
                Export
              </button>
              <button className="px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-xs text-gray-300 hover:text-white transition-colors">
                ⋮
              </button>
            </div>
          </div>
        ))}
      </div>
      
      <div className="pt-4 border-t border-gray-700">
        <div className="flex items-center justify-center gap-2 py-3 bg-gray-900 border border-gray-700 rounded-2xl">
          <div className="w-2 h-2 bg-gray-400 rounded-full animate-pulse" />
          <span className="text-xs text-gray-400 font-mono uppercase tracking-wider">
            Connected • Syncing
          </span>
        </div>
      </div>
    </div>
  );
};
