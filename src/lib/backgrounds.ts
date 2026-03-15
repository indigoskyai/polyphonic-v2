export interface BackgroundOption {
  id: string;
  label: string;
  css: string | null;
  isImage?: boolean;
}

export const BACKGROUND_OPTIONS: BackgroundOption[] = [
  { id: "none", label: "None", css: null },
  { id: "wallpaper", label: "Observatory", css: "url('/images/landing-bg.png')", isImage: true },
  { id: "gradient-sunset", label: "Sunset Glow", css: "linear-gradient(135deg, #2d1b3d 0%, #4a2040 25%, #6b3a5c 50%, #d4847c 75%, #e8b89d 100%)" },
  { id: "gradient-dawn", label: "Golden Dawn", css: "linear-gradient(135deg, #1a1520 0%, #3d2232 30%, #8b4d5e 60%, #d4976a 85%, #e8c49d 100%)" },
  { id: "gradient-lavender", label: "Lavender Mist", css: "linear-gradient(135deg, #1a1525 0%, #2d1f45 30%, #5e3d7a 55%, #9b6b9e 80%, #d4a5c7 100%)" },
  { id: "gradient-ember", label: "Ember", css: "linear-gradient(135deg, #1a1210 0%, #3d2015 30%, #7a3a20 55%, #c46a3a 80%, #e8a060 100%)" },
  { id: "gradient-dusk", label: "Twilight Dusk", css: "linear-gradient(135deg, #0f0f2d 0%, #1a1545 30%, #3d2060 55%, #7a4080 80%, #c47aaa 100%)" },
  
  { id: "wallpaper-campfire", label: "Campfire", css: "url('/images/bg-campfire.png')", isImage: true },
  { id: "wallpaper-summit", label: "Summit", css: "url('/images/bg-summit.png')", isImage: true },
  { id: "wallpaper-stargazer", label: "Stargazer", css: "url('/images/bg-stargazer.png')", isImage: true },
  { id: "wallpaper-apothecary", label: "Apothecary", css: "url('/images/bg-apothecary.png')", isImage: true },
];

export function getBackgroundStyle(optionId: string | undefined): React.CSSProperties | null {
  const id = optionId || localStorage.getItem("polyphonic_bg") || "wallpaper";
  const option = BACKGROUND_OPTIONS.find((o) => o.id === id);
  if (!option || !option.css) return null;

  if (option.isImage) {
    return {
      backgroundImage: option.css,
      backgroundSize: "cover",
      backgroundPosition: "center 35%",
      backgroundRepeat: "no-repeat",
    };
  }

  return { background: option.css };
}
