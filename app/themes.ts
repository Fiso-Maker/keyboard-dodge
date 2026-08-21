export type ThemeId =
  | "polar-white"
  | "warm-white"
  | "mono-signal"
  | "signal-blue"
  | "amber-ops"
  | "ivory-lab";

export type ThemeMode = "light" | "dark";

export type ThemePalette = readonly [string, string, string, string, string];

export interface ThemeConfig {
  id: ThemeId;
  displayName: string;
  description: string;
  mode: ThemeMode;
  swatches: ThemePalette;
}

export const DEFAULT_THEME_ID: ThemeId = "polar-white";

export const THEMES = [
  {
    id: "polar-white",
    displayName: "Polar White",
    description: "차가운 백색 패널과 청색·시안 신호의 정밀 인터페이스",
    mode: "light",
    swatches: ["#F7FAFF", "#E7EEF6", "#102440", "#2563EB", "#23CFE5"],
  },
  {
    id: "warm-white",
    displayName: "Warm White",
    description: "따뜻한 종이색 위에 짙은 녹색과 산호색을 더한 편집형 화면",
    mode: "light",
    swatches: ["#FBF7EC", "#D6EFE8", "#073F38", "#0B7C6B", "#F25F58"],
  },
  {
    id: "mono-signal",
    displayName: "Mono Signal",
    description: "흑백 터미널에 형광 라임과 적색 경보를 집중한 고대비 화면",
    mode: "light",
    swatches: ["#F7F7F3", "#D8DAD2", "#111111", "#B8FF00", "#E51F2A"],
  },
  {
    id: "signal-blue",
    displayName: "Signal Blue",
    description: "심해 청색 바탕에 시안과 라임 신호가 빛나는 전술형 화면",
    mode: "dark",
    swatches: ["#031A2B", "#08283D", "#EAFBFF", "#00D2F2", "#B8F21A"],
  },
  {
    id: "amber-ops",
    displayName: "Amber Ops",
    description: "암갈색 콘솔에 호박색 조명과 적색 경보를 얹은 작전실 화면",
    mode: "dark",
    swatches: ["#100803", "#281208", "#FFE5AD", "#FF9C1A", "#FF5037"],
  },
  {
    id: "ivory-lab",
    displayName: "Ivory Lab",
    description: "아이보리 실험실 바탕에 네이비·블루·마젠타 신호를 조합한 화면",
    mode: "light",
    swatches: ["#F6F0E4", "#0B1833", "#315FF4", "#F1328D", "#2CCEC4"],
  },
] as const satisfies readonly ThemeConfig[];

const THEME_BY_ID = Object.fromEntries(
  THEMES.map((theme) => [theme.id, theme]),
) as Record<ThemeId, (typeof THEMES)[number]>;

export function getTheme(themeId: string | null | undefined): ThemeConfig {
  return THEME_BY_ID[themeId as ThemeId] ?? THEME_BY_ID[DEFAULT_THEME_ID];
}
