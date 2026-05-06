import * as React from "react";
import * as AvatarPrimitive from "@radix-ui/react-avatar";

import { cn } from "@/lib/utils";

const Avatar = React.forwardRef<
  React.ElementRef<typeof AvatarPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Root>
>(({ className, ...props }, ref) => (
  <AvatarPrimitive.Root
    ref={ref}
    className={cn("relative flex h-10 w-10 shrink-0 overflow-hidden rounded-full", className)}
    {...props}
  />
));
Avatar.displayName = AvatarPrimitive.Root.displayName;

// Wraps Radix's Image so it fades in on load and stays hidden until ready,
// avoiding a hard pop when the image arrives over the network.
const AvatarImage = React.forwardRef<
  React.ElementRef<typeof AvatarPrimitive.Image>,
  React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Image>
>(({ className, style, onLoadingStatusChange, ...props }, ref) => {
  const [status, setStatus] = React.useState<"idle" | "loading" | "loaded" | "error">("idle");
  return (
    <AvatarPrimitive.Image
      ref={ref}
      className={cn("aspect-square h-full w-full", className)}
      style={{
        opacity: status === "loaded" ? 1 : 0,
        transition: "opacity var(--dur-normal, 300ms) var(--ease-out, cubic-bezier(0.16,1,0.3,1))",
        ...style,
      }}
      onLoadingStatusChange={(s) => {
        setStatus(s);
        onLoadingStatusChange?.(s);
      }}
      {...props}
    />
  );
});
AvatarImage.displayName = AvatarPrimitive.Image.displayName;

const AvatarFallback = React.forwardRef<
  React.ElementRef<typeof AvatarPrimitive.Fallback>,
  React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Fallback>
>(({ className, ...props }, ref) => (
  <AvatarPrimitive.Fallback
    ref={ref}
    className={cn(
      "flex h-full w-full items-center justify-center rounded-full bg-muted text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground",
      className,
    )}
    {...props}
  />
));
AvatarFallback.displayName = AvatarPrimitive.Fallback.displayName;

// Helper for callers — derive 1–2 letter initials from a name or email handle.
export function avatarInitials(input?: string | null): string {
  if (!input) return "·";
  const trimmed = input.trim();
  if (!trimmed) return "·";
  const cleaned = trimmed.includes("@") ? trimmed.split("@")[0] : trimmed;
  const parts = cleaned.split(/[\s._-]+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return parts[0].slice(0, 2).toUpperCase();
}

export { Avatar, AvatarImage, AvatarFallback };
