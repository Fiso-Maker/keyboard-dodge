import {
  useEffect,
  useRef,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { THEMES, type ThemeId } from "./themes";

interface ThemeSettingsProps {
  open: boolean;
  selectedThemeId: ThemeId;
  onSelect: (themeId: ThemeId) => void;
  onClose: () => void;
}

export function ThemeSettings({
  open,
  selectedThemeId,
  onSelect,
  onClose,
}: ThemeSettingsProps) {
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (open) closeButtonRef.current?.focus();
  }, [open]);

  if (!open) return null;

  const keepFocusInside = (event: ReactKeyboardEvent<HTMLElement>) => {
    if (event.code === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      onClose();
      return;
    }
    if (event.code !== "Tab") return;

    const controls = Array.from(
      dialogRef.current?.querySelectorAll<HTMLElement>(
        "button:not(:disabled), [href], [tabindex]:not([tabindex='-1'])",
      ) ?? [],
    );
    if (controls.length === 0) return;

    const first = controls[0];
    const last = controls[controls.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <div
      className="theme-dialog-backdrop"
      data-theme={selectedThemeId}
    >
      <dialog
        ref={dialogRef}
        className="theme-dialog"
        open
        aria-modal="true"
        aria-labelledby="theme-dialog-title"
        aria-describedby="theme-dialog-description"
        onKeyDown={keepFocusInside}
      >
        <header className="theme-dialog-head">
          <div>
            <p>DISPLAY CONFIGURATION / 06 PRESETS</p>
            <h2 id="theme-dialog-title">INTERFACE THEME</h2>
            <span id="theme-dialog-description">
              시안의 패널, 키보드, HUD 색과 재질을 함께 변경합니다.
            </span>
          </div>
          <button
            ref={closeButtonRef}
            className="theme-dialog-close"
            type="button"
            onClick={onClose}
            aria-label="테마 설정 닫기"
            title="닫기"
          >
            <span aria-hidden="true">×</span>
          </button>
        </header>

        <div className="theme-grid" aria-label="게임 테마 목록">
          {THEMES.map((theme, index) => {
            const selected = theme.id === selectedThemeId;
            const [previewLead, ...previewRest] = theme.displayName.split(" ");
            return (
              <button
                key={theme.id}
                type="button"
                className={`theme-option ${selected ? "is-selected" : ""}`}
                data-theme-id={theme.id}
                onClick={() => onSelect(theme.id)}
                aria-pressed={selected}
              >
                <span className="theme-option-preview" aria-hidden="true">
                  <span className="theme-option-preview-head">
                    <small>KEYBOARD//DODGE</small>
                    <i />
                  </span>
                  <span className="theme-option-preview-title">
                    <b>{previewLead}</b>
                    <b>{previewRest.join(" ")}</b>
                  </span>
                  <span className="theme-option-preview-board">
                    {(["Q", "W", "E", "R", "T"] as const).map((key) => (
                      <i key={key}>{key}</i>
                    ))}
                  </span>
                </span>
                <span className="theme-option-meta">
                  <small>{String(index + 1).padStart(2, "0")} / {theme.mode.toUpperCase()}</small>
                  <strong>{theme.displayName}</strong>
                  <em>{theme.description}</em>
                </span>
                <span className="theme-option-palette" aria-hidden="true">
                  {theme.swatches.map((swatch) => (
                    <i key={swatch} style={{ backgroundColor: swatch }} />
                  ))}
                </span>
                <span className="theme-option-state">
                  {selected ? "ACTIVE THEME" : "APPLY THEME"}
                </span>
              </button>
            );
          })}
        </div>

        <footer>
          <span>DEFAULT / POLAR WHITE</span>
          <button type="button" onClick={onClose}>설정 완료</button>
        </footer>
      </dialog>
    </div>
  );
}
