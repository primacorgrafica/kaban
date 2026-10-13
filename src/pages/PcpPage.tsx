import { useState, useEffect, useMemo, type ReactNode } from "react";
import { Layout } from "@/components/Layout";
import { useAuth } from "@/hooks/useAuth";
import { usePermissions } from "@/hooks/usePermissions";
import { supabase } from "@/integrations/supabase/client";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { subscribeOrders } from "@/lib/realtimeManager";


interface LiberadaEntry {
  order_id: string;
  titulo: string;
  cliente: string;
  descricao: string;
  vendedor: string | null;
  chegou_em: string;
}

interface EmitidaEntry {
  order_id: string;
  titulo: string;
  cliente: string;
  descricao: string;
  vendedor: string | null;
  created_at: string;
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

// Insere uma linha divisória sempre que o dia muda entre registros consecutivos
function withDayDividers(items: { key: string; date: Date; row: ReactNode }[]): ReactNode[] {
  const rows: ReactNode[] = [];
  let prevDate: Date | null = null;
  for (const item of items) {
    if (prevDate && !isSameDay(item.date, prevDate)) {
      rows.push(
        <TableRow key={`sep-${item.key}`} className="hover:bg-transparent">
          <TableCell colSpan={5} className="px-1 py-0">
            <div className="h-[3px] w-full bg-muted-foreground/60 my-1.5" />
          </TableCell>
        </TableRow>
      );
    }
    rows.push(item.row);
    prevDate = item.date;
  }
  return rows;
}

export default function PcpPage() {
  const { user, authReady } = useAuth();
  const permissions = usePermissions();
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [liberadas, setLiberadas] = useState<LiberadaEntry[]>([]);
  const [emitidas, setEmitidas] = useState<EmitidaEntry[]>([]);


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
      .select("id, titulo, cliente, descricao, vendedor, status, setor, setor_status")
      .in("id", Array.from(ids));

    const map = new Map<string, { titulo: string; cliente: string; descricao: string; vendedor: string | null }>();
    const stateMap = new Map<string, any>();
    (ordersData || []).forEach((o: any) => {
      map.set(o.id, { titulo: o.titulo, cliente: o.cliente, descricao: o.descricao, vendedor: o.vendedor });
      stateMap.set(o.id, o);
    });
    // Aprovação revogada: OS voltou da Saída para etapa anterior no próprio setor
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

    // Mantém apenas a liberação MAIS RECENTE por número de OS
    // (evita duplicatas de sub-OS, reliberações e origens diferentes)
    const latestByKey = new Map<string, LiberadaEntry>();
    for (const e of entries) {
      const key = (e.titulo || "").trim().toUpperCase() || e.order_id;
      const prev = latestByKey.get(key);
      if (!prev || e.chegou_em > prev.chegou_em) latestByKey.set(key, e);
    }
    const deduped = Array.from(latestByKey.values());

    deduped.sort((a, b) => b.chegou_em.localeCompare(a.chegou_em));
    setLiberadas(deduped);
    setLoading(false);
  };

