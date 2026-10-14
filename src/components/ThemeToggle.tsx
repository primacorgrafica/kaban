import { Moon, Sun, Check } from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function ThemeToggle() {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const isDark = (theme === "dark" || resolvedTheme === "dark");

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9 rounded-xl border border-border/40 bg-secondary/30 hover:bg-accent/40 hover:text-primary transition-all duration-200"
          title={`Tema atual: ${isDark ? "Escuro" : "Claro"}. Clique para alterar.`}
        >
          <Sun className="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0 text-amber-400" />
          <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100 text-cyan-400" />
          <span className="sr-only">Alternar tema</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="rounded-xl border-border/60 bg-popover/95 backdrop-blur-xl shadow-xl w-44 p-1">
        <DropdownMenuItem
          onClick={() => setTheme("light")}
          className={`flex items-center justify-between cursor-pointer text-xs font-medium py-2 px-3 rounded-lg hover:bg-accent hover:text-accent-foreground ${!isDark ? "bg-accent/50 font-semibold" : ""}`}
        >
          <div className="flex items-center gap-2">
            <Sun className="h-4 w-4 text-amber-500" />
            <span>Tema Claro</span>
          </div>
          {!isDark && <Check className="h-3.5 w-3.5 text-primary" />}
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => setTheme("dark")}
          className={`flex items-center justify-between cursor-pointer text-xs font-medium py-2 px-3 rounded-lg hover:bg-accent hover:text-accent-foreground ${isDark ? "bg-accent/50 font-semibold" : ""}`}
        >
          <div className="flex items-center gap-2">
            <Moon className="h-4 w-4 text-cyan-400" />
            <span>Tema Escuro</span>
          </div>
          {isDark && <Check className="h-3.5 w-3.5 text-primary" />}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
