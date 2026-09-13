"use client";

import { AdminShell } from "@/features/shell/admin-shell";

export default function AdminShellLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AdminShell>{children}</AdminShell>;
}
