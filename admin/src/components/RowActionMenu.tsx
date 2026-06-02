import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export type RowActionMenuItem = {
  label: string;
  onClick: () => void;
  variant?: "default" | "edit" | "danger";
  disabled?: boolean;
};

type RowActionMenuProps = {
  items: RowActionMenuItem[];
  label?: string;
};

type MenuPosition = {
  top: number;
  left: number;
};

const MENU_WIDTH = 208;
const SCREEN_GAP = 12;

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export function RowActionMenu({
  items,
  label = "Действия",
}: RowActionMenuProps) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<MenuPosition>({
    top: 0,
    left: 0,
  });

  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  function updateMenuPosition() {
    const trigger = triggerRef.current;

    if (!trigger) return;

    const rect = trigger.getBoundingClientRect();
    const menuWidth = menuRef.current?.offsetWidth ?? MENU_WIDTH;
    const menuHeight = menuRef.current?.offsetHeight ?? 180;

    const maxLeft = window.innerWidth - menuWidth - SCREEN_GAP;

    const left = clamp(
      rect.right - menuWidth,
      SCREEN_GAP,
      Math.max(SCREEN_GAP, maxLeft)
    );

    let top = rect.bottom + 8;

    if (top + menuHeight > window.innerHeight - SCREEN_GAP) {
      top = Math.max(SCREEN_GAP, rect.top - menuHeight - 8);
    }

    setPosition({
      top,
      left,
    });
  }

  useLayoutEffect(() => {
    if (!open) return;

    updateMenuPosition();
  }, [open, items.length]);

  useEffect(() => {
    if (!open) return;

    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node;

      if (wrapperRef.current?.contains(target)) {
        return;
      }

      if (menuRef.current?.contains(target)) {
        return;
      }

      setOpen(false);
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    function handleViewportChange() {
      updateMenuPosition();
    }

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    window.addEventListener("resize", handleViewportChange);
    window.addEventListener("scroll", handleViewportChange, true);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
      window.removeEventListener("resize", handleViewportChange);
      window.removeEventListener("scroll", handleViewportChange, true);
    };
  }, [open]);

  function handleActionClick(item: RowActionMenuItem) {
    if (item.disabled) return;

    item.onClick();
    setOpen(false);
  }

  const menu = open
    ? createPortal(
        <div
          ref={menuRef}
          className="row-action-menu row-action-menu-portal"
          style={{
            top: position.top,
            left: position.left,
          }}
        >
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              className={
                item.variant
                  ? `row-action-menu-item ${item.variant}`
                  : "row-action-menu-item"
              }
              disabled={item.disabled}
              onClick={() => handleActionClick(item)}
            >
              <span className="row-action-dot" />
              {item.label}
            </button>
          ))}
        </div>,
        document.body
      )
    : null;

  return (
    <div
      ref={wrapperRef}
      className={open ? "row-action-dropdown is-open" : "row-action-dropdown"}
    >
      <button
        ref={triggerRef}
        type="button"
        className="small-button row-action-trigger"
        onClick={() => setOpen((current) => !current)}
      >
        {label}
        <span className="row-action-trigger-icon">▾</span>
      </button>

      {menu}
    </div>
  );
}