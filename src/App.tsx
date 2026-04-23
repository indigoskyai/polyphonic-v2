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
import MemoryView from "./pages/MemoryView";
import MindView from "./pages/MindView";
import ImportView from "./pages/ImportView";
import ProfileView from "./pages/ProfileView";
import SettingsModal from "./components/SettingsModal";
import Rail from "./components/Rail";
import Sidebar from "./components/Sidebar";
import Clockbar from "./components/Clockbar";
import CommandPalette from "./components/CommandPalette";
import ImportProgressBanner from "./components/ImportProgressBanner";

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
    <div
      className="h-screen flex overflow-hidden"
      style={{
        background: 'var(--floor)',
        padding: 'var(--inset-gap)',
        gap: 'var(--inset-gap)',
      }}
    >
      <Rail />
      <Sidebar />
      <div
        className="flex-1 flex flex-col min-w-0 min-h-0 overflow-hidden"
        style={{
          background: 'var(--canvas)',
          border: '1px solid var(--border-faint)',
          borderRadius: 'var(--radius-inset)',
          boxShadow: 'var(--shadow-panel)',
        }}
      >
        <ImportProgressBanner />
        {children}
        {clockbarVisible && <Clockbar />}
      </div>
      <SettingsModal open={settingsOpen} onClose={closeSettings} />
      <CommandPalette />
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
            <Route path="/memory" element={<ProtectedRoute><AppShell><MemoryView /></AppShell></ProtectedRoute>} />
            <Route path="/mind" element={<ProtectedRoute><AppShell><MindView /></AppShell></ProtectedRoute>} />
            <Route path="/import" element={<ProtectedRoute><AppShell><ImportView /></AppShell></ProtectedRoute>} />
            <Route path="/profile" element={<ProtectedRoute><AppShell><ProfileView /></AppShell></ProtectedRoute>} />
            <Route path="/dashboard" element={<Navigate to="/mind" replace />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </AuthInit>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
