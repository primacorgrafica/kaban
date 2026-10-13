import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { OrderTimeline, formatDuration } from "@/hooks/useOrderAnalytics";
import { STATUS_CONFIG, STATUS_ORDER, OrderStatus } from "@/types/order";

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit", month: "2-digit", year: "2-digit",
    hour: "2-digit", minute: "2-digit",
  });
}

export function exportSingleOrderPDF(timeline: OrderTimeline) {
  const doc = new jsPDF();
  const title = `Relatório OS. — ${timeline.titulo}`;

  doc.setFontSize(16);
  doc.text(title, 14, 20);

  doc.setFontSize(10);
  doc.setTextColor(100);
  doc.text(`Gerado em: ${fmtDate(new Date().toISOString())}`, 14, 28);

  // Info
  doc.setFontSize(11);
  doc.setTextColor(0);
  const info = [
    ["Cliente", timeline.cliente],
    ["Status Atual", STATUS_CONFIG[timeline.statusAtual as OrderStatus]?.label || timeline.statusAtual],
    ["Criada em", fmtDate(timeline.criadoEm)],
    ["Liberada em", timeline.finalizadoEm ? fmtDate(timeline.finalizadoEm) : "—"],
    ["Tempo Total", timeline.tempoTotal !== null ? formatDuration(timeline.tempoTotal) : "—"],
  ];

  autoTable(doc, {
    startY: 34,
    head: [["Campo", "Valor"]],
    body: info,
    theme: "grid",
    headStyles: { fillColor: [59, 130, 246] },
    styles: { fontSize: 10 },
  });

  // Time per status
  const statusRows = STATUS_ORDER
    .filter((s) => timeline.tempoPorStatus[s] !== undefined)
    .map((s) => [
      STATUS_CONFIG[s].label,
      formatDuration(timeline.tempoPorStatus[s]),
    ]);

  if (statusRows.length > 0) {
    const finalY = (doc as any).lastAutoTable?.finalY || 80;
    doc.setFontSize(12);
    doc.text("Tempo por Etapa", 14, finalY + 10);

    autoTable(doc, {
      startY: finalY + 14,
      head: [["Etapa", "Tempo"]],
      body: statusRows,
      theme: "grid",
      headStyles: { fillColor: [59, 130, 246] },
      styles: { fontSize: 10 },
    });
  }

  doc.save(`OS_${timeline.titulo.replace(/\s+/g, "_")}.pdf`);
}

type CardOrder = { titulo: string; cliente: string; observacao: string | null; created_at: string; saida_direta?: boolean; prova_digital?: boolean; prova_email?: boolean };

export function exportColumnPDF(
  orders: CardOrder[],
  statusLabel: string
) {
  const doc = new jsPDF();

  doc.setFontSize(16);
  doc.text(`Pré-Impressão: ${statusLabel}`, 14, 20);
  doc.setFontSize(10);
  doc.setTextColor(100);
  doc.text(`${orders.length} ordem(ns) • Gerado em: ${fmtDate(new Date().toISOString())}`, 14, 28);

  const rows = orders.map((o, i) => [
    String(i + 1),
    o.titulo,
    o.cliente,
    o.saida_direta ? "Sim" : "Não",
    [o.prova_digital ? "Digital" : "", o.prova_email ? "E-mail" : ""].filter(Boolean).join(" / ") || "—",
    o.observacao || "—",
    fmtDate(o.created_at),
  ]);

  autoTable(doc, {
    startY: 34,
    head: [["#", "OS.", "Cliente", "Saída Direta", "Tipo Prova", "Observação", "Criada em"]],
    body: rows,
    theme: "grid",
    headStyles: { fillColor: [59, 130, 246] },
    styles: { fontSize: 9 },
    columnStyles: { 5: { cellWidth: 40 } },
  });

  doc.save(`Pre-Impressao_${statusLabel.replace(/\s+/g, "_")}_${new Date().toISOString().slice(0, 10)}.pdf`);
}

