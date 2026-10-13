import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronLeft, ChevronRight, Maximize, Minimize, Home } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import logoApresentacao from "@/assets/logo-apresentacao.png";

/* ------------------------------------------------------------------ */
/*  Helper Components                                                   */
/* ------------------------------------------------------------------ */

const BeforeAfter = ({
  title,
  icon,
  antes,
  depois,
  keyword,
}: {
  title: string;
  icon: string;
  antes: string;
  depois: string;
  keyword?: string;
}) => (
  <div className="flex flex-col h-full justify-center gap-6">
    <div className="flex items-center gap-4 mb-2">
      <span className="text-5xl">{icon}</span>
      <div>
        <h2 className="text-5xl font-extrabold tracking-tight text-foreground">{title}</h2>
        {keyword && (
          <p className="text-2xl text-muted-foreground mt-1">{keyword}</p>
        )}
      </div>
    </div>
    <div className="flex gap-6 flex-1 min-h-0">
      <div className="flex-1 flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <div className="px-4 py-1.5 rounded-lg bg-red-500/15 text-red-500 font-bold text-xl tracking-wide">
            ANTES
          </div>
        </div>
        <div className="flex-1 rounded-2xl overflow-hidden border-2 border-red-500/20 shadow-lg">
          <img
            src={antes}
            alt={`${title} — Antes`}
            className="w-full h-full object-cover"
          />
        </div>
      </div>
      <div className="flex-1 flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <div className="px-4 py-1.5 rounded-lg bg-green-500/15 text-green-500 font-bold text-xl tracking-wide">
            DEPOIS
          </div>
        </div>
        <div className="flex-1 rounded-2xl overflow-hidden border-2 border-green-500/20 shadow-lg">
          <img
            src={depois}
            alt={`${title} — Depois`}
            className="w-full h-full object-cover"
          />
        </div>
      </div>
    </div>
  </div>
);

const TopicCard = ({
  icon,
  title,
  keywords,
}: {
  icon: string;
  title: string;
  keywords: string[];
}) => (
  <div className="bg-card border rounded-2xl p-7 flex flex-col items-center text-center gap-3 shadow-sm hover:shadow-md transition-shadow">
    <span className="text-5xl">{icon}</span>
    <p className="text-2xl font-bold text-foreground">{title}</p>
    <div className="flex flex-wrap gap-2 justify-center">
      {keywords.map((k) => (
        <span
          key={k}
          className="px-3 py-1 rounded-full bg-primary/10 text-primary text-base font-medium"
        >
          {k}
        </span>
      ))}
    </div>
  </div>
);

/* ------------------------------------------------------------------ */
/*  Slides                                                              */
/* ------------------------------------------------------------------ */

interface Slide {
  id: number;
  title: string;
  content: React.ReactNode;
}

