const models = [
  { name: "Claude 3.5 Sonnet", provider: "Anthropic", active: true },
  { name: "GPT-4", provider: "OpenAI", active: true },
  { name: "Gemini Pro", provider: "Google", active: true },
  { name: "Llama 3 70B", provider: "Meta", active: false },
  { name: "Mixtral 8x7B", provider: "Mistral", active: false }
];

export const ModelsScreen = () => {
  return (
    <div className="flex flex-col h-full bg-gray-950 p-4">
      <div className="mb-6 text-center pb-4 border-b border-gray-700">
        <h2 className="text-xl font-mono tracking-[3px] text-white mb-1">
          MODEL ORCHESTRA
        </h2>
        <p className="text-xs text-gray-400 uppercase tracking-wider">
          Configure AI Ensemble
        </p>
      </div>
      
      <div className="flex-1 overflow-y-auto space-y-3">
        {models.map((model, i) => (
          <div
            key={i}
            className={`border rounded-2xl p-4 transition-all ${
              model.active
                ? "bg-gray-850 border-gray-600"
                : "bg-gray-900 border-gray-700"
            }`}
          >
            <div className="flex items-start justify-between mb-3">
              <div className="flex-1">
                <h3 className="text-sm font-medium text-gray-100 mb-1">
                  {model.name}
                </h3>
                <p className="text-xs text-gray-400 font-mono">
                  {model.provider}
                </p>
              </div>
              <div className={`w-10 h-5 rounded-full border transition-all ${
                model.active
                  ? "bg-gray-600 border-gray-500"
                  : "bg-gray-800 border-gray-700"
              }`}>
                <div className={`w-4 h-4 bg-white rounded-full transition-transform ${
                  model.active ? "translate-x-5" : "translate-x-0.5"
                }`} />
              </div>
            </div>
            
            {model.active && (
              <div className="flex items-center gap-2 pt-3 border-t border-gray-700">
                <button className="flex-1 py-2 bg-gray-800 border border-gray-700 rounded-lg text-xs text-gray-300 font-mono uppercase tracking-wider">
                  Configure
                </button>
                <div className="flex items-center gap-1 bg-gray-800 rounded-lg border border-gray-700">
                  <button className="w-8 h-8 flex items-center justify-center text-gray-400">
                    −
                  </button>
                  <span className="w-6 text-center text-xs font-mono text-white">
                    1
                  </span>
                  <button className="w-8 h-8 flex items-center justify-center text-gray-400">
                    +
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
      
      <div className="pt-4 border-t border-gray-700">
        <button className="w-full py-3 bg-gray-800 hover:bg-gray-700 border border-gray-600 rounded-2xl text-white text-sm font-mono uppercase tracking-wider transition-all">
          Apply Configuration
        </button>
      </div>
    </div>
  );
};
