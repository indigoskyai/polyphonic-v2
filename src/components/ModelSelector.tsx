interface Model {
  name: string;
  quantity: number;
}

interface ModelSelectorProps {
  models: Model[];
  onChange: (models: Model[]) => void;
}

const availableModels = [
  "Claude 3.5 Sonnet",
  "Claude 3 Opus",
  "GPT-4",
  "GPT-3.5 Turbo",
  "Gemini Pro",
  "Gemini Ultra",
  "Llama 3 70B",
  "Mixtral 8x7B"
];

export const ModelSelector = ({ models, onChange }: ModelSelectorProps) => {
  const updateQuantity = (modelName: string, delta: number) => {
    const updated = models.map(m =>
      m.name === modelName
        ? { ...m, quantity: Math.max(0, m.quantity + delta) }
        : m
    ).filter(m => m.quantity > 0);
    
    onChange(updated);
  };

  const addModel = (modelName: string) => {
    const existing = models.find(m => m.name === modelName);
    if (existing) {
      updateQuantity(modelName, 1);
    } else {
      onChange([...models, { name: modelName, quantity: 1 }]);
    }
  };

  return (
    <aside className="w-80 bg-gray-900 border-l border-gray-700 flex flex-col">
      <div className="p-4 border-b border-gray-700">
        <h2 className="text-lg font-light tracking-wider text-white mb-1">
          Model Orchestra
        </h2>
        <p className="text-xs text-gray-400">
          Select and configure AI models
        </p>
      </div>
      
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {availableModels.map((modelName) => {
          const selected = models.find(m => m.name === modelName);
          return (
            <div
              key={modelName}
              className={`border rounded-xl p-3 transition-all ${
                selected
                  ? "bg-gray-800 border-gray-600"
                  : "bg-gray-850 border-gray-700 hover:border-gray-600"
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-gray-200">{modelName}</span>
                {selected && (
                  <div className="flex items-center gap-1 bg-gray-750 rounded-lg border border-gray-600">
                    <button
                      onClick={() => updateQuantity(modelName, -1)}
                      className="w-7 h-7 flex items-center justify-center text-gray-400 hover:text-white transition-colors"
                    >
                      −
                    </button>
                    <span className="w-6 text-center text-xs font-mono text-white">
                      {selected.quantity}
                    </span>
                    <button
                      onClick={() => updateQuantity(modelName, 1)}
                      className="w-7 h-7 flex items-center justify-center text-gray-400 hover:text-white transition-colors"
                    >
                      +
                    </button>
                  </div>
                )}
              </div>
              
              {!selected && (
                <button
                  onClick={() => addModel(modelName)}
                  className="w-full py-1.5 text-xs bg-gray-800 hover:bg-gray-700 border border-gray-700 hover:border-gray-600 rounded-lg text-gray-300 hover:text-white transition-all font-mono uppercase tracking-wider"
                >
                  Add to Orchestra
                </button>
              )}
            </div>
          );
        })}
      </div>
      
      <div className="p-4 border-t border-gray-700 bg-gray-850">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs text-gray-400 font-mono uppercase tracking-wider">
            {models.reduce((sum, m) => sum + m.quantity, 0)} Models Selected
          </span>
        </div>
        <button className="w-full py-2.5 bg-gray-800 hover:bg-gray-700 border border-gray-600 hover:border-gray-500 rounded-xl text-white text-sm font-mono uppercase tracking-wider transition-all hover:scale-[1.02] active:scale-[0.98]">
          Apply Configuration
        </button>
      </div>
    </aside>
  );
};