export function exportAllColumnsPDF(
  ordersByStatus: { status: string; label: string; orders: CardOrder[] }[]
) {
  const doc = new jsPDF("landscape");
  const timestamp = fmtDate(new Date().toISOString());
  const totalOrders = ordersByStatus.reduce((sum, g) => sum + g.orders.length, 0);

  // ── Cover / Title ──
  doc.setFontSize(16);
  doc.setTextColor(30, 64, 175);
  doc.text("Relatório Geral — Pré-Impressão", 14, 14);
  doc.setFontSize(9);
  doc.setTextColor(100);
  doc.text(`${totalOrders} ordem(ns) no total • Gerado em: ${timestamp}`, 14, 20);

  // ── Summary table ──
  doc.setFontSize(11);
  doc.setTextColor(0);
  doc.text("Resumo por Coluna", 14, 28);

  const summaryRows = ordersByStatus.map((g) => [
    g.label,
    String(g.orders.length),
    g.orders.filter((o) => o.saida_direta).length > 0 ? String(g.orders.filter((o) => o.saida_direta).length) : "—",
    g.orders.filter((o) => o.prova_digital).length > 0 ? String(g.orders.filter((o) => o.prova_digital).length) : "—",
    g.orders.filter((o) => o.prova_email).length > 0 ? String(g.orders.filter((o) => o.prova_email).length) : "—",
  ]);

  autoTable(doc, {
    startY: 31,
    head: [["Coluna", "Qtd OS.", "Saída Direta", "Prova Digital", "Prova E-mail"]],
    body: summaryRows,
    theme: "grid",
    headStyles: { fillColor: [30, 64, 175], fontSize: 8 },
    styles: { fontSize: 8, cellPadding: 2 },
    tableWidth: 170,
  });

  // ── Status color map for headers ──
  const statusColors: Record<string, [number, number, number]> = {
    "Fila de Entrada": [100, 116, 139],
    "Preparando Arquivo": [59, 130, 246],
    "Produzindo Prova": [234, 179, 8],
    "Aguardando Aprovação": [249, 115, 22],
    "Aguardando Novo Arquivo": [239, 68, 68],
    "Arquivo Liberado": [34, 197, 94],
  };

  // ── One section per status ──
  for (const group of ordersByStatus) {
    if (group.orders.length === 0) continue;

    doc.addPage("landscape");

    const color = statusColors[group.label] || [59, 130, 246];

    // Header banner
    const bannerWidth = doc.internal.pageSize.getWidth() - 20;
    doc.setFillColor(color[0], color[1], color[2]);
    doc.roundedRect(10, 8, bannerWidth, 10, 2, 2, "F");
    doc.setFontSize(11);
    doc.setTextColor(255);
    doc.text(`${group.label}  —  ${group.orders.length} ordem(ns)`, 14, 15);

    doc.setTextColor(0);

    const rows = group.orders.map((o, i) => {
      const provas = [o.prova_digital ? "Digital" : "", o.prova_email ? "E-mail" : ""].filter(Boolean).join(" / ") || "—";
      return [
        String(i + 1),
        o.titulo,
        o.cliente,
        o.saida_direta ? "✔" : "—",
        provas,
        o.observacao || "—",
        fmtDate(o.created_at),
      ];
    });

    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 10;
    const usableWidth = pageWidth - margin * 2;

    autoTable(doc, {
      startY: 21,
      margin: { left: margin, right: margin },
      tableWidth: usableWidth,
      head: [["#", "OS.", "Cliente", "Saída", "Prova", "Observação", "Criada em"]],
      body: rows,
      theme: "striped",
      headStyles: { fillColor: color, fontSize: 8, textColor: [255, 255, 255], cellPadding: 1.5 },
      styles: { fontSize: 8, cellPadding: 1.5, overflow: "linebreak" },
      alternateRowStyles: { fillColor: [245, 247, 250] },
      columnStyles: {
        0: { cellWidth: usableWidth * 0.03, halign: "center" },
        1: { cellWidth: usableWidth * 0.15 },
        2: { cellWidth: usableWidth * 0.15 },
        3: { cellWidth: usableWidth * 0.06, halign: "center" },
        4: { cellWidth: usableWidth * 0.08, halign: "center" },
        5: { cellWidth: usableWidth * 0.37 },
        6: { cellWidth: usableWidth * 0.16 },
      },
    });
  }

  // ── Footer on every page ──
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(160);
    doc.text(`Página ${i} de ${pageCount}`, doc.internal.pageSize.getWidth() - 40, doc.internal.pageSize.getHeight() - 8);
    doc.text(`Gerado em: ${timestamp}`, 14, doc.internal.pageSize.getHeight() - 8);
  }

  doc.save(`Pre-Impressao_Completo_${new Date().toISOString().slice(0, 10)}.pdf`);
}

