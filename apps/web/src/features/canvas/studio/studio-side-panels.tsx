"use client";

import type { ReactNode, MouseEvent as ReactMouseEvent } from "react";
import { X } from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { cn } from "@/shared/lib/utils";

export type StudioSidePanelItem = {
  id: string;
  title: string;
  icon?: ReactNode;
  /** Current value, pinned on the right before × / chevron (e.g. 2:1). */
  badge?: ReactNode;
  /** Show × before chevron when dirty. */
  onClear?: () => void;
  content: ReactNode;
};

type Props = {
  items: StudioSidePanelItem[];
  defaultOpen?: string[];
  className?: string;
};

/**
 * Right-rail accordion (Radix Item → Header/Trigger → Content, no extra wrappers).
 * Row: [icon + title] …… [value] [×] [chevron]
 */
export function StudioSidePanels({
  items,
  defaultOpen,
  className,
}: Props) {
  if (!items.length) return null;
  const initial = defaultOpen ?? (items[0] ? [items[0].id] : []);

  function stopToggle(event: ReactMouseEvent) {
    event.preventDefault();
    event.stopPropagation();
  }

  return (
    <Accordion
      type="multiple"
      defaultValue={initial}
      className={cn("joy-studio-panels", className)}
    >
      {items.map((item) => (
        <AccordionItem
          key={item.id}
          value={item.id}
          className="joy-studio-panels__item"
        >
          <AccordionTrigger className="joy-studio-panels__trigger hover:no-underline focus-visible:ring-0">
            <span className="joy-studio-panels__lead">
              {item.icon ? (
                <span className="joy-studio-panels__icon">{item.icon}</span>
              ) : null}
              <span className="joy-studio-panels__title">{item.title}</span>
            </span>
            <span className="joy-studio-panels__actions">
              {item.badge ? (
                <span className="joy-studio-panels__value">{item.badge}</span>
              ) : null}
              {item.onClear ? (
                <span
                  role="button"
                  tabIndex={0}
                  title="清空，回到初始值"
                  aria-label={`清空${item.title}`}
                  className="joy-studio-panels__clear"
                  onClick={(event) => {
                    stopToggle(event);
                    item.onClear?.();
                  }}
                  onPointerDown={stopToggle}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      event.stopPropagation();
                      item.onClear?.();
                    }
                  }}
                >
                  <X className="size-3.5" />
                </span>
              ) : null}
            </span>
          </AccordionTrigger>
          <AccordionContent className="joy-studio-panels__content p-0">
            <div className="joy-studio-panels__body">{item.content}</div>
          </AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  );
}
