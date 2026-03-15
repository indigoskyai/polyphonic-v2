export function hasCustomBackground(backgroundStyle?: string | null): boolean {
  return false;
}

export const GLASS_STYLE: React.CSSProperties = {
  background: "rgba(255, 255, 255, 0.06)",
  backdropFilter: "blur(24px) saturate(1.4)",
  WebkitBackdropFilter: "blur(24px) saturate(1.4)",
  border: "1px solid rgba(255, 255, 255, 0.1)",
  boxShadow: "0 8px 40px rgba(0, 0, 0, 0.35), inset 0 1px 0 rgba(255,255,255,0.06)",
};

export const GLASS_DROPDOWN_STYLE: React.CSSProperties = {
  background: "rgba(255, 255, 255, 0.08)",
  backdropFilter: "blur(24px) saturate(1.4)",
  WebkitBackdropFilter: "blur(24px) saturate(1.4)",
  border: "1px solid rgba(255, 255, 255, 0.1)",
  boxShadow: "0 8px 32px rgba(0, 0, 0, 0.4)",
};

// Centralized glass interaction colors for internal elements
export const GLASS_HOVER = "rgba(255, 255, 255, 0.06)";
export const GLASS_ACTIVE = "rgba(255, 255, 255, 0.1)";
export const GLASS_BORDER = "rgba(255, 255, 255, 0.08)";

// Glass-aware text/icon palette
export const GLASS_ICON = "rgba(255, 255, 255, 0.5)";
export const GLASS_ICON_HOVER = "rgba(255, 255, 255, 0.85)";
export const GLASS_LABEL = "rgba(255, 255, 255, 0.45)";
export const GLASS_TEXT = "rgba(255, 255, 255, 0.9)";
export const GLASS_MUTED = "rgba(255, 255, 255, 0.4)";
export const GLASS_INPUT_BG = "rgba(255, 255, 255, 0.06)";
export const GLASS_INPUT_BORDER = "rgba(255, 255, 255, 0.1)";
export const GLASS_DIVIDER = "rgba(255, 255, 255, 0.08)";
export const GLASS_ACTIVE_BORDER = "rgba(255, 255, 255, 0.25)";

// Focus state constants for premium input container
export const GLASS_INPUT_FOCUS_BORDER = "rgba(255, 255, 255, 0.2)";
export const GLASS_INPUT_FOCUS_SHADOW = "0 20px 60px rgba(0, 0, 0, 0.45), 0 0 0 1px rgba(255, 255, 255, 0.08), inset 0 1px 2px rgba(255, 255, 255, 0.1)";

// Premium glassmorphic toggle button styles
export const GLASS_BUTTON_INACTIVE: React.CSSProperties = {
  background: "rgba(255, 255, 255, 0.04)",
  backdropFilter: "blur(8px)",
  WebkitBackdropFilter: "blur(8px)",
  border: "1px solid rgba(255, 255, 255, 0.06)",
  boxShadow: "inset 0 1px 0 rgba(255, 255, 255, 0.04)",
  transition: "all 200ms ease",
};

export const GLASS_BUTTON_IMAGE_GEN: React.CSSProperties = {
  background: "rgba(180, 140, 220, 0.35)",
  backdropFilter: "blur(12px) saturate(1.5)",
  WebkitBackdropFilter: "blur(12px) saturate(1.5)",
  border: "1px solid rgba(200, 170, 240, 0.3)",
  boxShadow: "0 0 16px rgba(180, 140, 220, 0.3), 0 4px 12px rgba(0, 0, 0, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.2)",
  transition: "all 200ms ease",
};

export const GLASS_BUTTON_WEB_SEARCH: React.CSSProperties = {
  background: "rgba(130, 200, 210, 0.35)",
  backdropFilter: "blur(12px) saturate(1.5)",
  WebkitBackdropFilter: "blur(12px) saturate(1.5)",
  border: "1px solid rgba(160, 220, 230, 0.3)",
  boxShadow: "0 0 16px rgba(130, 200, 210, 0.3), 0 4px 12px rgba(0, 0, 0, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.2)",
  transition: "all 200ms ease",
};

// Hover-intensified versions
export const GLASS_BUTTON_IMAGE_GEN_HOVER: React.CSSProperties = {
  background: "rgba(180, 140, 220, 0.45)",
  boxShadow: "0 0 24px rgba(180, 140, 220, 0.45), 0 6px 16px rgba(0, 0, 0, 0.25), inset 0 1px 0 rgba(255, 255, 255, 0.25)",
  border: "1px solid rgba(200, 170, 240, 0.4)",
  transform: "scale(1.05)",
};

export const GLASS_BUTTON_WEB_SEARCH_HOVER: React.CSSProperties = {
  background: "rgba(130, 200, 210, 0.45)",
  boxShadow: "0 0 24px rgba(130, 200, 210, 0.45), 0 6px 16px rgba(0, 0, 0, 0.25), inset 0 1px 0 rgba(255, 255, 255, 0.25)",
  border: "1px solid rgba(160, 220, 230, 0.4)",
  transform: "scale(1.05)",
};