export function exportFullAnalyticsPDF(
  timelines: OrderTimeline[],
  avgPerStatus: Record<string, number>,
  avgTotal: number | null,
  stats: { total: number; liberadas: number; arquivadas: number; criadasHoje: number }
) {
  const doc = new jsPDF("landscape");

  doc.setFontSize(18);
  doc.text("Relatório Completo de Analytics", 14, 18);
  doc.setFontSize(10);
  doc.setTextColor(100);
  doc.text(`Gerado em: ${fmtDate(new Date().toISOString())}`, 14, 26);

  // Summary cards
  doc.setTextColor(0);
  doc.setFontSize(12);
  doc.text("Resumo Geral", 14, 36);

  autoTable(doc, {
    startY: 40,
    head: [["Métrica", "Valor"]],
    body: [
      ["Total de OS.", String(stats.total)],
      ["Criadas Hoje", String(stats.criadasHoje)],
      ["Liberadas", String(stats.liberadas)],
      ["Arquivadas", String(stats.arquivadas)],
      ["Tempo Médio Total (criação → liberação)", avgTotal ? formatDuration(avgTotal) : "—"],
    ],
    theme: "grid",
    headStyles: { fillColor: [59, 130, 246] },
    styles: { fontSize: 10 },
    tableWidth: 120,
  });

  // Average per status
  const avgRows = STATUS_ORDER
    .filter((s) => avgPerStatus[s])
    .map((s) => [STATUS_CONFIG[s].label, formatDuration(avgPerStatus[s])]);

  if (avgRows.length > 0) {
    const y1 = (doc as any).lastAutoTable?.finalY || 80;
    doc.setFontSize(12);
    doc.text("Tempo Médio por Etapa (OS. Liberadas)", 14, y1 + 10);

    autoTable(doc, {
      startY: y1 + 14,
      head: [["Etapa", "Tempo Médio"]],
      body: avgRows,
      theme: "grid",
      headStyles: { fillColor: [34, 197, 94] },
      styles: { fontSize: 10 },
      tableWidth: 120,
    });
  }

  // Full order table
  doc.addPage("landscape");
  doc.setFontSize(14);
  doc.text("Detalhamento por OS.", 14, 18);

  const headers = ["OS.", "Cliente", "Status", "Criada", "Liberada", "Tempo Total",
    ...STATUS_ORDER.map((s) => STATUS_CONFIG[s].label)];

  const rows = timelines.map((t) => [
    t.titulo,
    t.cliente,
    STATUS_CONFIG[t.statusAtual as OrderStatus]?.label || t.statusAtual,
    fmtDate(t.criadoEm),
    t.finalizadoEm ? fmtDate(t.finalizadoEm) : "—",
    t.tempoTotal !== null ? formatDuration(t.tempoTotal) : "—",
    ...STATUS_ORDER.map((s) =>
      t.tempoPorStatus[s] ? formatDuration(t.tempoPorStatus[s]) : "—"
    ),
  ]);

  autoTable(doc, {
    startY: 24,
    head: [headers],
    body: rows,
    theme: "grid",
    headStyles: { fillColor: [59, 130, 246], fontSize: 7 },
    styles: { fontSize: 7, cellPadding: 2 },
    columnStyles: { 0: { cellWidth: 30 }, 1: { cellWidth: 25 } },
  });

  doc.save(`Analytics_Completo_${new Date().toISOString().slice(0, 10)}.pdf`);
}

