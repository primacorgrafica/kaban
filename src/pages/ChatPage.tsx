import { useState } from "react";
import { Layout } from "@/components/Layout";
import { ChatContainer } from "@/components/chat/ChatContainer";
import { usePermissions } from "@/hooks/usePermissions";
import { useOrders } from "@/hooks/useOrders";

export default function ChatPage() {
  const perms = usePermissions();
  const { activeOrders, archivedOrders, addOrder } = useOrders();
  const [searchQuery, setSearchQuery] = useState("");

  return (
    <Layout
      searchQuery={searchQuery}
      onSearchChange={setSearchQuery}
      onAddOrder={addOrder}
      activeCount={activeOrders.length}
      archivedCount={archivedOrders.length}
      sectorName="Chat Privado"
      countsLoading={false}
      permissions={perms}
    >
      <div className="h-[calc(100vh-4.75rem)] w-full">
        <ChatContainer />
      </div>
    </Layout>
  );
}
