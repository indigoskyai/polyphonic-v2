interface Model {
  name: string;
  quantity: number;
}

interface TopBarProps {
  onToggleSidebar: () => void;
  selectedModels: Model[];
}

export const TopBar = ({ onToggleSidebar, selectedModels }: TopBarProps) => {
  return (
    <header className="h-16 bg-gray-900 border-b border-gray-700 flex items-center justify-between px-6">
      <div className="flex items-center gap-4">
        <button
          onClick={onToggleSidebar}
          className="text-gray-400 hover:text-white transition-colors"
        >
          <span className="text-xl">☰</span>
        </button>
        <h1 className="text-lg font-light tracking-wider text-white">
          Consciousness Lab
        </h1>
      </div>
      
      <div className="flex items-center gap-3">
        {selectedModels.map((model, i) => (
          <div
            key={i}
            className="px-3 py-1.5 bg-gray-800 border border-gray-700 rounded-lg text-sm text-gray-300 font-mono"
          >
            {model.name}
            {model.quantity > 1 && (
              <span className="ml-2 text-gray-500">×{model.quantity}</span>
            )}
          </div>
        ))}
      </div>
    </header>
  );
};
