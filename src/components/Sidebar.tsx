interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

export const Sidebar = ({ collapsed, onToggle }: SidebarProps) => {
  return (
    <aside 
      className={`bg-gray-900 border-r border-gray-700 flex flex-col transition-all duration-300 ${
        collapsed ? "w-20" : "w-72"
      }`}
    >
      <div className="p-6 border-b border-gray-700">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-gray-800 border border-gray-600 rounded-lg flex items-center justify-center text-lg">
            ⟁
          </div>
          {!collapsed && (
            <span className="text-white text-xl font-thin tracking-[0.2em]">
              POLYPHONIC
            </span>
          )}
        </div>
      </div>
      
      <nav className="flex-1 p-4 space-y-6 overflow-y-auto">
        <div className="space-y-2">
          {!collapsed && (
            <div className="text-xs uppercase tracking-wider text-gray-500 px-3 mb-3">
              Workspace
            </div>
          )}
          {[
            { icon: "⟁", label: "Constellation Lab", badge: "3" },
            { icon: "◊", label: "Autonomous Mode" },
            { icon: "∞", label: "Memory Bank", badge: "247" },
            { icon: "⬡", label: "Pattern Explorer" }
          ].map((item, i) => (
            <button
              key={i}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all ${
                i === 0 
                  ? "bg-gray-800 text-white" 
                  : "text-gray-400 hover:bg-gray-800 hover:text-gray-200"
              }`}
            >
              <span className="text-lg">{item.icon}</span>
              {!collapsed && (
                <>
                  <span className="flex-1 text-left text-sm">{item.label}</span>
                  {item.badge && (
                    <span className="text-xs px-2 py-0.5 bg-gray-700 rounded-full">
                      {item.badge}
                    </span>
                  )}
                </>
              )}
            </button>
          ))}
        </div>
        
        <div className="space-y-2">
          {!collapsed && (
            <div className="text-xs uppercase tracking-wider text-gray-500 px-3 mb-3">
              Recent
            </div>
          )}
          {[
            "Consciousness Theory",
            "Emergence Patterns",
            "Collective Intelligence"
          ].map((label, i) => (
            <button
              key={i}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-gray-400 hover:bg-gray-800 hover:text-gray-200 transition-all"
            >
              <span className="text-lg">▣</span>
              {!collapsed && <span className="flex-1 text-left text-sm">{label}</span>}
            </button>
          ))}
        </div>
      </nav>
      
      <div className="p-4 border-t border-gray-700">
        <div className={`flex items-center gap-3 ${collapsed ? "justify-center" : ""}`}>
          <div className="w-10 h-10 bg-gray-800 rounded-full flex items-center justify-center text-lg">
            👤
          </div>
          {!collapsed && (
            <div className="flex-1">
              <div className="text-sm text-white">Explorer</div>
              <div className="text-xs text-gray-400">Online • 0.87 resonance</div>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
};
