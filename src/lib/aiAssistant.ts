import { Order, OrderStatus, STATUS_CONFIG, STATUS_ORDER } from "@/types/order";
import { format, isPast, isToday, isTomorrow, differenceInHours } from "date-fns";
import { ptBR } from "date-fns/locale";

export interface ParsedOrderDraft {
  titulo: string;
  cliente: string;
  descricao: string;
  prazo?: string;
  urgente: boolean;
  vendedor?: string;
  processos: string[];
  destinatario?: string;
  endereco_entrega?: string;
  tipo_entrega: string[];
  observacao?: string;
  confidence: number;
}

export interface ProductionInsight {
  type: "warning" | "critical" | "info" | "success";
  title: string;
  description: string;
  count?: number;
  orderIds?: string[];
  suggestedAction?: string;
}

export interface BottleneckAnalysisResult {
  totalActive: number;
  delayedOrders: Order[];
  dueTodayOrders: Order[];
  urgentOrders: Order[];
  bottleneckStages: { stage: string; count: number }[];
  insights: ProductionInsight[];
}

export interface DailyExecutiveBriefing {
  totalActive: number;
  urgentCount: number;
  delayedCount: number;
  dueTodayCount: number;
  dueTomorrowCount: number;
  proofPendingCount: number;
  insights: ProductionInsight[];
  topCriticalOrders: Order[];
  text: string;
}

/**
 * Heuristic/NLP Smart Order Parser
 * Transforma texto bruto, mensagem de WhatsApp ou briefing em campos estruturados de O.S.
 */
