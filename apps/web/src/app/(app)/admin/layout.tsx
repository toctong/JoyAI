"use client";

import { AdminSection } from "@/features/admin/admin-section";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AdminSection>{children}</AdminSection>;
}