type EntregaOrder = {
  titulo: string;
  cliente: string;
  descricao: string;
  setor: string | null;
  setor_status: string;
  updated_at: string;
  entrega_data_limite: string | null;
  vendedor: string | null;
  entrega_endereco: string | null;
};

export function exportEntregasPDF(
  orders: EntregaOrder[],
  getSectorLabel: (setor: string | null) => string,
  getStatusLabel: (setor: string | null, status: string) => string
) {
  const doc = new jsPDF("portrait");
  const timestamp = fmtDate(new Date().toISOString());

  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 8;
  const usableWidth = pageWidth - margin * 2;

  doc.setFontSize(12);
  doc.setTextColor(30, 64, 175);
  doc.text("Programação de Entregas", margin, 12);
  doc.setFontSize(8);
  doc.setTextColor(100);
  doc.text(`${orders.length} ordem(ns) • Gerado em: ${timestamp}`, margin, 17);

  // Group orders by date for separator rows
  const fmtEntregaDate = (d: string | null) => {
    if (!d) return "Sem data de entrega";
    return new Date(d).toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "2-digit", year: "numeric" });
  };

  const getDateKey = (d: string | null) => {
    if (!d) return "__no_date__";
    return d.slice(0, 10);
  };

  // Build body with separator rows
  const body: any[][] = [];
  let lastDateKey = "";

  for (const o of orders) {
    const dateKey = getDateKey(o.entrega_data_limite);
    if (dateKey !== lastDateKey) {
      // Separator row — single merged cell with date label
      body.push([{
        content: fmtEntregaDate(o.entrega_data_limite),
        colSpan: 7,
        styles: {
          fillColor: [220, 220, 220] as [number, number, number],
          textColor: [60, 60, 60] as [number, number, number],
          fontStyle: "bold" as const,
          fontSize: 7,
          cellPadding: 1.5,
        },
      }]);
      lastDateKey = dateKey;
    }

    body.push([
      o.titulo,
      o.cliente,
      o.descricao,
      getSectorLabel(o.setor),
      getStatusLabel(o.setor, o.setor_status),
      o.vendedor || "—",
      o.entrega_endereco || "—",
    ]);
  }

  autoTable(doc, {
    startY: 20,
    margin: { left: margin, right: margin },
    tableWidth: usableWidth,
    head: [["OS", "Cliente", "Descrição", "Setor", "Etapa", "Vendedor", "Endereço"]],
    body,
    theme: "striped",
    headStyles: { fillColor: [30, 64, 175], fontSize: 6.5, textColor: [255, 255, 255], cellPadding: 1.2 },
    styles: { fontSize: 6.5, cellPadding: 1.2, overflow: "linebreak" },
    alternateRowStyles: { fillColor: [245, 247, 250] },
    columnStyles: {
      0: { cellWidth: usableWidth * 0.09 },
      1: { cellWidth: usableWidth * 0.14 },
      2: { cellWidth: usableWidth * 0.22 },
      3: { cellWidth: usableWidth * 0.11 },
      4: { cellWidth: usableWidth * 0.11 },
      5: { cellWidth: usableWidth * 0.13 },
      6: { cellWidth: usableWidth * 0.20 },
    },
  });

  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setTextColor(160);
    doc.text(`Página ${i} de ${pageCount}`, pageWidth - 35, doc.internal.pageSize.getHeight() - 6);
    doc.text(`Gerado em: ${timestamp}`, margin, doc.internal.pageSize.getHeight() - 6);
  }

  doc.save(`Entregas_${new Date().toISOString().slice(0, 10)}.pdf`);
}
