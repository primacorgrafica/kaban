import { useState, useEffect, useMemo, useRef } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import {
  updateDriverDeliveryStatus,
  recordGpsCheckpoint,
  getEntregadoresList,
  uploadDeliveryProofFile,
} from "@/lib/deliveryService";
import {
  uploadDeliveryProtocolToSharePoint,
  SHAREPOINT_PROTOCOLOS_FOLDER,
  SHAREPOINT_PROTOCOLOS_URL,
} from "@/lib/sharepointService";
import {
  getActiveMicrosoftAccount,
  loginMicrosoft,
  getStoredMicrosoftUser,
  type StoredMicrosoftUser,
} from "@/lib/msalClient";
import type { DeliveryStatus, Entregador } from "@/types/delivery";
import { DELIVERY_STATUS_CONFIG } from "@/types/delivery";
import type { Order } from "@/types/order";
import { Link } from "react-router-dom";
import {
  Bike,
  Navigation,
  CheckCircle2,
  AlertTriangle,
  Camera,
  MapPin,
  Clock,
  LogOut,
  Package,
  RefreshCw,
  Phone,
  FileCheck,
  ChevronRight,
  ShieldAlert,
  ArrowLeft,
  Smartphone,
  Bell,
  BellRing,
  Download,
  Cloud,
  ExternalLink,
} from "lucide-react";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";

const INSUCESSO_MOTIVOS = [
  "Cliente ausente / estabelecimento fechado",
  "Endereço não localizado / número inexistente",
  "Destinatário recusou o recebimento",
  "Mercadoria avariada durante o transporte",
  "Horário comercial expirado",
  "Outro motivo (especificar nas observações)",
];

// Alerta sonoro agradável para entregador via Web Audio API (funciona offline e em segundo plano)
function playNotificationChime() {
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.connect(gain);
    gain.connect(ctx.destination);

    // Duplo bip alegre e nítido (D5 -> A5)
    osc.frequency.setValueAtTime(587.33, ctx.currentTime);
    osc.frequency.setValueAtTime(880, ctx.currentTime + 0.12);
    gain.gain.setValueAtTime(0.35, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.45);

    osc.start();
    osc.stop(ctx.currentTime + 0.5);
  } catch (e) {
    console.warn("[Sound] Falha ao emitir som de notificação:", e);
  }
}

// Disparo de notificação nativa do navegador (Push via Notification API e Service Worker)
async function triggerDeliveryPushNotification(title: string, body: string) {
  playNotificationChime();

  if ("vibrate" in navigator) {
    try {
      navigator.vibrate([250, 100, 250, 100, 250]);
    } catch { /* silencioso */ }
  }

  if (typeof window !== "undefined" && "Notification" in window) {
    if (Notification.permission === "granted") {
      try {
        if ("serviceWorker" in navigator) {
          const registration = await navigator.serviceWorker.ready;
          if (registration && "showNotification" in registration) {
            await registration.showNotification(title, {
              body,
              icon: "/pwa-icon-192.png",
              badge: "/pwa-icon-192.png",
              vibrate: [250, 100, 250, 100, 250],
              data: { url: "/entregador" },
              tag: `entrega-${Date.now()}`,
              renotify: true,
            } as any);
            return;
          }
        }
        new Notification(title, {
          body,
          icon: "/pwa-icon-192.png",
        });
      } catch (err) {
        console.warn("[Push] Erro ao disparar notificação:", err);
      }
    }
  }
}

