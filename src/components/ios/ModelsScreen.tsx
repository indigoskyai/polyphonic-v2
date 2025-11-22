import { useState } from "react";

const initialModels = [
  { name: "Claude 3.5 Sonnet", provider: "Anthropic", active: true, weight: 1 },
  { name: "GPT-4", provider: "OpenAI", active: true, weight: 1 },
  { name: "Gemini Pro", provider: "Google", active: true, weight: 1 },
  { name: "Llama 3 70B", provider: "Meta", active: false, weight: 1 },
  { name: "Mixtral 8x7B", provider: "Mistral", active: false, weight: 1 }
];

export const ModelsScreen = () => {
  const [models, setModels] = useState(initialModels);

  const toggleModel = (index: number) => {
    setModels(prev => prev.map((m, i) => 
      i === index ? { ...m, active: !m.active } : m
    ));
  };

  const updateWeight = (index: number, delta: number) => {
    setModels(prev => prev.map((m, i) => 
      i === index ? { ...m, weight: Math.max(1, Math.min(5, m.weight + delta)) } : m
    ));
  };

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
            className={`border rounded-2xl p-4 transition-all duration-200 ${
              model.active
                ? "bg-gray-850 border-gray-600 shadow-lg"
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
              <button 
                onClick={() => toggleModel(i)}
                className={`w-11 h-6 rounded-full border transition-all ${
                  model.active
                    ? "bg-gray-600 border-gray-500"
                    : "bg-gray-800 border-gray-700"
                }`}
              >
                <div className={`w-5 h-5 bg-white rounded-full transition-all duration-200 ${
                  model.active ? "translate-x-5" : "translate-x-0.5"
                }`} />
              </button>
            </div>
            
            {model.active && (
              <div className="space-y-2 pt-3 border-t border-gray-700 animate-fadeIn">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-gray-400 font-mono uppercase tracking-wider">Weight</span>
                  <div className="flex items-center gap-1 bg-gray-800 rounded-lg border border-gray-700">
                    <button 
                      onClick={() => updateWeight(i, -1)}
                      className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-white transition-colors active:scale-90"
                    >
                      −
                    </button>
                    <span className="w-8 text-center text-xs font-mono text-white font-semibold">
                      {model.weight}
                    </span>
                    <button 
                      onClick={() => updateWeight(i, 1)}
                      className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-white transition-colors active:scale-90"
                    >
                      +
                    </button>
                  </div>
                </div>
                <button className="w-full py-2 bg-gray-800 hover:bg-gray-750 border border-gray-700 rounded-lg text-xs text-gray-300 hover:text-white font-mono uppercase tracking-wider transition-all active:scale-98">
                  Configure Parameters
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
      
      <div className="pt-4 border-t border-gray-700 space-y-2">
        <div className="flex items-center justify-between px-1 mb-2">
          <span className="text-xs text-gray-500 font-mono uppercase tracking-wider">
            {models.filter(m => m.active).length} Active
          </span>
          <span className="text-xs text-gray-500 font-mono">
            Weight: {models.filter(m => m.active).reduce((sum, m) => sum + m.weight, 0)}
          </span>
        </div>
        <button className="w-full py-3 bg-gray-800 hover:bg-gray-700 active:scale-98 border border-gray-600 rounded-2xl text-white text-sm font-mono uppercase tracking-wider transition-all">
          Apply Configuration
        </button>
      </div>
    </div>
  );
};
