export interface BackgroundOption {
  id: string;
  label: string;
  css: string | null;
  isImage?: boolean;
}

export const BACKGROUND_OPTIONS: BackgroundOption[] = [
  { id: "none", label: "None", css: null },
];

export function getBackgroundStyle(optionId: string | undefined): React.CSSProperties | null {
  return null;
}
