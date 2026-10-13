import { Construction } from "lucide-react";
import { useLocation } from "react-router-dom";

const SECTOR_LABELS: Record<string, string> = {
  "/comercial": "Comercial",
  "/faturamento": "Faturamento",
  
  "/compras": "Compras",
  "/manutencao": "Manutenção",
};

export default function EmConstrucaoPage() {
  const location = useLocation();
  const label = SECTOR_LABELS[location.pathname] || "Setor";

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-center">
      <Construction className="h-16 w-16 text-muted-foreground/40" />
      <h1 className="text-2xl font-bold text-foreground">{label}</h1>
      <p className="text-muted-foreground max-w-md">
        Este módulo está em construção e estará disponível em breve.
      </p>
    </div>
  );
}
