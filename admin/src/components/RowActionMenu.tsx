import { useEffect, useRef, useState } from "react";

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

export function RowActionMenu({ items, label = "Действия" }: RowActionMenuProps) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;

    function handleClickOutside(event: MouseEvent) {
      if (!menuRef.current) return;

      if (!menuRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [open]);

  function handleActionClick(item: RowActionMenuItem) {
    if (item.disabled) return;

    item.onClick();
    setOpen(false);
  }

  return (
    <div
      ref={menuRef}
      className={open ? "row-action-dropdown is-open" : "row-action-dropdown"}
    >
      <button
        type="button"
        className="small-button row-action-trigger"
        onClick={() => setOpen((current) => !current)}
      >
        {label}
        <span className="row-action-trigger-icon">▾</span>
      </button>

      {open && (
        <div className="row-action-menu">
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
        </div>
      )}
    </div>
  );
}