export default function EntregadorPage() {
  const { user, signOut, isAdmin, hasModule } = useAuth();
  const canManage = isAdmin || hasModule("entregas");
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [availableDrivers, setAvailableDrivers] = useState<Entregador[]>([]);
  const [selectedDriverId, setSelectedDriverId] = useState<string>("");
  const [driverProfile, setDriverProfile] = useState<{
    nome_completo: string;
    placa_veiculo: string | null;
  } | null>(null);

  // Modais de ação
  const [completionOrder, setCompletionOrder] = useState<Order | null>(null);
  const [recipientName, setRecipientName] = useState("");
  const [deliveryNotes, setDeliveryNotes] = useState("");
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [proofPreviewUrl, setProofPreviewUrl] = useState<string | null>(null);
  const [submittingCompletion, setSubmittingCompletion] = useState(false);

  const [failureOrder, setFailureOrder] = useState<Order | null>(null);
  const [failureReason, setFailureReason] = useState<string>(INSUCESSO_MOTIVOS[0]);
  const [failureNotes, setFailureNotes] = useState("");
  const [submittingFailure, setSubmittingFailure] = useState(false);

  const [activeTabFilter, setActiveTabFilter] = useState<"pendentes" | "concluidas">("pendentes");
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Microsoft / SharePoint corporativo
  const [msUser, setMsUser] = useState<StoredMicrosoftUser | null>(() => getStoredMicrosoftUser());

  useEffect(() => {
    void getActiveMicrosoftAccount().then((acc) => {
      if (acc) {
        setMsUser({ name: acc.name || acc.username, username: acc.username });
      }
    });

    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === "kaban_msal_user_info") {
        setMsUser(getStoredMicrosoftUser());
      }
    };
    window.addEventListener("storage", handleStorageChange);
    return () => window.removeEventListener("storage", handleStorageChange);
  }, []);

  const handleConnectMicrosoft = async () => {
    try {
      const acc = await loginMicrosoft();
      if (acc) {
        setMsUser({ name: acc.name || acc.username, username: acc.username });
        toast.success(`Conectado ao SharePoint corporativo como ${acc.name || acc.username}`);
      }
    } catch (err: any) {
      toast.error(`Falha ao conectar Microsoft: ${err?.message || err}`);
    }
  };

  // PWA Install Prompt
  const [deferredPrompt, setDeferredPrompt] = useState<any>(() => {
    if (typeof window !== "undefined") {
      return (window as any).__pwaInstallPrompt || null;
    }
    return null;
  });
  const [isInstalled, setIsInstalled] = useState(false);
  const [showInstallBanner, setShowInstallBanner] = useState(true);
  const [showInstallHelpModal, setShowInstallHelpModal] = useState(false);

  useEffect(() => {
    const isStandalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as any).standalone === true ||
      document.referrer.includes("android-app://");

    if (isStandalone) {
      setIsInstalled(true);
      setShowInstallBanner(false);
    }

    if ((window as any).__pwaInstallPrompt) {
      setDeferredPrompt((window as any).__pwaInstallPrompt);
    }

    const handlePromptReady = (e: any) => {
      setDeferredPrompt(e.detail || (window as any).__pwaInstallPrompt);
      setShowInstallBanner(true);
    };

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      (window as any).__pwaInstallPrompt = e;
      setDeferredPrompt(e);
      setShowInstallBanner(true);
    };

    const handleAppInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
      (window as any).__pwaInstallPrompt = null;
      setShowInstallBanner(false);
      setShowInstallHelpModal(false);
      toast.success("App do Entregador instalado com sucesso no seu celular!");
    };

    window.addEventListener("pwa-prompt-ready", handlePromptReady);
    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleAppInstalled);

    return () => {
      window.removeEventListener("pwa-prompt-ready", handlePromptReady);
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, []);

  const handleInstallClick = async () => {
    const promptEvent = deferredPrompt || (window as any).__pwaInstallPrompt;

    if (promptEvent) {
      try {
        promptEvent.prompt();
        const { outcome } = await promptEvent.userChoice;
        if (outcome === "accepted") {
          setIsInstalled(true);
          setDeferredPrompt(null);
          (window as any).__pwaInstallPrompt = null;
          setShowInstallBanner(false);
          toast.success("Instalação iniciada! O app aparecerá na tela inicial do seu celular.");
        }
      } catch (err) {
        console.error("Erro ao solicitar instalação PWA:", err);
      }
    } else {
      setShowInstallHelpModal(true);
    }
  };

  // Permissão de Notificações Push do Navegador
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission>(() => {
    if (typeof window !== "undefined" && "Notification" in window) {
      return Notification.permission;
    }
    return "default";
  });

  const handleRequestNotificationPermission = async () => {
    if (typeof window === "undefined" || !("Notification" in window)) {
      toast.error("Seu navegador não suporta notificações nativas.");
      return;
    }

    try {
      const res = await Notification.requestPermission();
      setNotificationPermission(res);
      if (res === "granted") {
        playNotificationChime();
        toast.success("Notificações push ativadas com sucesso!");
        void triggerDeliveryPushNotification(
          "🔔 Notificações Ativadas!",
          "Você receberá alertas sonoros e visuais a cada nova entrega atribuída a você."
        );
      } else if (res === "denied") {
        toast.error("Notificações bloqueadas nas configurações do navegador.");
      }
    } catch (err) {
      console.warn("Erro ao pedir permissão de notificação:", err);
    }
  };

  // Captura e envio seguro de coordenadas GPS
  const sendGpsTelemetry = async (orderId?: string) => {
    if (!navigator.geolocation) return;

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude, accuracy, speed } = pos.coords;
        let bateriaPct: number | null = null;
        if ("getBattery" in navigator) {
          (navigator as any).getBattery?.().then((battery: any) => {
            bateriaPct = Math.round(battery.level * 100);
            void recordGpsCheckpoint({
              orderId,
              latitude,
              longitude,
              precisaoMetros: accuracy,
              velocidadeKmh: speed ? speed * 3.6 : null,
              bateriaPercentual: bateriaPct,
            });
          });
        } else {
          void recordGpsCheckpoint({
            orderId,
            latitude,
            longitude,
            precisaoMetros: accuracy,
            velocidadeKmh: speed ? speed * 3.6 : null,
          });
        }
      },
      (err) => {
        console.warn("[GPS] Não foi possível obter localização:", err.message);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 }
    );
  };

  const fetchDriverData = async () => {
    if (!user) return;
    setLoading(true);

    try {
      if (canManage) {
        try {
          const listRes = await getEntregadoresList();
          if (listRes.data && Array.isArray(listRes.data)) {
            setAvailableDrivers(listRes.data);
          }
        } catch { /* ignore */ }
      }

      const targetUserId = (canManage && selectedDriverId) ? selectedDriverId : user.id;

      // 1. Perfil do entregador
      const { data: driverData } = await supabase
        .from("entregadores" as any)
        .select("nome_completo, placa_veiculo")
        .eq("user_id", targetUserId)
        .maybeSingle();

      if (driverData) {
        setDriverProfile(driverData as any);
      } else {
        const found = availableDrivers.find(d => d.user_id === targetUserId);
        setDriverProfile(found ? { nome_completo: found.nome_completo, placa_veiculo: null } : null);
      }

      // 2. Ordens atribuídas ao entregador
      const { data: ordersData, error: ordersError } = await supabase
        .from("orders")
        .select("*")
        .eq("entregador_id", targetUserId)
        .order("ordem_parada", { ascending: true, nullsFirst: false });

      if (ordersError) {
        console.warn("[EntregadorPage] Erro ao carregar ordens:", ordersError.message);
      } else if (ordersData) {
        setOrders(ordersData as unknown as Order[]);
      }
    } catch (err) {
      console.warn("[EntregadorPage] Falha:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchDriverData();

    // Inscrição Realtime para atualizações na tabela de ordens com alerta push para o entregador
    const channel = supabase
      .channel("driver-orders-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "orders" },
        (payload: any) => {
          const targetUserId = (canManage && selectedDriverId) ? selectedDriverId : user.id;

          if (payload.eventType === "INSERT") {
            const newRow = payload.new as any;
            if (newRow && newRow.entregador_id === targetUserId && newRow.status_entrega !== "entregue") {
              void triggerDeliveryPushNotification(
                `📦 Nova Entrega: O.S. #${newRow.titulo || ""}`,
                `Cliente: ${newRow.cliente || "Novo destino"}\nEndereço: ${newRow.entrega_endereco || "Ver detalhes da rota"}`
              );
              toast.success(`Nova entrega recebida: O.S. #${newRow.titulo}`);
            }
          } else if (payload.eventType === "UPDATE") {
            const newRow = payload.new as any;
            const oldRow = payload.old as any;
            if (
              newRow &&
              newRow.entregador_id === targetUserId &&
              oldRow?.entregador_id !== targetUserId &&
              newRow.status_entrega !== "entregue"
            ) {
              void triggerDeliveryPushNotification(
                `📦 Nova Entrega Atribuída: O.S. #${newRow.titulo || ""}`,
                `Cliente: ${newRow.cliente || "Novo destino"}\nEndereço: ${newRow.entrega_endereco || "Ver detalhes da rota"}`
              );
              toast.success(`Nova entrega atribuída para você: O.S. #${newRow.titulo}`);
            }
          }

          void fetchDriverData();
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [user, selectedDriverId]);

  // Contadores
  const stats = useMemo(() => {
    let pendentes = 0;
    let concluidas = 0;
    orders.forEach((o) => {
      const st = o.status_entrega || "pendente";
      if (st === "entregue") concluidas++;
      else pendentes++;
    });
    return { total: orders.length, pendentes, concluidas };
  }, [orders]);

  // Filtra ordens pela aba
  const displayedOrders = useMemo(() => {
    return orders.filter((o) => {
      const st = o.status_entrega || "pendente";
      if (activeTabFilter === "pendentes") {
        return st !== "entregue";
      }
      return st === "entregue";
    });
  }, [orders, activeTabFilter]);

  // Transição: Iniciar Rota
  const handleStartRoute = async (order: Order) => {
    const res = await updateDriverDeliveryStatus({
      orderId: order.id,
      newStatus: "em_rota",
    });

    if (res.success) {
      toast.success(`Rota iniciada para a O.S. #${order.titulo}!`);
      void sendGpsTelemetry(order.id);
      void fetchDriverData();
    } else {
      toast.error(res.error || "Erro ao iniciar rota.");
    }
  };

  // Transição: Cheguei no Local
  const handleArrivedAtDestination = async (order: Order) => {
    const res = await updateDriverDeliveryStatus({
      orderId: order.id,
      newStatus: "no_local",
    });

    if (res.success) {
      toast.success("Chegada ao destino confirmada!");
      void sendGpsTelemetry(order.id);
      void fetchDriverData();
    } else {
      toast.error(res.error || "Erro ao registrar chegada.");
    }
  };

  // Modal: Abrir conclusão de entrega
  const handleOpenCompletion = (order: Order) => {
    setCompletionOrder(order);
    setRecipientName("");
    setDeliveryNotes("");
    setProofFile(null);
    setProofPreviewUrl(null);
  };

  // Upload e Finalização da Entrega (Zero-Friction: entregador não precisa logar no MS 365)
  const handleConfirmDelivery = async () => {
    if (!completionOrder) return;

    if (!recipientName.trim()) {
      toast.error("Por favor, informe o nome de quem recebeu a mercadoria.");
      return;
    }

    setSubmittingCompletion(true);

    try {
      let comprovanteSynced = false;

      // Se houver arquivo de comprovante fotografado
      if (proofFile) {
        // Tentativa rápida e silenciosa: se o dispositivo já possuir sessão MS 365 conectada, tenta direto
        const activeMs = msUser || (await getActiveMicrosoftAccount());
        if (activeMs) {
          try {
            const spRes = await uploadDeliveryProtocolToSharePoint(
              proofFile,
              completionOrder.titulo || completionOrder.id,
              recipientName.trim(),
              undefined,
              false // NUNCA abre popup interativo no celular do motoboy
            );

            if (spRes.success && spRes.driveItem && spRes.folderInfo) {
              comprovanteSynced = true;
              try {
                await supabase.from("order_attachments" as any).insert({
                  order_id: completionOrder.id,
                  nome_arquivo: spRes.driveItem.name || proofFile.name,
                  tamanho_bytes: spRes.driveItem.size || proofFile.size,
                  content_type: proofFile.type || "image/jpeg",
                  sharepoint_item_id: spRes.driveItem.id,
                  sharepoint_folder_id: spRes.folderInfo.folderId,
                  sharepoint_folder_name: spRes.folderInfo.folderName,
                  sharepoint_drive_id: spRes.folderInfo.driveId,
                  sharepoint_site_id: spRes.folderInfo.siteId,
                  sharepoint_web_url: spRes.driveItem.webUrl,
                  sharepoint_path: `${SHAREPOINT_PROTOCOLOS_FOLDER}/${spRes.driveItem.name}`,
                  status: "sincronizado",
                });
              } catch (attErr) {
                console.warn("[EntregadorPage] Erro ao gravar metadados em order_attachments:", attErr);
              }
            }
          } catch (spErr) {
            console.warn("[EntregadorPage] Upload direto ao SharePoint falhou silenciosamente, usando fila:", spErr);
          }
        }

        // Se o motoboy está na rua sem conta corporativa MS 365 (caso padrão):
        // Salva instantaneamente na fila segura e não bloqueia a entrega!
        if (!comprovanteSynced) {
          const uploadRes = await uploadDeliveryProofFile(completionOrder.id, proofFile);
          if (!uploadRes.success) {
            toast.error(uploadRes.error || "Erro ao salvar foto do comprovante.");
            return;
          }
        }

        // Atualiza status do comprovante na ordem (pendente_sharepoint ou sincronizado)
        await supabase
          .from("orders")
          .update({
            status_comprovante_sync: comprovanteSynced ? "sincronizado" : "pendente_sharepoint",
          } as any)
          .eq("id", completionOrder.id);
      }

      const res = await updateDriverDeliveryStatus({
        orderId: completionOrder.id,
        newStatus: "entregue",
        entreguePara: recipientName.trim(),
        obsEntrega: deliveryNotes.trim() || undefined,
      });

      if (res.success) {
        toast.success(
          proofFile && !comprovanteSynced
            ? `Entrega da O.S. #${completionOrder.titulo} concluída! Foto enfileirada para o SharePoint.`
            : `Entrega da O.S. #${completionOrder.titulo} concluída com sucesso!`
        );
        void sendGpsTelemetry(completionOrder.id);
        setCompletionOrder(null);
        void fetchDriverData();
      } else {
        toast.error(res.error || "Erro ao concluir entrega.");
      }
    } catch (err: any) {
      console.error("[EntregadorPage] Erro inesperado ao confirmar entrega:", err);
      toast.error(err?.message || "Erro ao registrar entrega.");
    } finally {
      setSubmittingCompletion(false);
    }
  };

  // Modal: Abrir registro de insucesso
  const handleOpenFailure = (order: Order) => {
    setFailureOrder(order);
    setFailureReason(INSUCESSO_MOTIVOS[0]);
    setFailureNotes("");
  };

  // Grava Insucesso
  const handleConfirmFailure = async () => {
    if (!failureOrder) return;

    const fullReason = failureNotes.trim()
      ? `${failureReason} — ${failureNotes.trim()}`
      : failureReason;

    setSubmittingFailure(true);
    const res = await updateDriverDeliveryStatus({
      orderId: failureOrder.id,
      newStatus: "insucesso",
      motivoInsucesso: fullReason,
    });
    setSubmittingFailure(false);

    if (res.success) {
      toast.error(`Ocorrência de insucesso registrada para O.S. #${failureOrder.titulo}.`);
      void sendGpsTelemetry(failureOrder.id);
      setFailureOrder(null);
      void fetchDriverData();
    } else {
      toast.error(res.error || "Erro ao registrar insucesso.");
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setProofFile(file);
      const url = URL.createObjectURL(file);
      setProofPreviewUrl(url);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col pb-12 select-none">
      {/* Barra de Topo do Entregador */}
      <header className="sticky top-0 z-30 bg-zinc-900/90 backdrop-blur-md border-b border-zinc-800 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <img
            src="/pwa-icon-192.png"
            alt="Primacor Entregas"
            className="h-9 w-9 rounded-xl object-contain shadow-sm border border-zinc-700/60"
          />
          <div>
            <h1 className="text-sm font-bold text-zinc-100 leading-tight">
              {driverProfile?.nome_completo || user?.email?.split("@")[0] || "Entregador"}
            </h1>
            <p className="text-[11px] text-zinc-400">
              {driverProfile?.placa_veiculo ? `Placa: ${driverProfile.placa_veiculo} • ` : ""}
              Primacor Entregas
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          {!isInstalled && (
            <Button
              variant="default"
              size="sm"
              onClick={handleInstallClick}
              className="h-8 px-2.5 bg-sky-500 hover:bg-sky-400 text-zinc-950 font-bold text-xs gap-1.5 shadow-sm shadow-sky-500/20 cursor-pointer"
              title="Instalar aplicativo do entregador no celular"
            >
              <Download className="h-3.5 w-3.5" />
              <span className="hidden xs:inline">Instalar App</span>
            </Button>
          )}
          {canManage && (
            <Button
              asChild
              variant="ghost"
              size="sm"
              className="h-8 text-xs text-zinc-400 hover:text-zinc-200 gap-1 px-2"
              title="Voltar ao Painel de Entregas"
            >
              <Link to="/entregas">
                <ArrowLeft className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Painel</span>
              </Link>
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            className={cn(
              "h-8 w-8 transition-colors",
              notificationPermission === "granted"
                ? "text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10"
                : "text-amber-400 hover:text-amber-300 hover:bg-amber-500/10"
            )}
            onClick={
              notificationPermission === "granted"
                ? () => {
                    void triggerDeliveryPushNotification(
                      "🔔 Teste de Notificação Primacor",
                      "O som e alerta de nova entrega estão funcionando perfeitamente!"
                    );
                    toast.success("Teste de notificação enviado!");
                  }
                : handleRequestNotificationPermission
            }
            title={
              notificationPermission === "granted"
                ? "Notificações ativadas (Clique para testar)"
                : "Ativar notificações de novas entregas"
            }
          >
            {notificationPermission === "granted" ? (
              <BellRing className="h-4 w-4" />
            ) : (
              <Bell className="h-4 w-4" />
            )}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-zinc-400 hover:text-zinc-200"
            onClick={() => void fetchDriverData()}
            title="Atualizar lista"
          >
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-zinc-400 hover:text-red-400"
            onClick={() => void signOut()}
            title="Sair do sistema"
          >
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </header>

      {/* Resumo & Abas Mobile */}
      <div className="p-4 flex flex-col gap-3 max-w-lg mx-auto w-full">
        {/* Banner de Instalação do App PWA no Celular */}
        {!isInstalled && showInstallBanner && (
          <div className="bg-gradient-to-r from-sky-950/80 via-zinc-900 to-emerald-950/70 border border-sky-500/40 rounded-xl p-3.5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-lg">
            <div className="flex items-center gap-3 min-w-0">
              <img
                src="/pwa-icon-192.png"
                alt="App Entregador"
                className="h-11 w-11 rounded-xl object-contain shadow-md shrink-0 border border-sky-400/40"
              />
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-white text-xs sm:text-sm block truncate">
                    Instalar App do Entregador
                  </span>
                  <Badge className="bg-sky-500/20 text-sky-300 border-sky-500/30 text-[9px] px-1.5 py-0">
                    Direto na Tela Inicial
                  </Badge>
                </div>
                <span className="text-[11px] text-zinc-300 block leading-tight mt-0.5">
                  Receba alertas sonoros e abra com 1 toque, sem precisar abrir pelo navegador.
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto shrink-0 justify-end pt-1 sm:pt-0">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setShowInstallBanner(false)}
                className="text-xs text-zinc-400 hover:text-white h-8 px-2.5"
              >
                Depois
              </Button>
              <Button
                size="sm"
                onClick={handleInstallClick}
                className="bg-sky-500 hover:bg-sky-400 text-zinc-950 font-bold text-xs h-8 px-3.5 shadow-md shadow-sky-500/25 flex-1 sm:flex-initial cursor-pointer gap-1.5"
              >
                <Download className="h-3.5 w-3.5" />
                Instalar Agora
              </Button>
            </div>
          </div>
        )}

        {/* Banner para Ativar Notificações Push do Navegador */}
        {notificationPermission !== "granted" && (
          <div className="bg-gradient-to-r from-amber-950/70 via-zinc-900 to-[#11212D] border border-amber-500/40 rounded-xl p-3 flex items-center justify-between gap-3 shadow-md">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="p-2 rounded-lg bg-amber-500/20 text-amber-400 shrink-0">
                <BellRing className="h-5 w-5 animate-pulse" />
              </div>
              <div className="min-w-0">
                <span className="font-bold text-white text-xs block truncate">
                  Ativar Alertas de Novas Entregas
                </span>
                <span className="text-[11px] text-zinc-400 block truncate">
                  Receba aviso push no celular e som a cada nova rota
                </span>
              </div>
            </div>
            <Button
              size="sm"
              onClick={handleRequestNotificationPermission}
              className="bg-amber-600 hover:bg-amber-500 text-white font-semibold text-xs h-8 px-3.5 shrink-0 shadow-sm"
            >
              Ativar
            </Button>
          </div>
        )}

        {/* Seletor de Simulação para Gestores */}
        {canManage && (
          <div className="bg-zinc-900/90 border border-zinc-800 rounded-lg p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-zinc-300">Visualizar como:</span>
              <Badge variant="outline" className="text-[10px] bg-primary/10 text-primary border-primary/30">Gestor</Badge>
            </div>
            <Select
              value={selectedDriverId || user?.id || "me"}
              onValueChange={(val) => setSelectedDriverId(val === "me" ? (user?.id || "") : val)}
            >
              <SelectTrigger className="h-8 w-full sm:w-[220px] bg-zinc-950 border-zinc-700 text-xs">
                <SelectValue placeholder="Selecione um motoboy..." />
              </SelectTrigger>
              <SelectContent className="bg-zinc-900 border-zinc-800 text-zinc-100">
                <SelectItem value={user?.id || "me"}>Minhas Entregas ({user?.email?.split("@")[0]})</SelectItem>
                {availableDrivers.map((d) => (
                  <SelectItem key={d.user_id} value={d.user_id}>
                    {d.nome_completo}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        {/* Cards de Contagem */}
        <div className="grid grid-cols-3 gap-2">
          <div className="bg-zinc-900/70 border border-zinc-800 rounded-lg p-2.5 text-center">
            <span className="text-[10px] uppercase font-semibold text-zinc-400 tracking-wider">Total</span>
            <div className="text-xl font-bold text-zinc-100 mt-0.5">{stats.total}</div>
          </div>
          <div
            onClick={() => setActiveTabFilter("pendentes")}
            className={cn(
              "border rounded-lg p-2.5 text-center cursor-pointer transition-all",
              activeTabFilter === "pendentes"
                ? "bg-amber-950/40 border-amber-600 ring-1 ring-amber-500"
                : "bg-zinc-900/70 border-zinc-800 opacity-80"
            )}
          >
            <span className="text-[10px] uppercase font-semibold text-amber-400 tracking-wider">A Entregar</span>
            <div className="text-xl font-bold text-amber-300 mt-0.5">{stats.pendentes}</div>
          </div>
          <div
            onClick={() => setActiveTabFilter("concluidas")}
            className={cn(
              "border rounded-lg p-2.5 text-center cursor-pointer transition-all",
              activeTabFilter === "concluidas"
                ? "bg-emerald-950/40 border-emerald-600 ring-1 ring-emerald-500"
                : "bg-zinc-900/70 border-zinc-800 opacity-80"
            )}
          >
            <span className="text-[10px] uppercase font-semibold text-emerald-400 tracking-wider">Entregues</span>
            <div className="text-xl font-bold text-emerald-300 mt-0.5">{stats.concluidas}</div>
          </div>
        </div>

        {/* Lista de Ordens */}
        <div className="flex flex-col gap-3 mt-1">
          {loading ? (
            <div className="text-center py-16 text-zinc-500 text-sm">
              <RefreshCw className="h-6 w-6 animate-spin mx-auto mb-2 text-zinc-400" />
              Carregando suas entregas...
            </div>
          ) : displayedOrders.length === 0 ? (
            <div className="text-center py-12 px-4 text-zinc-400 text-sm bg-zinc-900/40 rounded-xl border border-zinc-800/80 flex flex-col items-center gap-3">
              <Package className="h-10 w-10 text-zinc-600 mb-1" />
              <div>
                <p className="font-semibold text-zinc-200">
                  {activeTabFilter === "pendentes"
                    ? "Nenhuma entrega atribuída a este usuário no momento."
                    : "Nenhuma entrega concluída registrada."}
                </p>
                <p className="text-xs text-zinc-500 mt-1 max-w-sm">
                  O aplicativo do entregador exibe as ordens de serviço atribuídas a cada motoboy.
                </p>
              </div>

              {canManage && (
                <div className="pt-2">
                  <Button asChild size="sm" className="gap-2 bg-primary text-primary-foreground font-medium text-xs">
                    <Link to="/entregas">
                      <Package className="h-3.5 w-3.5" />
                      Ir para Gestão de Entregas e Atribuir O.S.
                    </Link>
                  </Button>
                </div>
              )}
            </div>
          ) : (
            displayedOrders.map((order) => {
              const status = (order.status_entrega || "pendente") as DeliveryStatus;
              const statusCfg = DELIVERY_STATUS_CONFIG[status] || DELIVERY_STATUS_CONFIG.pendente;
              const address = order.entrega_endereco || order.endereco_entrega || "";

              return (
                <div
                  key={order.id}
                  className={cn(
                    "rounded-xl border bg-zinc-900/90 p-4 flex flex-col gap-3 shadow-md transition-all",
                    status === "em_rota" && "border-amber-500/80 ring-1 ring-amber-500/40",
                    status === "no_local" && "border-purple-500/80 ring-1 ring-purple-500/40",
                    status === "entregue" && "border-emerald-900/60 opacity-85",
                    status === "insucesso" && "border-red-900/70",
                    status === "pendente" || status === "atribuido" ? "border-zinc-800" : ""
                  )}
                >
                  {/* Cabeçalho do Card */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      {order.ordem_parada && (
                        <div className="h-6 w-6 rounded-md bg-primary/20 text-primary border border-primary/40 font-bold text-xs flex items-center justify-center shrink-0">
                          #{order.ordem_parada}
                        </div>
                      )}
                      <div>
                        <div className="font-bold text-base text-zinc-100 flex items-center gap-1.5 flex-wrap">
                          <span>{order.tipo_entrega?.includes("coleta") ? "COLETA" : "O.S."} {order.titulo}</span>
                          {order.tipo_entrega?.includes("coleta") && (
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-bold bg-amber-500/20 text-amber-400 border-amber-500/40">
                              COLETA
                            </Badge>
                          )}
                          {order.urgente && (
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-bold bg-red-500/20 text-red-400 border-red-500/40">
                              URGENTE
                            </Badge>
                          )}
                        </div>
                        <div className="text-xs font-semibold text-zinc-300 line-clamp-1">
                          {order.cliente}
                        </div>
                      </div>
                    </div>

                    <Badge
                      variant="outline"
                      className={cn("text-[10px] px-2 py-0.5 shrink-0", statusCfg.badgeClass)}
                    >
                      {statusCfg.label}
                    </Badge>
                  </div>

                  {/* Endereço de Entrega Clicável */}
                  {address ? (
                    <div className="bg-zinc-950/70 border border-zinc-800/80 rounded-lg p-3 flex flex-col gap-2">
                      <div className="flex items-start gap-2 text-xs text-zinc-300">
                        <MapPin className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                        <span className="leading-snug">{address}</span>
                      </div>

                      <div className="flex items-center gap-2 pt-1 border-t border-zinc-800/50">
                        <a
                          href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(
                            address
                          )}`}
                          target="_blank"
                          rel="noreferrer"
                          className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium py-1.5 px-2.5 rounded flex items-center justify-center gap-1.5 transition-colors"
                        >
                          <Navigation className="h-3.5 w-3.5 text-primary" />
                          Navegar (Google Maps)
                        </a>
                        <a
                          href={`https://waze.com/ul?q=${encodeURIComponent(address)}&navigate=yes`}
                          target="_blank"
                          rel="noreferrer"
                          className="bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium py-1.5 px-3 rounded flex items-center justify-center gap-1 transition-colors"
                        >
                          Waze
                        </a>
                      </div>
                    </div>
                  ) : (
                    <div className="text-xs text-zinc-500 italic flex items-center gap-1">
                      <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                      Endereço de entrega não especificado na O.S.
                    </div>
                  )}

                  {/* Descrição do Material */}
                  {order.descricao && (
                    <p className="text-xs text-zinc-400 line-clamp-2 bg-zinc-950/40 p-2 rounded border border-zinc-800/40">
                      <span className="text-zinc-500 font-medium">Item: </span>
                      {order.descricao}
                    </p>
                  )}

                  {/* Detalhes de Conclusão ou Falha */}
                  {status === "entregue" && (
                    <div className="text-xs text-emerald-400 bg-emerald-950/30 border border-emerald-900/50 p-2 rounded flex flex-col gap-1">
                      <div className="flex items-center gap-1 font-medium">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        Recebido por: {order.entregue_para || "Comprovante anexado"}
                      </div>
                      {order.data_chegada_entrega && (
                        <div className="text-[11px] text-zinc-400 flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {format(parseISO(order.data_chegada_entrega), "dd/MM/yyyy HH:mm", {
                            locale: ptBR,
                          })}
                        </div>
                      )}
                    </div>
                  )}

                  {status === "insucesso" && (
                    <div className="text-xs text-red-400 bg-red-950/30 border border-red-900/50 p-2 rounded flex flex-col gap-1">
                      <div className="flex items-center gap-1 font-medium">
                        <AlertTriangle className="h-3.5 w-3.5" />
                        Insucesso na entrega:
                      </div>
                      <p className="text-[11px] text-zinc-300">{order.motivo_insucesso}</p>
                    </div>
                  )}

                  {/* Botões de Ação da Máquina de Estados */}
                  <div className="flex flex-col gap-2 pt-1 border-t border-zinc-800/80">
                    {/* Status: atribuido / pendente -> Iniciar Rota */}
                    {(status === "atribuido" || status === "pendente") && (
                      <Button
                        size="sm"
                        className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-xs h-10 gap-2"
                        onClick={() => handleStartRoute(order)}
                      >
                        <Bike className="h-4 w-4" />
                        {order.tipo_entrega?.includes("coleta") ? "Iniciar Rota para Coleta" : "Iniciar Rota para esta O.S."}
                      </Button>
                    )}

                    {/* Status: em_rota -> Cheguei no Local */}
                    {status === "em_rota" && (
                      <Button
                        size="sm"
                        className="w-full bg-purple-600 hover:bg-purple-700 text-white font-semibold text-xs h-10 gap-2"
                        onClick={() => handleArrivedAtDestination(order)}
                      >
                        <MapPin className="h-4 w-4" />
                        {order.tipo_entrega?.includes("coleta") ? "Cheguei no Local de Coleta" : "Cheguei no Local de Entrega"}
                      </Button>
                    )}

                    {/* Status: no_local -> Concluir ou Registrar Insucesso */}
                    {status === "no_local" && (
                      <div className="grid grid-cols-2 gap-2">
                        <Button
                          size="sm"
                          variant="destructive"
                          className="font-medium text-xs h-10 gap-1.5"
                          onClick={() => handleOpenFailure(order)}
                        >
                          <AlertTriangle className="h-3.5 w-3.5" />
                          {order.tipo_entrega?.includes("coleta") ? "Não Coletado" : "Não Entregue"}
                        </Button>

                        <Button
                          size="sm"
                          className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs h-10 gap-1.5"
                          onClick={() => handleOpenCompletion(order)}
                        >
                          <FileCheck className="h-4 w-4" />
                          {order.tipo_entrega?.includes("coleta") ? "Concluir Coleta" : "Concluir Entrega"}
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Modal: Concluir Entrega com Foto e Recebedor */}
      <Dialog
        open={!!completionOrder}
        onOpenChange={(open) => !open && setCompletionOrder(null)}
      >
        <DialogContent className="max-w-md bg-zinc-900 border-zinc-800 text-zinc-100 p-5">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-emerald-400 font-bold text-base">
              <CheckCircle2 className="h-5 w-5" />
              Finalizar Entrega — O.S. {completionOrder?.titulo}
            </DialogTitle>
          </DialogHeader>

          <div className="flex flex-col gap-4 py-2 text-xs">
            {/* Destino corporativo no SharePoint */}
            <div className="rounded-lg bg-sky-950/40 border border-sky-800/40 p-2.5 flex items-center justify-between text-xs">
              <div className="flex items-center gap-2 text-sky-200">
                <Cloud className="h-4 w-4 text-sky-400 shrink-0" />
                <span>Destino: <strong>SharePoint · PROTOCOLOS ENTREGAS</strong></span>
              </div>
              <Badge variant="outline" className="text-[10px] bg-sky-500/10 text-sky-300 border-sky-500/30">
                Auto-Sync Ativo
              </Badge>
            </div>

            {/* Nome de quem recebeu */}
            <div className="space-y-1.5">
              <Label htmlFor="recipient-name" className="text-zinc-200 font-semibold">
                Nome completo de quem recebeu *
              </Label>
              <Input
                id="recipient-name"
                placeholder="Ex: João Silva (Recepcionista / Porteiro)"
                value={recipientName}
                onChange={(e) => setRecipientName(e.target.value)}
                className="bg-zinc-950 border-zinc-800 text-zinc-100 text-xs"
                autoFocus
              />
            </div>

            {/* Captura de Foto do Comprovante */}
            <div className="space-y-1.5">
              <Label className="text-zinc-200 font-semibold">
                Foto do Comprovante Assinado / Mercadoria
              </Label>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                onChange={handleFileChange}
                className="hidden"
              />

              {proofPreviewUrl ? (
                <div className="relative rounded-lg overflow-hidden border border-zinc-700 max-h-48 flex items-center justify-center bg-black">
                  <img
                    src={proofPreviewUrl}
                    alt="Comprovante"
                    className="max-h-48 object-contain"
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    className="absolute bottom-2 right-2 text-xs h-7 gap-1"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Camera className="h-3 w-3" />
                    Tirar outra foto
                  </Button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full border-2 border-dashed border-zinc-700 hover:border-primary/60 rounded-lg p-5 flex flex-col items-center justify-center gap-2 text-zinc-400 hover:text-zinc-200 transition-colors bg-zinc-950/50"
                >
                  <Camera className="h-7 w-7 text-primary" />
                  <span className="font-semibold text-xs text-zinc-300">
                    Fotografar Comprovante / Canhoto
                  </span>
                  <span className="text-[11px] text-zinc-500">
                    Toque para abrir a câmera do celular
                  </span>
                </button>
              )}
            </div>

            {/* Observações opcionais */}
            <div className="space-y-1.5">
              <Label htmlFor="delivery-notes" className="text-zinc-200">
                Observações Adicionais (Opcional)
              </Label>
              <Textarea
                id="delivery-notes"
                placeholder="Ex: Entregue na portaria bloco B, deixado com protocolo..."
                value={deliveryNotes}
                onChange={(e) => setDeliveryNotes(e.target.value)}
                className="bg-zinc-950 border-zinc-800 text-zinc-100 text-xs min-h-[60px]"
              />
            </div>
          </div>

          <DialogFooter className="flex gap-2 sm:justify-end border-t border-zinc-800 pt-3">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setCompletionOrder(null)}
              disabled={submittingCompletion}
              className="border-zinc-800 text-zinc-300"
            >
              Voltar
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleConfirmDelivery}
              disabled={submittingCompletion}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold"
            >
              {submittingCompletion ? "Registrando..." : "Confirmar Entrega"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal: Registrar Insucesso */}
      <Dialog
        open={!!failureOrder}
        onOpenChange={(open) => !open && setFailureOrder(null)}
      >
        <DialogContent className="max-w-md bg-zinc-900 border-zinc-800 text-zinc-100 p-5">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-400 font-bold text-base">
              <AlertTriangle className="h-5 w-5" />
              Ocorrência de Insucesso — O.S. {failureOrder?.titulo}
            </DialogTitle>
          </DialogHeader>

          <div className="flex flex-col gap-4 py-2 text-xs">
            <div className="space-y-1.5">
              <Label htmlFor="failure-reason" className="text-zinc-200 font-semibold">
                Motivo da não entrega *
              </Label>
              <Select value={failureReason} onValueChange={setFailureReason}>
                <SelectTrigger id="failure-reason" className="bg-zinc-950 border-zinc-800 text-zinc-100 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-zinc-900 border-zinc-800 text-zinc-100">
                  {INSUCESSO_MOTIVOS.map((m) => (
                    <SelectItem key={m} value={m} className="text-xs">
                      {m}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="failure-notes" className="text-zinc-200">
                Detalhes da Ocorrência
              </Label>
              <Textarea
                id="failure-notes"
                placeholder="Descreva detalhes: tentou contato telefônico, portaria informou que mudou, etc..."
                value={failureNotes}
                onChange={(e) => setFailureNotes(e.target.value)}
                className="bg-zinc-950 border-zinc-800 text-zinc-100 text-xs min-h-[70px]"
              />
            </div>
          </div>

          <DialogFooter className="flex gap-2 sm:justify-end border-t border-zinc-800 pt-3">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setFailureOrder(null)}
              disabled={submittingFailure}
              className="border-zinc-800 text-zinc-300"
            >
              Voltar
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={handleConfirmFailure}
              disabled={submittingFailure}
              className="font-semibold"
            >
              {submittingFailure ? "Registrando..." : "Registrar Insucesso"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* MODAL DE INSTRUÇÕES DE INSTALAÇÃO DO PWA */}
      <Dialog open={showInstallHelpModal} onOpenChange={setShowInstallHelpModal}>
        <DialogContent className="max-w-md bg-[#0B131E] border-sky-900/60 text-white p-5 rounded-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2.5 text-sky-400 text-base">
              <img
                src="/pwa-icon-192.png"
                alt="App Entregador"
                className="h-7 w-7 rounded-lg object-contain border border-sky-500/30 shadow-sm"
              />
              Como Instalar o App do Entregador
            </DialogTitle>
          </DialogHeader>

          {/iPad|iPhone|iPod/.test(navigator.userAgent) ? (
            <div className="space-y-3.5 text-xs text-slate-300 py-2">
              <p className="text-slate-200 font-medium">
                No Safari do seu iPhone, siga os 3 passos rápidos:
              </p>
              <div className="space-y-2.5">
                <div className="flex items-start gap-2.5 p-2.5 rounded-lg bg-zinc-900/80 border border-zinc-800">
                  <div className="h-6 w-6 rounded-full bg-sky-500/20 text-sky-400 flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">
                    1
                  </div>
                  <div>
                    Toque no botão de <strong>Compartilhar</strong> (ícone com quadrado e seta ⎋ na barra inferior do Safari).
                  </div>
                </div>
                <div className="flex items-start gap-2.5 p-2.5 rounded-lg bg-zinc-900/80 border border-zinc-800">
                  <div className="h-6 w-6 rounded-full bg-sky-500/20 text-sky-400 flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">
                    2
                  </div>
                  <div>
                    Role a lista e toque em <strong>"Adicionar à Tela de Início"</strong> ➕.
                  </div>
                </div>
                <div className="flex items-start gap-2.5 p-2.5 rounded-lg bg-zinc-900/80 border border-zinc-800">
                  <div className="h-6 w-6 rounded-full bg-sky-500/20 text-sky-400 flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">
                    3
                  </div>
                  <div>
                    No canto superior direito, toque em <strong>"Adicionar"</strong>. O ícone do app aparecerá na tela do seu celular!
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-3 text-xs text-slate-300 py-2">
              <p className="text-slate-200">
                Para adicionar à sua tela inicial:
              </p>
              <div className="space-y-2.5">
                <div className="flex items-start gap-2.5 p-2.5 rounded-lg bg-zinc-900/80 border border-zinc-800">
                  <div className="h-6 w-6 rounded-full bg-sky-500/20 text-sky-400 flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">
                    1
                  </div>
                  <div>
                    Toque no menu do navegador (os <strong>três pontinhos</strong> ⋮ no topo ou rodapé do Chrome).
                  </div>
                </div>
                <div className="flex items-start gap-2.5 p-2.5 rounded-lg bg-zinc-900/80 border border-zinc-800">
                  <div className="h-6 w-6 rounded-full bg-sky-500/20 text-sky-400 flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">
                    2
                  </div>
                  <div>
                    Selecione <strong>"Instalar aplicativo"</strong> ou <strong>"Adicionar à tela inicial"</strong>.
                  </div>
                </div>
                <div className="flex items-start gap-2.5 p-2.5 rounded-lg bg-zinc-900/80 border border-zinc-800">
                  <div className="h-6 w-6 rounded-full bg-sky-500/20 text-sky-400 flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">
                    3
                  </div>
                  <div>
                    Confirme em <strong>"Instalar"</strong>. Pronto! O app terá ícone exclusivo e funcionará em tela cheia.
                  </div>
                </div>
              </div>
            </div>
          )}

          <DialogFooter className="pt-2">
            <Button
              type="button"
              onClick={() => setShowInstallHelpModal(false)}
              className="w-full bg-sky-500 hover:bg-sky-400 text-zinc-950 font-bold text-xs h-9 cursor-pointer"
            >
              Entendi
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