const slides: Slide[] = [
  /* 1 — Capa */
  {
    id: 1,
    title: "Capa",
    content: (
      <div className="flex flex-col items-center justify-center h-full text-center gap-8">
        <img
          src={logoApresentacao}
          alt="Primacor Gráfica"
          className="w-52 h-52 object-contain"
        />
        <h1 className="text-6xl font-extrabold tracking-tight text-foreground leading-tight">
          Nossa Evolução
        </h1>
        <p className="text-3xl text-muted-foreground max-w-3xl leading-relaxed">
          Mudança de local · Fusão · Crescimento
        </p>
        <div className="mt-4 px-8 py-3 rounded-full bg-primary/10 text-primary font-semibold text-xl">
          Apresentação Institucional
        </div>
      </div>
    ),
  },

  /* 2 — Contexto */
  {
    id: 2,
    title: "O Desafio",
    content: (
      <div className="flex flex-col justify-center h-full gap-10 px-4">
        <div>
          <h2 className="text-5xl font-extrabold tracking-tight text-foreground">
            O Desafio da Mudança
          </h2>
          <p className="mt-3 text-2xl text-muted-foreground">
            Mudar, unir forças e continuar crescendo
          </p>
        </div>
        <div className="grid grid-cols-3 gap-8">
          <div className="bg-muted/50 rounded-2xl p-8 flex flex-col items-center text-center gap-4">
            <span className="text-6xl">🏗️</span>
            <p className="text-3xl font-bold text-foreground">Novo Espaço</p>
            <p className="text-xl text-muted-foreground">
              Adaptação a uma nova estrutura física
            </p>
          </div>
          <div className="bg-muted/50 rounded-2xl p-8 flex flex-col items-center text-center gap-4">
            <span className="text-6xl">🤝</span>
            <p className="text-3xl font-bold text-foreground">Fusão</p>
            <p className="text-xl text-muted-foreground">
              Duas empresas se tornando uma só
            </p>
          </div>
          <div className="bg-muted/50 rounded-2xl p-8 flex flex-col items-center text-center gap-4">
            <span className="text-6xl">📈</span>
            <p className="text-3xl font-bold text-foreground">Crescimento</p>
            <p className="text-xl text-muted-foreground">
              Mais demandas, novas responsabilidades
            </p>
          </div>
        </div>
      </div>
    ),
  },

  /* 3 — Cronograma da Mudança */
  {
    id: 3,
    title: "Cronograma",
    content: (
      <div className="flex flex-col justify-center h-full gap-8 px-4">
        <div>
          <h2 className="text-5xl font-extrabold tracking-tight text-foreground">
            Cronograma da Mudança
          </h2>
          <p className="mt-3 text-2xl text-muted-foreground">
            De outubro a março — cada fase foi essencial
          </p>
        </div>
        <div className="flex items-start gap-2">
          {[
            { mes: "Outubro", etapa: "Decisão", itens: ["Contrato"] },
            { mes: "Novembro", etapa: "Projeto", itens: ["Lay-out", "Mapa de custos", "Equipamentos", "Equipe"] },
            { mes: "Dezembro", etapa: "Preparação", itens: ["Reformas", "Rede", "Elétrico", "Estruturas"] },
            { mes: "Dez–Jan", etapa: "Mudança de Local", itens: ["Transporte máquinas"] },
            { mes: "Jan–Fev", etapa: "Organização Física", itens: ["Instalação equip.", "Desocupação galpão"] },
            { mes: "Março", etapa: "Estruturação", itens: ["Padrões", "Processos", "Ajustes"] },
          ].map((fase, i, arr) => (
            <div key={fase.mes} className="flex items-start flex-1">
              <div className="flex flex-col items-center text-center gap-2 flex-1">
                <div className="px-3 py-2 rounded-xl bg-primary/10 text-primary font-bold text-base whitespace-nowrap">
                  {fase.mes}
                </div>
                <div className="w-11 h-11 rounded-full bg-primary flex items-center justify-center text-primary-foreground font-bold text-lg shadow-md">
                  {i + 1}
                </div>
                <p className="text-lg font-bold text-foreground mt-1">{fase.etapa}</p>
                <div className="flex flex-col gap-0.5 mt-1">
                  {fase.itens.map((item) => (
                    <span key={item} className="text-sm text-muted-foreground">{item}</span>
                  ))}
                </div>
              </div>
              {i < arr.length - 1 && (
                <div className="flex items-center pt-12 px-0.5">
                  <div className="w-4 h-0.5 bg-primary/40" />
                  <span className="text-primary text-lg">→</span>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    ),
  },

  /* 4 — Estrutura (Planta) */
  {
    id: 4,
    title: "Estrutura",
    content: (
      <div className="flex flex-col justify-center h-full gap-6 px-4">
        <div>
          <h2 className="text-5xl font-extrabold tracking-tight text-foreground">
            Nova Estrutura
          </h2>
          <p className="mt-3 text-2xl text-muted-foreground">
            Layout planejado para integrar todas as operações
          </p>
        </div>
        <div className="flex-1 min-h-0 rounded-2xl overflow-hidden border border-border shadow-lg">
          <img
            src="/institucional/estrutura.jpeg"
            alt="Planta da nova estrutura"
            className="w-full h-full object-contain bg-muted/30"
          />
        </div>
      </div>
    ),
  },

  /* 5 — Temas */
  {
    id: 5,
    title: "Temas",
    content: (
      <div className="flex flex-col justify-center h-full gap-8 px-4">
        <div>
          <h2 className="text-5xl font-extrabold tracking-tight text-foreground">O Que Mudou</h2>
          <p className="mt-3 text-2xl text-muted-foreground">Os pilares da nossa transformação</p>
        </div>
        <div className="grid grid-cols-5 gap-5">
          <TopicCard icon="🏭" title="Estrutura" keywords={["Novo espaço", "Adaptação"]} />
          <TopicCard icon="🚚" title="Logística" keywords={["Fluxo", "Deslocamentos"]} />
          <TopicCard icon="⚙️" title="Processos" keywords={["Padronização", "Ajustes"]} />
          <TopicCard icon="👥" title="Pessoas" keywords={["Novas equipes", "Integração"]} />
          <TopicCard icon="📦" title="Demandas" keywords={["Novos volumes", "Responsabilidades"]} />
        </div>
      </div>
    ),
  },

  /* 6 — Logística (Distâncias) */
  {
    id: 6,
    title: "Logística",
    content: (
      <div className="flex flex-col justify-center h-full gap-8 px-4">
        <div className="flex items-center gap-4">
          <span className="text-5xl">🚚</span>
          <div>
            <h2 className="text-5xl font-extrabold tracking-tight text-foreground">Logística</h2>
            <p className="mt-2 text-2xl text-muted-foreground">Distâncias em Km — impacto da nova localização</p>
          </div>
        </div>
        <div className="bg-card border rounded-2xl overflow-hidden shadow-lg">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="px-8 py-5 text-2xl font-bold text-foreground">Região</th>
                <th className="px-8 py-5 text-2xl font-bold text-center text-red-500">ANTES</th>
                <th className="px-8 py-5 text-2xl font-bold text-center text-amber-600">AGORA</th>
                <th className="px-8 py-5 text-2xl font-bold text-center text-muted-foreground">Diferença</th>
              </tr>
            </thead>
            <tbody>
              {[
                { regiao: "Centro (Praça Sete)", antes: 4.6, agora: 8.2 },
                { regiao: "Praça Savassi", antes: 5.5, agora: 11 },
                { regiao: "Alameda da Serra", antes: 9.5, agora: 17.8 },
                { regiao: "Lourdes", antes: 4.3, agora: 9 },
                { regiao: "Praça Cemig", antes: 7.4, agora: 17 },
              ].map((row) => (
                <tr key={row.regiao} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                  <td className="px-8 py-4 text-xl font-semibold text-foreground">{row.regiao}</td>
                  <td className="px-8 py-4 text-xl text-center text-red-500 font-bold">{row.antes} km</td>
                  <td className="px-8 py-4 text-xl text-center text-amber-600 font-bold">{row.agora} km</td>
                  <td className="px-8 py-4 text-xl text-center text-muted-foreground font-medium">+{(row.agora - row.antes).toFixed(1)} km</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xl text-muted-foreground text-center italic">
          Distâncias maiores exigem mais planejamento e eficiência nas entregas
        </p>
      </div>
    ),
  },

  /* 7 — Pessoas em Números */
  {
    id: 7,
    title: "Pessoas em Números",
    content: (
      <div className="flex flex-col justify-center h-full gap-10 px-4">
        <div className="flex items-center gap-4">
          <span className="text-5xl">👥</span>
          <div>
            <h2 className="text-5xl font-extrabold tracking-tight text-foreground">Pessoas em Números</h2>
            <p className="mt-2 text-2xl text-muted-foreground">Entenda o impacto das férias na operação</p>
          </div>
        </div>
        <div className="grid grid-cols-4 gap-6">
          {[
            { icon: "👤", valor: "45", label: "Colaboradores", sub: "Pessoas" },
            { icon: "🏖️", valor: "1", label: "Férias Individuais", sub: "Mês por pessoa" },
            { icon: "📅", valor: "45", label: "Total de Férias/Ano", sub: "Meses acumulados" },
            { icon: "⚠️", valor: "3,75", label: "Ausentes por Mês", sub: "Férias por mês" },
          ].map((card) => (
            <div key={card.label} className="bg-card border rounded-2xl p-8 flex flex-col items-center text-center gap-3 shadow-sm">
              <span className="text-5xl">{card.icon}</span>
              <p className="text-5xl font-extrabold text-primary">{card.valor}</p>
              <p className="text-xl font-bold text-foreground">{card.label}</p>
              <p className="text-base text-muted-foreground">{card.sub}</p>
            </div>
          ))}
        </div>
        <p className="text-xl text-muted-foreground text-center italic">
          Em média, sempre temos quase 4 colaboradores de férias simultaneamente
        </p>
      </div>
    ),
  },

  /* 4 — Comercial */
  {
    id: 4,
    title: "Comercial",
    content: (
      <BeforeAfter
        title="Comercial"
        icon="💼"
        keyword="Ambiente de trabalho · Organização"
        antes="/institucional/comercial_antes.jpeg"
        depois="/institucional/comercial_depois.jpeg"
      />
    ),
  },

  /* 5 — CTP */
  {
    id: 5,
    title: "CTP",
    content: (
      <BeforeAfter
        title="CTP"
        icon="🖥️"
        keyword="Pré-impressão · Chapas"
        antes="/institucional/ctp_antes.jpeg"
        depois="/institucional/ctp_depois.jpeg"
      />
    ),
  },

  /* 6 — Impressão */
  {
    id: 6,
    title: "Impressão",
    content: (
      <BeforeAfter
        title="Impressão"
        icon="🖨️"
        keyword="Parque gráfico · Máquinas"
        antes="/institucional/impressao_antes.jpeg"
        depois="/institucional/impressao_depois.jpeg"
      />
    ),
  },

  /* 7 — Acabamento */
  {
    id: 7,
    title: "Acabamento",
    content: (
      <BeforeAfter
        title="Acabamento"
        icon="✂️"
        keyword="Finalização · Produção"
        antes="/institucional/acabamento_antes.jpeg"
        depois="/institucional/acabamento_depois.jpeg"
      />
    ),
  },

  /* 8 — Corte e Vinco */
  {
    id: 8,
    title: "Corte e Vinco",
    content: (
      <BeforeAfter
        title="Corte e Vinco"
        icon="📐"
        keyword="Acabamento especializado"
        antes="/institucional/cv_antes.jpeg"
        depois="/institucional/cv_depois.jpeg"
      />
    ),
  },

  /* 9 — Dobra */
  {
    id: 9,
    title: "Dobra",
    content: (
      <BeforeAfter
        title="Dobra"
        icon="📄"
        keyword="Setor de dobra · Vista 1"
        antes="/institucional/dobra_antes.jpeg"
        depois="/institucional/dobra_depois.jpeg"
      />
    ),
  },

  /* 10 — Dobra 2 */
  {
    id: 10,
    title: "Dobra (2)",
    content: (
      <BeforeAfter
        title="Dobra"
        icon="📄"
        keyword="Setor de dobra · Vista 2"
        antes="/institucional/dobra2_antes.jpeg"
        depois="/institucional/dobra2_depois.jpeg"
      />
    ),
  },

  /* 11 — Estoque */
  {
    id: 11,
    title: "Estoque",
    content: (
      <BeforeAfter
        title="Estoque"
        icon="📦"
        keyword="Armazenamento · Matéria-prima"
        antes="/institucional/estoque_antes.jpeg"
        depois="/institucional/estoque_depois.jpeg"
      />
    ),
  },

  /* 12 — Refeitório */
  {
    id: 12,
    title: "Refeitório",
    content: (
      <BeforeAfter
        title="Refeitório"
        icon="🍽️"
        keyword="Bem-estar · Convivência"
        antes="/institucional/refeitorio_antes.jpeg"
        depois="/institucional/refeitorio_depois.jpeg"
      />
    ),
  },

  /* 13 — Pessoas */
  {
    id: 13,
    title: "Pessoas",
    content: (
      <div className="flex flex-col justify-center h-full gap-10 px-4">
        <div>
          <h2 className="text-5xl font-extrabold tracking-tight text-foreground">
            Nosso Maior Ativo
          </h2>
          <p className="mt-3 text-2xl text-muted-foreground">
            A evolução é feita por pessoas
          </p>
        </div>
        <div className="grid grid-cols-2 gap-8">
          <div className="bg-muted/50 rounded-2xl p-8 flex gap-5 items-start">
            <span className="text-5xl shrink-0">👥</span>
            <div>
              <p className="text-2xl font-bold text-foreground">Novas Equipes</p>
              <p className="text-xl text-muted-foreground leading-relaxed">
                Integramos colaboradores de duas empresas, somando experiências e fortalecendo cada setor.
              </p>
            </div>
          </div>
          <div className="bg-muted/50 rounded-2xl p-8 flex gap-5 items-start">
            <span className="text-5xl shrink-0">🔄</span>
            <div>
              <p className="text-2xl font-bold text-foreground">Integração</p>
              <p className="text-xl text-muted-foreground leading-relaxed">
                Novos colegas, novos processos — mas o mesmo compromisso com a qualidade e com o cliente.
              </p>
            </div>
          </div>
          <div className="bg-muted/50 rounded-2xl p-8 flex gap-5 items-start">
            <span className="text-5xl shrink-0">📚</span>
            <div>
              <p className="text-2xl font-bold text-foreground">Aprendizado</p>
              <p className="text-xl text-muted-foreground leading-relaxed">
                Cada desafio é uma oportunidade de crescer. Juntos, aprendemos mais rápido.
              </p>
            </div>
          </div>
          <div className="bg-muted/50 rounded-2xl p-8 flex gap-5 items-start">
            <span className="text-5xl shrink-0">💪</span>
            <div>
              <p className="text-2xl font-bold text-foreground">Resiliência</p>
              <p className="text-xl text-muted-foreground leading-relaxed">
                A mudança é difícil, mas a força de vocês é o que move esta empresa.
              </p>
            </div>
          </div>
        </div>
      </div>
    ),
  },

  /* 14 — Demandas */
  {
    id: 14,
    title: "Demandas",
    content: (
      <div className="flex flex-col justify-center h-full gap-10 px-4">
        <div>
          <h2 className="text-5xl font-extrabold tracking-tight text-foreground">
            Novas Demandas
          </h2>
          <p className="mt-3 text-2xl text-muted-foreground">
            Mais volume, mais responsabilidade, mais crescimento
          </p>
        </div>
        <div className="grid grid-cols-3 gap-8">
          <div className="bg-primary/5 rounded-2xl p-8 border border-primary/10 flex flex-col items-center text-center gap-4">
            <span className="text-6xl">📈</span>
            <p className="text-3xl font-bold text-foreground">+Volume</p>
            <p className="text-xl text-muted-foreground">
              A fusão trouxe novos clientes e novos trabalhos
            </p>
          </div>
          <div className="bg-primary/5 rounded-2xl p-8 border border-primary/10 flex flex-col items-center text-center gap-4">
            <span className="text-6xl">🎯</span>
            <p className="text-3xl font-bold text-foreground">+Qualidade</p>
            <p className="text-xl text-muted-foreground">
              Manter e superar o padrão em cada entrega
            </p>
          </div>
          <div className="bg-primary/5 rounded-2xl p-8 border border-primary/10 flex flex-col items-center text-center gap-4">
            <span className="text-6xl">⏱️</span>
            <p className="text-3xl font-bold text-foreground">+Agilidade</p>
            <p className="text-xl text-muted-foreground">
              Processos mais rápidos sem perder a excelência
            </p>
          </div>
        </div>
      </div>
    ),
  },

  /* 15 — Encerramento */
  {
    id: 15,
    title: "Encerramento",
    content: (
      <div className="flex flex-col items-center justify-center h-full text-center gap-8">
        <div className="w-24 h-24 rounded-full bg-green-500/10 flex items-center justify-center">
          <span className="text-6xl">🚀</span>
        </div>
        <h2 className="text-6xl font-extrabold text-foreground leading-tight">
          Juntos Somos<br />Mais Fortes
        </h2>
        <p className="text-2xl text-muted-foreground max-w-3xl leading-relaxed">
          A mudança é o caminho para o crescimento.<br />
          Cada um de vocês é parte essencial dessa transformação.
        </p>
        <div className="mt-6 flex gap-8">
          <div className="bg-primary/10 rounded-xl px-10 py-5">
            <p className="text-4xl font-extrabold text-primary">União</p>
          </div>
          <div className="bg-primary/10 rounded-xl px-10 py-5">
            <p className="text-4xl font-extrabold text-primary">Adaptação</p>
          </div>
          <div className="bg-primary/10 rounded-xl px-10 py-5">
            <p className="text-4xl font-extrabold text-primary">Crescimento</p>
          </div>
        </div>
      </div>
    ),
  },
];

/* ------------------------------------------------------------------ */
/*  Main Component                                                      */
/* ------------------------------------------------------------------ */

export default function InstitucionalPage() {
  const [current, setCurrent] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const navigate = useNavigate();

  const goNext = useCallback(
    () => setCurrent((c) => Math.min(c + 1, slides.length - 1)),
    []
  );
  const goPrev = useCallback(() => setCurrent((c) => Math.max(c - 1, 0)), []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === " ") {
        e.preventDefault();
        goNext();
      }
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        goPrev();
      }
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
    <div
      className={cn(
        "flex flex-col h-screen bg-background select-none",
        isFullscreen && "cursor-none"
      )}
    >
      {/* Top bar */}
      <div
        className={cn(
          "flex items-center justify-between px-6 py-3 border-b bg-card/80 backdrop-blur shrink-0 z-10",
          isFullscreen &&
            "opacity-0 hover:opacity-100 transition-opacity absolute top-0 left-0 right-0"
        )}
      >
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate("/")}
            className="gap-2"
          >
            <Home className="w-4 h-4" /> Voltar
          </Button>
          <span className="text-sm text-muted-foreground font-medium">
            Apresentação Institucional
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">
            {current + 1} / {slides.length}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={toggleFullscreen}
            className="gap-2"
          >
            {isFullscreen ? (
              <Minimize className="w-4 h-4" />
            ) : (
              <Maximize className="w-4 h-4" />
            )}
            {isFullscreen ? "Sair" : "Tela Cheia"}
          </Button>
        </div>
      </div>

      {/* Slide area */}
      <div
        className="flex-1 relative overflow-hidden"
        onClick={(e) => {
          const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
          const x = e.clientX - rect.left;
          if (x > rect.width / 2) goNext();
          else goPrev();
        }}
      >
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
                  (typeof window !== "undefined"
                    ? window.innerWidth - 32
                    : 1200) / 1920,
                  (typeof window !== "undefined"
                    ? window.innerHeight - (isFullscreen ? 32 : 100)
                    : 700) / 1080
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
      <div
        className={cn(
          "flex items-center justify-between px-6 py-3 border-t bg-card/80 backdrop-blur shrink-0",
          isFullscreen &&
            "opacity-0 hover:opacity-100 transition-opacity absolute bottom-0 left-0 right-0"
        )}
      >
        <div className="flex gap-1.5 overflow-x-auto flex-1 mr-4">
          {slides.map((s, i) => (
            <button
              key={s.id}
              onClick={(e) => {
                e.stopPropagation();
                setCurrent(i);
              }}
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
          <Button
            variant="outline"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              goPrev();
            }}
            disabled={current === 0}
          >
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              goNext();
            }}
            disabled={current === slides.length - 1}
          >
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
