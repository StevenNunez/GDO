"use client";

import * as React from "react";
import { ThemeProvider as NextThemesProvider } from "next-themes";

/**
 * App theme provider. Light is the primary/default theme; dark is the secondary
 * theme toggled via the `.dark` class on <html>. System preference is disabled
 * so the app always starts in light unless the user explicitly switches.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="light"
      enableSystem={false}
      disableTransitionOnChange
    >
      {children}
    </NextThemesProvider>
  );
}
