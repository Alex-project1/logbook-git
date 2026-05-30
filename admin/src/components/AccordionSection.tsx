import type { ReactNode } from "react";

type AccordionSectionProps = {
  title: string;
  subtitle?: string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
};

export function AccordionSection({
  title,
  subtitle,
  open,
  onToggle,
  children,
}: AccordionSectionProps) {
  return (
    <section
      className={
        open
          ? "accordion-section accordion-section-open"
          : "accordion-section"
      }
    >
      <button
        type="button"
        className="accordion-section-trigger"
        onClick={onToggle}
      >
        <span>
          <strong>{title}</strong>
          {subtitle && <small>{subtitle}</small>}
        </span>

        <span className="accordion-section-icon">{open ? "−" : "+"}</span>
      </button>

      {open && <div className="accordion-section-content">{children}</div>}
    </section>
  );
}