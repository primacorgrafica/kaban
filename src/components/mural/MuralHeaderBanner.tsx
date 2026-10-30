import { useState, useMemo } from "react";
import { useMuralAlertas } from "@/hooks/useMuralAlertas";
import { MuralAlerta } from "@/types/mural";
import { MuralDetailDialog } from "./MuralDetailDialog";
import { MuralAlertaDialog } from "./MuralAlertaDialog";
import { Megaphone, AlertTriangle, Info } from "lucide-react";

export function MuralHeaderBanner() {
  const { activeAlerts, canManageMural, editarAlerta } = useMuralAlertas();
  const [detailOpen, setDetailOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [selectedAlerta, setSelectedAlerta] = useState<MuralAlerta | null>(null);

  // Constrói o texto do letreiro exatamente no mesmo padrão e velocidade do Radar PCP
  // Regra de Hooks do React: Declarado incondicionalmente no topo ANTES de qualquer retorno
  const renderedMarquee = useMemo(() => {
    if (!activeAlerts || activeAlerts.length === 0) return null;

    const renderAlertGroup = (prefixKey: string) => {
      return activeAlerts.map((alerta, idx) => {
        const isUrg = alerta.tipo === "urgente";
        const isImp = alerta.tipo === "importante";
        const tagText = isUrg ? "URGENTE" : isImp ? "IMPORTANTE" : "INFORMATIVO";
        const tagClass = isUrg
          ? "text-red-600 dark:text-red-400 font-black tracking-wider"
          : isImp
          ? "text-amber-600 dark:text-amber-400 font-black tracking-wider"
          : "text-sky-500 dark:text-sky-400 font-black tracking-wider";

        return (
          <span
            key={`${prefixKey}-${alerta.id}-${idx}`}
            className="inline-flex items-center gap-1.5 mx-4"
          >
            <span className={tagClass}>[{tagText}]</span>
            <strong className="text-foreground tracking-wide font-bold">{alerta.titulo}:</strong>
            <span className="text-foreground/90 font-medium">{alerta.mensagem}</span>
            <span className="text-muted-foreground/60 mx-3 select-none">✦✦✦</span>
          </span>
        );
      });
    };

    // Renderiza duas vezes consecutivas para manter o fluxo contínuo sem interrupção
    return (
      <>
        {renderAlertGroup("stream-1")}
        {renderAlertGroup("stream-2")}
      </>
    );
  }, [activeAlerts]);

  // Se não houver alertas ativos, não renderiza o banner (executado APÓS todas as declarações de Hooks)
  if (!activeAlerts || activeAlerts.length === 0) {
    return null;
  }

  // Define a prioridade do estilo do banner com base no alerta mais crítico
  const hasUrgente = activeAlerts.some((a) => a.tipo === "urgente");
  const hasImportante = activeAlerts.some((a) => a.tipo === "importante");

  const priorityType = hasUrgente ? "urgente" : hasImportante ? "importante" : "info";

  const containerStyle = priorityType === "urgente"
    ? "bg-red-500/10 hover:bg-red-500/20 border-red-500/50 text-red-600 dark:text-red-400 shadow-[0_0_12px_rgba(239,68,68,0.15)]"
    : priorityType === "importante"
    ? "bg-amber-500/10 hover:bg-amber-500/20 border-amber-500/50 text-amber-600 dark:text-amber-400 shadow-[0_0_12px_rgba(245,158,11,0.15)]"
    : "bg-sky-500/10 hover:bg-sky-500/20 border-sky-500/50 text-sky-600 dark:text-sky-400 shadow-[0_0_12px_rgba(14,165,233,0.15)]";

  const badgeStyle = priorityType === "urgente"
    ? "bg-red-500/20 border-red-500/40 text-red-600 dark:text-red-300"
    : priorityType === "importante"
    ? "bg-amber-500/20 border-amber-500/40 text-amber-600 dark:text-amber-300"
    : "bg-sky-500/20 border-sky-500/40 text-sky-600 dark:text-sky-300";

  const dotColor = priorityType === "urgente"
    ? "bg-red-500 shadow-[0_0_8px_#ef4444]"
    : priorityType === "importante"
    ? "bg-amber-500 shadow-[0_0_8px_#f59e0b]"
    : "bg-sky-400 shadow-[0_0_8px_#38bdf8]";

  const Icon = priorityType === "urgente" ? AlertTriangle : priorityType === "importante" ? Megaphone : Info;

  const handleOpenDetail = () => {
    setSelectedAlerta(activeAlerts[0] || null);
    setDetailOpen(true);
  };

  const handleEdit = (alerta: MuralAlerta) => {
    setSelectedAlerta(alerta);
    setEditOpen(true);
  };

  return (
    <>
      <div
        onClick={handleOpenDetail}
        title="Mural de Alertas — Passe o mouse para pausar / Clique para ver detalhes"
        className={`order-1 flex items-center gap-2.5 px-2.5 py-1 rounded-xl border text-xs cursor-pointer select-none transition-all duration-200 flex-1 min-w-0 max-w-sm sm:max-w-md md:max-w-xl lg:max-w-2xl xl:max-w-3xl overflow-hidden ${containerStyle}`}
      >
        {/* Badge fixo à esquerda no estilo do Radar PCP */}
        <div className={`flex items-center gap-1.5 uppercase tracking-wider shrink-0 px-2 py-0.5 rounded-lg border text-[10px] font-black ${badgeStyle}`}>
          <span className={`w-2 h-2 rounded-full shrink-0 ${dotColor} animate-ping`} />
          <Icon className="h-3 w-3 shrink-0" />
          <span className="font-mono-tech whitespace-nowrap">ALERTA DO DIA</span>
        </div>

        {/* Letreiro passando na mesma velocidade e animação do Radar PCP */}
        <div className="flex-1 overflow-hidden whitespace-nowrap text-foreground dark:text-slate-300 text-[11px]">
          <span className="inline-block animate-marquee font-medium">
            {renderedMarquee}
          </span>
        </div>

        {/* Indicador de quantidade à direita */}
        {activeAlerts.length > 1 && (
          <span className="hidden sm:inline-flex text-[10px] opacity-75 font-mono-tech shrink-0 bg-background/50 px-1.5 py-0.5 rounded border border-border/40">
            {activeAlerts.length} avisos
          </span>
        )}
      </div>

      {/* Modal de leitura completa com navegação entre avisos */}
      <MuralDetailDialog
        alerta={selectedAlerta || activeAlerts[0]}
        alertas={activeAlerts}
        open={detailOpen}
        onOpenChange={setDetailOpen}
        onEdit={handleEdit}
        canManage={canManageMural}
      />

      {/* Modal de edição direta para coordenador/admin */}
      {canManageMural && (
        <MuralAlertaDialog
          open={editOpen}
          onOpenChange={setEditOpen}
          alertaToEdit={selectedAlerta}
          onSave={async (data) => {
            if (selectedAlerta) {
              return await editarAlerta(selectedAlerta.id, data);
            }
            return { success: false };
          }}
        />
      )}
    </>
  );
}
