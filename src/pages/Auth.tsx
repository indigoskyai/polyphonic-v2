import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";

type AuthMode = "login" | "signup" | "forgot";

const Auth = () => {
  const [mode, setMode] = useState<AuthMode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [loading, setLoading] = useState(false);
  const [exiting, setExiting] = useState(false);
  const { toast } = useToast();
  const navigate = useNavigate();
  const { user } = useAuth();

  useEffect(() => {
    if (user) {
      setExiting(true);
      setTimeout(() => navigate("/chat", { replace: true }), 300);
    }
  }, [user, navigate]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      toast({ title: "Login failed", description: error.message, variant: "destructive" });
    }
    // Navigation handled by useEffect when user state updates
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { display_name: displayName },
        emailRedirectTo: window.location.origin,
      },
    });
    setLoading(false);
    if (error) {
      toast({ title: "Signup failed", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Check your email", description: "We sent you a verification link." });
      setMode("login");
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth?mode=reset`,
    });
    setLoading(false);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Check your email", description: "Password reset link sent." });
      setMode("login");
    }
  };

  const inputStyle = {
    background: "rgba(255, 255, 255, 0.08)",
    border: "1px solid rgba(255, 255, 255, 0.12)",
    color: "#ececec",
    backdropFilter: "blur(4px)",
  };

  return (
    <div className={`relative flex min-h-screen items-center justify-center px-4 overflow-hidden ${exiting ? 'page-transition-exit' : 'page-transition-enter'}`} style={{ background: "var(--bg-void, #0a0a0a)" }}>

      {/* Floating glass card */}
      <div
        className="relative z-10 w-full max-w-sm space-y-8 p-8 rounded-2xl"
        style={{
          background: "rgba(20, 20, 30, 0.65)",
          backdropFilter: "blur(24px) saturate(1.4)",
          WebkitBackdropFilter: "blur(24px) saturate(1.4)",
          border: "1px solid rgba(255, 255, 255, 0.08)",
          boxShadow: "0 8px 48px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255,255,255,0.04) inset",
        }}
      >
        {/* Logo */}
        <div className="text-center">
          <div
            className="text-[28px] mb-2"
            style={{ color: "rgba(236, 236, 236, 0.9)", letterSpacing: "0.1em", fontWeight: 300 }}
          >
            ⟁
          </div>
          <h1
            style={{
              fontSize: "20px",
              fontWeight: 600,
              letterSpacing: "0.08em",
              color: "rgba(236, 236, 236, 0.95)",
              textTransform: "uppercase" as const,
            }}
          >
            Welcome
          </h1>
          <p style={{ fontSize: "13px", color: "rgba(180, 180, 200, 0.7)", marginTop: "8px" }}>
            {mode === "login" && "Sign in to continue"}
            {mode === "signup" && "Create your account"}
            {mode === "forgot" && "Reset your password"}
          </p>
        </div>

        <form
          onSubmit={mode === "login" ? handleLogin : mode === "signup" ? handleSignup : handleForgotPassword}
          className="space-y-4"
        >
          {mode === "signup" && (
            <div className="space-y-2">
              <label style={{ fontSize: "13px", fontWeight: 500, color: "rgba(180, 180, 200, 0.7)" }}>
                Display Name
              </label>
              <input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Your name"
                className="w-full h-10 px-4 rounded-lg outline-none text-sm transition-colors focus:ring-1 focus:ring-white/20"
                style={inputStyle}
              />
            </div>
          )}
          <div className="space-y-2">
            <label style={{ fontSize: "13px", fontWeight: 500, color: "rgba(180, 180, 200, 0.7)" }}>
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              className="w-full h-10 px-4 rounded-lg outline-none text-sm transition-colors focus:ring-1 focus:ring-white/20"
              style={inputStyle}
            />
          </div>
          {mode !== "forgot" && (
            <div className="space-y-2">
              <label style={{ fontSize: "13px", fontWeight: 500, color: "rgba(180, 180, 200, 0.7)" }}>
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                minLength={6}
                className="w-full h-10 px-4 rounded-lg outline-none text-sm transition-colors focus:ring-1 focus:ring-white/20"
                style={inputStyle}
              />
            </div>
          )}
          <button
            type="submit"
            disabled={loading}
            className="w-full h-10 rounded-lg text-sm font-medium transition-all duration-200"
            style={{
              background: loading
                ? "rgba(255, 255, 255, 0.1)"
                : "rgba(255, 255, 255, 0.15)",
              color: loading ? "rgba(180, 180, 200, 0.5)" : "rgba(236, 236, 236, 0.95)",
              cursor: loading ? "not-allowed" : "pointer",
              border: "1px solid rgba(255, 255, 255, 0.1)",
              backdropFilter: "blur(4px)",
            }}
            onMouseEnter={(e) => {
              if (!loading) e.currentTarget.style.background = "rgba(255, 255, 255, 0.22)";
            }}
            onMouseLeave={(e) => {
              if (!loading) e.currentTarget.style.background = "rgba(255, 255, 255, 0.15)";
            }}
          >
            {loading
              ? "..."
              : mode === "login"
              ? "Sign In"
              : mode === "signup"
              ? "Sign Up"
              : "Send Reset Link"}
          </button>
        </form>

        {/* Divider */}
        {mode !== "forgot" && (
          <>
            <div className="flex items-center gap-3">
              <div className="flex-1 h-px" style={{ background: "rgba(255, 255, 255, 0.08)" }} />
              <span style={{ fontSize: "12px", color: "rgba(180, 180, 200, 0.4)", textTransform: "uppercase" as const, letterSpacing: "0.1em" }}>or</span>
              <div className="flex-1 h-px" style={{ background: "rgba(255, 255, 255, 0.08)" }} />
            </div>

            <button
              type="button"
              onClick={async () => {
                const { error } = await supabase.auth.signInWithOAuth({
                  provider: "google",
                  options: { redirectTo: window.location.origin },
                });
                if (error) {
                  toast({ title: "Google sign-in failed", description: error.message, variant: "destructive" });
                }
              }}
              className="w-full h-10 rounded-lg text-sm font-medium transition-all duration-200 flex items-center justify-center gap-2"
              style={{
                background: "rgba(255, 255, 255, 0.08)",
                color: "rgba(236, 236, 236, 0.95)",
                border: "1px solid rgba(255, 255, 255, 0.1)",
                backdropFilter: "blur(4px)",
                cursor: "pointer",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(255, 255, 255, 0.15)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(255, 255, 255, 0.08)"; }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
              Continue with Google
            </button>

            <button
              type="button"
              onClick={async () => {
                const { error } = await supabase.auth.signInWithOAuth({
                  provider: "apple",
                  options: { redirectTo: window.location.origin },
                });
                if (error) {
                  toast({ title: "Apple sign-in failed", description: error.message, variant: "destructive" });
                }
              }}
              className="w-full h-10 rounded-lg text-sm font-medium transition-all duration-200 flex items-center justify-center gap-2"
              style={{
                background: "rgba(255, 255, 255, 0.08)",
                color: "rgba(236, 236, 236, 0.95)",
                border: "1px solid rgba(255, 255, 255, 0.1)",
                backdropFilter: "blur(4px)",
                cursor: "pointer",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(255, 255, 255, 0.15)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(255, 255, 255, 0.08)"; }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="rgba(236, 236, 236, 0.95)">
                <path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/>
              </svg>
              Continue with Apple
            </button>
          </>
        )}

        <div className="flex flex-col items-center gap-3">
          {mode === "login" && (
            <>
              <button
                onClick={() => setMode("forgot")}
                className="transition-colors"
                style={{ fontSize: "13px", color: "rgba(180, 180, 200, 0.5)" }}
                onMouseEnter={(e) => { e.currentTarget.style.color = "rgba(220, 220, 240, 0.8)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = "rgba(180, 180, 200, 0.5)"; }}
              >
                Forgot password?
              </button>
              <button
                onClick={() => setMode("signup")}
                className="transition-colors"
                style={{ fontSize: "13px", color: "rgba(180, 180, 200, 0.5)" }}
                onMouseEnter={(e) => { e.currentTarget.style.color = "rgba(220, 220, 240, 0.8)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = "rgba(180, 180, 200, 0.5)"; }}
              >
                Don't have an account? Sign up
              </button>
            </>
          )}
          {mode !== "login" && (
            <button
              onClick={() => setMode("login")}
              className="transition-colors"
              style={{ fontSize: "13px", color: "rgba(180, 180, 200, 0.5)" }}
              onMouseEnter={(e) => { e.currentTarget.style.color = "rgba(220, 220, 240, 0.8)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = "rgba(180, 180, 200, 0.5)"; }}
            >
              Back to sign in
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default Auth;
