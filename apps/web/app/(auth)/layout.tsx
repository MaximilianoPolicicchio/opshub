import { ReactNode } from "react";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mb-1 text-lg font-semibold tracking-tight text-ink">OpsHub</div>
          <p className="text-sm text-ink-muted">Project Command Center</p>
        </div>
        {children}
      </div>
    </div>
  );
}
