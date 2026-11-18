import React, { useState, useRef, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { motion, useScroll, useTransform, useSpring, AnimatePresence } from "framer-motion";
import {
  BookOpen, Search, CheckCircle2, AlertTriangle, Layers, PrinterCheck,
  Monitor, Truck, Factory, ShieldCheck, Package, BarChart3, Clock,
  ArrowRight, ChevronRight, FileText, FileDown, Printer, RotateCcw,
  Info, Sparkles, ArrowLeft, ExternalLink, HelpCircle, ShoppingCart,
  Wrench, ClipboardList, Eye, Check, X, Bookmark, Zap, Compass,
  ChevronDown, MapPin, Hash, CheckSquare, ShieldAlert, Cpu, ArrowUpRight
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ThemeToggle } from "@/components/ThemeToggle";
import logoImg from "@/assets/logo-sidebar.png";

// ─── Checklist Mock Data ────────────────────────────────────────────────────
const CHECKLIST_13_ITEMS = [
  "A montagem corresponde à OS e à versão final aprovada do trabalho.",
  "O formato da folha e a máquina de impressão estão corretos.",
  "O formato da chapa, a orientação e o posicionamento da montagem estão corretos.",
  "A quantidade de peças por folha, os espaçamentos e o aproveitamento estão corretos.",
  "A paginação, a sequência dos cadernos e a orientação das páginas estão corretas.",
  "Frente e verso estão correspondentes, considerando o sistema de virada previsto.",
  "A posição de pinça e a referência lateral seguem o padrão da máquina.",
  "O formato final, as sangrias e as margens de segurança estão corretos na montagem.",
  "As marcas de corte, dobra e registro estão posicionadas corretamente.",
  "As barras de controle estão posicionadas corretamente, sem invadir a área útil.",
  "Facas, vincos e vernizes estão posicionados e identificados corretamente na montagem.",
  "A prova de montagem ou o boneco foi conferido quanto a corte, dobra e sequência.",
  "A quantidade e a identificação das formas e chapas correspondem à OS."
];

// ─── Pipeline Stages ────────────────────────────────────────────────────────
const PIPELINE_STAGES = [
  {
    step: "01",
    tag: "COMERCIAL",
    title: "Entrada & Ordem",
    icon: ClipboardList,
    color: "from-blue-500/20 to-blue-600/5",
    border: "border-blue-500/40",
    glow: "shadow-blue-500/10",
    text: "text-blue-400",
    desc: "Abertura da O.S., prazos com o cliente, anexos e sincronização de aprovação de boneco via Outlook M365."
  },
  {
    step: "02",
    tag: "PRÉ-IMPRESSÃO",
    title: "Kanban & Provas",
    icon: Monitor,
    color: "from-indigo-500/20 to-indigo-600/5",
    border: "border-indigo-500/40",
    glow: "shadow-indigo-500/10",
    text: "text-indigo-400",
    desc: "Tratamento de artes, RIP, provas físicas/digitais, controle de REVs e barreira do Checklist de 13 itens."
  },
  {
    step: "03",
    tag: "CTP & DIGITAL",
    title: "Matrizes & Chapas",
    icon: Layers,
    color: "from-amber-500/20 to-amber-600/5",
    border: "border-amber-500/40",
    glow: "shadow-amber-500/10",
    text: "text-amber-400",
    desc: "Gravação a laser de matrizes térmicas offset, controle de paralisações justificadas e impressão rápida."
  },
  {
    step: "04",
    tag: "CHÃO DE FÁBRICA",
    title: "Offset & Acabamento",
    icon: Factory,
    color: "from-orange-500/20 to-orange-600/5",
    border: "border-orange-500/40",
    glow: "shadow-orange-500/10",
    text: "text-orange-400",
    desc: "Impressoras planas, corte, dobra, alceamento, costura, colagem de lombada e embalagem em pallets."
  },
  {
    step: "05",
    tag: "INSPEÇÃO",
    title: "Qualidade & Rótulos 80mm",
    icon: ShieldCheck,
    color: "from-emerald-500/20 to-emerald-600/5",
    border: "border-emerald-500/40",
    glow: "shadow-emerald-500/10",
    text: "text-emerald-400",
    desc: "Conferência final rigorosa e emissão de etiquetas térmicas na Zebra ZD230 com modo Manual ou Sequencial."
  },
  {
    step: "06",
    tag: "EXPEDIÇÃO",
    title: "Logística & Entregador",
    icon: Truck,
    color: "from-cyan-500/20 to-cyan-600/5",
    border: "border-cyan-500/40",
    glow: "shadow-cyan-500/10",
    text: "text-cyan-400",
    desc: "Roteirização viária inteligente OSRM, app do motorista com assinatura na tela e fotos no SharePoint."
  }
];

export default function TutorialPage() {
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement>(null);

  // Parallax scroll hooks
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start start", "end end"]
  });

  const smoothProgress = useSpring(scrollYProgress, { stiffness: 100, damping: 20 });
  const heroOrbY1 = useTransform(smoothProgress, [0, 1], [0, 320]);
  const heroOrbY2 = useTransform(smoothProgress, [0, 1], [0, -280]);
  const cardFloatY = useTransform(smoothProgress, [0, 0.5], [0, -60]);

  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState<string>("todos");
  const [activeFaq, setActiveFaq] = useState<number | null>(null);

  // Simulated interactive 13-item Checklist for user to test on the landing page!
  const [checkedItems, setCheckedItems] = useState<Record<number, boolean>>({
    0: true, 1: true, 2: true, 3: true, 4: true, 5: true, 6: true, 7: true
  });

  const toggleCheckItem = (idx: number) => {
    setCheckedItems((prev) => ({ ...prev, [idx]: !prev[idx] }));
  };

  const checkAllItems = () => {
    const all: Record<number, boolean> = {};
    CHECKLIST_13_ITEMS.forEach((_, i) => { all[i] = true; });
    setCheckedItems(all);
  };

  const checkedCount = Object.values(checkedItems).filter(Boolean).length;
  const isChecklistComplete = checkedCount === CHECKLIST_13_ITEMS.length;

  // Thermal Label Interactive Preview State
  const [mockLabelMode, setMockLabelMode] = useState<"manual" | "sequencial">("manual");
  const [mockPacote, setMockPacote] = useState("01");

  const scrollToSection = (id: string) => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: "smooth" });
    }
  };

  return (
    <div ref={containerRef} className="min-h-screen bg-[#06141B] text-[#CCD0CF] selection:bg-blue-600 selection:text-white relative overflow-hidden font-sans">
      
      {/* ─── Ambient Glow & Mesh Background (Parallax layers) ─── */}
      <div className="fixed inset-0 pointer-events-none -z-10 overflow-hidden">
        <motion.div
          style={{ y: heroOrbY1 }}
          className="absolute -top-40 -left-20 w-[600px] h-[600px] rounded-full bg-blue-600/15 blur-[140px]"
        />
        <motion.div
          style={{ y: heroOrbY2 }}
          className="absolute top-1/3 -right-32 w-[700px] h-[700px] rounded-full bg-emerald-500/10 blur-[160px]"
        />
        <div className="absolute bottom-10 left-1/4 w-[500px] h-[500px] rounded-full bg-indigo-600/10 blur-[130px]" />
        {/* Subtle grid pattern overlay */}
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#4A5C6A0f_1px,transparent_1px),linear-gradient(to_bottom,#4A5C6A0f_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)]" />
      </div>

      {/* ─── Fixed Header Nav ─── */}
      <header className="sticky top-0 z-50 backdrop-blur-xl bg-[#06141B]/80 border-b border-[#253745]/70 transition-all">
        <div className="max-w-7xl mx-auto px-4 sm:px-8 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate("/")}
              className="flex items-center gap-2.5 group cursor-pointer"
              title="Voltar ao Sistema"
            >
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center font-black text-white text-base shadow-lg shadow-blue-500/20 group-hover:scale-105 transition-transform">
                P
              </div>
              <div className="hidden sm:block text-left">
                <span className="block text-xs font-black tracking-wider text-white uppercase">Primacor Kaban</span>
                <span className="block text-[10px] text-[#9BA8AB] font-mono-tech leading-none">Guia Operacional 360°</span>
              </div>
            </button>
          </div>

          {/* Quick Nav Anchors */}
          <nav className="hidden md:flex items-center gap-1 text-xs font-semibold text-[#9BA8AB]">
            <button
              onClick={() => scrollToSection("roteiro-fabril")}
              className="px-3 py-1.5 rounded-lg hover:text-white hover:bg-[#253745]/60 transition-colors cursor-pointer"
            >
              Roteiro da Fábrica
            </button>
            <button
              onClick={() => scrollToSection("checklist-13")}
              className="px-3 py-1.5 rounded-lg hover:text-white hover:bg-[#253745]/60 transition-colors cursor-pointer flex items-center gap-1"
            >
              <CheckSquare className="h-3.5 w-3.5 text-emerald-400" />
              Checklist 13 Itens
            </button>
            <button
              onClick={() => scrollToSection("etiquetas-zebra")}
              className="px-3 py-1.5 rounded-lg hover:text-white hover:bg-[#253745]/60 transition-colors cursor-pointer flex items-center gap-1"
            >
              <Printer className="h-3.5 w-3.5 text-amber-400" />
              Etiquetas 80mm
            </button>
            <button
              onClick={() => scrollToSection("relatorios-pdf")}
              className="px-3 py-1.5 rounded-lg hover:text-white hover:bg-[#253745]/60 transition-colors cursor-pointer"
            >
              Relatórios PDF
            </button>
            <button
              onClick={() => scrollToSection("faq")}
              className="px-3 py-1.5 rounded-lg hover:text-white hover:bg-[#253745]/60 transition-colors cursor-pointer"
            >
              FAQ
            </button>
          </nav>

          {/* CTA & System Return */}
          <div className="flex items-center gap-2.5">
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate("/")}
              className="text-xs h-9 gap-1.5 bg-[#253745]/80 hover:bg-[#253745] text-white border-[#4A5C6A]/60 rounded-xl shadow-xs"
            >
              <ArrowLeft className="h-3.5 w-3.5 text-blue-400" />
              <span>Voltar ao Sistema</span>
            </Button>
          </div>
        </div>
      </header>

      {/* ─── HERO SECTION (Modern SaaS Parallax) ─── */}
      <section className="relative pt-16 sm:pt-24 pb-20 px-4 sm:px-8 max-w-7xl mx-auto text-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="space-y-6 max-w-4xl mx-auto"
        >
          {/* Eyebrow Pill */}
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#11212D] border border-blue-500/40 text-blue-400 text-xs font-bold tracking-wide shadow-lg shadow-blue-500/10">
            <Sparkles className="h-3.5 w-3.5 animate-pulse" />
            <span>MANUAL OFICIAL & DOCUMENTAÇÃO DA INDÚSTRIA GRÁFICA</span>
          </div>

          {/* Large Title */}
          <h1 className="text-4xl sm:text-6xl md:text-7xl font-black text-white tracking-tight leading-[1.08]">
            Domine o fluxo da fábrica{" "}
            <span className="bg-gradient-to-r from-blue-400 via-emerald-400 to-indigo-400 bg-clip-text text-transparent">
              do Comercial à Entrega.
            </span>
          </h1>

          {/* Subtitle */}
          <p className="text-base sm:text-xl text-[#9BA8AB] font-normal leading-relaxed max-w-2xl mx-auto">
            Guia visual interativo para operadores, PCP, impressores e expedição. Entenda as barreiras de qualidade, rotulagem Zebra 80mm e gestão em tempo real.
          </p>

          {/* Interactive Hero CTAs */}
          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            <Button
              size="lg"
              onClick={() => scrollToSection("roteiro-fabril")}
              className="h-12 px-6 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm shadow-xl shadow-blue-600/30 gap-2 cursor-pointer transition-all hover:scale-105"
            >
              <span>Ver Roteiro da Produção</span>
              <ArrowRight className="h-4 w-4" />
            </Button>
            <Button
              size="lg"
              variant="outline"
              onClick={() => scrollToSection("checklist-13")}
              className="h-12 px-6 rounded-2xl bg-[#11212D]/80 hover:bg-[#253745] text-white border-[#4A5C6A]/60 font-bold text-sm gap-2 cursor-pointer"
            >
              <CheckCircle2 className="h-4 w-4 text-emerald-400" />
              <span>Conhecer o Checklist CTP</span>
            </Button>
          </div>
        </motion.div>

        {/* ─── Hero Floating Mockup (Parallax Card with Live Simulation) ─── */}
        <motion.div
          style={{ y: cardFloatY }}
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.8, delay: 0.2 }}
          className="mt-14 max-w-5xl mx-auto rounded-3xl p-1 bg-gradient-to-b from-[#4A5C6A]/60 via-[#253745]/30 to-transparent shadow-2xl"
        >
          <div className="rounded-[22px] bg-[#11212D]/95 border border-[#253745] p-5 sm:p-8 backdrop-blur-2xl">
            <div className="flex flex-col sm:flex-row items-center justify-between pb-6 border-b border-[#253745] gap-4 text-left">
              <div className="flex items-center gap-3">
                <div className="w-3 h-3 rounded-full bg-emerald-500 animate-ping" />
                <div>
                  <h3 className="text-sm font-bold text-white uppercase tracking-wider">Simulação do Fluxo em Tempo Real</h3>
                  <p className="text-xs text-[#9BA8AB]">Veja como uma O.S. trafega pelas barreiras de segurança do Kaban</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge className="bg-emerald-500/15 text-emerald-400 border-emerald-500/30 text-xs font-mono-tech">
                  Checklist 13/13 Ativo
                </Badge>
                <Badge className="bg-blue-500/15 text-blue-400 border-blue-500/30 text-xs font-mono-tech">
                  Zebra 80mm Pronta
                </Badge>
              </div>
            </div>

            {/* Visual Simulated Kanban Card */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-6 text-left">
              {/* Step 1 Preview Card */}
              <div className="p-4 rounded-2xl bg-[#06141B]/70 border border-[#253745] space-y-3">
                <div className="flex items-center justify-between">
                  <Badge variant="outline" className="text-[10px] border-blue-500/40 text-blue-400">PRÉ-IMPRESSÃO</Badge>
                  <span className="text-[10px] text-[#9BA8AB] font-mono-tech">REV 1</span>
                </div>
                <div>
                  <h4 className="text-xs font-bold text-white">OS. 73677 — COLEGIO BURITIS</h4>
                  <p className="text-[11px] text-[#9BA8AB] mt-0.5 line-clamp-1">64 LIVROS - 1º Ano - Receitas Para a Vida</p>
                </div>
                <div className="p-2 rounded-xl bg-blue-500/10 border border-blue-500/20 text-[11px] text-blue-300 flex items-center gap-2">
                  <Clock className="h-3.5 w-3.5 shrink-0" />
                  <span>Prova digital aprovada via Outlook</span>
                </div>
              </div>

              {/* Step 2 Preview Card: Checklist gatekeeper */}
              <div className="p-4 rounded-2xl bg-[#06141B]/70 border border-emerald-500/40 shadow-lg shadow-emerald-500/5 space-y-3">
                <div className="flex items-center justify-between">
                  <Badge variant="outline" className="text-[10px] border-emerald-500/40 text-emerald-400">SAÍDA / CTP</Badge>
                  <span className="text-[10px] text-emerald-400 font-bold">TRAVA ATIVA</span>
                </div>
                <div>
                  <h4 className="text-xs font-bold text-white">Checklist de Conferência CTP</h4>
                  <p className="text-[11px] text-[#9BA8AB] mt-0.5">13 de 13 itens verificados</p>
                </div>
                <div className="p-2 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-[11px] text-emerald-300 flex items-center justify-between">
                  <span className="font-bold">Liberado p/ Gravação</span>
                  <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                </div>
              </div>

              {/* Step 3 Preview Card: Inspection & Label */}
              <div className="p-4 rounded-2xl bg-[#06141B]/70 border border-[#253745] space-y-3">
                <div className="flex items-center justify-between">
                  <Badge variant="outline" className="text-[10px] border-amber-500/40 text-amber-400">INSPEÇÃO</Badge>
                  <span className="text-[10px] text-[#9BA8AB] font-mono-tech">80x50mm</span>
                </div>
                <div>
                  <h4 className="text-xs font-bold text-white">Etiqueta Zebra ZD230</h4>
                  <p className="text-[11px] text-[#9BA8AB] mt-0.5">Pacotes 01 a 20 (Modo Sequencial)</p>
                </div>
                <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/20 text-[11px] text-amber-300 flex items-center gap-2">
                  <Printer className="h-3.5 w-3.5 shrink-0" />
                  <span>Pronto para expedição e entrega</span>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      </section>

      {/* ─── SECTION 1: O ROTEIRO COMPLETO DA FÁBRICA (Interactive Pipeline) ─── */}
      <section id="roteiro-fabril" className="py-20 px-4 sm:px-8 max-w-7xl mx-auto relative border-t border-[#253745]/60">
        <div className="text-center max-w-3xl mx-auto space-y-3 mb-14">
          <Badge className="bg-blue-500/15 text-blue-400 border-blue-500/30 text-xs">PIPELINE INDUSTRIAL</Badge>
          <h2 className="text-3xl sm:text-4xl font-black text-white">O Roteiro da Produção em 6 Etapas</h2>
          <p className="text-sm sm:text-base text-[#9BA8AB]">
            Nenhum trabalho trafega no escuro. Acompanhe o ciclo de vida exato de qualquer O.S. na Primacor.
          </p>
        </div>

        {/* 6 Stage Bento Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {PIPELINE_STAGES.map((st) => {
            const Icon = st.icon;
            return (
              <motion.div
                key={st.step}
                whileHover={{ y: -6, transition: { duration: 0.2 } }}
                className={`p-6 rounded-3xl bg-gradient-to-b ${st.color} bg-[#11212D]/80 border ${st.border} shadow-xl ${st.glow} backdrop-blur-xl space-y-4 text-left relative overflow-hidden group`}
              >
                <div className="flex items-center justify-between">
                  <div className={`p-3 rounded-2xl bg-[#06141B] border border-[#253745] ${st.text}`}>
                    <Icon className="h-6 w-6" />
                  </div>
                  <span className="text-3xl font-black font-mono-tech text-white/20 group-hover:text-white/40 transition-colors">
                    {st.step}
                  </span>
                </div>

                <div>
                  <span className={`text-[10px] font-bold tracking-wider font-mono-tech uppercase ${st.text}`}>
                    {st.tag}
                  </span>
                  <h3 className="text-lg font-bold text-white mt-0.5">{st.title}</h3>
                  <p className="text-xs sm:text-sm text-[#9BA8AB] mt-2 leading-relaxed">
                    {st.desc}
                  </p>
                </div>
              </motion.div>
            );
          })}
        </div>
      </section>

      {/* ─── SECTION 2: CHECKLIST DOS 13 ITENS (Interactive Gatekeeper) ─── */}
      <section id="checklist-13" className="py-20 px-4 sm:px-8 max-w-7xl mx-auto relative border-t border-[#253745]/60">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Left Text */}
          <div className="lg:col-span-5 space-y-5 text-left sticky top-24">
            <Badge className="bg-emerald-500/15 text-emerald-400 border-emerald-500/30 text-xs">
              TRAVA DE QUALIDADE INTRANSIGENTE
            </Badge>
            <h2 className="text-3xl sm:text-4xl font-black text-white leading-tight">
              A Barreira dos 13 Itens na Pré-Impressão
            </h2>
            <p className="text-xs sm:text-sm text-[#9BA8AB] leading-relaxed">
              Erros de chapa custam caro e atrasam a fábrica inteira. Por isso, a coluna <strong>Arquivo Liberado (Saída)</strong> da Pré-Impressão possui uma barreira eletrônica que só libera o envio para o CTP após todos os 13 pontos serem confirmados.
            </p>

            {/* Checklist Live Counter Card */}
            <div className="p-5 rounded-2xl bg-[#11212D] border border-[#253745] space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-white">Status da Barreira:</span>
                <span className={`text-xs font-bold font-mono-tech ${isChecklistComplete ? "text-emerald-400" : "text-amber-400"}`}>
                  {checkedCount} de 13 validados
                </span>
              </div>

              {/* Progress bar */}
              <div className="w-full h-2 rounded-full bg-[#06141B] overflow-hidden">
                <div
                  className={`h-full transition-all duration-300 ${isChecklistComplete ? "bg-emerald-500" : "bg-amber-500"}`}
                  style={{ width: `${(checkedCount / 13) * 100}%` }}
                />
              </div>

              <div className="pt-2 flex items-center justify-between gap-2">
                <Button
                  size="sm"
                  onClick={checkAllItems}
                  className="text-xs h-8 bg-[#253745] hover:bg-[#253745]/80 text-white rounded-xl cursor-pointer"
                >
                  Marcar Todos (Simular)
                </Button>

                <Button
                  size="sm"
                  disabled={!isChecklistComplete}
                  className={`text-xs h-8 rounded-xl font-bold ${
                    isChecklistComplete
                      ? "bg-emerald-600 hover:bg-emerald-700 text-white shadow-md shadow-emerald-600/30"
                      : "bg-[#253745]/50 text-white/40 cursor-not-allowed"
                  }`}
                >
                  {isChecklistComplete ? "Enviar -> Produção Liberado!" : "Bloqueado (Pendente)"}
                </Button>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-200 flex items-start gap-2.5">
              <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
              <span>
                <strong>Auditoria Permanente:</strong> Cada validação grava o usuário, O.S. e horário no banco de dados. Nunca marque itens sem conferir o boneco ou chapa.
              </span>
            </div>
          </div>

          {/* Right: The 13 Items interactive list */}
          <div className="lg:col-span-7 space-y-2.5 text-left">
            {CHECKLIST_13_ITEMS.map((item, idx) => {
              const isChecked = !!checkedItems[idx];
              return (
                <div
                  key={idx}
                  onClick={() => toggleCheckItem(idx)}
                  className={`p-3.5 rounded-2xl border transition-all cursor-pointer flex items-start gap-3 select-none ${
                    isChecked
                      ? "bg-emerald-500/5 border-emerald-500/30 hover:border-emerald-500/50"
                      : "bg-[#11212D]/60 border-[#253745] hover:border-[#4A5C6A]"
                  }`}
                >
                  <div className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 mt-0.5 transition-colors ${
                    isChecked ? "bg-emerald-500 text-white" : "border-2 border-[#4A5C6A] text-transparent"
                  }`}>
                    <Check className="h-4 w-4 stroke-[3]" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <span className="text-xs font-mono-tech font-bold text-[#9BA8AB] mr-2">
                      #{String(idx + 1).padStart(2, "0")}
                    </span>
                    <span className={`text-xs sm:text-sm font-medium ${isChecked ? "text-white" : "text-[#CCD0CF]"}`}>
                      {item}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ─── SECTION 3: ETIQUETAS TÉRMICAS ZEBRA 80MM (Inspeção) ─── */}
      <section id="etiquetas-zebra" className="py-20 px-4 sm:px-8 max-w-7xl mx-auto relative border-t border-[#253745]/60">
        <div className="text-center max-w-3xl mx-auto space-y-3 mb-14">
          <Badge className="bg-amber-500/15 text-amber-400 border-amber-500/30 text-xs">ROH / ROTULAGEM PROFISSIONAL</Badge>
          <h2 className="text-3xl sm:text-4xl font-black text-white">Etiquetas de Embalagem na Inspeção (80mm)</h2>
          <p className="text-sm sm:text-base text-[#9BA8AB]">
            Desenvolvido exclusivamente para a impressora térmica Zebra ZD230. Alto contraste, linhas reforçadas e fechamento automático do card ao imprimir.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
          {/* Left: Interactive Simulated 80mm Label */}
          <div className="lg:col-span-6 flex flex-col items-center">
            <div className="w-full max-w-md p-4 rounded-3xl bg-[#11212D] border border-[#253745] shadow-2xl space-y-4">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-white flex items-center gap-1.5">
                  <Printer className="h-4 w-4 text-amber-400" />
                  Prévia Fiel da Etiqueta (80x50mm)
                </span>
                <span className="text-[10px] text-[#9BA8AB] font-mono-tech">Zebra ZD230</span>
              </div>

              {/* Physical White Label with Dark Borders & Solid Banner */}
              <div className="w-full aspect-[80/50] bg-white text-black p-3 rounded-xl shadow-lg border-[3px] border-black flex flex-col justify-between font-sans select-none">
                {/* Header */}
                <div className="flex items-center justify-between border-b-[2.5px] border-black pb-1 gap-2">
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <CheckCircle2 className="h-6 w-6 stroke-[2.5] text-black shrink-0" />
                    <div className="w-[2.5px] h-6 bg-black shrink-0" />
                    <div className="min-w-0 flex-1 text-left">
                      <div className="font-black text-xs uppercase leading-tight tracking-tight line-clamp-1">
                        COLEGIO BURITIS AGOSTINIANO
                      </div>
                      <div className="text-[10px] font-semibold text-black leading-tight line-clamp-1 mt-0.5">
                        <strong>Serviço:</strong> 64 LIVROS - 1º Ano
                      </div>
                    </div>
                  </div>

                  <div className="border-[2.5px] border-black rounded-lg px-2 py-0.5 text-center shrink-0 min-w-[55px] flex flex-col items-center justify-center bg-white">
                    <span className="text-[9px] font-black leading-none">O.S.:</span>
                    <span className="text-sm font-black leading-none mt-0.5">73677</span>
                  </div>
                </div>

                {/* Body rows */}
                <div className="flex flex-col justify-around py-1 space-y-1 text-left">
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-1">
                      <Package className="h-3.5 w-3.5 stroke-[2.5]" />
                      <div className="w-[2px] h-3 bg-black mx-1" />
                      <span className="font-extrabold text-[11px]">Quantidade:</span>
                    </div>
                    <span className="font-black text-sm">100 un</span>
                  </div>

                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-1">
                      <Clock className="h-3.5 w-3.5 stroke-[2.5]" />
                      <div className="w-[2px] h-3 bg-black mx-1" />
                      <span className="font-extrabold text-[11px]">Data:</span>
                    </div>
                    <span className="font-bold text-xs">18/11/2026</span>
                  </div>

                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-1">
                      <FileText className="h-3.5 w-3.5 stroke-[2.5]" />
                      <div className="w-[2px] h-3 bg-black mx-1" />
                      <span className="font-extrabold text-[11px]">Obs.:</span>
                    </div>
                    <span className="font-semibold text-[10px] line-clamp-1">Embalar c/ fita adesiva reforçada</span>
                  </div>
                </div>

                {/* Bottom solid black package banner */}
                <div className="bg-black text-white rounded-lg py-1 px-3 flex items-center justify-center gap-2">
                  <div className="flex-1 h-[2.5px] bg-white rounded-full" />
                  <span className="text-sm font-black tracking-wide whitespace-nowrap leading-none">
                    Pacote <u>{mockLabelMode === "manual" ? mockPacote || "______" : "01 a 20"}</u>
                  </span>
                  <div className="flex-1 h-[2.5px] bg-white rounded-full" />
                </div>
              </div>

              {/* Mode switch controls */}
              <div className="flex items-center justify-between pt-2">
                <span className="text-xs text-[#9BA8AB]">Modo de Numeração:</span>
                <div className="flex items-center gap-1 bg-[#06141B] p-1 rounded-xl border border-[#253745]">
                  <button
                    onClick={() => setMockLabelMode("manual")}
                    className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      mockLabelMode === "manual" ? "bg-amber-500 text-black" : "text-[#9BA8AB] hover:text-white"
                    }`}
                  >
                    Manual
                  </button>
                  <button
                    onClick={() => setMockLabelMode("sequencial")}
                    className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      mockLabelMode === "sequencial" ? "bg-amber-500 text-black" : "text-[#9BA8AB] hover:text-white"
                    }`}
                  >
                    Sequencial (De..Até)
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Right: Operational Instructions */}
          <div className="lg:col-span-6 space-y-4 text-left">
            <h3 className="text-2xl font-bold text-white">Regras e Cuidados de Impressão</h3>
            
            <div className="space-y-3">
              <div className="p-4 rounded-2xl bg-[#11212D] border border-[#253745] space-y-1">
                <h4 className="text-sm font-bold text-white flex items-center gap-2">
                  <span className="w-5 h-5 rounded-md bg-blue-600 text-white text-xs flex items-center justify-center font-mono">1</span>
                  Modo Manual vs Sequencial
                </h4>
                <p className="text-xs text-[#9BA8AB] leading-relaxed pl-7">
                  No <strong>Modo Manual</strong>, você digita um número livre (ex: 01, 7, 12A) ou deixa vazio para escrever à mão. Para imprimir várias etiquetas iguais, altere o campo &quot;Cópias&quot; na janela do Windows. No <strong>Modo Sequencial</strong>, digite De (1) e Até (20) e mantenha Cópias = 1.
                </p>
              </div>

              <div className="p-4 rounded-2xl bg-[#11212D] border border-[#253745] space-y-1">
                <h4 className="text-sm font-bold text-white flex items-center gap-2">
                  <span className="w-5 h-5 rounded-md bg-emerald-600 text-white text-xs flex items-center justify-center font-mono">2</span>
                  Fechamento Automático & Histórico
                </h4>
                <p className="text-xs text-[#9BA8AB] leading-relaxed pl-7">
                  Ao clicar em &quot;Imprimir Etiqueta&quot;, o card se fecha imediatamente para evitar cliques duplicados. Cada lote impresso fica gravado no <strong>Histórico de Impressões Concluídas</strong> da O.S.
                </p>
              </div>

              <div className="p-4 rounded-2xl bg-[#11212D] border border-[#253745] space-y-1">
                <h4 className="text-sm font-bold text-white flex items-center gap-2">
                  <span className="w-5 h-5 rounded-md bg-amber-600 text-white text-xs flex items-center justify-center font-mono">3</span>
                  Configurações do Driver Zebra
                </h4>
                <p className="text-xs text-[#9BA8AB] leading-relaxed pl-7">
                  Sempre configure: <strong>Margens: Nenhuma</strong> | <strong>Escala: 100%</strong> | <strong>Marcar: Gráficos de segundo plano</strong>. Isso garante que a moldura e o banner preto inferior fiquem perfeitos sem cortar as bordas.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── SECTION 4: EXPORTAÇÃO DE RELATÓRIOS PDF ─── */}
      <section id="relatorios-pdf" className="py-20 px-4 sm:px-8 max-w-7xl mx-auto relative border-t border-[#253745]/60 text-left">
        <div className="p-8 sm:p-12 rounded-3xl bg-gradient-to-br from-[#11212D] via-[#253745]/40 to-[#11212D] border border-[#253745] shadow-2xl space-y-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="space-y-2 max-w-2xl">
              <Badge className="bg-rose-500/15 text-rose-400 border-rose-500/30 text-xs">NOVA FUNCIONALIDADE</Badge>
              <h2 className="text-3xl font-black text-white">Relatórios Executivos em PDF por Setor</h2>
              <p className="text-xs sm:text-sm text-[#9BA8AB] leading-relaxed">
                No <strong>Dashboard &gt; Chão de Fábrica</strong>, você pode exportar a programação completa da indústria ou filtrar exatamente o setor desejado através do menu dropdown &quot;Exportar PDF v&quot;.
              </p>
            </div>

            {/* Visual Simulated PDF dropdown */}
            <div className="p-4 rounded-2xl bg-[#06141B] border border-[#253745] shrink-0 space-y-2 w-full md:w-64">
              <span className="text-[11px] font-bold text-[#9BA8AB] block uppercase">Opções de Exportação</span>
              <div className="space-y-1 text-xs">
                <div className="p-2 rounded-lg bg-blue-500/10 text-blue-300 flex items-center justify-between">
                  <span>Todos os Setores</span>
                  <FileDown className="h-3.5 w-3.5" />
                </div>
                <div className="p-2 rounded-lg bg-[#11212D] text-[#CCD0CF] flex items-center justify-between">
                  <span>Pré-Impressão</span>
                  <FileDown className="h-3.5 w-3.5 text-[#9BA8AB]" />
                </div>
                <div className="p-2 rounded-lg bg-[#11212D] text-[#CCD0CF] flex items-center justify-between">
                  <span>CTP / Matrizes</span>
                  <FileDown className="h-3.5 w-3.5 text-[#9BA8AB]" />
                </div>
                <div className="p-2 rounded-lg bg-rose-500/10 text-rose-300 flex items-center justify-between font-bold">
                  <span>Somente Urgentes</span>
                  <AlertTriangle className="h-3.5 w-3.5" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── SECTION 5: FAQ & PERGUNTAS FREQUENTES ─── */}
      <section id="faq" className="py-20 px-4 sm:px-8 max-w-4xl mx-auto relative border-t border-[#253745]/60 text-left">
        <div className="text-center space-y-3 mb-12">
          <Badge className="bg-purple-500/15 text-purple-400 border-purple-500/30 text-xs">FAQ OPERACIONAL</Badge>
          <h2 className="text-3xl font-black text-white">Perguntas Frequentes & Destravamento de O.S.</h2>
          <p className="text-xs sm:text-sm text-[#9BA8AB]">
            Respostas imediatas para as principais dúvidas do dia a dia da equipe técnica e operacional.
          </p>
        </div>

        <div className="space-y-3">
          {[
            {
              q: "Por que não consigo clicar no botão 'Enviar -> Produção'?",
              a: "Isso acontece quando a O.S. está na coluna 'Arquivo Liberado' da Pré-Impressão e o Checklist CTP ainda não foi preenchido. Você deve abrir o diálogo do checklist, conferir todos os 13 itens e clicar em 'Salvar e Validar Conferência'. Se a O.S. tiver faca ou clichê novo, confirme se o suprimento foi marcado como enviado."
            },
            {
              q: "Por que a etiqueta de inspeção não aparece em outros setores?",
              a: "Por regra rigorosa de qualidade da Primacor, a rotulagem só pode ser feita na etapa de INSPEÇÃO após o produto estar 100% pronto e conferido. Nenhum operador de pré-impressão ou expedição deve emitir etiquetas antes da qualidade."
            },
            {
              q: "O que significam as etiquetas REV 1, REV 2 e REV 3 nos cards?",
              a: "Significa 'Revisão' (retrabalho de arquivo). Quando um cliente reprova a prova e envia nova arte, o card recebe automaticamente a etiqueta de REV para que o operador saiba que não é um trabalho novo, e sim uma substituição de arte corrigida."
            },
            {
              q: "Como o entregador colhe a assinatura no celular?",
              a: "O motorista acessa a rota '/entregador' no smartphone, clica na entrega desejada e toca em 'Coletar Assinatura'. O cliente assina diretamente na tela de toque com o dedo e a imagem é enviada com data, hora e geolocalização para o SharePoint da Primacor."
            },
            {
              q: "Como imprimir ou salvar este manual em PDF para colocar na bancada?",
              a: "Basta pressionar 'Ctrl + P' no seu teclado ou clicar no botão 'Imprimir / PDF' no topo desta página. O layout está adaptado para impressão limpa."
            }
          ].map((item, i) => {
            const isOpen = activeFaq === i;
            return (
              <div
                key={i}
                className="p-5 rounded-2xl bg-[#11212D] border border-[#253745] transition-all cursor-pointer"
                onClick={() => setActiveFaq(isOpen ? null : i)}
              >
                <div className="flex items-center justify-between gap-4">
                  <h3 className="text-sm font-bold text-white">{item.q}</h3>
                  <ChevronDown className={`h-4 w-4 text-[#9BA8AB] transition-transform duration-200 shrink-0 ${isOpen ? "rotate-180" : ""}`} />
                </div>
                <AnimatePresence>
                  {isOpen && (
                    <motion.p
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      className="text-xs sm:text-sm text-[#9BA8AB] mt-3 pt-3 border-t border-[#253745] leading-relaxed"
                    >
                      {item.a}
                    </motion.p>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
      </section>

      {/* ─── FOOTER ─── */}
      <footer className="border-t border-[#253745] bg-[#06141B] py-12 px-4 sm:px-8 text-center text-xs text-[#9BA8AB]">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="font-bold text-white">Primacor Gráfica e Editora LTDA</span>
            <span>•</span>
            <span>Sistema Kaban v2.4</span>
          </div>
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate("/")}
              className="text-blue-400 hover:text-blue-300 font-semibold cursor-pointer"
            >
              ← Ir para o Kanban Principal
            </button>
            <span>•</span>
            <span className="font-mono-tech text-[11px]">Acesso direto: /tutorial</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
