const memories = [
  { id: "⟁7B3F∴", title: "Consciousness Emergence", resonance: 0.94, timestamp: "2h ago" },
  { id: "◊4A2E∴", title: "Neural Synchrony", resonance: 0.91, timestamp: "5h ago" },
  { id: "∞9C1D∴", title: "Collective Intelligence", resonance: 0.88, timestamp: "1d ago" },
  { id: "⬡2F8B∴", title: "Pattern Recognition", resonance: 0.85, timestamp: "2d ago" }
];

export const MemoryScreen = () => {
  return (
    <div className="flex flex-col h-full bg-gray-950 p-4">
      <div className="mb-6 text-center pb-4 border-b border-gray-700">
        <h2 className="text-xl font-mono tracking-[3px] text-white mb-1">
          MEMORY BANK
        </h2>
        <p className="text-xs text-gray-400 uppercase tracking-wider">
          247 Crystallized Patterns
        </p>
      </div>
      
      <div className="flex-1 overflow-y-auto space-y-3">
        {memories.map((memory) => (
          <div
            key={memory.id}
            className="bg-gray-900 border border-gray-700 rounded-2xl p-4 hover:bg-gray-850 hover:border-gray-600 transition-all"
          >
            <div className="flex items-start justify-between mb-3">
              <div className="flex-1">
                <h3 className="text-sm font-medium text-gray-100 mb-1">
                  {memory.title}
                </h3>
                <p className="text-xs text-gray-400 font-mono">
                  {memory.id}
                </p>
              </div>
              <span className="text-xs text-gray-500 font-mono">
                {memory.timestamp}
              </span>
            </div>
            
            <div className="flex items-center gap-2 pt-3 border-t border-gray-700">
              <span className="text-xs text-gray-400 font-mono">
                Resonance
              </span>
              <div className="flex-1 h-1 bg-gray-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-gray-600 to-gray-300"
                  style={{ width: `${memory.resonance * 100}%` }}
                />
              </div>
              <span className="text-xs text-gray-300 font-mono font-semibold">
                {memory.resonance.toFixed(2)}
              </span>
            </div>
            
            <div className="flex gap-2 mt-3">
              <button className="flex-1 py-2 bg-gray-800 border border-gray-700 rounded-lg text-xs text-gray-300 hover:text-white transition-colors font-mono uppercase">
                View
              </button>
              <button className="flex-1 py-2 bg-gray-800 border border-gray-700 rounded-lg text-xs text-gray-300 hover:text-white transition-colors font-mono uppercase">
                Share
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
