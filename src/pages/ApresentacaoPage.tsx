import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronLeft, ChevronRight, Maximize, Minimize, Home, Monitor } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import logoApresentacao from "@/assets/logo-apresentacao.png";

/* ------------------------------------------------------------------ */
/*  Slide data                                                         */
/* ------------------------------------------------------------------ */

interface Slide {
  id: number;
  title: string;
  content: React.ReactNode;
}

/* helper components */
const SectionTitle = ({ children, sub }: { children: React.ReactNode; sub?: string }) => (
  <div className="mb-8">
    <h2 className="text-5xl font-bold tracking-tight text-foreground">{children}</h2>
    {sub && <p className="mt-3 text-2xl text-muted-foreground">{sub}</p>}
  </div>
);

const Bullet = ({ icon, title, text }: { icon: string; title: string; text: string }) => (
  <div className="flex gap-5 items-start">
    <span className="text-4xl shrink-0 leading-none mt-1">{icon}</span>
    <div>
      <p className="text-2xl font-semibold text-foreground">{title}</p>
      <p className="text-xl text-muted-foreground leading-relaxed">{text}</p>
    </div>
  </div>
);

const FlowStep = ({ n, label, desc }: { n: number; label: string; desc: string }) => (
  <div className="flex items-start gap-4">
    <div className="shrink-0 w-12 h-12 rounded-full bg-primary flex items-center justify-center text-primary-foreground font-bold text-xl">
      {n}
    </div>
    <div>
      <p className="text-2xl font-semibold text-foreground">{label}</p>
      <p className="text-lg text-muted-foreground">{desc}</p>
    </div>
  </div>
);

const CompareCard = ({ title, items, variant }: { title: string; items: string[]; variant: "before" | "after" }) => (
  <div className={cn(
    "rounded-2xl p-8 flex-1",
    variant === "before" ? "bg-destructive/10 border border-destructive/20" : "bg-green-500/10 border border-green-500/20"
  )}>
    <h3 className={cn(
      "text-2xl font-bold mb-5",
      variant === "before" ? "text-destructive" : "text-green-600"
    )}>{title}</h3>
    <ul className="space-y-3">
      {items.map((item, i) => (
        <li key={i} className="flex items-start gap-3 text-xl text-foreground">
          <span className="mt-1">{variant === "before" ? "❌" : "✅"}</span>
          <span>{item}</span>
        </li>
      ))}
    </ul>
  </div>
);

