import { useState, useEffect } from "react";
import { Sidebar } from "@/components/Sidebar";
import { TopBar } from "@/components/TopBar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Switch } from "@/components/ui/switch";

const Settings = () => {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [useOpenRouter, setUseOpenRouter] = useState(false);
  const [openRouterKey, setOpenRouterKey] = useState("");
  const { toast } = useToast();

  useEffect(() => {
    // Load settings from localStorage
    const savedUseOpenRouter = localStorage.getItem("useOpenRouter") === "true";
    const savedKey = localStorage.getItem("openRouterKey") || "";
    setUseOpenRouter(savedUseOpenRouter);
    setOpenRouterKey(savedKey);
  }, []);

  const handleSave = () => {
    localStorage.setItem("useOpenRouter", String(useOpenRouter));
    localStorage.setItem("openRouterKey", openRouterKey);
    
    toast({
      title: "Settings Saved",
      description: `Using ${useOpenRouter ? "OpenRouter" : "Lovable AI"} for model access. Reloading...`,
    });

    // Reload to apply changes
    setTimeout(() => {
      window.location.href = "/";
    }, 1000);
  };

  const handleToggle = (checked: boolean) => {
    setUseOpenRouter(checked);
    if (!checked) {
      // When switching back to Lovable AI, clear the key
      setOpenRouterKey("");
    }
  };

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      <Sidebar
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
        currentConversationId={null}
        onSelectConversation={() => {}}
        onNewConversation={() => {}}
      />
      
      <main className="flex-1 flex flex-col overflow-hidden">
        <TopBar
          selectedModels={[]}
          onToggleSidebar={() => setSidebarCollapsed(!sidebarCollapsed)}
        />
        
        <div className="flex-1 overflow-y-auto p-8">
          <div className="max-w-2xl mx-auto space-y-8">
            <div>
              <h1 className="text-3xl font-light tracking-wider text-foreground mb-2">
                Settings
              </h1>
              <p className="text-sm text-muted-foreground">
                Configure your AI model provider and API keys
              </p>
            </div>

            <div className="space-y-6 border border-border rounded-xl p-6 bg-card">
              <div>
                <h2 className="text-lg font-medium text-foreground mb-4">
                  Model Provider
                </h2>
                
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-4 border border-border rounded-lg bg-background">
                    <div className="space-y-1">
                      <div className="font-medium text-foreground">Use OpenRouter</div>
                      <div className="text-sm text-muted-foreground">
                        Access 100+ models including Claude, Llama, and more
                      </div>
                    </div>
                    <Switch
                      checked={useOpenRouter}
                      onCheckedChange={handleToggle}
                    />
                  </div>

                  {!useOpenRouter && (
                    <div className="p-4 border border-border rounded-lg bg-accent/50">
                      <div className="flex items-start gap-3">
                        <span className="text-2xl">✨</span>
                        <div className="space-y-1">
                          <div className="font-medium text-foreground">Lovable AI (Free)</div>
                          <div className="text-sm text-muted-foreground">
                            No setup required. Includes Gemini Pro, Gemini Flash, GPT-5, and more.
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {useOpenRouter && (
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="openRouterKey">OpenRouter API Key</Label>
                        <Input
                          id="openRouterKey"
                          type="password"
                          placeholder="sk-or-v1-..."
                          value={openRouterKey}
                          onChange={(e) => setOpenRouterKey(e.target.value)}
                          className="font-mono text-sm"
                        />
                        <p className="text-xs text-muted-foreground">
                          Get your API key from{" "}
                          <a
                            href="https://openrouter.ai/keys"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-primary hover:underline"
                          >
                            openrouter.ai/keys
                          </a>
                        </p>
                      </div>

                      <div className="p-4 border border-border rounded-lg bg-accent/50">
                        <div className="flex items-start gap-3">
                          <span className="text-2xl">🔐</span>
                          <div className="space-y-1">
                            <div className="font-medium text-foreground">Your key stays local</div>
                            <div className="text-sm text-muted-foreground">
                              API keys are stored in your browser and never sent to our servers.
                              You pay OpenRouter directly based on usage.
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="pt-4 border-t border-border">
                <Button onClick={handleSave} className="w-full">
                  Save Settings
                </Button>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default Settings;