  const fetchEmitidas = async () => {
    const since = new Date();
    since.setDate(since.getDate() - 6);
    since.setHours(0, 0, 0, 0);
    const { data } = await supabase
      .from("orders")
      .select("id, titulo, cliente, descricao, vendedor, created_at, om_numero, oc_numero, nc_numero, setor, parent_order_id")
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
    }));
    // Dedup pelo número da OS: cada OS aparece apenas uma vez (a mais recente).
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
    const unsub = subscribeOrders(() => { fetchLiberadas(); fetchEmitidas(); });
    return () => unsub();
  }, [authReady, user]);

  // Recalcula os grupos "Hoje/Anteriores" na virada do dia, sem precisar recarregar a página.
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
    // "Anteriores" = os 5 dias anteriores a hoje (ontem até 5 dias atrás)
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
    // "Anteriores" = os 5 dias anteriores a hoje (ontem até 5 dias atrás)
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



  const handleAddOrder = () => {};


  return (
    <Layout
      searchQuery={searchQuery}
      onSearchChange={setSearchQuery}
      onAddOrder={handleAddOrder}
      activeCount={0}
      archivedCount={0}
      sectorName="PCP"
      countsLoading={loading}
      permissions={permissions}
    >
      {loading ? (
        <div className="flex items-center justify-center h-full text-muted-foreground">Carregando dados...</div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-3">
            <h3 className="text-sm font-bold text-blue-800 uppercase text-center tracking-wide">OS Emitidas</h3>
            <EmitidasView grouped={emitidasGrouped} variant="blue" />
          </div>
          <div className="space-y-3">
            <h3 className="text-sm font-bold text-green-800 uppercase text-center tracking-wide">OS Liberadas</h3>
            <LiberadasView grouped={liberadasGrouped} variant="green" />
          </div>
        </div>
      )}
    </Layout>
  );
}

