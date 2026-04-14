import { useEffect, useState } from 'react';
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useAuthStore } from "@/stores/authStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { useSettingsModalStore } from "@/stores/settingsModalStore";
import LoginPage from "./pages/LoginPage";
import SignupPage from "./pages/SignupPage";
import ChatView from "./pages/ChatView";
import DashboardView from "./pages/DashboardView";
import SettingsModal from "./components/SettingsModal";
import Rail from "./components/Rail";
import Clockbar from "./components/Clockbar";

const queryClient = new QueryClient();

function AuthInit({ children }: { children: React.ReactNode }) {
  const initialize = useAuthStore((s) => s.initialize);
  useEffect(() => {
    const unsub = initialize();
    return unsub;
  }, [initialize]);
  return <>{children}</>;
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuthStore();
  if (loading) return <div className="flex h-screen items-center justify-center" style={{ background: 'var(--bg-deep)', color: 'var(--text-tertiary)' }}>Loading...</div>;
  if (!user) return <Navigate to="/auth/login" replace />;
  return <>{children}</>;
}

function AppShell({ children }: { children: React.ReactNode }) {
  const user = useAuthStore((s) => s.user);
  const loadSettings = useSettingsStore((s) => s.loadSettings);
  const clockbarVisible = useSettingsStore((s) => s.clockbar_visible);
  const { open: settingsOpen, closeSettings } = useSettingsModalStore();

  useEffect(() => {
    if (user) loadSettings(user.id);
  }, [user]);

  return (
    <div className="flex h-screen" style={{ background: 'var(--bg-primary)' }}>
      <Rail />
      <div className="flex-1 flex flex-col min-w-0 min-h-0 overflow-hidden">
        {children}
        {clockbarVisible && <Clockbar />}
      </div>
      <SettingsModal open={settingsOpen} onClose={closeSettings} />
    </div>
  );
}

function RootRedirect() {
  const { user, loading } = useAuthStore();
  if (loading) return <div className="flex h-screen items-center justify-center" style={{ background: 'var(--bg-deep)', color: 'var(--text-tertiary)' }}>Loading...</div>;
  return <Navigate to={user ? "/chat" : "/auth/login"} replace />;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthInit>
          <Routes>
            <Route path="/" element={<RootRedirect />} />
            <Route path="/auth/login" element={<LoginPage />} />
            <Route path="/auth/signup" element={<SignupPage />} />
            <Route path="/chat" element={<ProtectedRoute><AppShell><ChatView /></AppShell></ProtectedRoute>} />
            <Route path="/chat/:threadId" element={<ProtectedRoute><AppShell><ChatView /></AppShell></ProtectedRoute>} />
            <Route path="/dashboard" element={<ProtectedRoute><AppShell><DashboardView /></AppShell></ProtectedRoute>} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </AuthInit>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
