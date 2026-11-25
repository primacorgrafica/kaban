import { useState } from "react";
import { Layout } from "@/components/Layout";
import { useOrders } from "@/hooks/useOrders";
import { usePermissions } from "@/hooks/usePermissions";
import { DriverManagementPanel } from "@/components/delivery/routes/DriverManagementPanel";
import { Bike, Lock } from "lucide-react";

export default function EntregadoresPage() {
  const permissions = usePermissions();
  const { activeOrders, archivedOrders, loading } = useOrders();
  const [searchQuery, setSearchQuery] = useState("");

  return (
    <Layout
      searchQuery={searchQuery}
      onSearchChange={setSearchQuery}
      onAddOrder={() => {}}
      activeCount={activeOrders.length}
      archivedCount={archivedOrders.length}
      sectorName="Expedição · Cadastro de Entregadores"
      countsLoading={loading}
      permissions={permissions}
    >
      <div className="flex flex-col h-full gap-4 p-3 sm:p-5 overflow-y-auto">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-primary/15 text-primary border border-primary/30">
              <Bike className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-foreground">
                Cadastro de Entregadores
              </h1>
              <p className="text-xs text-muted-foreground">
                Inclusão, edição e inativação lógica de entregadores da Expedição (Carro ou Moto) com preservação do histórico de rotas.
              </p>
            </div>
          </div>
        </div>

        {!permissions.canManageEntregadores ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="max-w-md w-full rounded-2xl border border-amber-500/40 bg-amber-500/10 p-6 text-center space-y-2">
              <Lock className="h-8 w-8 text-amber-400 mx-auto" />
              <h2 className="text-sm font-bold text-foreground">Acesso Restrito à Expedição</h2>
              <p className="text-xs text-muted-foreground">
                Somente o responsável pela Expedição e administradores podem gerenciar o cadastro e os documentos dos entregadores.
              </p>
            </div>
          </div>
        ) : (
          <DriverManagementPanel mode="page" active />
        )}
      </div>
    </Layout>
  );
}
