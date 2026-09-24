"use client";

import * as React from "react";
import { ThemeProvider as NextThemesProvider } from "next-themes";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ConfirmDialogHost } from "@/components/confirm-dialog-host";
import { AppToaster } from "@/shared/lib/toast";
import { QueryProvider } from "@/shared/providers/query-provider";
import { RouteAbortEffects } from "@/shared/providers/route-abort-effects";
import { ViewShellGate } from "@/shared/providers/view-shell-gate";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="light"
      enableSystem={false}
      disableTransitionOnChange
    >
      <QueryProvider>
        <TooltipProvider delayDuration={200}>
          <RouteAbortEffects />
          <ViewShellGate />
          {children}
          <ConfirmDialogHost />
          <AppToaster />
        </TooltipProvider>
      </QueryProvider>
    </NextThemesProvider>
  );
}
