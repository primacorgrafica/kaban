import { useState, useEffect, useMemo, useRef } from "react";
import { Layout } from "@/components/Layout";
import { useAuth } from "@/hooks/useAuth";
import { usePermissions } from "@/hooks/usePermissions";
import { supabase } from "@/integrations/supabase/client";
import { format, parseISO, isToday } from "date-fns";
import { ptBR } from "date-fns/locale";
import { subscribeOrders, subscribeOrdersIncremental } from "@/lib/realtimeManager";
import {
  Tv, Maximize2, Minimize2, Volume2, VolumeX, Clock,
  CheckCircle2, Layers, RefreshCw,
  AlertTriangle, Zap
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import logoSidebar from "@/assets/logo-sidebar.png";
import logoLight from "@/assets/logo.png";

interface LiberadaEntry {
  order_id: string;
  titulo: string;
  cliente: string;
  descricao: string;
  vendedor: string | null;
  chegou_em: string;
  urgente?: boolean;
}

interface EmitidaEntry {
  order_id: string;
  titulo: string;
  cliente: string;
  descricao: string;
  vendedor: string | null;
  created_at: string;
  urgente?: boolean;
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function cleanOsTitle(titulo: string): string {
  if (!titulo) return "";
  return titulo.replace(/^O\.?S\.?[\s._-]*/i, "").trim() || titulo;
}

function formatPcpDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  try {
    const d = typeof dateStr === "string" ? parseISO(dateStr) : new Date(dateStr);
    if (isNaN(d.getTime())) return "—";
    return format(d, "dd/MM/yy HH:mm");
  } catch {
    return "—";
  }
}

// Chime sintetizado via Web Audio API (som de alta fidelidade sem arquivos externos)
function playTvChime() {
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
    osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.15); // A5
    gain.gain.setValueAtTime(0.2, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.4);
  } catch {}
}

// Gerenciamento e seleção contínua de vozes femininas em português do Brasil
let cachedPtVoices: SpeechSynthesisVoice[] = [];

function loadPtVoices() {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  const allVoices = window.speechSynthesis.getVoices() || [];
  cachedPtVoices = allVoices.filter((v) => {
    const l = (v.lang || "").toLowerCase();
    return l.startsWith("pt") || l.includes("pt-br") || l.includes("pt_br");
  });
}

if (typeof window !== "undefined" && "speechSynthesis" in window) {
  loadPtVoices();
  window.speechSynthesis.onvoiceschanged = () => {
    loadPtVoices();
  };
}

function getFemaleVoice(): SpeechSynthesisVoice | null {
  if (cachedPtVoices.length === 0) {
    loadPtVoices();
  }
  if (cachedPtVoices.length === 0) return null;

  const femaleKeywords = [
    "francisca", "brenda", "thalita", "maria", "luciana", "elza",
    "giovanna", "leila", "leticia", "manuela", "yara", "joana",
    "alice", "heloisa", "google português do brasil", "google", "female", "mulher"
  ];

  for (const kw of femaleKeywords) {
    const match = cachedPtVoices.find((v) => v.name.toLowerCase().includes(kw));
    if (match) return match;
  }

  const maleKeywords = ["daniel", "antonio", "donato", "fabiano", "humberto", "julio", "nicolau", "valerio", "male", "homem"];
  const nonMale = cachedPtVoices.find((v) => {
    const n = v.name.toLowerCase();
    return !maleKeywords.some((m) => n.includes(m));
  });
  if (nonMale) return nonMale;

  return cachedPtVoices[0] || null;
}

function playFemaleVoice(text: string) {
  try {
    playTvChime();

    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;

    window.speechSynthesis.cancel();

    const voice = getFemaleVoice();
    const isMaleName = voice && ["daniel", "antonio", "donato", "fabiano", "humberto", "julio", "nicolau", "valerio", "male", "homem"].some((m) => voice.name.toLowerCase().includes(m));

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "pt-BR";
    utterance.volume = 1.0;
    utterance.rate = 1.55;

    if (voice && !isMaleName) {
      utterance.voice = voice;
      utterance.pitch = 1.0;
    } else {
      if (voice) utterance.voice = voice;
      utterance.pitch = 1.35;
    }

    setTimeout(() => {
      window.speechSynthesis.speak(utterance);
    }, 280);
  } catch (err) {
    console.warn("[Voz PCP] Erro ao reproduzir locução:", err);
  }
}

function speakOsLiberada(titulo: string) {
  const cleanNumber = titulo.replace(/^O\.?S\.?[\s._-]*/i, "").trim();
  const frase = cleanNumber
    ? `Atenção: Ordem de serviço número ${cleanNumber} foi liberada para produção.`
    : `Atenção: Ordem de serviço ${titulo} foi liberada para produção.`;
  playFemaleVoice(frase);
}