const KanbanDemo = () => {
  const cols = [
    { name: "ENTRADA", color: "bg-[hsl(var(--status-entrada))]", cards: ["OS.1042", "OS.1045"] },
    { name: "PREPARANDO ARQUIVOS", color: "bg-[hsl(var(--status-novo))]", cards: ["OS.1038"] },
    { name: "PRODUZINDO PROVA", color: "bg-[hsl(var(--status-andamento))]", cards: ["OS.1035"] },
    { name: "AGUARDANDO APROVAÇÃO", color: "bg-[hsl(var(--status-aguardando))]", cards: [] },
    { name: "SAÍDA", color: "bg-[hsl(var(--status-concluido))]", cards: ["OS.1030"] },
  ];
  return (
    <div className="flex gap-4 w-full">
      {cols.map((col) => (
        <div key={col.name} className="flex-1 rounded-xl bg-muted/60 p-3 min-h-[180px]">
          <div className={cn("rounded-lg px-3 py-1.5 text-sm font-bold text-white mb-3 text-center", col.color)}>
            {col.name}
          </div>
          <div className="space-y-2">
            {col.cards.map((c) => (
              <div key={c} className="bg-card rounded-lg border px-3 py-2 text-base font-medium shadow-sm">{c}</div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
};

/* ------------------------------------------------------------------ */
/*  Slides array                                                       */
/* ------------------------------------------------------------------ */

const slides: Slide[] = [
  /* 1 — Capa */
  {
    id: 1,
    title: "Capa",
    content: (
      <div className="flex flex-col items-center justify-center h-full text-center gap-6">
        <img src={logoApresentacao} alt="Primacor Gráfica" className="w-56 h-56 object-contain mb-2" />
        <h1 className="text-6xl font-extrabold tracking-tight text-foreground leading-tight">
          Sistema Kanban de<br />Gestão de O.S
        </h1>
        <p className="text-3xl text-muted-foreground max-w-3xl">
          Apresentação do novo sistema de controle e acompanhamento de Ordens de Serviço
        </p>
        <div className="mt-6 px-8 py-3 rounded-full bg-primary/10 text-primary font-semibold text-xl">
          Para todos os colaboradores
        </div>
      </div>
    ),
  },
  /* 2 — O que é */
  {
    id: 2,
    title: "O que é o sistema?",
    content: (
      <div className="flex flex-col justify-center h-full gap-8 px-4">
        <SectionTitle sub="Entenda como o sistema organiza o trabalho da empresa">
          O que é o Sistema Kanban?
        </SectionTitle>
        <div className="grid grid-cols-2 gap-8">
          <Bullet icon="📋" title="Quadro Digital" text="Um painel visual onde cada Ordem de Serviço aparece como um cartão que se move entre colunas — cada coluna é uma etapa do processo." />
          <Bullet icon="🏭" title="Todos os Setores" text="Pré-Impressão, CTP, Digital, Off-Set, Acabamento, Terceiros e Expedição — tudo num só lugar." />
          <Bullet icon="👁️" title="Visão em Tempo Real" text="Qualquer colaborador pode ver, a qualquer momento, onde cada O.S está e qual é seu status atual." />
          <Bullet icon="🎯" title="Objetivo" text="Eliminar dúvidas, evitar retrabalho e garantir que nenhuma O.S fique esquecida ou parada." />
        </div>
      </div>
    ),
  },
  /* 3 — Para que serve */
  {
    id: 3,
    title: "Para que serve?",
    content: (
      <div className="flex flex-col justify-center h-full gap-8 px-4">
        <SectionTitle sub="Os problemas que o sistema resolve no dia a dia">
          Para que Serve?
        </SectionTitle>
        <div className="grid grid-cols-1 gap-6">
          <Bullet icon="🔍" title="Rastreabilidade completa" text="Saiba exatamente onde está cada O.S, quem movimentou e quando — sem precisar perguntar para ninguém." />
          <Bullet icon="⚡" title="Agilidade na comunicação" text="Chega de telefonemas e bilhetes! O sistema mostra automaticamente o que precisa ser feito em cada setor." />
          <Bullet icon="📊" title="Controle de prazos" text="Visualize com clareza quais O.S estão urgentes e quais precisam de atenção imediata." />
          <Bullet icon="🤝" title="Integração entre setores" text="Todos os setores trabalham conectados: quando um finaliza, o próximo já enxerga a O.S na sua entrada." />
        </div>
      </div>
    ),
  },
  /* 4 — Como funciona (visual Kanban) */
  {
    id: 4,
    title: "Como funciona?",
    content: (
      <div className="flex flex-col justify-center h-full gap-6 px-4">
        <SectionTitle sub="Exemplo do setor de Pré-Impressão">
          Como Funciona na Prática?
        </SectionTitle>
        <KanbanDemo />
        <div className="grid grid-cols-3 gap-6 mt-2">
          <div className="bg-muted/50 rounded-xl p-5">
            <p className="font-bold text-xl text-foreground mb-1">1. Cartões = O.S</p>
            <p className="text-lg text-muted-foreground">Cada cartão representa uma Ordem de Serviço com todas as informações necessárias.</p>
          </div>
          <div className="bg-muted/50 rounded-xl p-5">
            <p className="font-bold text-xl text-foreground mb-1">2. Colunas = Etapas</p>
            <p className="text-lg text-muted-foreground">Cada coluna é uma etapa do processo. O cartão avança conforme o trabalho progride.</p>
          </div>
          <div className="bg-muted/50 rounded-xl p-5">
            <p className="font-bold text-xl text-foreground mb-1">3. Arrastar = Avançar</p>
            <p className="text-lg text-muted-foreground">Basta arrastar o cartão para a próxima coluna quando concluir sua etapa.</p>
          </div>
        </div>
      </div>
    ),
  },
  /* 5 — Funcionalidades */
  {
    id: 5,
    title: "Funcionalidades",
    content: (
      <div className="flex flex-col justify-center h-full gap-8 px-4">
        <SectionTitle sub="Conheça as principais funcionalidades do sistema">
          Funcionalidades Principais
        </SectionTitle>
        <div className="grid grid-cols-2 gap-7">
          <Bullet icon="➕" title="Criação de O.S" text="O coordenador cria a O.S com todas as informações: cliente, descrição, vendedor, tipo de trabalho, processos e equipamentos." />
          <Bullet icon="🔀" title="Movimentação Kanban" text="Arraste os cartões entre colunas para registrar o avanço da O.S em cada setor." />
          <Bullet icon="📡" title="Acompanhamento em tempo real" text="Veja o status atualizado de todas as O.S em qualquer setor, a qualquer momento." />
          <Bullet icon="👤" title="Responsáveis por etapa" text="O sistema registra quem movimentou cada O.S, criando responsabilidade clara." />
          <Bullet icon="📜" title="Histórico completo" text="Todas as movimentações ficam gravadas com data, hora e responsável." />
          <Bullet icon="🚨" title="Marcação de urgência" text="O.S urgentes recebem destaque visual por setor: urgente na prova, impressão, acabamento ou expedição." />
        </div>
      </div>
    ),
  },
  /* 6 — Fluxo completo */
  {
    id: 6,
    title: "Fluxo de Funcionamento",
    content: (
      <div className="flex flex-col justify-center h-full gap-6 px-4">
        <SectionTitle sub="O caminho da O.S dentro da empresa">
          Fluxo de Funcionamento
        </SectionTitle>
        <div className="grid grid-cols-2 gap-x-10 gap-y-5">
          <FlowStep n={1} label="PRÉ-IMPRESSÃO" desc="O.S entra no sistema. O arquivo é preparado, prova produzida e enviada para aprovação do cliente." />
          <FlowStep n={2} label="CTP" desc="Após aprovação, as chapas são impostas, gravadas e liberadas para impressão." />
          <FlowStep n={3} label="DIGITAL / OFF-SET" desc="A O.S segue para o setor de impressão adequado: Color, PB, Plotter ou máquinas Off-Set." />
          <FlowStep n={4} label="ACABAMENTO" desc="Laminação, dobra, corte, cola, encadernação e demais processos de finalização." />
          <FlowStep n={5} label="TERCEIROS" desc="Quando necessário, etapas terceirizadas são controladas no mesmo fluxo." />
          <FlowStep n={6} label="EXPEDIÇÃO" desc="Produto pronto é organizado em rotas (manhã/tarde) e entregue ao cliente." />
        </div>
      </div>
    ),
  },
  /* 7 — Exemplo prático */
  {
    id: 7,
    title: "Exemplo Prático",
    content: (
      <div className="flex flex-col justify-center h-full gap-6 px-4">
        <SectionTitle sub="Simulação de uso real">
          Exemplo Prático
        </SectionTitle>
        <div className="bg-muted/40 rounded-2xl p-8 border space-y-5">
          <p className="text-2xl font-bold text-foreground">📌 Cenário: Impressão de 500 folders para o cliente "ABC Eventos"</p>
          <div className="grid grid-cols-1 gap-4">
            <div className="flex items-start gap-4">
              <span className="bg-primary/10 text-primary px-3 py-1 rounded-lg font-bold text-lg shrink-0">09:00</span>
              <p className="text-xl text-foreground">O coordenador cria a OS.1050 com os detalhes do trabalho e seleciona os processos necessários.</p>
            </div>
            <div className="flex items-start gap-4">
              <span className="bg-primary/10 text-primary px-3 py-1 rounded-lg font-bold text-lg shrink-0">09:30</span>
              <p className="text-xl text-foreground">O arte-finalista move a O.S para "Finalização" e começa a preparar o arquivo.</p>
            </div>
            <div className="flex items-start gap-4">
              <span className="bg-primary/10 text-primary px-3 py-1 rounded-lg font-bold text-lg shrink-0">11:00</span>
              <p className="text-xl text-foreground">Prova digital produzida e enviada ao cliente. O.S muda para "Aguardando Aprovação".</p>
            </div>
            <div className="flex items-start gap-4">
              <span className="bg-primary/10 text-primary px-3 py-1 rounded-lg font-bold text-lg shrink-0">14:00</span>
              <p className="text-xl text-foreground">Cliente aprova! O.S segue para CTP → Off-Set → Acabamento → Expedição.</p>
            </div>
            <div className="flex items-start gap-4">
              <span className="bg-primary/10 text-primary px-3 py-1 rounded-lg font-bold text-lg shrink-0">DIA+1</span>
              <p className="text-xl text-foreground">Produto finalizado sai na rota da manhã. Tudo registrado no sistema.</p>
            </div>
          </div>
        </div>
      </div>
    ),
  },
  /* 8 — Antes e depois */
  {
    id: 8,
    title: "Antes e Depois",
    content: (
      <div className="flex flex-col justify-center h-full gap-8 px-4">
        <SectionTitle sub="A transformação no dia a dia da empresa">
          Antes × Depois
        </SectionTitle>
        <div className="flex gap-8">
          <CompareCard
            title="❌ Antes do Sistema"
            variant="before"
            items={[
              "Ninguém sabia onde estava cada O.S",
              "Comunicação por telefone e bilhetes",
              "O.S esquecidas ou perdidas entre setores",
              "Sem histórico de movimentações",
              "Retrabalho frequente por falta de informação",
            ]}
          />
          <CompareCard
            title="✅ Depois do Sistema"
            variant="after"
            items={[
              "Localização instantânea de qualquer O.S",
              "Informação visível para todos os setores",
              "Alertas visuais para urgências e prazos",
              "Histórico completo com responsáveis",
              "Redução significativa de erros e atrasos",
            ]}
          />
        </div>
      </div>
    ),
  },
  /* 9 — Benefícios */
  {
    id: 9,
    title: "Benefícios",
    content: (
      <div className="flex flex-col justify-center h-full gap-8 px-4">
        <SectionTitle sub="O impacto positivo no trabalho de cada um">
          Benefícios para a Empresa
        </SectionTitle>
        <div className="grid grid-cols-2 gap-8">
          <div className="bg-primary/5 rounded-2xl p-7 border border-primary/10">
            <p className="text-5xl mb-3">📦</p>
            <p className="text-2xl font-bold text-foreground">Organização</p>
            <p className="text-xl text-muted-foreground mt-2">Cada O.S tem seu lugar certo. Nada se perde, nada fica esquecido.</p>
          </div>
          <div className="bg-primary/5 rounded-2xl p-7 border border-primary/10">
            <p className="text-5xl mb-3">🔁</p>
            <p className="text-2xl font-bold text-foreground">Menos Retrabalho</p>
            <p className="text-xl text-muted-foreground mt-2">Informações claras desde o início reduzem erros e evitam refazer trabalhos.</p>
          </div>
          <div className="bg-primary/5 rounded-2xl p-7 border border-primary/10">
            <p className="text-5xl mb-3">👁️</p>
            <p className="text-2xl font-bold text-foreground">Visibilidade Total</p>
            <p className="text-xl text-muted-foreground mt-2">Todos os setores enxergam o andamento completo. Mais colaboração, menos dúvidas.</p>
          </div>
          <div className="bg-primary/5 rounded-2xl p-7 border border-primary/10">
            <p className="text-5xl mb-3">🚀</p>
            <p className="text-2xl font-bold text-foreground">Produtividade</p>
            <p className="text-xl text-muted-foreground mt-2">Menos tempo procurando informação, mais tempo produzindo.</p>
          </div>
        </div>
      </div>
    ),
  },
  /* 10 — Roteiro do apresentador */
  {
    id: 10,
    title: "Roteiro da Apresentação",
    content: (
      <div className="flex flex-col justify-center h-full gap-6 px-4">
        <SectionTitle sub="Guia para o apresentador">
          Roteiro de Apresentação
        </SectionTitle>
        <div className="space-y-4">
          <div className="bg-muted/40 rounded-xl p-5 border">
            <p className="text-xl font-bold text-foreground mb-1">🎤 Abertura (2 min)</p>
            <p className="text-lg text-muted-foreground italic">"Pessoal, hoje vamos conhecer o novo sistema que vai ajudar a gente a organizar melhor o nosso trabalho. É simples, visual e vai facilitar a vida de todos."</p>
          </div>
          <div className="bg-muted/40 rounded-xl p-5 border">
            <p className="text-xl font-bold text-foreground mb-1">📋 Demonstração (10 min)</p>
            <p className="text-lg text-muted-foreground italic">"Vou mostrar na prática: vamos criar uma O.S do zero e acompanhar ela passando por cada setor. Vejam como é fácil saber onde cada trabalho está."</p>
          </div>
          <div className="bg-muted/40 rounded-xl p-5 border">
            <p className="text-xl font-bold text-foreground mb-1">💡 Benefícios (3 min)</p>
            <p className="text-lg text-muted-foreground italic">"Com esse sistema, acabam os 'cadê aquela O.S?'. Tudo fica registrado, visível e organizado. Menos erro, menos estresse, mais resultado."</p>
          </div>
          <div className="bg-muted/40 rounded-xl p-5 border">
            <p className="text-xl font-bold text-foreground mb-1">❓ Perguntas (5 min)</p>
            <p className="text-lg text-muted-foreground italic">"Agora é com vocês! Perguntem o que quiserem. Estamos aqui para que todos se sintam seguros usando o sistema."</p>
          </div>
        </div>
      </div>
    ),
  },
  /* 11 — Encerramento */
  {
    id: 11,
    title: "Encerramento",
    content: (
      <div className="flex flex-col items-center justify-center h-full text-center gap-8">
        <div className="w-20 h-20 rounded-full bg-green-500/10 flex items-center justify-center">
          <span className="text-5xl">🎯</span>
        </div>
        <h2 className="text-5xl font-extrabold text-foreground">
          Contamos com Todos!
        </h2>
        <p className="text-2xl text-muted-foreground max-w-3xl leading-relaxed">
          O sistema só funciona de verdade com a participação de cada um.<br />
          Movimente suas O.S, mantenha o quadro atualizado e ajude a empresa inteira a trabalhar melhor.
        </p>
        <div className="mt-4 flex gap-6">
          <div className="bg-primary/10 rounded-xl px-8 py-4">
            <p className="text-lg text-muted-foreground">Dúvidas?</p>
            <p className="text-xl font-bold text-primary">Fale com seu coordenador</p>
          </div>
          <div className="bg-primary/10 rounded-xl px-8 py-4">
            <p className="text-lg text-muted-foreground">Sugestões?</p>
            <p className="text-xl font-bold text-primary">Estamos ouvindo</p>
          </div>
        </div>
      </div>
    ),
  },
];

/* ------------------------------------------------------------------ */
/*  Main Presentation Component                                        */
/* ------------------------------------------------------------------ */

export default function ApresentacaoPage() {
  const [current, setCurrent] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const navigate = useNavigate();

  const goNext = useCallback(() => setCurrent((c) => Math.min(c + 1, slides.length - 1)), []);
  const goPrev = useCallback(() => setCurrent((c) => Math.max(c - 1, 0)), []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === " ") { e.preventDefault(); goNext(); }
      if (e.key === "ArrowLeft") { e.preventDefault(); goPrev(); }
      if (e.key === "Escape" && isFullscreen) {
        document.exitFullscreen?.();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [goNext, goPrev, isFullscreen]);

  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", handler);
    return () => document.removeEventListener("fullscreenchange", handler);
  }, []);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen();
    } else {
      document.exitFullscreen();
    }
  };

  return (
    <div className={cn(
      "flex flex-col h-screen bg-background select-none",
      isFullscreen && "cursor-none"
    )}
      onMouseMove={() => {
        if (isFullscreen) {
          document.body.style.cursor = "default";
          // auto-hide handled by CSS
        }
      }}
    >
      {/* Top bar */}
      <div className={cn(
        "flex items-center justify-between px-6 py-3 border-b bg-card/80 backdrop-blur shrink-0 z-10",
        isFullscreen && "opacity-0 hover:opacity-100 transition-opacity absolute top-0 left-0 right-0"
      )}>
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => navigate("/")} className="gap-2">
            <Home className="w-4 h-4" /> Voltar
          </Button>
          <span className="text-sm text-muted-foreground font-medium">
            Apresentação do Sistema Kanban
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">
            {current + 1} / {slides.length}
          </span>
          <Button variant="outline" size="sm" onClick={toggleFullscreen} className="gap-2">
            {isFullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
            {isFullscreen ? "Sair" : "Tela Cheia"}
          </Button>
        </div>
      </div>

      {/* Slide area */}
      <div className="flex-1 relative overflow-hidden" onClick={(e) => {
        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
        const x = e.clientX - rect.left;
        if (x > rect.width / 2) goNext(); else goPrev();
      }}>
        {/* 16:9 scaled slide */}
        <div className="absolute inset-0 flex items-center justify-center p-4">
          <div
            className="w-full h-full flex items-center justify-center"
            style={{ maxWidth: "100%", maxHeight: "100%" }}
          >
            <div
              className="bg-card rounded-2xl shadow-xl border overflow-hidden"
              style={{
                width: "1920px",
                height: "1080px",
                transform: `scale(${Math.min(
                  (typeof window !== "undefined" ? window.innerWidth - 32 : 1200) / 1920,
                  (typeof window !== "undefined" ? window.innerHeight - (isFullscreen ? 32 : 100) : 700) / 1080
                )})`,
                transformOrigin: "center center",
              }}
            >
              <div className="w-full h-full p-16">
                {slides[current].content}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom nav */}
      <div className={cn(
        "flex items-center justify-between px-6 py-3 border-t bg-card/80 backdrop-blur shrink-0",
        isFullscreen && "opacity-0 hover:opacity-100 transition-opacity absolute bottom-0 left-0 right-0"
      )}>
        {/* Thumbnails */}
        <div className="flex gap-1.5 overflow-x-auto flex-1 mr-4">
          {slides.map((s, i) => (
            <button
              key={s.id}
              onClick={(e) => { e.stopPropagation(); setCurrent(i); }}
              className={cn(
                "shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-all",
                i === current
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-accent"
              )}
            >
              {i + 1}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={(e) => { e.stopPropagation(); goPrev(); }} disabled={current === 0}>
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={(e) => { e.stopPropagation(); goNext(); }} disabled={current === slides.length - 1}>
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
