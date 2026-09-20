"use client";

import * as React from "react";
import { ThemeProvider as NextThemesProvider } from "next-themes";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ConfirmDialogHost } from "@/components/confirm-dialog-host";
import { AppToaster } from "@/shared/lib/toast";
import { QueryProvider } from "@/shared/providers/query-provider";
import { RouteAbortEffects } from "@/shared/providers/route-abort-effects";

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
          {children}
          <ConfirmDialogHost />
          <AppToaster />
        </TooltipProvider>
      </QueryProvider>
    </NextThemesProvider>
  );
}