export function parseOrderText(input: string, knownVendors: string[] = []): ParsedOrderDraft {
  const text = input.trim();
  const lower = text.toLowerCase();

  let titulo = "";
  let cliente = "";
  let descricao = "";
  let prazo: string | undefined = undefined;
  let urgente = false;
  let vendedor: string | undefined = undefined;
  const processos: string[] = [];
  let destinatario = "";
  let endereco_entrega = "";
  const tipo_entrega: string[] = [];
  let observacao = "";

  // 1. Detectar Número de O.S. (ex: 71234, OS 71234, #71234)
  const osMatch = text.match(/(?:o\.?s\.?|ordem|#)?\s*(\b\d{5}\b)/i);
  if (osMatch) {
    titulo = osMatch[1];
  } else {
    const numMatch = text.match(/\b\d{4,6}\b/);
    if (numMatch) titulo = numMatch[0];
  }

  // 2. Detectar Urgência
  if (
    lower.includes("urgente") ||
    lower.includes("urgência") ||
    lower.includes("prioridade alta") ||
    lower.includes("asap") ||
    lower.includes("para hoje")
  ) {
    urgente = true;
  }

  // 3. Detectar Vendedor
  const defaultVendors = [
    "Deborah", "Ronaldo", "Wellington", "Ozeas", "Alexandre", "Andre", "Marcelo", "Giovani", "Elana", "Carlos", "Primacor"
  ];
  const allVendors = Array.from(new Set([...defaultVendors, ...knownVendors]));

  const vendorExplicitMatch = text.match(/vendedor\s*[:=-]?\s*([A-Za-zÀ-ÿ]+)/i);
  if (vendorExplicitMatch) {
    vendedor = vendorExplicitMatch[1].trim();
  } else {
    for (const v of allVendors) {
      const regex = new RegExp(`\\b${v}\\b`, "i");
      if (regex.test(text)) {
        vendedor = v;
        break;
      }
    }
  }

  // 4. Detectar Tipo de Entrega
  if (lower.includes("motoboy") || lower.includes("moto")) tipo_entrega.push("MOTO");
  if (lower.includes("carro") || lower.includes("van") || lower.includes("veículo")) tipo_entrega.push("CARRO");
  if (lower.includes("retira") || lower.includes("cliente retira") || lower.includes("balcão")) tipo_entrega.push("RETIRA");
  if (lower.includes("transportadora") || lower.includes("sedex") || lower.includes("correios")) tipo_entrega.push("TRANSPORTADORA");

  // 5. Detectar Processos Gráficos
  const processKeywords: Record<string, string[]> = {
    PANTONE: ["pantone", "cor especial"],
    CMYK: ["cmyk", "4x4", "4x0", "colorido"],
    DIG: ["digital", "impressão digital", "laser"],
    CTP: ["ctp", "chapa"],
    OFF: ["offset", "off-set"],
    GUI: ["guilhotina", "corte", "refile"],
    LAM: ["laminação", "laminado", "bopp", "fosco", "brilho"],
    UV: ["verniz uv", "reserva uv", "verniz"],
    HOT: ["hot stamping", "hotstamp", "hot-stamping"],
    CVM: ["corte e vinco", "corte vinco", "cvm", "faca"],
    DOB: ["dobra", "dobrado", "dobradeira"],
    ALC: ["alceamento", "grampo", "alceadeira", "revista"],
    PUR: ["pur", "lombada quadrada", "cola pur"],
    WIR: ["wire-o", "wireo", "espiral"],
    CAR: ["cartucheira", "colagem cartucho", "colagem"],
    DES: ["destaque", "destacador"],
    CAP: ["capa dura"],
    VIN: ["vinco", "vincadeira"],
  };

  for (const [code, terms] of Object.entries(processKeywords)) {
    if (terms.some((term) => lower.includes(term))) {
      processos.push(code);
    }
  }

  // 6. Detectar Cliente
  // Suporta: "cliente: Farmácias São Bento", "para cliente: Farmácias São Bento", "cliente Farmácias São Bento"
  const clienteMatch = text.match(/(?:para\s+o?\s*cliente|cliente|para\s+a?\s*empresa|empresa)\s*[:=-]?\s*([A-Za-zÀ-ÿ0-9\s&.-]{3,40}?)(?=[,\n;]|urgente|prazo|vendedor|os\b|serviço|produto|$)/i);
  if (clienteMatch && clienteMatch[1].trim()) {
    const rawClient = clienteMatch[1].trim();
    if (!["o", "a", "os", "as", "um", "uma"].includes(rawClient.toLowerCase())) {
      cliente = rawClient;
    }
  }

  // 7. Detectar Descrição / Serviço / Produto
  const explicitDescMatch = text.match(/(?:serviço|produto|descrição|item)\s*[:=-]?\s*([^\n;]+)/i);
  if (explicitDescMatch && explicitDescMatch[1].trim()) {
    descricao = explicitDescMatch[1].trim();
  } else {
    const descMatch = text.match(/(?:\d+[.\d]*\s*(?:unidades?|unids?|mil|fls|folhas|cartuchos?|folders?|livros?|revistas?|blocos?|adesivos?|embalagens?|flyers?|panfletos?)[^,\n;]*)/i);
    if (descMatch) {
      descricao = descMatch[0].trim();
    } else {
      descricao = text.split("\n").filter(Boolean)[0]?.slice(0, 80).trim() || "";
    }
  }

  // Se o cliente ainda estiver vazio, tentar inferir da primeira linha limpa
  if (!cliente) {
    const lines = text.split("\n").map(l => l.trim()).filter(Boolean);
    if (lines.length > 0) {
      cliente = lines[0].replace(/[^a-zA-ZÀ-ÿ0-9\s]/g, "").trim();
    }
  }

  return {
    titulo,
    cliente: cliente || "CLIENTE A DEFINIR",
    descricao: descricao || text.slice(0, 60),
    prazo,
    urgente,
    vendedor,
    processos: Array.from(new Set(processos)),
    destinatario,
    endereco_entrega,
    tipo_entrega,
    observacao: text.length > 100 ? text : undefined,
    confidence: (titulo ? 30 : 0) + (cliente ? 25 : 0) + (descricao ? 25 : 0) + (processos.length ? 20 : 0),
  };
}

/**
 * Sugestão Automática de Processos Gráficos com base no tipo de produto
 */
export function suggestProcessosForProduct(description: string): string[] {
  const d = description.toLowerCase();
  const set = new Set<string>();

  if (d.includes("cartucho") || d.includes("caixa") || d.includes("embalagem")) {
    set.add("CTP");
    set.add("OFF");
    set.add("COR"); // corte
    set.add("CVM"); // corte e vinco
    set.add("COL"); // colagem
    set.add("CAR"); // cartucheira
    set.add("CMYK");
    set.add("Embalagem");
    set.add("GUI");
    set.add("LAM");
  } else if (d.includes("folder") || d.includes("flyer") || d.includes("panfleto")) {
    set.add("CTP");
    set.add("OFF");
    set.add("CMYK");
    set.add("Promocional");
    set.add("GUI");
    if (d.includes("dobra") || d.includes("3 dobras") || d.includes("2 dobras")) set.add("DOB");
  } else if (d.includes("livro") || d.includes("catalogo") || d.includes("catálogo")) {
    set.add("CTP");
    set.add("OFF");
    set.add("CMYK");
    set.add("Editorial");
    set.add("GUI");
    set.add("LAM");
    set.add("PUR");
  } else if (d.includes("livreto") || d.includes("revista") || d.includes("cartilha") || d.includes("bula")) {
    set.add("CTP");
    set.add("OFF");
    set.add("CMYK");
    set.add("Editorial");
    set.add("GUI");
    set.add("ALC");
    set.add("DOB");
  } else if (d.includes("adesivo") || d.includes("rotulo") || d.includes("rótulo")) {
    set.add("DIG");
    set.add("Promocional");
    set.add("GUI");
  } else if (d.includes("bloco") || d.includes("receituario") || d.includes("receituário")) {
    set.add("OFF");
    set.add("Promocional");
    set.add("GUI");
    set.add("MAN");
  } else if (d.includes("cracha") || d.includes("crachá") || d.includes("cartao") || d.includes("cartão")) {
    set.add("DIG");
    set.add("Promocional");
    set.add("GUI");
    set.add("LAM");
  } else {
    set.add("Promocional");
    set.add("GUI");
  }

  return Array.from(set);
}

/**
 * Análise Inteligente de Gargalos de Produção
 */
export function analyzeProductionBottlenecks(orders: Order[]): BottleneckAnalysisResult {
  const active = orders.filter((o) => !o.arquivado);
  const now = new Date();

  // 1. Ordens Vencidas
  const delayedOrders = active.filter((o) => o.prazo && isPast(new Date(o.prazo)));

  // 2. Ordens para Hoje (ainda não vencidas)
  const dueTodayOrders = active.filter((o) => o.prazo && isToday(new Date(o.prazo)) && !isPast(new Date(o.prazo)));

  // 3. Ordens Urgentes
  const urgentOrders = active.filter((o) => o.urgente);

  // 4. Volume por etapa
  const stageCounts: Record<string, number> = {};
  active.forEach((o) => {
    const key = o.setor || o.status;
    stageCounts[key] = (stageCounts[key] || 0) + 1;
  });

  const bottleneckStages = Object.entries(stageCounts)
    .map(([stage, count]) => ({ stage, count }))
    .sort((a, b) => b.count - a.count);

  const insights: ProductionInsight[] = [];

  if (delayedOrders.length > 0) {
    insights.push({
      type: "critical",
      title: `${delayedOrders.length} O.S. com Prazo Expirado`,
      description: "Existem pedidos com data limite ultrapassada que ainda não foram finalizados.",
      count: delayedOrders.length,
      orderIds: delayedOrders.map((o) => o.id),
      suggestedAction: "Filtrar por 'Urgentes' e verificar prioridade na Expedição/Off-set.",
    });
  }

  if (dueTodayOrders.length > 0) {
    insights.push({
      type: "warning",
      title: `${dueTodayOrders.length} O.S. com Entrega Hoje`,
      description: "Pedidos com prazo de entrega vencendo hoje. Monitorar fluxo de saída.",
      count: dueTodayOrders.length,
      orderIds: dueTodayOrders.map((o) => o.id),
      suggestedAction: "Confirmar se já estão em acabamento ou expedição.",
    });
  }

  const prep = active.filter((o) => o.status === "aguardando_novo_arquivo");
  if (prep.length > 10) {
    insights.push({
      type: "warning",
      title: `Sobrecarga em Preparação (${prep.length} O.S.)`,
      description: "Volume elevado de ordens em preparação na pré-impressão.",
      count: prep.length,
      suggestedAction: "Verificar os motivos das paradas e dar andamento às ordens liberadas.",
    });
  }

  return {
    totalActive: active.length,
    delayedOrders,
    dueTodayOrders,
    urgentOrders,
    bottleneckStages,
    insights,
  };
}

/**
 * Resumo Executivo Diário
 */
export function generateDailyExecutiveBriefing(orders: Order[]): DailyExecutiveBriefing {
  const analysis = analyzeProductionBottlenecks(orders);
  const active = orders.filter((o) => !o.arquivado);
  const dueTomorrow = active.filter((o) => o.prazo && isTomorrow(new Date(o.prazo)));
  const proofPending = active.filter((o) => o.status === "aguardando_aprovacao" || o.status === "aguardando_prova");

  const topCritical = [...active]
    .sort((a, b) => {
      if (a.urgente !== b.urgente) return a.urgente ? -1 : 1;
      if (a.prazo && b.prazo) return new Date(a.prazo).getTime() - new Date(b.prazo).getTime();
      return 0;
    })
    .slice(0, 5);

  const text = `
Relatório Executivo Primacor — ${format(new Date(), "dd/MM/yyyy HH:mm", { locale: ptBR })}
Total de Ordens Ativas: ${analysis.totalActive}
Ordens Urgentes: ${analysis.urgentOrders.length}
Ordens com Prazo Atrasado: ${analysis.delayedOrders.length}
Ordens com Entrega Hoje: ${analysis.dueTodayOrders.length}
Aguardando Prova/Aprovação: ${proofPending.length}
  `.trim();

  return {
    totalActive: analysis.totalActive,
    urgentCount: analysis.urgentOrders.length,
    delayedCount: analysis.delayedOrders.length,
    dueTodayCount: analysis.dueTodayOrders.length,
    dueTomorrowCount: dueTomorrow.length,
    proofPendingCount: proofPending.length,
    insights: analysis.insights,
    topCriticalOrders: topCritical,
    text,
  };
}

/**
 * Helper para exportação de texto do resumo executivo
 */
export function generateDailyExecutiveBriefingText(orders: Order[]): string {
  const briefing = generateDailyExecutiveBriefing(orders);
  return briefing.text;
}
