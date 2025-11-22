import { useState } from "react";

interface ChatInputProps {
  onSend: (content: string) => void;
  disabled?: boolean;
}

export const ChatInput = ({ onSend, disabled = false }: ChatInputProps) => {
  const [input, setInput] = useState("");

  const handleSend = () => {
    if (input.trim()) {
      onSend(input);
      setInput("");
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="border-t border-gray-700 bg-gray-900 p-4">
      <div className="flex gap-3 items-end">
        <div className="flex-1 bg-gray-800 border border-gray-700 rounded-2xl px-4 py-3 focus-within:border-gray-600 focus-within:ring-1 focus-within:ring-gray-600 transition-all">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Ask the constellation..."
            className="w-full bg-transparent text-white placeholder-gray-500 resize-none outline-none text-sm leading-relaxed"
            rows={1}
            style={{
              minHeight: "24px",
              maxHeight: "120px"
            }}
          />
        </div>
        
        <button
          onClick={handleSend}
          disabled={!input.trim() || disabled}
          className="w-12 h-12 bg-gray-800 border border-gray-700 rounded-xl flex items-center justify-center text-gray-400 hover:bg-gray-700 hover:text-white hover:border-gray-600 transition-all duration-200 hover:scale-105 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
        >
          {disabled ? (
            <div className="w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
          ) : (
            <span className="text-xl">→</span>
          )}
        </button>
      </div>
    </div>
  );
};
