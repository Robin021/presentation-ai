"use client";

import { Moon, Sun } from "lucide-react";
import {
  ThemeProvider as NextThemesProvider,
  type ThemeProviderProps,
  useTheme,
} from "next-themes";

import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";

import * as React from "react";
import { cn } from "@/lib/utils";

export function ThemeProvider({ children, ...props }: ThemeProviderProps) {
  return <NextThemesProvider {...props}>{children}</NextThemesProvider>;
}

// ... imports remain the same

export const ThemeToggle = React.forwardRef<
  HTMLButtonElement,
  React.ComponentPropsWithoutRef<typeof Button>
>(({ className, onClick, ...props }, ref) => {
  const { theme, setTheme } = useTheme();

  return (
    <Button
      ref={ref}
      asChild
      variant="outline"
      className={cn(
        "flex w-full items-center justify-between gap-2 text-primary cursor-pointer",
        className,
      )}
      onClick={(e) => {
        setTheme(theme === "light" ? "dark" : "light");
        onClick?.(e);
      }}
      {...props}
    >
      <div>
        <span>Change Theme</span>
        <div className="flex items-center">
          <Sun className="h-4 w-4 rotate-0 transition-all dark:hidden" />
          <Moon className="hidden h-4 w-4 rotate-0 transition-all dark:block" />
          <Switch
            checked={theme === "dark"}
            onCheckedChange={() => setTheme(theme === "light" ? "dark" : "light")}
            className="ml-2 pointer-events-none"
          />
        </div>
        <span className="sr-only">Toggle theme</span>
      </div>
    </Button>
  );
});
ThemeToggle.displayName = "ThemeToggle";
