import { useEffect, useState } from 'react';
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useAuthStore } from "@/stores/authStore";
import { useSettingsStore } from "@/stores/settingsStore";
import LoginPage from "./pages/LoginPage";
import SignupPage from "./pages/SignupPage";
import ChatView from "./pages/ChatView";
import DashboardView from "./pages/DashboardView";
import MemoryView from "./pages/MemoryView";
import MindView from "./pages/MindView";
import ImportView from "./pages/ImportView";
import ProfileView from "./pages/ProfileView";
import ProfileIdentityView from "./pages/ProfileIdentityView";
import ProfileSkillsView from "./pages/ProfileSkillsView";
import ProfileRevisionsView from "./pages/ProfileRevisionsView";
import ProfileScheduleView from "./pages/ProfileScheduleView";
import GroupSession from "./pages/GroupSession";
import CheckpointsView from "./pages/CheckpointsView";
import WorkspaceView from "./pages/WorkspaceView";
import AgentsList from "./pages/settings/AgentsList";
import AgentDetail from "./pages/settings/AgentDetail";
import SettingsPlaceholder from "./pages/settings/SettingsPlaceholder";
import GeneralSettings from "./pages/settings/GeneralSettings";
import ModelsSettings from "./pages/settings/ModelsSettings";
import AppearanceSettings from "./pages/settings/AppearanceSettings";
import AccountSettings from "./pages/settings/AccountSettings";
import LocalRuntimeSettings from "./pages/settings/LocalRuntimeSettings";
import Onboarding from "./pages/Onboarding";
import MobilePreview from "./pages/MobilePreview";
import { isFirstRun } from "./lib/firstRun";
import { useLocation, useNavigate } from "react-router-dom";
import Rail from "./components/Rail";
import Sidebar from "./components/Sidebar";
import Clockbar from "./components/Clockbar";
import CommandPalette from "./components/palette/CommandPalette";
import ImportProgressBanner from "./components/ImportProgressBanner";
import { useDrawerStore } from "./stores/drawerStore";
import { useNotificationStore } from "./stores/notificationStore";
import { Drawer, DrawerHeader, DrawerTitle, DrawerEscChip, DrawerCloseBtn, DrawerBody, DrawerSection } from "./components/ui/luca";
import NotificationsDrawer from "./components/drawers/NotificationsDrawer";
import ActivityTimelineDrawer from "./components/drawers/ActivityTimelineDrawer";
import ThreadDetailDrawer from "./components/drawers/ThreadDetailDrawer";
import ObserverDrawer from "./components/drawers/ObserverDrawer";
import SubAgentOverlay from "./components/subagents/SubAgentOverlay";
import UndoToast from "./components/subagents/UndoToast";
import { useSubagentRealtime } from "./hooks/useSubagentRealtime";
import ConnectionBanner from "./components/states/ConnectionBanner";
import PermissionModal from "./components/permissions/PermissionModal";
import CanvasPanel from "./components/canvas/CanvasPanel";

const queryClient = new QueryClient();

function AuthInit({ children }: { children: React.ReactNode }) {
  const initialize = useAuthStore((s) => s.initialize);
  useEffect(() => {
    const unsub = initialize();
    return unsub;
  }, [initialize]);
  return <>{children}</>;
}

function FirstRunGate({ children }: { children: React.ReactNode }) {
  const user = useAuthStore((s) => s.user);
  const location = useLocation();
  const navigate = useNavigate();
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    if (!user) { setChecked(true); return; }
    if (location.pathname === '/onboarding') { setChecked(true); return; }
    // Force re-entry via ?onboarding=1 (for QA)
    if (location.search.includes('onboarding=1')) {
      navigate('/onboarding', { replace: true });
      return;
    }
    let cancelled = false;
    isFirstRun(user.id).then((first) => {
      if (cancelled) return;
      if (first) {
        navigate('/onboarding', { replace: true });
      }
      setChecked(true);
    }).catch(() => setChecked(true));
    return () => { cancelled = true; };
  }, [user?.id, location.pathname, location.search, navigate]);

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
  const loadNotifications = useNotificationStore((s) => s.load);
  const subscribeNotifications = useNotificationStore((s) => s.subscribe);

  useEffect(() => {
    if (user) loadSettings(user.id);
  }, [user]);

  useEffect(() => {
    if (!user) return;
    loadNotifications(user.id);
    const unsub = subscribeNotifications(user.id);
    return unsub;
  }, [user, loadNotifications, subscribeNotifications]);

  useSubagentRealtime();

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
          boxShadow: 'var(--shadow-panel), var(--shadow-inset-highlight)',
        }}
      >
        <ConnectionBanner />
        <ImportProgressBanner />
        {children}
        {clockbarVisible && <Clockbar />}
      </div>
      <CommandPalette />
      <DrawerRouter />
      <SubAgentOverlay />
      <UndoToast />
      <PermissionModal />
    </div>
  );
}

