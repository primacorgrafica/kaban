import { useState, useEffect } from "react";
import { Cloud, ShieldCheck, LogIn, LogOut, CheckCircle2, Activity } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  getStoredMicrosoftUser,
  getActiveMicrosoftAccount,
  loginMicrosoft,
  logoutMicrosoft,
  type StoredMicrosoftUser,
} from "@/lib/msalClient";
import { SharePointDiagnosticsModal } from "./SharePointDiagnosticsModal";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

export function SharePointStatusIndicator() {
  const { isAdmin, role } = useAuth();
  const canManageSharePoint = isAdmin || role === "coordenador";

  if (!canManageSharePoint) return null;

  const [user, setUser] = useState<StoredMicrosoftUser | null>(() => getStoredMicrosoftUser());
  const [loading, setLoading] = useState(false);
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false);

  useEffect(() => {
    // Sincroniza conta ativa com o MSAL em segundo plano
    void getActiveMicrosoftAccount().then((acc) => {
      if (acc) {
        setUser({ name: acc.name || acc.username, username: acc.username });
      }
    });

    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === "kaban_msal_user_info") {
        setUser(getStoredMicrosoftUser());
      }
    };
    window.addEventListener("storage", handleStorageChange);
    return () => window.removeEventListener("storage", handleStorageChange);
  }, []);

  const handleConnect = async () => {
    setLoading(true);
    try {
      const acc = await loginMicrosoft();
      if (acc) {
        setUser({ name: acc.name || acc.username, username: acc.username });
        toast.success(`Conectado ao Microsoft 365 como ${acc.name || acc.username}`);
      }
    } catch (err: any) {
      console.warn("Falha ao autenticar Microsoft:", err);
      toast.error(`Falha ao conectar Microsoft: ${err?.message || err}`);
    } finally {
      setLoading(false);
    }
  };

  const handleDisconnect = async () => {
    try {
      await logoutMicrosoft();
      setUser(null);
      toast.info("Desconectado do Microsoft 365.");
    } catch (err: any) {
      toast.error(`Erro ao desconectar: ${err?.message || err}`);
    }
  };

  return (
    <>
      {!user ? (
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            disabled={loading}
            onClick={handleConnect}
            className="h-9 px-2.5 text-xs text-muted-foreground hover:text-[#CCD0CF] hover:bg-[#253745]/50 border border-border rounded-xl flex items-center gap-1.5 font-mono-tech transition-all"
            title="Conectar ao SharePoint corporativo da Primacor Gráfica"
          >
            <Cloud className="h-3.5 w-3.5 text-[#9BA8AB]" />
            <span className="hidden lg:inline text-[11px]">Conectar SharePoint</span>
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setDiagnosticsOpen(true)}
            className="h-9 w-7 text-slate-400 hover:text-sky-300"
            title="Ver Logs e Diagnóstico do SharePoint"
          >
            <Activity className="h-3.5 w-3.5" />
          </Button>
        </div>
      ) : (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-9 px-2.5 text-xs text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10 border border-emerald-500/30 rounded-xl flex items-center gap-1.5 font-mono-tech transition-all"
              title={`SharePoint Conectado: ${user.username}`}
            >
              <div className="relative flex items-center justify-center">
                <Cloud className="h-3.5 w-3.5 text-emerald-400" />
                <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-emerald-400 ring-2 ring-background animate-pulse" />
              </div>
              <span className="hidden xl:inline text-[11px] truncate max-w-[120px]">
                {user.name || user.username}
              </span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64 bg-popover border-border rounded-xl p-2 shadow-2xl">
            <DropdownMenuLabel className="font-normal p-2">
              <div className="flex items-center gap-2">
                <div className="h-8 w-8 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center">
                  <ShieldCheck className="h-4 w-4 text-emerald-400" />
                </div>
                <div className="flex flex-col min-w-0">
                  <span className="text-xs font-semibold text-foreground truncate">
                    {user.name || "Microsoft 365"}
                  </span>
                  <span className="text-[10px] text-muted-foreground truncate" title={user.username}>
                    {user.username}
                  </span>
                </div>
              </div>
              <div className="mt-2 flex items-center gap-1 text-[10px] text-emerald-400 font-mono-tech">
                <CheckCircle2 className="h-3 w-3" />
                <span>Sessão SharePoint Ativa (Permanente)</span>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => setDiagnosticsOpen(true)}
              className="text-xs text-sky-400 hover:text-sky-300 cursor-pointer rounded-lg hover:bg-sky-500/10 font-medium"
            >
              <Activity className="h-3.5 w-3.5 mr-2" />
              <span>Ver Logs & Diagnóstico</span>
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={handleConnect}
              className="text-xs text-foreground cursor-pointer rounded-lg hover:bg-accent"
            >
              <LogIn className="h-3.5 w-3.5 mr-2 text-[#9BA8AB]" />
              <span>Renovar Permissões</span>
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={handleDisconnect}
              className="text-xs text-rose-400 hover:text-rose-300 cursor-pointer rounded-lg hover:bg-rose-500/10"
            >
              <LogOut className="h-3.5 w-3.5 mr-2" />
              <span>Desconectar Microsoft 365</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      <SharePointDiagnosticsModal
        open={diagnosticsOpen}
        onOpenChange={setDiagnosticsOpen}
      />
    </>
  );
}
