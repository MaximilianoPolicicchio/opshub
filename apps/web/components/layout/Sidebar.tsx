"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";
import { useMe } from "@/hooks/useMe";
import { useAuth } from "@/lib/auth";

const NAV = [
  { href: "/today", label: "Today", icon: SunIcon },
  { href: "/projects", label: "Projects", icon: FolderIcon },
  { href: "/time", label: "Time", icon: ClockIcon },
  { href: "/financial", label: "Financial", icon: DollarIcon },
  { href: "/costs", label: "Costs", icon: DollarIcon },
  { href: "/automations", label: "Automations", icon: BoltIcon },
  { href: "/weekly-review", label: "Weekly Review", icon: ChartIcon },
  { href: "/settings", label: "Settings", icon: GearIcon },
];

export function Sidebar() {
  const pathname = usePathname();
  const { data: me } = useMe();
  const { logout } = useAuth();
  const workspaceName = me?.memberships?.[0]?.workspace?.name ?? "Workspace";

  return (
    <aside className="flex h-screen w-56 shrink-0 flex-col border-r border-border bg-surface">
      <div className="border-b border-border-subtle px-4 py-4">
        <div className="text-sm font-semibold text-ink">{workspaceName}</div>
        <div className="mt-0.5 truncate text-xs text-ink-faint">{me?.user?.email}</div>
      </div>
      <nav className="flex-1 space-y-0.5 overflow-y-auto p-2" aria-label="Main navigation">
        {NAV.map((item) => {
          const isActive = pathname === item.href || pathname?.startsWith(item.href + "/");
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "focus-ring flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                isActive ? "bg-accent/10 text-accent" : "text-ink-muted hover:bg-surface-hover hover:text-ink",
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-border-subtle p-2">
        <button
          onClick={() => logout()}
          className="focus-ring flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium text-ink-muted transition-colors hover:bg-surface-hover hover:text-ink"
        >
          <LogoutIcon className="h-4 w-4 shrink-0" />
          Sign out
        </button>
      </div>
    </aside>
  );
}

function SunIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 20 20" fill="none" {...props} aria-hidden>
      <circle cx="10" cy="10" r="3.5" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M10 2v2M10 16v2M4.2 4.2l1.4 1.4M14.4 14.4l1.4 1.4M2 10h2M16 10h2M4.2 15.8l1.4-1.4M14.4 5.6l1.4-1.4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}
function FolderIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 20 20" fill="none" {...props} aria-hidden>
      <path
        d="M3 5.5A1.5 1.5 0 0 1 4.5 4h3.379a1.5 1.5 0 0 1 1.06.44l1.122 1.12a1.5 1.5 0 0 0 1.06.44H15.5A1.5 1.5 0 0 1 17 7.5v7A1.5 1.5 0 0 1 15.5 16h-11A1.5 1.5 0 0 1 3 14.5v-9Z"
        stroke="currentColor"
        strokeWidth="1.5"
      />
    </svg>
  );
}
function ClockIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 20 20" fill="none" {...props} aria-hidden>
      <circle cx="10" cy="10" r="7" stroke="currentColor" strokeWidth="1.5" />
      <path d="M10 6v4l3 2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}
function DollarIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 20 20" fill="none" {...props} aria-hidden>
      <path d="M10 3v14M13.5 6.5c0-1.4-1.5-2.5-3.5-2.5s-3.5 1-3.5 2.5S8 8.5 10 9s3.5 1 3.5 2.5-1.5 2.5-3.5 2.5-3.5-1.1-3.5-2.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}
function BoltIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 20 20" fill="none" {...props} aria-hidden>
      <path d="M11 2 4 11.5h4.5L9 18l7-9.5H11.5L11 2Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}
function ChartIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 20 20" fill="none" {...props} aria-hidden>
      <path d="M4 16V9M10 16V4M16 16v-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}
function GearIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 20 20" fill="none" {...props} aria-hidden>
      <circle cx="10" cy="10" r="2.5" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M10 3v1.5M10 15.5V17M17 10h-1.5M4.5 10H3M14.8 5.2l-1 1M6.2 13.8l-1 1M14.8 14.8l-1-1M6.2 6.2l-1-1"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}
function LogoutIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 20 20" fill="none" {...props} aria-hidden>
      <path d="M8 3H5a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h3M13 14l4-4-4-4M17 10H7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
