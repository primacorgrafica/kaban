import { useState, useEffect } from "react";
import { useMuralAlertas } from "@/hooks/useMuralAlertas";
import { MuralAlerta } from "@/types/mural";
import { MuralDetailDialog } from "./MuralDetailDialog";
import { MuralAlertaDialog } from "./MuralAlertaDialog";
import { Megaphone, AlertTriangle, Info, ChevronRight, ChevronLeft } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

export function MuralHeaderBanner() {
  const { activeAlerts, canManageMural, editarAlerta } = useMuralAlertas();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [detailOpen, setDetailOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [selectedAlerta, setSelectedAlerta] = useState<MuralAlerta | null>(null);

  // Alterna automaticamente se houver mais de um alerta ativo
  useEffect(() => {
    if (activeAlerts.length <= 1) return;
    const interval = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % activeAlerts.length);
    }, 7000);
    return () => clearInterval(interval);
  }, [activeAlerts.length]);

  if (!activeAlerts || activeAlerts.length === 0) {
    return null;
  }

  const currentAlert = activeAlerts[currentIndex % activeAlerts.length] || activeAlerts[0];

  const handleOpenDetail = () => {
    setSelectedAlerta(currentAlert);
    setDetailOpen(true);
  };

  const handleEdit = (alerta: MuralAlerta) => {
    setSelectedAlerta(alerta);
    setEditOpen(true);
  };

  const isUrgente = currentAlert.tipo === "urgente";
  const isImportante = currentAlert.tipo === "importante";

  const containerStyle = isUrgente
    ? "bg-red-500/10 hover:bg-red-500/20 border-red-500/50 text-red-600 dark:text-red-400 shadow-[0_0_12px_rgba(239,68,68,0.15)]"
    : isImportante
    ? "bg-amber-500/10 hover:bg-amber-500/20 border-amber-500/50 text-amber-600 dark:text-amber-400 shadow-[0_0_12px_rgba(245,158,11,0.15)]"
    : "bg-sky-500/10 hover:bg-sky-500/20 border-sky-500/50 text-sky-600 dark:text-sky-400 shadow-[0_0_12px_rgba(14,165,233,0.15)]";

  const dotColor = isUrgente ? "bg-red-500 shadow-[0_0_8px_#ef4444]" : isImportante ? "bg-amber-500 shadow-[0_0_8px_#f59e0b]" : "bg-sky-400 shadow-[0_0_8px_#38bdf8]";
  const Icon = isUrgente ? AlertTriangle : isImportante ? Megaphone : Info;

  return (
    <>
      <div
        onClick={handleOpenDetail}
        title={`Clique para ler o alerta: ${currentAlert.titulo}`}
        className={`order-1 flex items-center gap-2 px-3 py-1 rounded-xl border text-xs font-semibold cursor-pointer select-none transition-all duration-200 max-w-full sm:max-w-xs md:max-w-md lg:max-w-lg ${containerStyle}`}
      >
        <span className={`w-2 h-2 rounded-full shrink-0 ${dotColor} animate-pulse`} />
        <Icon className="h-3.5 w-3.5 shrink-0" />
        
        <span className="font-mono-tech uppercase tracking-wider text-[11px] font-black shrink-0">
          ALERTA DO DIA:
        </span>

        <AnimatePresence mode="wait">
          <motion.span
            key={currentAlert.id}
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            transition={{ duration: 0.2 }}
            className="truncate font-bold flex-1"
          >
            {currentAlert.titulo}
          </motion.span>
        </AnimatePresence>

        {activeAlerts.length > 1 && (
          <span className="text-[10px] opacity-75 font-mono-tech shrink-0 ml-1">
            ({currentIndex + 1}/{activeAlerts.length})
          </span>
        )}
      </div>

      {/* Modal de leitura completa */}
      <MuralDetailDialog
        alerta={selectedAlerta}
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