function DrawerRouter() {
  const active = useDrawerStore((s) => s.active);
  const close = useDrawerStore((s) => s.close);
  const open = active !== null;

  const label =
    active === 'notifications' ? 'Activity'
    : active === 'activity-timeline' ? 'Activity timeline'
    : active === 'thread-detail' ? 'Thread detail'
    : active === 'memory-detail' ? 'Memory detail'
    : active === 'agent-inspector' ? 'Agent inspector'
    : active === 'observer' ? 'Observer'
    : '';

  return (
    <Drawer open={open} onClose={close} ariaLabel={label || 'Drawer'}>
      {active === 'notifications' && <NotificationsDrawer />}
      {active === 'activity-timeline' && <ActivityTimelineDrawer />}
      {active === 'thread-detail' && <ThreadDetailDrawer />}
      {active === 'observer' && <ObserverDrawer />}
      {active !== null && active !== 'notifications' && active !== 'activity-timeline' && active !== 'thread-detail' && active !== 'observer' && (
        <>
          <DrawerHeader>
            <DrawerTitle>{label}</DrawerTitle>
            <DrawerEscChip />
            <DrawerCloseBtn onClick={close} />
          </DrawerHeader>
          <DrawerBody>
            <DrawerSection>
              <p style={{ color: 'var(--text-ghost)', fontSize: 13, lineHeight: 1.6 }}>
                Content arrives in a later phase.
              </p>
            </DrawerSection>
          </DrawerBody>
        </>
      )}
    </Drawer>
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
          <FirstRunGate>
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
            <Route path="/profile/identity" element={<ProtectedRoute><AppShell><ProfileIdentityView /></AppShell></ProtectedRoute>} />
            <Route path="/profile/skills" element={<ProtectedRoute><AppShell><ProfileSkillsView /></AppShell></ProtectedRoute>} />
            <Route path="/profile/revisions" element={<ProtectedRoute><AppShell><ProfileRevisionsView /></AppShell></ProtectedRoute>} />
            <Route path="/profile/schedule" element={<ProtectedRoute><AppShell><ProfileScheduleView /></AppShell></ProtectedRoute>} />
            <Route path="/group" element={<ProtectedRoute><AppShell><GroupSession /></AppShell></ProtectedRoute>} />
            <Route path="/checkpoints" element={<ProtectedRoute><AppShell><CheckpointsView /></AppShell></ProtectedRoute>} />
            <Route path="/workspace" element={<ProtectedRoute><AppShell><WorkspaceView /></AppShell></ProtectedRoute>} />
            <Route path="/canvas/:artifactId" element={<ProtectedRoute><AppShell><CanvasPanel /></AppShell></ProtectedRoute>} />
            <Route path="/settings" element={<Navigate to="/settings/agents" replace />} />
            <Route path="/settings/agents" element={<ProtectedRoute><AppShell><AgentsList /></AppShell></ProtectedRoute>} />
            <Route path="/settings/agents/:id" element={<ProtectedRoute><AppShell><AgentDetail /></AppShell></ProtectedRoute>} />
            <Route path="/settings/general" element={<ProtectedRoute><AppShell><GeneralSettings /></AppShell></ProtectedRoute>} />
            <Route path="/settings/models" element={<ProtectedRoute><AppShell><ModelsSettings /></AppShell></ProtectedRoute>} />
            <Route path="/settings/appearance" element={<ProtectedRoute><AppShell><AppearanceSettings /></AppShell></ProtectedRoute>} />
            <Route path="/settings/skills" element={<ProtectedRoute><AppShell><ProfileSkillsView /></AppShell></ProtectedRoute>} />
            <Route path="/settings/routines" element={<ProtectedRoute><AppShell><ProfileScheduleView /></AppShell></ProtectedRoute>} />
            <Route path="/settings/voice" element={<ProtectedRoute><AppShell><SettingsPlaceholder eyebrow="§ 09 / VOICE & SECURITY" title="Voice & security" description="Voice identity, wake phrase, biometric unlock, and session security." /></AppShell></ProtectedRoute>} />
            <Route path="/settings/local-runtime" element={<ProtectedRoute><AppShell><LocalRuntimeSettings /></AppShell></ProtectedRoute>} />
            <Route path="/settings/portability" element={<ProtectedRoute><AppShell><ImportView /></AppShell></ProtectedRoute>} />
            <Route path="/settings/account" element={<ProtectedRoute><AppShell><AccountSettings /></AppShell></ProtectedRoute>} />
            <Route path="/onboarding" element={<ProtectedRoute><Onboarding /></ProtectedRoute>} />
            <Route path="/_mobile" element={<MobilePreview />} />
            <Route path="/dashboard" element={<Navigate to="/mind" replace />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
          </FirstRunGate>
        </AuthInit>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