function LiberadasSection({ title, entries, variant = 'green', timeOnly = false }: { title: string; entries: LiberadaEntry[]; variant?: 'blue' | 'green'; timeOnly?: boolean }) {
  const borderCls = variant === 'blue' ? 'border-blue-300' : 'border-green-300';
  const headerBg = variant === 'blue' ? 'bg-blue-100' : 'bg-green-100';
  const titleCls = variant === 'blue' ? 'text-blue-800' : 'text-green-800';
  const badgeBg = variant === 'blue' ? 'bg-blue-200' : 'bg-green-200';
  const badgeText = variant === 'blue' ? 'text-blue-900' : 'text-green-900';
  return (
    <div className={`rounded-lg border bg-card ${borderCls}`}>
      <div className={`px-2 py-1.5 border-b rounded-t-lg flex items-center justify-center ${headerBg}`}>
        <span className={`text-sm font-semibold ${titleCls}`}>{title} <span className={`inline-flex items-center justify-center px-1.5 py-0.5 rounded-full text-[11px] font-bold ml-1.5 ${badgeBg} ${badgeText}`}>{entries.length}</span></span>
      </div>
      <div className="overflow-auto max-h-[60vh]">
        <Table className="table-fixed w-full">
          <TableHeader>
            <TableRow className="text-[11px]">
              <TableHead className="whitespace-nowrap px-1 py-1 w-[55px]">OS</TableHead>
              <TableHead className="whitespace-nowrap px-1 py-1 w-[90px]">CLIENTE</TableHead>
              <TableHead className="whitespace-nowrap px-1 py-1 w-[170px]">DESCRIÇÃO</TableHead>
              <TableHead className="whitespace-nowrap px-1 py-1 w-[75px]">VENDEDOR</TableHead>
              <TableHead className="whitespace-nowrap px-1 py-1 w-[105px]">QUANDO</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {entries.length === 0 ? (
              <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-4 text-xs">Nenhuma OS</TableCell></TableRow>
            ) : withDayDividers(entries.map(e => ({
              key: `${e.order_id}-${e.chegou_em}`,
              date: parseISO(e.chegou_em),
              row: (
                <TableRow key={`${e.order_id}-${e.chegou_em}`} className="text-[11px]">
                  <TableCell className="px-1 py-0.5 font-semibold whitespace-nowrap">{e.titulo}</TableCell>
                  <TableCell className="px-1 py-0.5 whitespace-nowrap truncate">{e.cliente}</TableCell>
                  <TableCell className="px-1 py-0.5 truncate">{e.descricao}</TableCell>
                  <TableCell className="px-1 py-0.5 whitespace-nowrap truncate">{e.vendedor || "—"}</TableCell>
                  <TableCell className="px-1 py-0.5 whitespace-nowrap">{timeOnly ? format(parseISO(e.chegou_em), "HH:mm", { locale: ptBR }) : format(parseISO(e.chegou_em), "dd/MM/yy HH:mm", { locale: ptBR })}</TableCell>
                </TableRow>
              ),
            })))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function LiberadasView({ grouped, variant = 'green' }: { grouped: { hoje: LiberadaEntry[]; anteriores: LiberadaEntry[] }; variant?: 'blue' | 'green' }) {
  return (
    <div className="space-y-3">
      <LiberadasSection title="Hoje" entries={grouped.hoje} variant={variant} timeOnly />
      <LiberadasSection title="Anteriores" entries={grouped.anteriores} variant={variant} />
    </div>
  );
}


function EmitidasSection({ title, entries, variant = 'blue', timeOnly = false }: { title: string; entries: EmitidaEntry[]; variant?: 'blue' | 'green'; timeOnly?: boolean }) {
  const borderCls = variant === 'blue' ? 'border-blue-300' : 'border-green-300';
  const headerBg = variant === 'blue' ? 'bg-blue-100' : 'bg-green-100';
  const titleCls = variant === 'blue' ? 'text-blue-800' : 'text-green-800';
  const badgeBg = variant === 'blue' ? 'bg-blue-200' : 'bg-green-200';
  const badgeText = variant === 'blue' ? 'text-blue-900' : 'text-green-900';
  return (
    <div className={`rounded-lg border bg-card ${borderCls}`}>
      <div className={`px-2 py-1.5 border-b rounded-t-lg flex items-center justify-center ${headerBg}`}>
        <span className={`text-sm font-semibold ${titleCls}`}>{title} <span className={`inline-flex items-center justify-center px-1.5 py-0.5 rounded-full text-[11px] font-bold ml-1.5 ${badgeBg} ${badgeText}`}>{entries.length}</span></span>
      </div>
      <div className="overflow-auto max-h-[60vh]">
        <Table className="table-fixed w-full">
          <TableHeader>
            <TableRow className="text-[11px]">
              <TableHead className="whitespace-nowrap px-1 py-1 w-[55px]">OS</TableHead>
              <TableHead className="whitespace-nowrap px-1 py-1 w-[90px]">CLIENTE</TableHead>
              <TableHead className="whitespace-nowrap px-1 py-1 w-[170px]">DESCRIÇÃO</TableHead>
              <TableHead className="whitespace-nowrap px-1 py-1 w-[75px]">VENDEDOR</TableHead>
              <TableHead className="whitespace-nowrap px-1 py-1 w-[105px]">CRIADA</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {entries.length === 0 ? (
              <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-4 text-xs">Nenhuma OS</TableCell></TableRow>
            ) : withDayDividers(entries.map(e => ({
              key: `${e.order_id}-${e.created_at}`,
              date: parseISO(e.created_at),
              row: (
                <TableRow key={`${e.order_id}-${e.created_at}`} className="text-[11px]">
                  <TableCell className="px-1 py-0.5 font-semibold whitespace-nowrap">{e.titulo}</TableCell>
                  <TableCell className="px-1 py-0.5 whitespace-nowrap truncate">{e.cliente}</TableCell>
                  <TableCell className="px-1 py-0.5 truncate">{e.descricao}</TableCell>
                  <TableCell className="px-1 py-0.5 whitespace-nowrap truncate">{e.vendedor || "—"}</TableCell>
                  <TableCell className="px-1 py-0.5 whitespace-nowrap">{timeOnly ? format(parseISO(e.created_at), "HH:mm", { locale: ptBR }) : format(parseISO(e.created_at), "dd/MM/yy HH:mm", { locale: ptBR })}</TableCell>
                </TableRow>
              ),
            })))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function EmitidasView({ grouped, variant = 'blue' }: { grouped: { hoje: EmitidaEntry[]; anteriores: EmitidaEntry[] }; variant?: 'blue' | 'green' }) {
  return (
    <div className="space-y-3">
      <EmitidasSection title="Hoje" entries={grouped.hoje} variant={variant} timeOnly />
      <EmitidasSection title="Anteriores" entries={grouped.anteriores} variant={variant} />
    </div>
  );
}
