import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

import { Icon, type IconName } from "./Icon";

export type MenuEntry =
  | {
      type?: "item";
      danger?: boolean;
      disabled?: boolean;
      hint?: string;
      icon?: IconName;
      label: string;
      onSelect: () => void;
    }
  | { type: "separator" }
  | { type: "label"; label: string }
  | { type: "empty"; label: string };

type MenuButtonProps = {
  align?: "start" | "end";
  buttonClassName?: string;
  children: ReactNode;
  disabled?: boolean;
  entries: MenuEntry[] | (() => MenuEntry[]);
  label: string;
  title?: string;
};

export function MenuButton({
  align = "end",
  buttonClassName = "icon-btn",
  children,
  disabled = false,
  entries,
  label,
  title,
}: MenuButtonProps) {
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);

  const close = useCallback((restoreFocus = false) => {
    setIsOpen(false);
    setPosition(null);
    if (restoreFocus) {
      buttonRef.current?.focus();
    }
  }, []);

  useLayoutEffect(() => {
    if (!isOpen) return;
    const button = buttonRef.current;
    const menu = menuRef.current;
    if (!button || !menu) return;

    const rect = button.getBoundingClientRect();
    const menuRect = menu.getBoundingClientRect();
    const deckHeight =
      Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--deck-h")) ||
      0;
    const viewportBottom = window.innerHeight - deckHeight - 8;

    let top = rect.bottom + 6;
    if (top + menuRect.height > viewportBottom && rect.top - menuRect.height - 6 > 8) {
      top = rect.top - menuRect.height - 6;
    }

    let left = align === "end" ? rect.right - menuRect.width : rect.left;
    left = Math.max(8, Math.min(left, window.innerWidth - menuRect.width - 8));
    setPosition({ top, left });
  }, [align, isOpen]);

  useEffect(() => {
    if (!isOpen || !position) return;
    const menu = menuRef.current;
    if (menu && !menu.contains(document.activeElement)) {
      menu.querySelector<HTMLButtonElement>(".menu-item:not(:disabled)")?.focus({
        preventScroll: true,
      });
    }
  }, [isOpen, position]);

  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (menuRef.current?.contains(target) || buttonRef.current?.contains(target)) {
        return;
      }
      close();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        close(true);
      }
    };
    const handleViewportChange = (event: Event) => {
      if (menuRef.current && event.target instanceof Node && menuRef.current.contains(event.target)) {
        return;
      }
      close();
    };

    document.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("resize", handleViewportChange);
    window.addEventListener("scroll", handleViewportChange, true);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("resize", handleViewportChange);
      window.removeEventListener("scroll", handleViewportChange, true);
    };
  }, [close, isOpen]);

  const handleMenuKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    const items = Array.from(
      menuRef.current?.querySelectorAll<HTMLButtonElement>(".menu-item:not(:disabled)") ?? [],
    );
    if (items.length === 0) return;
    const currentIndex = items.indexOf(document.activeElement as HTMLButtonElement);
    const delta = event.key === "ArrowDown" ? 1 : -1;
    const nextIndex = (currentIndex + delta + items.length) % items.length;
    items[nextIndex]?.focus();
  };

  const resolvedEntries = isOpen ? (typeof entries === "function" ? entries() : entries) : [];

  return (
    <>
      <button
        aria-expanded={isOpen}
        aria-haspopup="menu"
        aria-label={label}
        className={buttonClassName}
        disabled={disabled}
        onClick={(event) => {
          event.stopPropagation();
          setIsOpen((current) => !current);
        }}
        ref={buttonRef}
        title={title ?? label}
        type="button"
      >
        {children}
      </button>
      {isOpen
        ? createPortal(
            <div
              aria-label={label}
              className="menu"
              onKeyDown={handleMenuKeyDown}
              ref={menuRef}
              role="menu"
              style={
                position
                  ? { top: position.top, left: position.left }
                  : { top: -9999, left: -9999, visibility: "hidden" }
              }
            >
              {resolvedEntries.map((entry, index) => {
                if (entry.type === "separator") {
                  return <div className="menu-sep" key={`sep-${index}`} role="separator" />;
                }
                if (entry.type === "label") {
                  return (
                    <div className="menu-label" key={`label-${index}`}>
                      {entry.label}
                    </div>
                  );
                }
                if (entry.type === "empty") {
                  return (
                    <div className="menu-empty" key={`empty-${index}`}>
                      {entry.label}
                    </div>
                  );
                }
                return (
                  <button
                    className={entry.danger ? "menu-item danger" : "menu-item"}
                    disabled={entry.disabled}
                    key={`${entry.label}-${index}`}
                    onClick={() => {
                      close(true);
                      entry.onSelect();
                    }}
                    role="menuitem"
                    type="button"
                  >
                    {entry.icon ? <Icon name={entry.icon} size={16} /> : null}
                    <span className="truncate">{entry.label}</span>
                    {entry.hint ? <span className="menu-item-hint">{entry.hint}</span> : null}
                  </button>
                );
              })}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
