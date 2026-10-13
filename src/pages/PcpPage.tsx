import { useState, useEffect, useMemo, useRef, type ReactNode } from "react";
import { Layout } from "@/components/Layout";
import { useAuth } from "@/hooks/useAuth";
import { usePermissions } from "@/hooks/usePermissions";
import { supabase } from "@/integrations/supabase/client";
import { format, parseISO, isToday } from "date-fns";
import { ptBR } from "date-fns/locale";
import { subscribeOrders } from "@/lib/realtimeManager";
import {
  Tv, Maximize2, Minimize2, Volume2, VolumeX, Clock, Activity,
  CheckCircle2, ArrowRight, Layers, Search, Sparkles, RefreshCw,
  AlertTriangle, TrendingUp, Radio, Zap, ShieldCheck, Flame, Filter,
  ChevronRight, Calendar
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

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
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const [activeTabLeft, setActiveTabLeft] = useState<"hoje" | "anteriores">("hoje");
  const [activeTabRight, setActiveTabRight] = useState<"hoje" | "anteriores">("hoje");

  // Relógio ao vivo atualizado a cada segundo
  const [currentTime, setCurrentTime] = useState(new Date());
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Notificação de último evento em tempo real
  const [lastEventAlert, setLastEventAlert] = useState<{ text: string; time: string; type: "liberada" | "emitida" } | null>(null);
  const prevLiberadasCountRef = useRef<number>(0);

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

  const fetchLiberadas = async () => {
    const since = new Date();
    since.setDate(since.getDate() - 6);
    since.setHours(0, 0, 0, 0);
    const sinceISO = since.toISOString();

    const [statusRes, sectorRes, currentRes] = await Promise.all([
      supabase
        .from("order_status_history")
        .select("order_id, created_at")
        .eq("status_novo", "arquivo_liberado")
        .gte("created_at", sinceISO),
      supabase
        .from("sector_history")
        .select("order_id, setor_anterior, setor_novo, created_at")
        .eq("setor_anterior", "desenvolvimento")
        .gte("created_at", sinceISO),
      supabase
        .from("orders")
        .select("id, updated_at")
        .eq("setor", "desenvolvimento")
        .eq("setor_status", "saida")
        .eq("arquivado", false)
        .gte("updated_at", sinceISO),
    ]);

    const ids = new Set<string>();
    (statusRes.data || []).forEach((r: any) => ids.add(r.order_id));
    const sectorRows = (sectorRes.data || []).filter((r: any) => r.setor_novo !== "desenvolvimento");
    sectorRows.forEach((r: any) => ids.add(r.order_id));
    (currentRes.data || []).forEach((r: any) => ids.add(r.id));

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

    const preValida = (id: string) => {
      const o = stateMap.get(id);
      return !!o && o.status === "arquivo_liberado";
    };
    const embValida = (id: string) => {
      const o = stateMap.get(id);
      if (!o) return false;
      if (o.setor === "desenvolvimento") return o.setor_status === "saida";
      return true;
    };

    const entries: LiberadaEntry[] = [];
    (statusRes.data || []).forEach((r: any) => {
      const m = preValida(r.order_id) ? map.get(r.order_id) : undefined;
      if (m) entries.push({ order_id: r.order_id, ...m, chegou_em: r.created_at });
    });
    sectorRows.forEach((r: any) => {
      const m = embValida(r.order_id) ? map.get(r.order_id) : undefined;
      if (m) entries.push({ order_id: r.order_id, ...m, chegou_em: r.created_at });
    });
    (currentRes.data || []).forEach((r: any) => {
      const m = map.get(r.id);
      if (m) entries.push({ order_id: r.id, ...m, chegou_em: r.updated_at });
    });

    const latestByKey = new Map<string, LiberadaEntry>();
    for (const e of entries) {
      const key = (e.titulo || "").trim().toUpperCase() || e.order_id;
      const prev = latestByKey.get(key);
      if (!prev || e.chegou_em > prev.chegou_em) latestByKey.set(key, e);
    }
    const deduped = Array.from(latestByKey.values());
    deduped.sort((a, b) => b.chegou_em.localeCompare(a.chegou_em));

    // Checa se houve nova liberação para alerta da TV
    if (prevLiberadasCountRef.current > 0 && deduped.length > prevLiberadasCountRef.current) {
      const newlyLiberada = deduped[0];
      setLastEventAlert({
        text: `O.S. ${newlyLiberada.titulo} liberada para Produção! (${newlyLiberada.cliente})`,
        time: format(new Date(), "HH:mm:ss"),
        type: "liberada"
      });
      if (soundEnabled) playTvChime();
    }
    prevLiberadasCountRef.current = deduped.length;

    setLiberadas(deduped);
    setLoading(false);
  };

  const fetchEmitidas = async () => {
    const since = new Date();
    since.setDate(since.getDate() - 6);
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
    const unsub = subscribeOrders(() => {
      fetchLiberadas();
      fetchEmitidas();
    });
    return () => unsub();
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
    const antStart = new Date(today); antStart.setDate(antStart.getDate() - 5);
    const antEnd = new Date(today); antEnd.setDate(antEnd.getDate() - 1); antEnd.setHours(23, 59, 59, 999);

    const q = searchQuery.trim().toLowerCase();
    const filterFn = (e: LiberadaEntry) =>
      !q || e.titulo.toLowerCase().includes(q) || e.cliente.toLowerCase().includes(q) || e.descricao.toLowerCase().includes(q);

    const hoje: LiberadaEntry[] = [];
    const anteriores: LiberadaEntry[] = [];
    liberadas.filter(filterFn).forEach(e => {
      const d = new Date(e.chegou_em);
      if (isSameDay(d, today)) hoje.push(e);
      else if (d >= antStart && d <= antEnd) anteriores.push(e);
    });
    return { hoje, anteriores };
  }, [liberadas, searchQuery, dayKey]);

  const emitidasGrouped = useMemo(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const antStart = new Date(today); antStart.setDate(antStart.getDate() - 5);
    const antEnd = new Date(today); antEnd.setDate(antEnd.getDate() - 1); antEnd.setHours(23, 59, 59, 999);

    const q = searchQuery.trim().toLowerCase();
    const filterFn = (e: EmitidaEntry) =>
      !q || e.titulo.toLowerCase().includes(q) || e.cliente.toLowerCase().includes(q) || e.descricao.toLowerCase().includes(q) || (e.vendedor || "").toLowerCase().includes(q);

    const hoje: EmitidaEntry[] = [];
    const anteriores: EmitidaEntry[] = [];
    emitidas.filter(filterFn).forEach(e => {
      const d = new Date(e.created_at);
      if (isSameDay(d, today)) hoje.push(e);
      else if (d >= antStart && d <= antEnd) anteriores.push(e);
    });
    return { hoje, anteriores };
  }, [emitidas, searchQuery, dayKey]);

  // Contadores e métricas de telemetria
  const totalEmitidasHoje = emitidasGrouped.hoje.length;
  const totalLiberadasHoje = liberadasGrouped.hoje.length;
  const urgentesHoje = useMemo(() => {
    const uEmitidas = emitidasGrouped.hoje.filter(e => e.urgente).length;
    const uLiberadas = liberadasGrouped.hoje.filter(e => e.urgente).length;
    return uEmitidas + uLiberadas;
  }, [emitidasGrouped, liberadasGrouped]);

  const lastLiberada = liberadasGrouped.hoje[0] || liberadas[0] || null;

  // Auto-scroll para TV: alterna suavemente as listas se houver muitos itens
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
            ref.current.scrollBy({ top: 180, behavior: "smooth" });
          }
        }
      });
    }, 12000); // Rola a cada 12 segundos para a equipe ler
    return () => clearInterval(interval);
  }, [autoScroll]);

  // O conteúdo principal do display de operações
  const mainContent = (
    <div className={`flex flex-col h-full bg-[#050811] text-slate-100 ${isTvMode ? "p-3 sm:p-5 select-none" : "space-y-4"}`}>
      {/* BARRA SUPERIOR: TELEMETRIA INDUSTRIAL & RELÓGIO DE ALTA PRECISÃO */}
      <div className="flex flex-col md:flex-row items-center justify-between gap-4 p-4 rounded-3xl bg-slate-900/80 border border-slate-800/80 backdrop-blur-2xl shadow-2xl shrink-0">
        <div className="flex items-center gap-4">
          <div className="relative p-3 rounded-2xl bg-gradient-to-br from-blue-600/20 via-cyan-500/20 to-emerald-500/20 border border-cyan-500/40 text-cyan-300 shadow-[0_0_25px_rgba(6,182,212,0.25)]">
            <Tv className="h-6 w-6" />
            <span className="absolute -top-1 -right-1 flex h-3.5 w-3.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-emerald-500 shadow-[0_0_8px_#10b981]" />
            </span>
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-xl md:text-2xl font-black tracking-tight text-white font-mono-tech">
                PCP
              </h1>
            </div>
            <p className="text-xs text-slate-400 font-medium mt-0.5">
              Primacor Gráfica • Monitoramento de Emissões e Liberações em Tempo Real
            </p>
          </div>
        </div>

        {/* RELÓGIO DIGITAL GIGANTE & DATA */}
        <div className="flex items-center gap-4 sm:gap-6">
          <div className="text-center sm:text-right">
            <div className="text-2xl sm:text-3xl font-black font-mono-tech text-white tracking-wider flex items-center justify-center sm:justify-end gap-1 drop-shadow-[0_0_12px_rgba(255,255,255,0.2)]">
              <Clock className="h-5 w-5 text-cyan-400 hidden sm:inline" />
              <span>{format(currentTime, "HH:mm:ss")}</span>
            </div>
            <div className="text-[11px] sm:text-xs font-medium text-slate-400 uppercase tracking-wide">
              {format(currentTime, "EEEE, dd 'de' MMMM", { locale: ptBR })}
            </div>
          </div>

          {/* BOTÕES DE CONTROLE TV (SOM, FULLSCREEN, MODO) */}
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const next = !soundEnabled;
                setSoundEnabled(next);
                if (next) playTvChime();
              }}
              className={`h-9 px-2.5 rounded-xl border text-xs gap-1.5 transition-all ${
                soundEnabled
                  ? "bg-cyan-500/20 border-cyan-500/40 text-cyan-300 shadow-[0_0_10px_rgba(6,182,212,0.2)]"
                  : "bg-slate-950/60 border-slate-800 text-slate-400 hover:text-white"
              }`}
              title={soundEnabled ? "Som de nova OS ativado" : "Ativar som de nova OS na TV"}
            >
              {soundEnabled ? <Volume2 className="h-4 w-4 text-cyan-400" /> : <VolumeX className="h-4 w-4" />}
              <span className="hidden xl:inline">{soundEnabled ? "Som Ativo" : "Mudo"}</span>
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={() => setAutoScroll(!autoScroll)}
              className={`h-9 px-2.5 rounded-xl border text-xs gap-1.5 transition-all ${
                autoScroll
                  ? "bg-emerald-500/20 border-emerald-500/40 text-emerald-300 shadow-[0_0_10px_rgba(16,185,129,0.2)]"
                  : "bg-slate-950/60 border-slate-800 text-slate-400 hover:text-white"
              }`}
              title="Rolagem automática da lista de ordens na TV"
            >
              <RefreshCw className={`h-4 w-4 text-emerald-400 ${autoScroll ? "animate-spin" : ""}`} />
              <span className="hidden xl:inline">Auto-Scroll</span>
            </Button>

            <Button
              variant="default"
              size="sm"
              onClick={toggleTvMode}
              className="h-9 px-3 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-bold text-xs gap-1.5 shadow-lg shadow-cyan-600/30"
            >
              {isTvMode ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
              <span>{isTvMode ? "Sair TV" : "Modo TV"}</span>
            </Button>
          </div>
        </div>
      </div>

      {/* BANNER DE ALERTA DE EVENTO RECENTE AO VIVO */}
      {lastEventAlert && (
        <div className="p-3 rounded-2xl bg-gradient-to-r from-emerald-500/20 via-cyan-500/20 to-blue-500/20 border border-emerald-500/40 text-emerald-200 flex items-center justify-between gap-3 animate-in fade-in slide-in-from-top-2 duration-300 shrink-0 shadow-[0_0_20px_rgba(16,185,129,0.15)]">
          <div className="flex items-center gap-2.5">
            <Zap className="h-4 w-4 text-emerald-400 animate-bounce" />
            <span className="text-xs sm:text-sm font-bold font-mono-tech tracking-wide">
              {lastEventAlert.text}
            </span>
          </div>
          <span className="text-[10px] font-mono-tech bg-slate-950/80 px-2 py-0.5 rounded-lg border border-slate-800 text-slate-400">
            {lastEventAlert.time}
          </span>
        </div>
      )}

      {/* METRIC HUD TELEMETRY CARDS (GIGANTES PARA ENXERGAR DE LONGE) */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4 shrink-0 mt-2">
        {/* Card 1: Emitidas Hoje */}
        <div className="p-4 rounded-3xl bg-slate-900/90 border border-blue-500/30 shadow-[0_0_25px_rgba(59,130,246,0.1)] relative overflow-hidden group">
          <div className="flex items-center justify-between text-xs font-semibold text-blue-400 uppercase tracking-wider mb-1">
            <span className="flex items-center gap-1.5">
              <Layers className="h-4 w-4" /> O.S. Emitidas Hoje
            </span>
            <Activity className="h-4 w-4 text-blue-500/50" />
          </div>
          <div className="text-4xl md:text-5xl font-black font-mono-tech text-white tracking-tight drop-shadow">
            {totalEmitidasHoje}
          </div>
          <div className="flex items-center justify-between text-[11px] text-slate-400 mt-2">
            <span>Entradas no PCP</span>
            <span className="font-mono-tech font-bold text-blue-400">Semana: {emitidas.length}</span>
          </div>
          <div className="absolute bottom-0 left-0 right-0 h-1.5 bg-gradient-to-r from-blue-500 to-cyan-500" />
        </div>

        {/* Card 2: Liberadas Hoje */}
        <div className="p-4 rounded-3xl bg-slate-900/90 border border-emerald-500/30 shadow-[0_0_25px_rgba(16,185,129,0.1)] relative overflow-hidden group">
          <div className="flex items-center justify-between text-xs font-semibold text-emerald-400 uppercase tracking-wider mb-1">
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="h-4 w-4" /> O.S. Liberadas Hoje
            </span>
            <Flame className="h-4 w-4 text-emerald-400 animate-pulse" />
          </div>
          <div className="text-4xl md:text-5xl font-black font-mono-tech text-white tracking-tight drop-shadow">
            {totalLiberadasHoje}
          </div>
          <div className="flex items-center justify-between text-[11px] text-slate-400 mt-2">
            <span>Para Chão de Fábrica</span>
            <span className="font-mono-tech font-bold text-emerald-400">Semana: {liberadas.length}</span>
          </div>
          <div className="absolute bottom-0 left-0 right-0 h-1.5 bg-gradient-to-r from-emerald-500 to-teal-400" />
        </div>

        {/* Card 3: Fluxo Líquido / Vazão */}
        <div className="p-4 rounded-3xl bg-slate-900/90 border border-cyan-500/30 shadow-[0_0_25px_rgba(6,182,212,0.1)] relative overflow-hidden group">
          <div className="flex items-center justify-between text-xs font-semibold text-cyan-400 uppercase tracking-wider mb-1">
            <span className="flex items-center gap-1.5">
              <TrendingUp className="h-4 w-4" /> Ritmo de Liberação
            </span>
            <Radio className="h-4 w-4 text-cyan-400" />
          </div>
          <div className="text-4xl md:text-5xl font-black font-mono-tech text-white tracking-tight drop-shadow">
            {totalEmitidasHoje > 0 ? `${Math.round((totalLiberadasHoje / totalEmitidasHoje) * 100)}%` : "100%"}
          </div>
          <div className="flex items-center justify-between text-[11px] text-slate-400 mt-2">
            <span>Vazão Liberadas / Emitidas</span>
            <span className="font-mono-tech font-bold text-cyan-400">
              {totalLiberadasHoje - totalEmitidasHoje >= 0 ? `+${totalLiberadasHoje - totalEmitidasHoje}` : `${totalLiberadasHoje - totalEmitidasHoje}`} saldo
            </span>
          </div>
          <div className="absolute bottom-0 left-0 right-0 h-1.5 bg-gradient-to-r from-cyan-500 to-indigo-500" />
        </div>

        {/* Card 4: Alerta de Urgências ou Última Liberação */}
        <div className={`p-4 rounded-3xl bg-slate-900/90 border relative overflow-hidden group ${
          urgentesHoje > 0
            ? "border-rose-500/50 shadow-[0_0_25px_rgba(244,63,94,0.2)]"
            : "border-slate-800 shadow-[0_0_25px_rgba(255,255,255,0.03)]"
        }`}>
          <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider mb-1">
            <span className={`flex items-center gap-1.5 ${urgentesHoje > 0 ? "text-rose-400 font-bold" : "text-slate-400"}`}>
              {urgentesHoje > 0 ? <AlertTriangle className="h-4 w-4 text-rose-400 animate-bounce" /> : <Clock className="h-4 w-4" />}
              {urgentesHoje > 0 ? "Urgências Hoje" : "Última Liberação"}
            </span>
            <ShieldCheck className="h-4 w-4 text-slate-500" />
          </div>
          {urgentesHoje > 0 ? (
            <>
              <div className="text-4xl md:text-5xl font-black font-mono-tech text-rose-300 tracking-tight drop-shadow">
                {urgentesHoje} O.S.
              </div>
              <p className="text-[11px] text-rose-400/80 mt-2 font-medium">Prioridade total de entrega</p>
            </>
          ) : lastLiberada ? (
            <>
              <div className="text-xl md:text-2xl font-black font-mono-tech text-white truncate drop-shadow">
                {lastLiberada.titulo}
              </div>
              <p className="text-[11px] text-slate-400 truncate mt-1">
                {lastLiberada.cliente} • {format(parseISO(lastLiberada.chegou_em), "HH:mm")}
              </p>
            </>
          ) : (
            <div className="text-2xl font-bold text-slate-400 mt-2">—</div>
          )}
          <div className={`absolute bottom-0 left-0 right-0 h-1.5 ${urgentesHoje > 0 ? "bg-rose-500" : "bg-slate-700"}`} />
        </div>
      </div>

      {/* DUAL COMMAND DECK: EMITIDAS (ESQUERDA) vs LIBERADAS (DIREITA) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 flex-1 min-h-0 mt-3">
        {/* COLUNA ESQUERDA: O.S. EMITIDAS */}
        <div className="flex flex-col rounded-3xl bg-slate-900/70 border border-blue-500/30 overflow-hidden shadow-2xl backdrop-blur-xl">
          {/* Header da Coluna */}
          <div className="p-3.5 sm:p-4 border-b border-blue-500/20 bg-blue-950/40 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-blue-500/20 text-blue-400 border border-blue-500/30 shadow-[0_0_12px_rgba(59,130,246,0.3)]">
                <Layers className="h-4 w-4" />
              </div>
              <div>
                <h2 className="text-base sm:text-lg font-black tracking-tight text-white flex items-center gap-2">
                  OS EMITIDAS <span className="text-blue-400 font-mono-tech text-xs font-normal">(ENTRADAS)</span>
                </h2>
                <span className="text-[11px] text-slate-400 font-medium">Cadastradas no sistema</span>
              </div>
            </div>

            {/* Alternador Hoje / Anteriores */}
            <div className="flex items-center gap-1 bg-slate-950/80 p-1 rounded-xl border border-slate-800">
              <button
                onClick={() => setActiveTabLeft("hoje")}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                  activeTabLeft === "hoje"
                    ? "bg-blue-600 text-white shadow-md shadow-blue-600/40"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                Hoje ({emitidasGrouped.hoje.length})
              </button>
              <button
                onClick={() => setActiveTabLeft("anteriores")}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                  activeTabLeft === "anteriores"
                    ? "bg-blue-600 text-white shadow-md shadow-blue-600/40"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                Anteriores ({emitidasGrouped.anteriores.length})
              </button>
            </div>
          </div>

          {/* Lista com Cartões de Alta Visibilidade para TV */}
          <div
            ref={listRefLeft}
            className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-2.5 scroll-smooth"
          >
            {loading ? (
              <div className="flex flex-col items-center justify-center h-full py-20 text-slate-400 font-mono-tech gap-2">
                <RefreshCw className="h-6 w-6 animate-spin text-blue-400" />
                <span className="text-xs">Carregando ordens emitidas...</span>
              </div>
            ) : (activeTabLeft === "hoje" ? emitidasGrouped.hoje : emitidasGrouped.anteriores).length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full py-20 text-slate-500 text-sm">
                Nenhuma O.S. encontrada neste período.
              </div>
            ) : (
              (activeTabLeft === "hoje" ? emitidasGrouped.hoje : emitidasGrouped.anteriores).map((e) => {
                const isNew = isToday(parseISO(e.created_at)) && (Date.now() - new Date(e.created_at).getTime()) < 3600000; // criada na última hora

                return (
                  <div
                    key={`${e.order_id}-${e.created_at}`}
                    className={`p-3.5 rounded-2xl border transition-all hover:scale-[1.01] ${
                      e.urgente
                        ? "bg-rose-500/10 border-rose-500/50 shadow-[0_0_20px_rgba(244,63,94,0.15)]"
                        : isNew
                        ? "bg-blue-500/10 border-blue-400/50 shadow-[0_0_20px_rgba(59,130,246,0.15)]"
                        : "bg-slate-950/70 border-slate-800/90 hover:border-blue-500/40"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <div className="flex items-center gap-2">
                        <span className="font-mono-tech font-black text-lg sm:text-xl text-blue-300 tracking-wide drop-shadow">
                          {e.titulo}
                        </span>
                        {isNew && (
                          <Badge className="bg-blue-500 text-white font-mono-tech text-[10px] px-2 py-0 animate-pulse font-bold">
                            NOVA
                          </Badge>
                        )}
                        {e.urgente && (
                          <Badge variant="destructive" className="font-mono-tech text-[10px] px-2 py-0 font-bold">
                            URGENTE
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono-tech text-xs sm:text-sm font-bold text-blue-400 bg-blue-500/10 border border-blue-500/20 px-2 py-0.5 rounded-lg">
                          {format(parseISO(e.created_at), activeTabLeft === "hoje" ? "HH:mm" : "dd/MM HH:mm")}
                        </span>
                      </div>
                    </div>

                    <div className="text-sm sm:text-base font-bold text-white tracking-wide truncate">
                      {e.cliente}
                    </div>

                    <div className="text-xs sm:text-sm text-slate-300 line-clamp-2 mt-1 leading-snug">
                      {e.descricao || "—"}
                    </div>

                    <div className="flex items-center justify-between text-[11px] text-slate-400 mt-2.5 pt-2 border-t border-slate-800/60 font-medium">
                      <span>Vendedor: <strong className="text-slate-300 font-semibold">{e.vendedor || "Não informado"}</strong></span>
                      <span className="font-mono-tech text-slate-500">{format(parseISO(e.created_at), "dd/MM/yyyy")}</span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* COLUNA DIREITA: O.S. LIBERADAS */}
        <div className="flex flex-col rounded-3xl bg-slate-900/70 border border-emerald-500/30 overflow-hidden shadow-2xl backdrop-blur-xl">
          {/* Header da Coluna */}
          <div className="p-3.5 sm:p-4 border-b border-emerald-500/20 bg-emerald-950/40 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 shadow-[0_0_12px_rgba(16,185,129,0.3)]">
                <CheckCircle2 className="h-4 w-4" />
              </div>
              <div>
                <h2 className="text-base sm:text-lg font-black tracking-tight text-white flex items-center gap-2">
                  OS LIBERADAS <span className="text-emerald-400 font-mono-tech text-xs font-normal">(SAÍDA P/ FÁBRICA)</span>
                </h2>
                <span className="text-[11px] text-slate-400 font-medium">Prontas para produção</span>
              </div>
            </div>

            {/* Alternador Hoje / Anteriores */}
            <div className="flex items-center gap-1 bg-slate-950/80 p-1 rounded-xl border border-slate-800">
              <button
                onClick={() => setActiveTabRight("hoje")}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                  activeTabRight === "hoje"
                    ? "bg-emerald-600 text-white shadow-md shadow-emerald-600/40"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                Hoje ({liberadasGrouped.hoje.length})
              </button>
              <button
                onClick={() => setActiveTabRight("anteriores")}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                  activeTabRight === "anteriores"
                    ? "bg-emerald-600 text-white shadow-md shadow-emerald-600/40"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                Anteriores ({liberadasGrouped.anteriores.length})
              </button>
            </div>
          </div>

          {/* Lista com Cartões de Alta Visibilidade para TV */}
          <div
            ref={listRefRight}
            className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-2.5 scroll-smooth"
          >
            {loading ? (
              <div className="flex flex-col items-center justify-center h-full py-20 text-slate-400 font-mono-tech gap-2">
                <RefreshCw className="h-6 w-6 animate-spin text-emerald-400" />
                <span className="text-xs">Carregando ordens liberadas...</span>
              </div>
            ) : (activeTabRight === "hoje" ? liberadasGrouped.hoje : liberadasGrouped.anteriores).length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full py-20 text-slate-500 text-sm">
                Nenhuma O.S. liberada neste período.
              </div>
            ) : (
              (activeTabRight === "hoje" ? liberadasGrouped.hoje : liberadasGrouped.anteriores).map((e) => {
                const isRecent = isToday(parseISO(e.chegou_em)) && (Date.now() - new Date(e.chegou_em).getTime()) < 1800000; // liberada nos últimos 30 min

                return (
                  <div
                    key={`${e.order_id}-${e.chegou_em}`}
                    className={`p-3.5 rounded-2xl border transition-all hover:scale-[1.01] ${
                      e.urgente
                        ? "bg-rose-500/10 border-rose-500/50 shadow-[0_0_20px_rgba(244,63,94,0.15)]"
                        : isRecent
                        ? "bg-emerald-500/15 border-emerald-400/60 shadow-[0_0_25px_rgba(16,185,129,0.25)] ring-1 ring-emerald-400/50"
                        : "bg-slate-950/70 border-slate-800/90 hover:border-emerald-500/40"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <div className="flex items-center gap-2">
                        <span className="font-mono-tech font-black text-lg sm:text-xl text-emerald-300 tracking-wide drop-shadow">
                          {e.titulo}
                        </span>
                        {isRecent && (
                          <Badge className="bg-emerald-500 text-slate-950 font-mono-tech text-[10px] px-2 py-0 font-extrabold animate-pulse shadow-[0_0_10px_#10b981]">
                            LIBERADA AGORA!
                          </Badge>
                        )}
                        {e.urgente && (
                          <Badge variant="destructive" className="font-mono-tech text-[10px] px-2 py-0 font-bold">
                            URGENTE
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono-tech text-xs sm:text-sm font-bold text-emerald-300 bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 rounded-lg shadow-sm">
                          {format(parseISO(e.chegou_em), activeTabRight === "hoje" ? "HH:mm" : "dd/MM HH:mm")}
                        </span>
                      </div>
                    </div>

                    <div className="text-sm sm:text-base font-bold text-white tracking-wide truncate">
                      {e.cliente}
                    </div>

                    <div className="text-xs sm:text-sm text-slate-300 line-clamp-2 mt-1 leading-snug">
                      {e.descricao || "—"}
                    </div>

                    <div className="flex items-center justify-between text-[11px] text-slate-400 mt-2.5 pt-2 border-t border-slate-800/60 font-medium">
                      <span>Vendedor: <strong className="text-slate-300 font-semibold">{e.vendedor || "Não informado"}</strong></span>
                      <span className="font-mono-tech text-slate-500">{format(parseISO(e.chegou_em), "dd/MM/yyyy")}</span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* RODAPÉ: TELEMETRY TICKER ESTILO BLOOMBERG / TV NOTÍCIAS */}
      <div className="mt-3 p-2.5 rounded-2xl bg-slate-950/90 border border-slate-800/80 flex items-center justify-between gap-4 overflow-hidden shrink-0 text-xs font-mono-tech">
        <div className="flex items-center gap-2 text-cyan-400 font-bold uppercase tracking-wider shrink-0 bg-slate-900 px-3 py-1 rounded-xl border border-slate-800">
          <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
          RADAR PCP
        </div>

        <div className="flex-1 overflow-hidden whitespace-nowrap text-slate-300 text-[11px] sm:text-xs">
          <span className="inline-block animate-marquee">
            📢 <strong>PRIMACOR GRÁFICA</strong> • TRANSMISSÃO AO VIVO EM TEMPO REAL • HOJE: {totalEmitidasHoje} EMITIDAS / {totalLiberadasHoje} LIBERADAS •
            {lastLiberada ? ` ÚLTIMA LIBERAÇÃO: ${lastLiberada.titulo} (${lastLiberada.cliente}) •` : ""}
            WEBSOCKET SUPABASE CONECTADO • RITMO DE PRODUÇÃO: {totalEmitidasHoje > 0 ? `${Math.round((totalLiberadasHoje / totalEmitidasHoje) * 100)}%` : "100%"} •
            CONTROLE PCP PRIMACOR OS v2.0
          </span>
        </div>

        <div className="hidden sm:flex items-center gap-3 text-slate-500 text-[11px] shrink-0 font-medium">
          <span>Pressione <strong>F11</strong> para Tela Cheia</span>
        </div>
      </div>
    </div>
  );

  // Se estiver em modo TV, renderiza em tela cheia pura (100vw x 100vh) sem a barra lateral
  if (isTvMode) {
    return (
      <div className="fixed inset-0 z-50 bg-[#050811] text-white flex flex-col h-screen w-screen overflow-hidden">
        {mainContent}
      </div>
    );
  }

  // Modo padrão com Layout e barra lateral normal
  return (
    <Layout
      searchQuery={searchQuery}
      onSearchChange={setSearchQuery}
      onAddOrder={() => {}}
      activeCount={0}
      archivedCount={0}
      sectorName="PCP"
      countsLoading={loading}
      permissions={permissions}
    >
      {mainContent}
    </Layout>
  );
}
