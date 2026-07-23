"use client";

import * as React from "react";
import { useTheme } from "next-themes";
import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Light/dark toggle. Light is primary; this flips to the secondary dark theme.
 * Renders a stable placeholder until mounted to avoid a hydration mismatch.
 */
export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);
  // Standard next-themes hydration guard: the resolved theme is only known on the
  // client, so we render a neutral placeholder until mounted. One-time flag, safe.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  React.useEffect(() => setMounted(true), []);

  const isDark = resolvedTheme === "dark";

  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={isDark ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
      title={isDark ? "Modo claro" : "Modo oscuro"}
      onClick={() => setTheme(isDark ? "light" : "dark")}
      className="relative h-9 w-9 text-muted-foreground hover:text-foreground"
    >
      {mounted ? (
        <>
          <Sun className={`h-[1.15rem] w-[1.15rem] transition-all ${isDark ? "scale-0 -rotate-90 opacity-0" : "scale-100 rotate-0 opacity-100"}`} />
          <Moon className={`absolute h-[1.15rem] w-[1.15rem] transition-all ${isDark ? "scale-100 rotate-0 opacity-100" : "scale-0 rotate-90 opacity-0"}`} />
        </>
      ) : (
        <Sun className="h-[1.15rem] w-[1.15rem] opacity-0" />
      )}
    </Button>
  );
}
