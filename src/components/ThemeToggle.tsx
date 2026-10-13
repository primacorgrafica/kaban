import { Moon, Sun, Monitor } from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9 rounded-xl border border-border/40 bg-secondary/30 hover:bg-accent/40 hover:text-primary transition-all duration-200"
          title="Alternar tema visual"
        >
          <Sun className="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0 text-amber-400" />
          <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100 text-cyan-400" />
          <span className="sr-only">Alternar tema</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="rounded-xl border-border/60 bg-popover/95 backdrop-blur-xl shadow-xl">
        <DropdownMenuItem
          onClick={() => setTheme("light")}
          className="flex items-center gap-2 cursor-pointer text-xs font-medium py-2 px-3 rounded-lg hover:bg-accent hover:text-accent-foreground"
        >
          <Sun className="h-4 w-4 text-amber-500" />
          <span>Tema Claro (Clean)</span>
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => setTheme("dark")}
          className="flex items-center gap-2 cursor-pointer text-xs font-medium py-2 px-3 rounded-lg hover:bg-accent hover:text-accent-foreground"
        >
          <Moon className="h-4 w-4 text-cyan-400" />
          <span>Tema Escuro (Industrial)</span>
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => setTheme("system")}
          className="flex items-center gap-2 cursor-pointer text-xs font-medium py-2 px-3 rounded-lg hover:bg-accent hover:text-accent-foreground"
        >
          <Monitor className="h-4 w-4 text-muted-foreground" />
          <span>Automático (Sistema)</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
