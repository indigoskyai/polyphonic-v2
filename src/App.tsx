import { lazy, Suspense, useEffect, useState } from 'react';
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useAuthStore } from "@/stores/authStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { isFirstRun } from "./lib/firstRun";
import { useLocation, useNavigate } from "react-router-dom";
import Rail from "./components/Rail";
import Sidebar from "./components/Sidebar";
// NavColumn (the bacedc3 unified column) is preserved at git tag
// `pre-rail-rewrite` and the file still lives in the tree for reference,
// but is no longer wired in. Rail + Sidebar is the active layout.
import Clockbar from "./components/Clockbar";
import MobileAppBar from "./components/mobile/MobileAppBar";
import MobileNavDrawer from "./components/mobile/MobileNavDrawer";
import CommandPalette from "./components/palette/CommandPalette";
import ImportProgressBanner from "./components/ImportProgressBanner";
import { useDrawerStore } from "./stores/drawerStore";
import { useNotificationStore } from "./stores/notificationStore";
import { prefetchCoreSettingsRoutes } from "./lib/routePrefetch";
import { Drawer, DrawerHeader, DrawerTitle, DrawerEscChip, DrawerCloseBtn, DrawerBody, DrawerSection } from "./components/ui/luca";
import NotificationsDrawer from "./components/drawers/NotificationsDrawer";
import ActivityTimelineDrawer from "./components/drawers/ActivityTimelineDrawer";
import ThreadDetailDrawer from "./components/drawers/ThreadDetailDrawer";
import MemoryDetailDrawer from "./components/drawers/MemoryDetailDrawer";
import ObserverDrawer from "./components/drawers/ObserverDrawer";
import AgentDialogueDrawer from "./components/drawers/AgentDialogueDrawer";
import SubAgentOverlay from "./components/subagents/SubAgentOverlay";
import UndoToast from "./components/subagents/UndoToast";
import { useSubagentRealtime } from "./hooks/useSubagentRealtime";
import ConnectionBanner from "./components/states/ConnectionBanner";
import PermissionModal from "./components/permissions/PermissionModal";
import { useIsMobile } from "./hooks/use-mobile";

const queryClient = new QueryClient();

const LandingPage = lazy(() => import("./pages/LandingPage"));
const LoginPage = lazy(() => import("./pages/LoginPage"));
const SignupPage = lazy(() => import("./pages/SignupPage"));
const ResetPasswordPage = lazy(() => import("./pages/ResetPasswordPage"));
const OpenRouterCallback = lazy(() => import("./pages/OpenRouterCallback"));
const PrivacyPage = lazy(() => import("./pages/PrivacyPage"));
const TermsPage = lazy(() => import("./pages/TermsPage"));
const ChatView = lazy(() => import("./pages/ChatView"));
const MemoryView = lazy(() => import("./pages/MemoryView"));
const MindView = lazy(() => import("./pages/MindView"));
const JournalView = lazy(() => import("./pages/JournalView"));
const ImportView = lazy(() => import("./pages/ImportView"));
const ProjectsView = lazy(() => import("./pages/ProjectsView"));
const ProfileView = lazy(() => import("./pages/ProfileView"));
const ProfileIdentityView = lazy(() => import("./pages/ProfileIdentityView"));
const ProfileSkillsView = lazy(() => import("./pages/ProfileSkillsView"));
const ProfileRevisionsView = lazy(() => import("./pages/ProfileRevisionsView"));
const ProfileScheduleView = lazy(() => import("./pages/ProfileScheduleView"));
const GroupSession = lazy(() => import("./pages/GroupSession"));
const CheckpointsView = lazy(() => import("./pages/CheckpointsView"));
const WorkspaceView = lazy(() => import("./pages/WorkspaceView"));
const Onboarding = lazy(() => import("./pages/Onboarding"));
const MobilePreview = lazy(() => import("./pages/MobilePreview"));
const StyleGallery = lazy(() => import("./pages/StyleGallery"));
const ComposerGallery = lazy(() => import("./pages/ComposerGallery"));
const PublicProfileView = lazy(() => import("./pages/PublicProfileView"));
const AgentsList = lazy(() => import("./pages/settings/AgentsList"));
const AgentDetail = lazy(() => import("./pages/settings/AgentDetail"));
const SettingsPlaceholder = lazy(() => import("./pages/settings/SettingsPlaceholder"));
const GeneralSettings = lazy(() => import("./pages/settings/GeneralSettings"));
const ModelsSettings = lazy(() => import("./pages/settings/ModelsSettings"));
const AppearanceSettings = lazy(() => import("./pages/settings/AppearanceSettings"));
const AccountSettings = lazy(() => import("./pages/settings/AccountSettings"));
const LocalRuntimeSettings = lazy(() => import("./pages/settings/LocalRuntimeSettings"));
const PublicProfileSettings = lazy(() => import("./pages/settings/PublicProfileSettings"));
const CanvasPanel = lazy(() => import("./components/canvas/CanvasPanel"));

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
    const isPublicRoute =
      location.pathname.startsWith('/auth/')
      || location.pathname === '/reset-password'
      || location.pathname === '/privacy'
      || location.pathname === '/terms'
      || location.pathname.startsWith('/u/')
      || location.pathname.startsWith('/@')
      || location.pathname.startsWith('/_mockups');

    if (isPublicRoute) { setChecked(true); return; }
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

