"use client";

import Link from "next/link";
import { cn } from "@/lib/cn";

export interface TabItem {
  label: string;
  href: string;
  count?: number;
}

export function Tabs({ items, active }: { items: TabItem[]; active: string }) {
  return (
    <nav className="flex gap-1 overflow-x-auto border-b border-border" aria-label="Tabs">
      {items.map((item) => {
        const isActive = active === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "focus-ring relative whitespace-nowrap px-3 py-2.5 text-sm font-medium transition-colors",
              isActive ? "text-ink" : "text-ink-muted hover:text-ink",
            )}
          >
            {item.label}
            {item.count !== undefined ? (
              <span className="ml-1.5 rounded-full bg-surface-hover px-1.5 py-0.5 text-xxs text-ink-muted">{item.count}</span>
            ) : null}
            {isActive ? <span className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-accent" aria-hidden /> : null}
          </Link>
        );
      })}
    </nav>
  );
}