export default function PcpPage() {
  const { user, authReady } = useAuth();
  const permissions = usePermissions();
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [liberadas, setLiberadas] = useState<LiberadaEntry[]>([]);
  const [emitidas, setEmitidas] = useState<EmitidaEntry[]>([]);

  // TV Mode States
  const [isTvMode, setIsTvMode] = useState(() => {
    return localStorage.getItem("primacor_pcp_tv_mode") === "true";
  });

  // Som e Voz com persistência e Ref
  const [soundEnabled, setSoundEnabled] = useState(() => {
    return localStorage.getItem("primacor_pcp_sound_enabled") === "true";
  });
  const soundEnabledRef = useRef(soundEnabled);
  useEffect(() => {
    soundEnabledRef.current = soundEnabled;
  }, [soundEnabled]);

  const announcedOrderIdsRef = useRef<Set<string>>(new Set());
  const [autoScroll, setAutoScroll] = useState(true);
  const [mobileTab, setMobileTab] = useState<"todas" | "emitidas" | "liberadas">("emitidas");

  // Relógio ao vivo atualizado a cada segundo
  const [currentTime, setCurrentTime] = useState(new Date());
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Notificação de último evento em tempo real
  const [lastEventAlert, setLastEventAlert] = useState<{ text: string; time: string; type: "liberada" | "emitida" } | null>(null);
  const knownLiberadaIdsRef = useRef<Set<string> | null>(null);

  const toggleTvMode = () => {
    const next = !isTvMode;
    setIsTvMode(next);
    localStorage.setItem("primacor_pcp_tv_mode", String(next));
    if (next && !document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else if (!next && document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    }
  };

  const handleToggleSound = () => {
    const next = !soundEnabled;
    setSoundEnabled(next);
    soundEnabledRef.current = next;
    localStorage.setItem("primacor_pcp_sound_enabled", String(next));
    if (next) {
      playTvChime();
      const recent = liberadas.find((d) => {
        const diffMs = Date.now() - new Date(d.chegou_em).getTime();
        return diffMs < 15 * 60 * 1000 && !announcedOrderIdsRef.current.has(d.order_id);
      });
      if (recent) {
        announcedOrderIdsRef.current.add(recent.order_id);
        setTimeout(() => {
          speakOsLiberada(recent.titulo);
        }, 600);
      }
    } else {
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
    }
  };

  const fetchLiberadas = async () => {
    const since = new Date();
    since.setDate(since.getDate() - 14);
    since.setHours(0, 0, 0, 0);
    const sinceISO = since.toISOString();

    const [statusRes, sectorRes, activePreRes, activeEmbRes] = await Promise.all([
      supabase
        .from("order_status_history")
        .select("order_id, created_at")
        .eq("status_novo", "arquivo_liberado")
        .gte("created_at", sinceISO),
      supabase
        .from("sector_history")
        .select("order_id, setor_anterior, setor_novo, setor_status_novo, created_at")
        .or("setor_status_novo.eq.saida,setor_anterior.eq.desenvolvimento")
        .gte("created_at", sinceISO),
      supabase
        .from("orders")
        .select("id, created_at")
        .eq("status", "arquivo_liberado")
        .eq("arquivado", false),
      supabase
        .from("orders")
        .select("id, created_at")
        .eq("setor", "desenvolvimento")
        .eq("setor_status", "saida")
        .eq("arquivado", false),
    ]);

    const ids = new Set<string>();
    (statusRes.data || []).forEach((r: any) => ids.add(r.order_id));
    (sectorRes.data || []).forEach((r: any) => ids.add(r.order_id));
    (activePreRes.data || []).forEach((r: any) => ids.add(r.id));
    (activeEmbRes.data || []).forEach((r: any) => ids.add(r.id));

    if (ids.size === 0) { setLiberadas([]); return; }

    const { data: ordersData } = await supabase
      .from("orders")
      .select("id, titulo, cliente, descricao, vendedor, status, setor, setor_status, urgente, urgente_impressao, urgente_acabamento, urgente_expedicao")
      .in("id", Array.from(ids));

    const map = new Map<string, { titulo: string; cliente: string; descricao: string; vendedor: string | null; urgente?: boolean }>();
    const stateMap = new Map<string, any>();
    (ordersData || []).forEach((o: any) => {
      const isUrg = !!(o.urgente || o.urgente_impressao || o.urgente_acabamento || o.urgente_expedicao);
      map.set(o.id, { titulo: o.titulo, cliente: o.cliente, descricao: o.descricao, vendedor: o.vendedor, urgente: isUrg });
      stateMap.set(o.id, o);
    });

    const isLiberada = (id: string) => {
      const o = stateMap.get(id);
      if (!o) return false;
      if (o.status === "arquivo_liberado") return true;
      if (o.setor === "desenvolvimento" && o.setor_status === "saida") return true;
      if (o.setor && o.setor !== "desenvolvimento") return true;
      return false;
    };

    const entries: LiberadaEntry[] = [];
    (statusRes.data || []).forEach((r: any) => {
      const m = isLiberada(r.order_id) ? map.get(r.order_id) : undefined;
      if (m) entries.push({ order_id: r.order_id, ...m, chegou_em: r.created_at });
    });
    (sectorRes.data || []).forEach((r: any) => {
      const m = map.get(r.order_id);
      if (m && isLiberada(r.order_id)) entries.push({ order_id: r.order_id, ...m, chegou_em: r.created_at });
    });
    (activePreRes.data || []).forEach((r: any) => {
      const m = map.get(r.id);
      if (m) entries.push({ order_id: r.id, ...m, chegou_em: r.created_at });
    });
    (activeEmbRes.data || []).forEach((r: any) => {
      const m = map.get(r.id);
      if (m) entries.push({ order_id: r.id, ...m, chegou_em: r.created_at });
    });

    const latestByKey = new Map<string, LiberadaEntry>();
    for (const e of entries) {
      const key = (e.titulo || "").trim().toUpperCase() || e.order_id;
      const prev = latestByKey.get(key);
      if (!prev || e.chegou_em > prev.chegou_em) latestByKey.set(key, e);
    }
    const deduped = Array.from(latestByKey.values());
    deduped.sort((a, b) => b.chegou_em.localeCompare(a.chegou_em));

    if (knownLiberadaIdsRef.current === null) {
      knownLiberadaIdsRef.current = new Set(deduped.map((d) => d.order_id));
      const recemLiberada = deduped.find((d) => {
        const diffMs = Date.now() - new Date(d.chegou_em).getTime();
        return diffMs < 15 * 60 * 1000;
      });
      if (recemLiberada && soundEnabledRef.current && !announcedOrderIdsRef.current.has(recemLiberada.order_id)) {
        announcedOrderIdsRef.current.add(recemLiberada.order_id);
        speakOsLiberada(recemLiberada.titulo);
      }
    } else {
      const recemLiberadas = deduped.filter((d) => !knownLiberadaIdsRef.current!.has(d.order_id));
      if (recemLiberadas.length > 0) {
        const newlyLiberada = recemLiberadas[0];
        setLastEventAlert({
          text: `O.S. ${cleanOsTitle(newlyLiberada.titulo)} liberada para Produção! (${newlyLiberada.cliente})`,
          time: format(new Date(), "HH:mm:ss"),
          type: "liberada"
        });
        if (soundEnabledRef.current && !announcedOrderIdsRef.current.has(newlyLiberada.order_id)) {
          announcedOrderIdsRef.current.add(newlyLiberada.order_id);
          speakOsLiberada(newlyLiberada.titulo);
        }
      }
      knownLiberadaIdsRef.current = new Set(deduped.map((d) => d.order_id));
    }

    setLiberadas(deduped);
    setLoading(false);
  };

  const fetchLiberadasRef = useRef<() => Promise<void>>();
  fetchLiberadasRef.current = fetchLiberadas;

  const fetchEmitidas = async () => {
    const since = new Date();
    since.setDate(since.getDate() - 14);
    since.setHours(0, 0, 0, 0);
    const { data } = await supabase
      .from("orders")
      .select("id, titulo, cliente, descricao, vendedor, created_at, om_numero, oc_numero, nc_numero, setor, parent_order_id, urgente, urgente_impressao, urgente_acabamento, urgente_expedicao")
      .is("parent_order_id", null)
      .gte("created_at", since.toISOString())
      .order("created_at", { ascending: false });

    if (!data) { setEmitidas([]); return; }
    const filtered = (data as any[]).filter(o =>
      !o.om_numero && !o.oc_numero && !o.nc_numero && !o.parent_order_id
    );
    const mapped: EmitidaEntry[] = filtered.map((o: any) => ({
      order_id: o.id,
      titulo: o.titulo,
      cliente: o.cliente,
      descricao: o.descricao,
      vendedor: o.vendedor,
      created_at: o.created_at,
      urgente: !!(o.urgente || o.urgente_impressao || o.urgente_acabamento || o.urgente_expedicao)
    }));

    const byId = new Map<string, EmitidaEntry>();
    for (const e of mapped) {
      const key = (e.titulo || "").trim().toUpperCase() || e.order_id;
      const prev = byId.get(key);
      if (!prev || e.created_at > prev.created_at) byId.set(key, e);
    }
    const deduped = Array.from(byId.values());
    deduped.sort((a, b) => b.created_at.localeCompare(a.created_at));
    setEmitidas(deduped);
    setLoading(false);
  };

  useEffect(() => {
    if (!authReady || !user) return;
    fetchLiberadas();
    fetchEmitidas();

    const unsubInc = subscribeOrdersIncremental((payload) => {
      if (!payload) return;

      if (payload.eventType === "UPDATE") {
        const newRow = payload.new as any;
        const oldRow = payload.old as any;
        if (!newRow) return;

        const preLiberada = newRow.status === "arquivo_liberado" && oldRow?.status !== "arquivo_liberado";
        const embLiberada = newRow.setor === "desenvolvimento" && newRow.setor_status === "saida" && oldRow?.setor_status !== "saida";
        const devTransfer = oldRow?.setor === "desenvolvimento" && newRow.setor && newRow.setor !== "desenvolvimento";

        if (preLiberada || embLiberada || devTransfer) {
          setLastEventAlert({
            text: `O.S. ${cleanOsTitle(newRow.titulo)} liberada para Produção! (${newRow.cliente || ""})`,
            time: format(new Date(), "HH:mm:ss"),
            type: "liberada",
          });

          if (soundEnabledRef.current && !announcedOrderIdsRef.current.has(newRow.id)) {
            announcedOrderIdsRef.current.add(newRow.id);
            speakOsLiberada(newRow.titulo);
          }

          fetchLiberadasRef.current?.();
          return;
        }

        if (newRow.status !== oldRow?.status || newRow.setor_status !== oldRow?.setor_status) {
          fetchLiberadasRef.current?.();
          fetchEmitidas();
        }
      } else if (payload.eventType === "INSERT") {
        fetchEmitidas();
      }
    });

    const unsubOrders = subscribeOrders(() => {
      fetchLiberadasRef.current?.();
      fetchEmitidas();
    });

    const interval = setInterval(() => {
      fetchLiberadasRef.current?.();
      fetchEmitidas();
    }, 15000);

    return () => {
      unsubInc();
      unsubOrders();
      clearInterval(interval);
    };
  }, [authReady, user]);

  // Recalcula os grupos "Hoje/Anteriores" na virada do dia
  const [dayKey, setDayKey] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
  });
  useEffect(() => {
    const check = () => {
      const d = new Date();
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      setDayKey(prev => (prev === key ? prev : key));
    };
    const interval = setInterval(check, 30000);
    return () => clearInterval(interval);
  }, []);

  const liberadasGrouped = useMemo(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const q = searchQuery.trim().toLowerCase();
    const filterFn = (e: LiberadaEntry) =>
      !q || e.titulo.toLowerCase().includes(q) || e.cliente.toLowerCase().includes(q) || e.descricao.toLowerCase().includes(q) || (e.vendedor || "").toLowerCase().includes(q);

    const hoje: LiberadaEntry[] = [];
    const anteriores: LiberadaEntry[] = [];
    liberadas.filter(filterFn).forEach(e => {
      const d = new Date(e.chegou_em);
      if (isSameDay(d, today)) hoje.push(e);
      else if (d < today) anteriores.push(e);
    });
    return { hoje, anteriores };
  }, [liberadas, searchQuery, dayKey]);

  const emitidasGrouped = useMemo(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const q = searchQuery.trim().toLowerCase();
    const filterFn = (e: EmitidaEntry) =>
      !q || e.titulo.toLowerCase().includes(q) || e.cliente.toLowerCase().includes(q) || e.descricao.toLowerCase().includes(q) || (e.vendedor || "").toLowerCase().includes(q);

    const hoje: EmitidaEntry[] = [];
    const anteriores: EmitidaEntry[] = [];
    emitidas.filter(filterFn).forEach(e => {
      const d = new Date(e.created_at);
      if (isSameDay(d, today)) hoje.push(e);
      else if (d < today) anteriores.push(e);
    });
    return { hoje, anteriores };
  }, [emitidas, searchQuery, dayKey]);

  // Contadores
  const totalEmitidasHoje = emitidasGrouped.hoje.length;
  const totalLiberadasHoje = liberadasGrouped.hoje.length;
  const lastLiberada = liberadasGrouped.hoje[0] || liberadas[0] || null;

  // Auto-scroll para TV: rola suavemente a lista de anteriores se houver muitos itens
  const listRefLeft = useRef<HTMLDivElement>(null);
  const listRefRight = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!autoScroll) return;
    const interval = setInterval(() => {
      [listRefLeft, listRefRight].forEach(ref => {
        if (ref.current) {
          const { scrollTop, scrollHeight, clientHeight } = ref.current;
          if (scrollTop + clientHeight >= scrollHeight - 10) {
            ref.current.scrollTo({ top: 0, behavior: "smooth" });
          } else {
            ref.current.scrollBy({ top: 140, behavior: "smooth" });
          }
        }
      });
    }, 10000);
    return () => clearInterval(interval);
  }, [autoScroll]);

  // Conteúdo principal
  const mainContent = (
    <div className={`flex flex-col h-full font-pcp ${isTvMode ? "bg-[#050811] text-slate-100 p-3 sm:p-4 select-none" : "space-y-3 text-foreground"}`}>
      {/* BARRA SUPERIOR: CABEÇALHO COM LOGO & RELÓGIO */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-3 sm:p-4 rounded-2xl glass-bento shrink-0">
        {/* Identificação: Logo Primacor à esquerda antes do título PAINEL */}
        <div className="flex items-center gap-3 sm:gap-4 w-full sm:w-auto justify-between sm:justify-start">
          <div className="flex items-center gap-3 sm:gap-4">
            <img
              src={logoSidebar}
              alt="Primacor Gráfica"
              className={`h-8 sm:h-9 w-auto object-contain shrink-0 ${isTvMode ? "block" : "dark:block hidden"}`}
            />
            <img
              src={logoLight}
              alt="Primacor Gráfica"
              className={`h-8 sm:h-9 w-auto object-contain shrink-0 ${isTvMode ? "hidden" : "dark:hidden block"}`}
            />
            <div className="h-6 w-px bg-border/80 dark:bg-[#4A5C6A]/60 hidden sm:block" />
            <div className="flex items-center gap-2.5">
              <div className="relative p-2 sm:p-2.5 rounded-xl bg-[#253745] border border-[#4A5C6A] text-[#CCD0CF] shadow-xs shrink-0">
                <Tv className="h-4 w-4 sm:h-5 sm:w-5" />
                <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5 sm:h-3 sm:w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 sm:h-3 sm:w-3 bg-emerald-500 shadow-[0_0_8px_#10b981]" />
                </span>
              </div>
              <h1 className="text-xl sm:text-2xl font-black tracking-tight text-foreground dark:text-white uppercase whitespace-nowrap">
                PAINEL
              </h1>
            </div>
          </div>
        </div>

        {/* Relógio Digital & Botões de Ação */}
        <div className="flex items-center gap-4 w-full md:w-auto justify-between md:justify-end">
          <div className="text-left md:text-right">
            <div className="text-xl sm:text-2xl font-black text-foreground dark:text-white tracking-wider flex items-center md:justify-end gap-1.5 drop-shadow-[0_0_12px_rgba(255,255,255,0.15)]">
              <Clock className="h-4 w-4 text-[#CCD0CF] hidden sm:inline" />
              <span>{format(currentTime, "HH:mm:ss")}</span>
            </div>
            <div className="text-[10px] font-medium text-muted-foreground dark:text-slate-400 uppercase tracking-wide">
              {format(currentTime, "EEEE, dd 'de' MMMM", { locale: ptBR })}
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <Button
              variant="outline"
              size="sm"
              onClick={handleToggleSound}
              className={`h-8 px-2.5 rounded-xl border text-xs gap-1.5 transition-all ${
                soundEnabled
                  ? "bg-[#253745] border-[#4A5C6A] text-[#CCD0CF] shadow-xs"
                  : "bg-muted/60 dark:bg-[#11212D]/80 border-border dark:border-[#4A5C6A]/40 text-muted-foreground dark:text-[#CCD0CF] hover:text-foreground dark:hover:text-white"
              }`}
              title={soundEnabled ? "Som e voz feminina ativados" : "Ativar som e voz feminina"}
            >
              {soundEnabled ? <Volume2 className="h-3.5 w-3.5 text-[#CCD0CF]" /> : <VolumeX className="h-3.5 w-3.5" />}
              <span className="hidden xl:inline">{soundEnabled ? "Som Ativo" : "Mudo"}</span>
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={() => setAutoScroll(!autoScroll)}
              className={`h-8 px-2.5 rounded-xl border text-xs gap-1.5 transition-all ${
                autoScroll
                  ? "bg-emerald-500/20 border-emerald-500/40 text-emerald-300 shadow-[0_0_10px_rgba(16,185,129,0.2)]"
                  : "bg-muted/60 dark:bg-[#11212D]/80 border-border dark:border-[#4A5C6A]/40 text-muted-foreground dark:text-[#CCD0CF] hover:text-foreground dark:hover:text-white"
              }`}
              title="Rolagem automática da lista de ordens na TV"
            >
              <RefreshCw className={`h-3.5 w-3.5 text-emerald-400 ${autoScroll ? "animate-spin" : ""}`} />
              <span className="hidden xl:inline">Auto-Scroll</span>
            </Button>

            <Button
              variant="default"
              size="sm"
              onClick={toggleTvMode}
              className="h-8 px-2.5 sm:px-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-white dark:bg-[#CCD0CF] dark:hover:bg-white dark:text-[#06141B] font-bold text-xs gap-1.5 shadow-md transition-all shrink-0"
            >
              {isTvMode ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
              <span className="hidden sm:inline">{isTvMode ? "Sair TV" : "Modo TV"}</span>
            </Button>
          </div>
        </div>
      </div>

      {/* BANNER DE ALERTA DE EVENTO RECENTE */}
      {lastEventAlert && (
        <div className="p-2.5 rounded-xl bg-[#253745]/40 border border-[#4A5C6A]/50 text-[#CCD0CF] flex items-center justify-between gap-3 animate-in fade-in slide-in-from-top-2 duration-300 shrink-0 shadow-[0_0_20px_rgba(6,20,27,0.4)]">
          <div className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-[#CCD0CF] animate-bounce" />
            <span className="text-xs sm:text-sm font-bold tracking-wide">
              {lastEventAlert.text}
            </span>
          </div>
          <span className="text-[10px] bg-card/85 dark:bg-[#11212D]/85 px-2 py-0.5 rounded-lg border border-border/80 dark:border-[#4A5C6A]/35 text-muted-foreground dark:text-[#CCD0CF]">
            {lastEventAlert.time}
          </span>
        </div>
      )}

      {/* SELETOR DE COLUNAS EM TELAS MENORES / MOBILE (< lg) */}
      <div className="flex lg:hidden items-center justify-between gap-1 p-1 bg-muted/60 dark:bg-[#11212D]/80 rounded-xl border border-border/70 shrink-0 text-xs font-bold">
        <button
          onClick={() => setMobileTab("emitidas")}
          className={`flex-1 py-1.5 px-2 rounded-lg transition-all flex items-center justify-center gap-1.5 ${
            mobileTab === "emitidas"
              ? "bg-blue-600 text-white shadow-xs"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Layers className="h-3.5 w-3.5" />
          <span>Emitidas ({totalEmitidasHoje})</span>
        </button>
        <button
          onClick={() => setMobileTab("liberadas")}
          className={`flex-1 py-1.5 px-2 rounded-lg transition-all flex items-center justify-center gap-1.5 ${
            mobileTab === "liberadas"
              ? "bg-emerald-600 text-white shadow-xs"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <CheckCircle2 className="h-3.5 w-3.5" />
          <span>Liberadas ({totalLiberadasHoje})</span>
        </button>
        <button
          onClick={() => setMobileTab("todas")}
          className={`py-1.5 px-3 rounded-lg transition-all ${
            mobileTab === "todas"
              ? "bg-slate-800 text-white dark:bg-slate-700 shadow-xs"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Todas
        </button>
      </div>

      {/* DUAS COLUNAS PRINCIPAIS: OS EMITIDAS (ESQUERDA) vs OS LIBERADAS (DIREITA) */}
      <div className={`gap-3.5 flex-1 min-h-0 ${
        mobileTab === "todas"
          ? "flex flex-col lg:grid lg:grid-cols-2 overflow-y-auto lg:overflow-hidden"
          : "grid grid-cols-1 lg:grid-cols-2"
      }`}>
        {/* ========================================================= */}
        {/* COLUNA ESQUERDA: OS EMITIDAS                              */}
        {/* ========================================================= */}
        <div className={`flex flex-col rounded-2xl glass-bento border border-blue-500/30 overflow-hidden shadow-sm bg-card/60 dark:bg-[#11212D]/80 ${
          mobileTab === "liberadas" ? "hidden lg:flex" : "flex"
        } ${mobileTab === "todas" ? "min-h-[440px] lg:min-h-0" : ""}`}>
          {/* TÍTULO PRINCIPAL: OS EMITIDAS */}
          <div className="py-2.5 px-4 bg-blue-600/10 dark:bg-blue-950/50 border-b border-blue-500/20 text-center flex items-center justify-center gap-2 shrink-0">
            <Layers className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            <h2 className="text-sm sm:text-base font-black tracking-wider text-blue-700 dark:text-blue-400 uppercase">
              OS EMITIDAS
            </h2>
          </div>

          {/* SEÇÃO 1: HOJE */}
          <div className="flex flex-col shrink-0 border-b border-blue-500/20">
            <div className="py-1.5 px-4 bg-blue-100/80 dark:bg-blue-900/30 border-b border-blue-500/20 flex items-center justify-center gap-2 shrink-0">
              <span className="text-xs font-bold text-blue-900 dark:text-blue-200">
                Hoje
              </span>
              <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-blue-600 text-white shadow-xs">
                {emitidasGrouped.hoje.length}
              </span>
            </div>

            <div className="overflow-x-auto max-h-[220px] overflow-y-auto">
              <table className="w-full min-w-[500px] text-left text-xs table-fixed">
                <thead className="sticky top-0 bg-muted/90 dark:bg-[#0c1822]/95 backdrop-blur-xs text-[10px] font-bold uppercase tracking-wider text-muted-foreground border-b border-border/40 select-none z-10">
                  <tr>
                    <th className="w-[15%] py-2 pl-3">OS</th>
                    <th className="w-[27%] py-2">CLIENTE</th>
                    <th className="w-[31%] py-2">DESCRIÇÃO</th>
                    <th className="w-[12%] py-2">VENDEDOR</th>
                    <th className="w-[15%] py-2 pr-3 text-right">CRIADA</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/20">
                  {loading ? (
                    <tr>
                      <td colSpan={5} className="py-4 text-center text-xs text-muted-foreground">
                        <RefreshCw className="h-4 w-4 animate-spin inline mr-1.5 text-blue-500" />
                        Carregando...
                      </td>
                    </tr>
                  ) : emitidasGrouped.hoje.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-4 text-center text-xs text-muted-foreground italic font-medium">
                        Nenhuma OS
                      </td>
                    </tr>
                  ) : (
                    emitidasGrouped.hoje.map((e) => (
                      <tr
                        key={`${e.order_id}-${e.created_at}`}
                        className={`hover:bg-blue-500/10 transition-colors ${
                          e.urgente ? "bg-rose-500/10 text-rose-600 dark:text-rose-300 font-semibold" : ""
                        }`}
                      >
                        <td className="py-2 pl-3 font-bold text-blue-600 dark:text-blue-400 whitespace-nowrap truncate">
                          {cleanOsTitle(e.titulo)}
                          {e.urgente && (
                            <span className="ml-1 text-[9px] text-rose-500 font-extrabold" title="Urgente">
                              🚨
                            </span>
                          )}
                        </td>
                        <td className="py-2 font-semibold text-foreground truncate" title={e.cliente}>
                          {e.cliente}
                        </td>
                        <td className="py-2 text-muted-foreground dark:text-slate-300 truncate" title={e.descricao}>
                          {e.descricao || "—"}
                        </td>
                        <td className="py-2 text-muted-foreground truncate" title={e.vendedor || ""}>
                          {e.vendedor || "—"}
                        </td>
                        <td className="py-2 pr-3 text-right text-muted-foreground whitespace-nowrap">
                          {formatPcpDate(e.created_at)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* SEÇÃO 2: ANTERIORES */}
          <div className="flex flex-col flex-1 min-h-0">
            <div className="py-1.5 px-4 bg-blue-100/80 dark:bg-blue-900/30 border-b border-blue-500/20 flex items-center justify-center gap-2 shrink-0">
              <span className="text-xs font-bold text-blue-900 dark:text-blue-200">
                Anteriores
              </span>
              <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-blue-600 text-white shadow-xs">
                {emitidasGrouped.anteriores.length}
              </span>
            </div>

            <div ref={listRefLeft} className="flex-1 overflow-y-auto overflow-x-auto scroll-smooth">
              <table className="w-full min-w-[500px] text-left text-xs table-fixed">
                <thead className="sticky top-0 bg-muted/90 dark:bg-[#0c1822]/95 backdrop-blur-xs text-[10px] font-bold uppercase tracking-wider text-muted-foreground border-b border-border/40 select-none z-10">
                  <tr>
                    <th className="w-[15%] py-2 pl-3">OS</th>
                    <th className="w-[27%] py-2">CLIENTE</th>
                    <th className="w-[31%] py-2">DESCRIÇÃO</th>
                    <th className="w-[12%] py-2">VENDEDOR</th>
                    <th className="w-[15%] py-2 pr-3 text-right">CRIADA</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/20">
                  {loading ? (
                    <tr>
                      <td colSpan={5} className="py-6 text-center text-xs text-muted-foreground">
                        <RefreshCw className="h-4 w-4 animate-spin inline mr-1.5 text-blue-500" />
                        Carregando anteriores...
                      </td>
                    </tr>
                  ) : emitidasGrouped.anteriores.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-6 text-center text-xs text-muted-foreground italic font-medium">
                        Nenhuma OS anterior
                      </td>
                    </tr>
                  ) : (
                    emitidasGrouped.anteriores.map((e) => (
                      <tr
                        key={`${e.order_id}-${e.created_at}`}
                        className={`hover:bg-blue-500/10 transition-colors ${
                          e.urgente ? "bg-rose-500/10 text-rose-600 dark:text-rose-300 font-semibold" : ""
                        }`}
                      >
                        <td className="py-2 pl-3 font-bold text-blue-600 dark:text-blue-400 whitespace-nowrap truncate">
                          {cleanOsTitle(e.titulo)}
                          {e.urgente && (
                            <span className="ml-1 text-[9px] text-rose-500 font-extrabold" title="Urgente">
                              🚨
                            </span>
                          )}
                        </td>
                        <td className="py-2 font-semibold text-foreground truncate" title={e.cliente}>
                          {e.cliente}
                        </td>
                        <td className="py-2 text-muted-foreground dark:text-slate-300 truncate" title={e.descricao}>
                          {e.descricao || "—"}
                        </td>
                        <td className="py-2 text-muted-foreground truncate" title={e.vendedor || ""}>
                          {e.vendedor || "—"}
                        </td>
                        <td className="py-2 pr-3 text-right text-muted-foreground whitespace-nowrap">
                          {formatPcpDate(e.created_at)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* ========================================================= */}
        {/* COLUNA DIREITA: OS LIBERADAS                             */}
        {/* ========================================================= */}
        <div className={`flex flex-col rounded-2xl glass-bento border border-emerald-500/30 overflow-hidden shadow-sm bg-card/60 dark:bg-[#11212D]/80 ${
          mobileTab === "emitidas" ? "hidden lg:flex" : "flex"
        } ${mobileTab === "todas" ? "min-h-[440px] lg:min-h-0" : ""}`}>
          {/* TÍTULO PRINCIPAL: OS LIBERADAS */}
          <div className="py-2.5 px-4 bg-emerald-600/10 dark:bg-emerald-950/50 border-b border-emerald-500/20 text-center flex items-center justify-center gap-2 shrink-0">
            <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            <h2 className="text-sm sm:text-base font-black tracking-wider text-emerald-700 dark:text-emerald-400 uppercase">
              OS LIBERADAS
            </h2>
          </div>

          {/* SEÇÃO 1: HOJE */}
          <div className="flex flex-col shrink-0 border-b border-emerald-500/20">
            <div className="py-1.5 px-4 bg-emerald-100/80 dark:bg-emerald-900/30 border-b border-emerald-500/20 flex items-center justify-center gap-2 shrink-0">
              <span className="text-xs font-bold text-emerald-900 dark:text-emerald-200">
                Hoje
              </span>
              <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-600 text-white shadow-xs">
                {liberadasGrouped.hoje.length}
              </span>
            </div>

            <div className="overflow-x-auto max-h-[220px] overflow-y-auto">
              <table className="w-full min-w-[500px] text-left text-xs table-fixed">
                <thead className="sticky top-0 bg-muted/90 dark:bg-[#0c1822]/95 backdrop-blur-xs text-[10px] font-bold uppercase tracking-wider text-muted-foreground border-b border-border/40 select-none z-10">
                  <tr>
                    <th className="w-[15%] py-2 pl-3">OS</th>
                    <th className="w-[27%] py-2">CLIENTE</th>
                    <th className="w-[31%] py-2">DESCRIÇÃO</th>
                    <th className="w-[12%] py-2">VENDEDOR</th>
                    <th className="w-[15%] py-2 pr-3 text-right">QUANDO</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/20">
                  {loading ? (
                    <tr>
                      <td colSpan={5} className="py-4 text-center text-xs text-muted-foreground">
                        <RefreshCw className="h-4 w-4 animate-spin inline mr-1.5 text-emerald-500" />
                        Carregando...
                      </td>
                    </tr>
                  ) : liberadasGrouped.hoje.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-4 text-center text-xs text-muted-foreground italic font-medium">
                        Nenhuma OS
                      </td>
                    </tr>
                  ) : (
                    liberadasGrouped.hoje.map((e) => {
                      const isRecent = isToday(parseISO(e.chegou_em)) && (Date.now() - new Date(e.chegou_em).getTime()) < 1800000;
                      return (
                        <tr
                          key={`${e.order_id}-${e.chegou_em}`}
                          className={`hover:bg-emerald-500/10 transition-colors ${
                            e.urgente
                              ? "bg-rose-500/10 text-rose-600 dark:text-rose-300 font-semibold"
                              : isRecent
                              ? "bg-emerald-500/15"
                              : ""
                          }`}
                        >
                          <td className="py-2 pl-3 font-bold text-emerald-600 dark:text-emerald-400 whitespace-nowrap truncate">
                            {cleanOsTitle(e.titulo)}
                            {e.urgente && (
                              <span className="ml-1 text-[9px] text-rose-500 font-extrabold" title="Urgente">
                                🚨
                              </span>
                            )}
                            {isRecent && (
                              <span className="ml-1 text-[9px] text-emerald-600 dark:text-emerald-300 font-bold" title="Liberada recentemente">
                                ✨
                              </span>
                            )}
                          </td>
                          <td className="py-2 font-semibold text-foreground truncate" title={e.cliente}>
                            {e.cliente}
                          </td>
                          <td className="py-2 text-muted-foreground dark:text-slate-300 truncate" title={e.descricao}>
                            {e.descricao || "—"}
                          </td>
                          <td className="py-2 text-muted-foreground truncate" title={e.vendedor || ""}>
                            {e.vendedor || "—"}
                          </td>
                          <td className="py-2 pr-3 text-right text-muted-foreground whitespace-nowrap">
                            {formatPcpDate(e.chegou_em)}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* SEÇÃO 2: ANTERIORES */}
          <div className="flex flex-col flex-1 min-h-0">
            <div className="py-1.5 px-4 bg-emerald-100/80 dark:bg-emerald-900/30 border-b border-emerald-500/20 flex items-center justify-center gap-2 shrink-0">
              <span className="text-xs font-bold text-emerald-900 dark:text-emerald-200">
                Anteriores
              </span>
              <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-600 text-white shadow-xs">
                {liberadasGrouped.anteriores.length}
              </span>
            </div>

            <div ref={listRefRight} className="flex-1 overflow-y-auto overflow-x-auto scroll-smooth">
              <table className="w-full min-w-[500px] text-left text-xs table-fixed">
                <thead className="sticky top-0 bg-muted/90 dark:bg-[#0c1822]/95 backdrop-blur-xs text-[10px] font-bold uppercase tracking-wider text-muted-foreground border-b border-border/40 select-none z-10">
                  <tr>
                    <th className="w-[15%] py-2 pl-3">OS</th>
                    <th className="w-[27%] py-2">CLIENTE</th>
                    <th className="w-[31%] py-2">DESCRIÇÃO</th>
                    <th className="w-[12%] py-2">VENDEDOR</th>
                    <th className="w-[15%] py-2 pr-3 text-right">QUANDO</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/20">
                  {loading ? (
                    <tr>
                      <td colSpan={5} className="py-6 text-center text-xs text-muted-foreground">
                        <RefreshCw className="h-4 w-4 animate-spin inline mr-1.5 text-emerald-500" />
                        Carregando anteriores...
                      </td>
                    </tr>
                  ) : liberadasGrouped.anteriores.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-6 text-center text-xs text-muted-foreground italic font-medium">
                        Nenhuma OS anterior
                      </td>
                    </tr>
                  ) : (
                    liberadasGrouped.anteriores.map((e) => (
                      <tr
                        key={`${e.order_id}-${e.chegou_em}`}
                        className={`hover:bg-emerald-500/10 transition-colors ${
                          e.urgente ? "bg-rose-500/10 text-rose-600 dark:text-rose-300 font-semibold" : ""
                        }`}
                      >
                        <td className="py-2 pl-3 font-bold text-emerald-600 dark:text-emerald-400 whitespace-nowrap truncate">
                          {cleanOsTitle(e.titulo)}
                          {e.urgente && (
                            <span className="ml-1 text-[9px] text-rose-500 font-extrabold" title="Urgente">
                              🚨
                            </span>
                          )}
                        </td>
                        <td className="py-2 font-semibold text-foreground truncate" title={e.cliente}>
                          {e.cliente}
                        </td>
                        <td className="py-2 text-muted-foreground dark:text-slate-300 truncate" title={e.descricao}>
                          {e.descricao || "—"}
                        </td>
                        <td className="py-2 text-muted-foreground truncate" title={e.vendedor || ""}>
                          {e.vendedor || "—"}
                        </td>
                        <td className="py-2 pr-3 text-right text-muted-foreground whitespace-nowrap">
                          {formatPcpDate(e.chegou_em)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      {/* RODAPÉ TELEMETRY TICKER */}
      <div className="p-2 rounded-xl glass-bento flex items-center justify-between gap-3 overflow-hidden shrink-0 text-xs">
        <div className="flex items-center gap-2 text-[#CCD0CF] font-bold uppercase tracking-wider shrink-0 bg-muted/60 dark:bg-[#253745]/60 px-2.5 py-0.5 rounded-lg border border-border/80 dark:border-[#4A5C6A]/40 text-[10px]">
          <span className="w-2 h-2 rounded-full bg-[#CCD0CF] animate-ping" />
          RADAR PCP
        </div>

        <div className="flex-1 overflow-hidden whitespace-nowrap text-foreground dark:text-slate-300 text-[11px]">
          <span className="inline-block animate-marquee">
            📢 <strong>PRIMACOR GRÁFICA</strong> • HOJE: {totalEmitidasHoje} EMITIDAS / {totalLiberadasHoje} LIBERADAS • {lastLiberada ? `ÚLTIMA LIBERAÇÃO: ${cleanOsTitle(lastLiberada.titulo)} (${lastLiberada.cliente}) • ` : ""}RITMO: {totalEmitidasHoje > 0 ? `${Math.round((totalLiberadasHoje / totalEmitidasHoje) * 100)}%` : "100%"}
          </span>
        </div>

        <div className="hidden sm:flex items-center gap-3 text-muted-foreground dark:text-slate-500 text-[10px] shrink-0 font-medium">
          <span>Pressione <strong>F11</strong> para Tela Cheia</span>
        </div>
      </div>
    </div>
  );

  // Modo TV em tela cheia
  if (isTvMode) {
    return (
      <div className="fixed inset-0 z-50 bg-[#050811] text-white flex flex-col h-screen w-screen overflow-hidden">
        {mainContent}
      </div>
    );
  }

  // Modo padrão com Layout
  return (
    <Layout
      searchQuery={searchQuery}
      onSearchChange={setSearchQuery}
      onAddOrder={() => {}}
      activeCount={0}
      archivedCount={0}
      sectorName="Painel"
      countsLoading={loading}
      permissions={permissions}
    >
      {mainContent}
    </Layout>
  );
}