function RouteFallback() {
  return (
    <div
      className="flex h-screen items-center justify-center"
      style={{ background: 'var(--bg-deep)', color: 'var(--text-tertiary)' }}
      aria-label="Loading page"
    >
      Loading...
    </div>
  );
}

function PanelRouteFallback() {
  return (
    <div
      className="route-panel-fallback flex-1 min-h-0 min-w-0"
      aria-label="Loading section"
      role="status"
    >
      <div className="route-panel-fallback__line" />
      <div className="route-panel-fallback__line route-panel-fallback__line--short" />
    </div>
  );
}

function AppShell({ children }: { children: React.ReactNode }) {
  const user = useAuthStore((s) => s.user);
  const location = useLocation();
  const loadSettings = useSettingsStore((s) => s.loadSettings);
  const clockbarVisible = useSettingsStore((s) => s.clockbar_visible);
  const loadNotifications = useNotificationStore((s) => s.load);
  const subscribeNotifications = useNotificationStore((s) => s.subscribe);
  const isMobile = useIsMobile();

  useEffect(() => {
    if (user) loadSettings(user.id);
  }, [user]);

  useEffect(() => {
    if (!user) return;
    loadNotifications(user.id);
    const unsub = subscribeNotifications(user.id);
    return unsub;
  }, [user, loadNotifications, subscribeNotifications]);

  useEffect(() => {
    if (location.pathname.startsWith('/settings')) {
      prefetchCoreSettingsRoutes();
    }
  }, [location.pathname]);

  useSubagentRealtime();

  return (
    <div
      className="app-shell h-screen flex overflow-hidden"
      data-mobile={isMobile ? 'true' : undefined}
      style={{ background: 'var(--floor)' }}
    >
      {isMobile ? <MobileAppBar /> : <><Rail /><Sidebar /></>}
      <div
        className="app-main flex-1 flex flex-col min-w-0 min-h-0 overflow-hidden"
        style={{
          background: 'var(--canvas)',
          border: isMobile ? 'none' : '1px solid var(--border-faint)',
          borderRadius: isMobile ? 0 : 'var(--radius-inset)',
          boxShadow: isMobile ? 'none' : 'var(--shadow-panel), var(--shadow-inset-highlight)',
        }}
      >
        <ConnectionBanner />
        <ImportProgressBanner />
        <Suspense fallback={<PanelRouteFallback />}>
          <div
            key={`${location.pathname}${location.search}`}
            className="route-transition-stage flex-1 min-h-0 min-w-0 flex flex-col"
          >
            {children}
          </div>
        </Suspense>
        {clockbarVisible && !isMobile && <Clockbar />}
      </div>
      {isMobile && <MobileNavDrawer />}
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
  const isMobile = useIsMobile();
  const open = active !== null;

  const label =
    active === 'notifications' ? 'Activity'
    : active === 'activity-timeline' ? 'Activity timeline'
    : active === 'thread-detail' ? 'Thread detail'
    : active === 'memory-detail' ? 'Memory detail'
    : active === 'agent-inspector' ? 'Agent inspector'
    : active === 'agent-dialogue' ? 'Agent dialogue'
    : active === 'observer' ? 'Observer'
    : '';

  // Memory detail floats over the page (no backdrop blur) so the graph
  // behind it remains visible. All other drawers keep the backdrop.
  const showBackdrop = active !== 'memory-detail' || isMobile;
  const drawerWidth = active === 'memory-detail' && !isMobile ? 320 : undefined;

  return (
    <Drawer open={open} onClose={close} ariaLabel={label || 'Drawer'} showBackdrop={showBackdrop} width={drawerWidth}>
      {active === 'notifications' && <NotificationsDrawer />}
      {active === 'activity-timeline' && <ActivityTimelineDrawer />}
      {active === 'thread-detail' && <ThreadDetailDrawer />}
      {active === 'memory-detail' && <MemoryDetailDrawer />}
      {active === 'observer' && <ObserverDrawer />}
      {active === 'agent-dialogue' && <AgentDialogueDrawer />}
      {active !== null
        && active !== 'notifications'
        && active !== 'activity-timeline'
        && active !== 'thread-detail'
        && active !== 'memory-detail'
        && active !== 'observer'
        && active !== 'agent-dialogue' && (
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
  // Authenticated users go straight to chat. Unauthenticated visitors land
  // on the public landing surface (composer + auth states), not the bare
  // login form.
  return user ? <Navigate to="/chat" replace /> : <LandingPage initialMode="idle" />;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <AuthInit>
          <FirstRunGate>
            <Suspense fallback={<RouteFallback />}>
              <Routes>
                <Route path="/" element={<RootRedirect />} />
                <Route path="/auth/login" element={<LandingPage initialMode="signin" />} />
                <Route path="/auth/signup" element={<LandingPage initialMode="signup" />} />
                <Route path="/auth/legacy-login" element={<LoginPage />} />
                <Route path="/auth/legacy-signup" element={<SignupPage />} />
                <Route path="/reset-password" element={<ResetPasswordPage />} />
                <Route path="/auth/openrouter/callback" element={<OpenRouterCallback />} />
                <Route path="/privacy" element={<PrivacyPage />} />
                <Route path="/terms" element={<TermsPage />} />
                {/* Public profile (no app shell, no auth required) */}
                <Route path="/u/:handle" element={<PublicProfileView mode="view" />} />
                <Route path="/u/:handle/edit" element={<ProtectedRoute><PublicProfileView mode="edit" /></ProtectedRoute>} />
                {/* Legacy/pretty @-prefixed URLs: redirect to /u/:handle since React Router v6 has issues parsing the @ prefix attached to a param. */}
                <Route path="/@:handle" element={<PublicProfileView mode="view" />} />
                <Route path="/@:handle/edit" element={<ProtectedRoute><PublicProfileView mode="edit" /></ProtectedRoute>} />
                <Route path="/settings/public-profile" element={<ProtectedRoute><AppShell><PublicProfileSettings /></AppShell></ProtectedRoute>} />
                <Route path="/chat" element={<ProtectedRoute><AppShell><ChatView /></AppShell></ProtectedRoute>} />
                <Route path="/chat/:threadId" element={<ProtectedRoute><AppShell><ChatView /></AppShell></ProtectedRoute>} />
                <Route path="/memory" element={<ProtectedRoute><AppShell><MemoryView /></AppShell></ProtectedRoute>} />
                <Route path="/mind" element={<ProtectedRoute><AppShell><MindView /></AppShell></ProtectedRoute>} />
                <Route path="/journal" element={<ProtectedRoute><AppShell><JournalView /></AppShell></ProtectedRoute>} />
                <Route path="/import" element={<ProtectedRoute><AppShell><ImportView /></AppShell></ProtectedRoute>} />
                <Route path="/projects" element={<ProtectedRoute><AppShell><ProjectsView /></AppShell></ProtectedRoute>} />
                <Route path="/projects/:projectId" element={<ProtectedRoute><AppShell><ProjectsView /></AppShell></ProtectedRoute>} />
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
                <Route path="/_mockups/styles" element={<StyleGallery />} />
                <Route path="/_mockups/composer" element={<ComposerGallery />} />
                <Route path="/dashboard" element={<Navigate to="/mind" replace />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </Suspense>
          </FirstRunGate>
        </AuthInit>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
