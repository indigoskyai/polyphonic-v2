import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ScrollArea } from "@/components/ui/scroll-area";

interface Conversation {
  id: string;
  title: string;
  updated_at: string;
  created_at: string;
}

interface ConversationListProps {
  currentConversationId: string | null;
  onSelectConversation: (id: string) => void;
  onNewConversation: () => void;
}

export const ConversationList = ({ 
  currentConversationId, 
  onSelectConversation,
  onNewConversation 
}: ConversationListProps) => {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadConversations();
  }, [currentConversationId]);

  const loadConversations = async () => {
    const { data, error } = await supabase
      .from('conversations')
      .select('id, title, created_at, updated_at')
      .order('updated_at', { ascending: false });

    if (!error && data) {
      setConversations(data);
    }
    setLoading(false);
  };

  if (loading) {
    return (
      <div className="p-4 text-gray-500 text-sm">
        Loading conversations...
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b border-gray-700">
        <button
          onClick={onNewConversation}
          className="w-full py-2 px-4 bg-gray-800 hover:bg-gray-700 rounded-lg text-white text-sm font-medium transition-colors border border-gray-600"
        >
          + New Conversation
        </button>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-2 space-y-1">
          {conversations.map(conv => (
            <button
              key={conv.id}
              onClick={() => onSelectConversation(conv.id)}
              className={`w-full text-left p-3 rounded-lg transition-colors ${
                conv.id === currentConversationId
                  ? 'bg-gray-800 text-white border border-gray-600'
                  : 'text-gray-400 hover:bg-gray-800/50'
              }`}
            >
              <div className="font-medium truncate text-sm">{conv.title}</div>
              <div className="text-xs text-gray-500 mt-1">
                {new Date(conv.updated_at).toLocaleDateString()}
              </div>
            </button>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
};
