import React, { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  BookOpen, Search, CheckCircle2, AlertTriangle, Layers, PrinterCheck,
  Monitor, Truck, Factory, ShieldCheck, Package, BarChart3, Clock,
  ArrowRight, ChevronRight, FileText, FileDown, Printer, RotateCcw,
  Info, Sparkles, ArrowLeft, ExternalLink, HelpCircle, ShoppingCart,
  Wrench, ClipboardList, Eye, Check, X, Bookmark
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ThemeToggle } from "@/components/ThemeToggle";
import logoImg from "@/assets/logo-sidebar.png";

interface TutorialSection {
  id: string;
  title: string;
  subtitle: string;
  icon: React.ComponentType<{ className?: string }>;
  badgeColor: string;
  category: "geral" | "fluxo" | "especifico" | "faq";
  content: {
    resumo: string;
    passoAPasso: Array<{
      passo: number;
      titulo: string;
      descricao: string;
      dicaPro?: string;
    }>;
    regrasImportantes?: string[];
    alertas?: string[];
  };
}

const TUTORIAL_DATA: TutorialSection[] = [
  {
    id: "visao-geral",
    title: "1. Visão Geral & Primeiro Acesso",
    subtitle: "Estrutura do sistema, navegação e conceitos fundamentais",
    icon: Monitor,
    badgeColor: "bg-blue-500/20 text-blue-400 border-blue-500/30",
    category: "geral",
    content: {
      resumo: "O Primacor Kaban é o sistema operacional e industrial da Primacor Gráfica. Ele conecta todos os setores em tempo real — desde a entrada comercial da O.S., passando pelo tratamento do arquivo, confecção de chapas (CTP), impressão, acabamento, conferência de qualidade até a entrega física ao cliente.",
      passoAPasso: [
        {
          passo: 1,
          titulo: "Login & Níveis de Acesso",
          descricao: "Acesse com seu e-mail corporativo e senha. O sistema adapta a interface conforme o seu setor (Comercial, PCP, Pré-Impressão, CTP, Chão de Fábrica, Inspeção, Expedição ou Diretoria).",
          dicaPro: "Se esquecer a senha, um Coordenador ou Administrador pode redefini-la rapidamente no menu de Usuários."
        },
        {
          passo: 2,
          titulo: "Busca Rápida Global (Ctrl + K)",
          descricao: "Pressione 'Ctrl + K' em qualquer tela para abrir a Paleta de Comandos. Digite o número da O.S., o nome do cliente ou o nome de um setor para navegar instantaneamente.",
          dicaPro: "Você pode digitar apenas os números da O.S. (ex: '73677') para abrir direto os detalhes do trabalho."
        },
        {
          passo: 3,
          titulo: "Mural de Alertas & Notificações",
          descricao: "O ícone de sino no topo e a faixa superior informam avisos da diretoria, comunicados urgentes e quando um cliente respondeu a um e-mail de aprovação de prova.",
        }
      ],
      regrasImportantes: [
        "Mantenha sempre sua sessão ativa; alterações feitas por outros operadores sincronizam em tempo real na sua tela.",
        "Use o modo escuro padrão para menor cansaço visual e alto contraste na leitura dos cartões de O.S."
      ]
    }
  },
  {
    id: "comercial-pcp",
    title: "2. Comercial & Planejamento (PCP)",
    subtitle: "Entrada de ordens de serviço, compras, manutenção e SLAs",
    icon: ClipboardList,
    badgeColor: "bg-purple-500/20 text-purple-400 border-purple-500/30",
    category: "fluxo",
    content: {
      resumo: "O setor Comercial cadastra novos trabalhos e orçamentos, enquanto o PCP (Planejamento e Controle da Produção) monitora os prazos de entrega, gargalos industriais e sequência prioritária das máquinas.",
      passoAPasso: [
        {
          passo: 1,
          titulo: "Cadastrando uma Nova O.S.",
          descricao: "Clique no botão '+ Nova O.S.' no menu superior. Preencha obrigatoriamente: Número da O.S., Cliente (em caixa alta), Descrição do Produto, Tiragem/Quantidade, Vendedor responsável e Data/Hora de Entrega.",
          dicaPro: "Anexe o PDF final ou links dos arquivos de pré-impressão diretamente no card para que a equipe técnica já inicie sem esperas."
        },
        {
          passo: 2,
          titulo: "Ordens de Compra (O.C.) & Manutenção (O.M.)",
          descricao: "Para compras de insumos específicos (Pantone, faca, papel especial) use '+ Nova O.C.'. Para reparos de maquinários use '+ Nova O.M.'.",
        },
        {
          passo: 3,
          titulo: "Monitorando Prazos no PCP",
          descricao: "No menu 'Painel' (PCP), acompanhe a lista ordenada de prazos mais apertados. Cartões em vermelho indicam O.S. vencida ou com entrega em menos de 2 horas.",
        }
      ],
      regrasImportantes: [
        "A data de entrega combinada com o cliente é soberana: ela define a ordem de prioridade visual no Chão de Fábrica.",
        "Se houver alteração de escopo pelo cliente após o envio da O.S., notifique imediatamente a Pré-Impressão para geração de REV."
      ]
    }
  },
  {
    id: "pre-impressao",
    title: "3. Pré-Impressão (Kanban Principal)",
    subtitle: "Tratamento de arquivos, envio de provas, controle de REVs e travas",
    icon: Monitor,
    badgeColor: "bg-sky-500/20 text-sky-400 border-sky-500/30",
    category: "fluxo",
    content: {
      resumo: "A Pré-Impressão é o coração técnico da fábrica. O Kanban é composto por 6 etapas sequenciais que garantem que nenhum arquivo vá para as máquinas com erros de sangria, texto ou cor.",
      passoAPasso: [
        {
          passo: 1,
          titulo: "As 6 Colunas da Pré-Impressão",
          descricao: "1. Fila de Entrada -> 2. Preparando Arquivo -> 3. Produzindo Prova -> 4. Aguardando Aprovação -> 5. Aguardando Novo Arquivo -> 6. Arquivo Liberado (Saída).",
        },
        {
          passo: 2,
          titulo: "Envio de Prova & Integração Outlook",
          descricao: "Ao gerar a prova (Física, Digital ou E-mail), mova o card para 'Aguardando Aprovação'. Se enviado via e-mail corporativo, as respostas do cliente sincronizam automaticamente com a O.S.",
          dicaPro: "Se o cliente responder 'Aprovado' por e-mail, o sistema notifica o operador para liberar o trabalho sem precisar checar a caixa de entrada."
        },
        {
          passo: 3,
          titulo: "Controle de Revisões (REVs)",
          descricao: "Se o cliente solicitar alterações na arte, o card volta para 'Preparando Arquivo' e recebe a etiqueta de REV (REV 1, REV 2+).",
          dicaPro: "REVs 2 ou superiores piscam com alerta crítico no Dashboard da diretoria por representarem retrabalho."
        },
        {
          passo: 4,
          titulo: "Travas de Suprimentos (Faca & Clichê)",
          descricao: "Se a O.S. necessitar de nova faca de corte ou clichê de relevo/verniz, ela fica travada na Saída até que a chegada ou liberação do suprimento seja confirmada.",
        }
      ],
      alertas: [
        "ATENÇÃO: A O.S. só pode ser enviada para a Produção/CTP a partir da coluna 'Arquivo Liberado' após preencher o Checklist de 13 itens!"
      ]
    }
  },
  {
    id: "checklist-ctp",
    title: "4. Checklist Obrigatório de Conferência (13 Itens)",
    subtitle: "Barreira de qualidade mandatória antes de avançar para a Produção",
    icon: CheckCircle2,
    badgeColor: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
    category: "especifico",
    content: {
      resumo: "Para erradicar perdas financeiras com chapas perdidas e erros de impressão na chapa offset, foi implementada uma barreira eletrônica intransponível na Saída da Pré-Impressão. A O.S. não avança sem que todos os 13 pontos sejam checados pelo operador.",
      passoAPasso: [
        {
          passo: 1,
          titulo: "Localização do Checklist",
          descricao: "Quando a O.S. chega na coluna 'Arquivo Liberado' (Saída), surge no card o botão 'Checklist CTP (0/13 PENDENTE)'.",
        },
        {
          passo: 2,
          titulo: "Conferência Ponto a Ponto",
          descricao: "Clique no botão para abrir o diálogo modal. Você deve inspecionar fisicamente e no arquivo digital cada um dos 13 itens da tabela oficial Primacor.",
          dicaPro: "Existe o botão 'Marcar Todos como Verificados' caso você tenha feito a conferência completa da folha impressa/boneco."
        },
        {
          passo: 3,
          titulo: "Salvar e Liberar Envio",
          descricao: "Ao marcar 13/13 itens, clique em 'Salvar e Validar Conferência'. O card ganha o selo verde '13/13 Verificado' e o botão 'Enviar -> Produção' é liberado.",
        }
      ],
      regrasImportantes: [
        "01. Montagem corresponde à OS e versão final aprovada.",
        "02. Formato da folha e máquina de impressão corretos.",
        "03. Formato da chapa, orientação e posicionamento da montagem.",
        "04. Quantidade de peças por folha, espaçamentos e aproveitamento.",
        "05. Paginação, sequência de cadernos e orientação.",
        "06. Frente e verso correspondentes com sistema de virada.",
        "07. Posição de pinça e referência lateral da máquina.",
        "08. Formato final, sangrias e margens de segurança.",
        "09. Marcas de corte, dobra e registro corretas.",
        "10. Barras de controle sem invadir a área útil.",
        "11. Facas, vincos e vernizes identificados.",
        "12. Prova de montagem/boneco conferido.",
        "13. Quantidade e identificação de formas e chapas."
      ],
      alertas: [
        "O sistema registra o nome do operador e data/hora em que a conferência foi validada para auditoria da qualidade."
      ]
    }
  },
  {
    id: "ctp-digital",
    title: "5. CTP & Impressão Digital",
    subtitle: "Gravação de matrizes offset, fila de ripagem e impressão rápida",
    icon: Layers,
    badgeColor: "bg-amber-500/20 text-amber-400 border-amber-500/30",
    category: "fluxo",
    content: {
      resumo: "No CTP são gravadas as matrizes de alumínio (chapas) nas medidas exatas de cada impressora (Speedmaster, SORMZ, etc.). Na Impressão Digital são produzidos materiais rápidos e provas em papel especial.",
      passoAPasso: [
        {
          passo: 1,
          titulo: "As 4 Colunas do CTP",
          descricao: "1. Entrada: Ordens recebidas da Pré-Impressão prontas para gravação -> 2. Paralisado: Casos que exigem parada -> 3. Produção: Chapas em gravação no laser -> 4. Saída: Chapas gravadas e conferidas.",
        },
        {
          passo: 2,
          titulo: "Justificando uma Paralisação",
          descricao: "Se faltar matriz no estoque, quebrar laser ou houver dúvida técnica, mova para 'Paralisado'. Selecione obrigatoriamente o motivo (Falta de Matriz, Máquina em Manutenção, Dúvida de Arquivo, etc.).",
          dicaPro: "O card em Paralisado emite alerta imediato no Painel do PCP para providências de suprimentos."
        },
        {
          passo: 3,
          titulo: "Finalização das Chapas",
          descricao: "Ao concluir a gravação e lavagem, mova para 'Saída' e despache para o setor de Impressão Offset correspondente.",
        }
      ]
    }
  },
  {
    id: "chao-fabrica",
    title: "6. Chão de Fábrica (Produção Industrial)",
    subtitle: "Impressão Offset, Dobra, Alceamento, Lombada, Corte & Vinco",
    icon: Factory,
    badgeColor: "bg-orange-500/20 text-orange-400 border-orange-500/30",
    category: "fluxo",
    content: {
      resumo: "O Chão de Fábrica executa a transformação física do papel. As O.S. trafegam entre as impressoras planas e o acabamento editorial e promocional conforme o roteiro técnico do produto.",
      passoAPasso: [
        {
          passo: 1,
          titulo: "Prioridades de Máquina",
          descricao: "Os operadores de máquina devem puxar sempre os trabalhos com selo 'URGENTE' ou com prazo de entrega do mesmo dia.",
        },
        {
          passo: 2,
          titulo: "Rastreio por Etapas",
          descricao: "Cada fase concluída (Impressão -> Secagem -> Dobra -> Costura -> Corte) deve ser sinalizada no sistema para que a Expedição saiba o andamento real.",
        },
        {
          passo: 3,
          titulo: "Encaminhamento para Inspeção",
          descricao: "Assim que o último processo de acabamento é concluído (ex: refile trilateral ou colagem de caixas), o lote segue fisicamente para a mesa de Inspeção e Qualidade.",
        }
      ]
    }
  },
  {
    id: "inspecao-etiquetas",
    title: "7. Inspeção & Etiquetas Térmicas (Zebra 80mm)",
    subtitle: "Conferência final de qualidade, embalagem e rotulagem para entrega",
    icon: ShieldCheck,
    badgeColor: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
    category: "especifico",
    content: {
      resumo: "A Inspeção é o último filtro de qualidade antes do cliente receber o produto. É onde os produtos são contados, embalados em pacotes padronizados e etiquetados com rótulo térmico profissional de 80mm de largura.",
      passoAPasso: [
        {
          passo: 1,
          titulo: "Abertura da Rotulagem",
          descricao: "No card em Inspeção, clique no botão 'Imprimir etiqueta'. O diálogo carrega automaticamente: Cliente, Descrição do Serviço, Quantidade total da O.S., Data e Número da O.S.",
          dicaPro: "Todos os dados são editáveis apenas para a etiqueta caso precise ajustar a descrição do pacote sem alterar a O.S."
        },
        {
          passo: 2,
          titulo: "Escolha do Modo de Numeração",
          descricao: "• MODO MANUAL: Para imprimir 1 etiqueta com texto livre de até 6 caracteres (ex: '01', '7', '12A') ou em branco (gera traço para caneta). A quantidade de etiquetas iguais é colocada no campo 'Cópias' da impressora.\n• MODO SEQUENCIAL: Para imprimir pacotes numerados em ordem (ex: 'De 1 até 50'). O sistema gera todas as páginas em sequência contínua com zeros à esquerda alinhados.",
        },
        {
          passo: 3,
          titulo: "Disparo da Impressão & Fechamento Automático",
          descricao: "Ao clicar em 'Imprimir', a janela do navegador abre na Zebra ZD230. O card se fecha automaticamente e o registro de etiquetas impressas é gravado no Histórico de Concluídas da Inspeção.",
          dicaPro: "Configuração da Zebra: Margens: NENHUMA (Zero), Escala: 100%, Papel: 80x50mm."
        }
      ],
      alertas: [
        "IMPORTANTE: O botão 'Imprimir etiqueta' só existe e deve ser utilizado na coluna de Inspeção. Não existe etiqueta antes da conferência final!"
      ]
    }
  },
  {
    id: "expedicao-entregas",
    title: "8. Expedição & Gestão de Entregas",
    subtitle: "Roteirização viária, motoristas, comprovantes e app mobile",
    icon: Truck,
    badgeColor: "bg-amber-500/20 text-amber-400 border-amber-500/30",
    category: "fluxo",
    content: {
      resumo: "A Expedição confere os pacotes etiquetados, agrupa as entregas por rotas otimizadas e despacha via Moto, Carro ou Retirada. O entregador utiliza um app mobile próprio com assinatura na tela.",
      passoAPasso: [
        {
          passo: 1,
          titulo: "Conferência de Pacotes",
          descricao: "Verifique se a quantidade de pacotes físicos bate exatamente com as etiquetas geradas na Inspeção (ex: 20 pacotes de 100 unidades = 2.000 unidades).",
        },
        {
          passo: 2,
          titulo: "Roteirização Inteligente (OSRM)",
          descricao: "No menu 'Gestão de Entregas', o sistema calcula a rota viária mais eficiente de Belo Horizonte e região metropolitana, reduzindo tempo e combustível.",
        },
        {
          passo: 3,
          titulo: "App do Entregador (/entregador)",
          descricao: "O motorista visualiza no celular apenas suas entregas do dia, clica em 'Iniciar Rota' (abre Waze/Google Maps), colhe a assinatura digital do recebedor e tira foto do comprovante.",
          dicaPro: "As fotos e comprovantes sincronizam automaticamente com a pasta segura do cliente no SharePoint da Primacor."
        }
      ]
    }
  },
  {
    id: "dashboard-relatorios",
    title: "9. Dashboard & Exportação de Relatórios PDF",
    subtitle: "Telemetria fabril, governança operacional e relatórios por setor",
    icon: BarChart3,
    badgeColor: "bg-indigo-500/20 text-indigo-400 border-indigo-500/30",
    category: "especifico",
    content: {
      resumo: "O Dashboard reúne os dados estatísticos da indústria: tempo médio em cada etapa, SLA de entrega, ordens críticas e relatórios executivos em PDF com resumo analítico em modo paisagem.",
      passoAPasso: [
        {
          passo: 1,
          titulo: "Aba Chão de Fábrica",
          descricao: "Mostra a listagem completa de ordens ativas na indústria com filtros rápidos: Todos, Pré-Imp, CTP, Digital, Qualidade, Expedição e Urgentes.",
        },
        {
          passo: 2,
          titulo: "Menu Dropdown 'Exportar PDF'",
          descricao: "Clique no botão 'Exportar PDF v' para escolher o que exportar: Todos os setores juntos ou um setor específico (apenas CTP, apenas Pré-Imp, etc.) ou somente Urgentes.",
          dicaPro: "O PDF gerado inclui cabeçalho oficial, quadro estatístico (total, atrasadas, urgentes) e linhas de alerta destacadas em cores."
        },
        {
          passo: 3,
          titulo: "Aba Governança & Auditoria",
          descricao: "Acompanhe o painel de retrabalhos (REVs) e auditoria de compras de Pantones e ferramentas de corte.",
        }
      ]
    }
  },
  {
    id: "faq-duvidas",
    title: "10. Dúvidas Frequentes & Resolução de Problemas",
    subtitle: "Soluções rápidas para as situações mais comuns do dia a dia",
    icon: HelpCircle,
    badgeColor: "bg-rose-500/20 text-rose-400 border-rose-500/30",
    category: "faq",
    content: {
      resumo: "Guia rápido para destravar ordens e resolver dúvidas operacionais sem precisar parar a produção.",
      passoAPasso: [
        {
          passo: 1,
          titulo: "Por que não consigo enviar a O.S. para a Produção?",
          descricao: "Verifique se a O.S. está na coluna 'Arquivo Liberado' e se o Checklist CTP de 13 itens foi marcado e salvo. Se houver Faca ou Clichê novo marcado, confirme se já foi registrado como 'Enviado/Liberado'.",
        },
        {
          passo: 2,
          titulo: "A etiqueta na Zebra saiu desalinhada ou com corte na borda. O que fazer?",
          descricao: "Na caixa de diálogo de impressão do navegador, certifique-se de selecionar: Destino: Zebra ZD230 | Margens: NENHUMA | Escala: Padrão (100%) | Marcar 'Gráficos de plano de fundo'.",
        },
        {
          passo: 3,
          titulo: "Como sinalizar que uma O.S. virou URGENTE?",
          descricao: "Abra os detalhes da O.S. clicando nela e marque a caixa 'URGENTE'. O card ficará com borda destacada em vermelho e subirá para o topo de todas as filas industriais.",
        },
        {
          passo: 4,
          titulo: "Como encontrar uma O.S. que já foi entregue há semanas?",
          descricao: "Acesse o menu 'O.S. Concluídas' no menu lateral ou pressione Ctrl + K e digite o número da O.S. Todas as informações, históricos de provas e fotos de entrega ficam arquivados permanentemente.",
        }
      ]
    }
  }
];

export default function TutorialPage() {
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState("");
  const [activeCategory, setActiveCategory] = useState<string>("all");
  const [selectedSectionId, setSelectedSectionId] = useState<string>("visao-geral");

  const filteredSections = useMemo(() => {
    return TUTORIAL_DATA.filter((sec) => {
      if (activeCategory !== "all" && sec.category !== activeCategory) return false;
      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase();
        const matchTitle = sec.title.toLowerCase().includes(q);
        const matchSubtitle = sec.subtitle.toLowerCase().includes(q);
        const matchResumo = sec.content.resumo.toLowerCase().includes(q);
        const matchPassos = sec.content.passoAPasso.some(
          (p) => p.titulo.toLowerCase().includes(q) || p.descricao.toLowerCase().includes(q)
        );
        const matchRegras = sec.content.regrasImportantes?.some((r) => r.toLowerCase().includes(q));
        return matchTitle || matchSubtitle || matchResumo || matchPassos || matchRegras;
      }
      return true;
    });
  }, [activeCategory, searchTerm]);

  const activeSection = useMemo(() => {
    return TUTORIAL_DATA.find((s) => s.id === selectedSectionId) || TUTORIAL_DATA[0];
  }, [selectedSectionId]);

  const handlePrintTutorial = () => {
    window.print();
  };

  return (
    <div className="min-h-screen bg-[#06141B] text-[#CCD0CF] flex flex-col selection:bg-blue-600 selection:text-white">
      {/* Top Header */}
      <header className="sticky top-0 z-30 border-b border-[#253745]/80 bg-[#11212D]/90 backdrop-blur-md px-4 sm:px-8 py-3.5 flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate("/")}
            className="text-xs h-9 gap-1.5 text-[#9BA8AB] hover:text-white hover:bg-[#253745] rounded-xl border border-[#4A5C6A]/40"
          >
            <ArrowLeft className="h-4 w-4" />
            <span className="hidden sm:inline">Voltar ao Sistema</span>
          </Button>

          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-blue-500/15 border border-blue-500/30 text-blue-400">
              <BookOpen className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-sm sm:text-base font-extrabold text-white tracking-tight">
                  Manual & Tutorial do Usuário
                </h1>
                <Badge variant="outline" className="text-[10px] font-mono-tech border-emerald-500/40 text-emerald-400 bg-emerald-500/10">
                  PLATAFORMA COMPLETA
                </Badge>
              </div>
              <p className="text-[11px] text-[#9BA8AB] hidden sm:block">
                Guia operacional completo para todos os setores da Primacor Gráfica
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handlePrintTutorial}
            className="text-xs h-9 gap-1.5 border-[#4A5C6A]/50 bg-[#253745]/60 hover:bg-[#253745] text-white rounded-xl"
            title="Imprimir ou salvar manual em PDF"
          >
            <Printer className="h-3.5 w-3.5 text-blue-400" />
            <span className="hidden md:inline">Imprimir / PDF</span>
          </Button>

          <ThemeToggle />
        </div>
      </header>

      {/* Hero Banner with Search */}
      <div className="px-4 sm:px-8 pt-8 pb-6 bg-gradient-to-b from-[#11212D] to-[#06141B] border-b border-[#253745]/60">
        <div className="max-w-6xl mx-auto space-y-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <span className="text-xs font-mono-tech uppercase tracking-wider text-blue-400 font-bold">
                DOCUMENTAÇÃO OPERACIONAL PRIMACOR
              </span>
              <h2 className="text-2xl sm:text-3xl font-black text-white mt-1">
                Como usar a plataforma de ponta a ponta
              </h2>
              <p className="text-xs sm:text-sm text-[#9BA8AB] mt-1 max-w-2xl">
                Consulte o passo a passo de cada etapa, regras de qualidade, checklists obrigatórios, padrões de impressão de etiquetas e resolução de dúvidas.
              </p>
            </div>

            {/* Quick stats cards */}
            <div className="flex items-center gap-2 sm:gap-3 shrink-0">
              <div className="px-3.5 py-2 rounded-xl bg-[#253745]/60 border border-[#4A5C6A]/50 text-center">
                <span className="block text-lg font-black text-white">10</span>
                <span className="text-[10px] text-[#9BA8AB] uppercase font-bold">Módulos</span>
              </div>
              <div className="px-3.5 py-2 rounded-xl bg-[#253745]/60 border border-[#4A5C6A]/50 text-center">
                <span className="block text-lg font-black text-emerald-400">13</span>
                <span className="text-[10px] text-[#9BA8AB] uppercase font-bold">Itens CTP</span>
              </div>
              <div className="px-3.5 py-2 rounded-xl bg-[#253745]/60 border border-[#4A5C6A]/50 text-center">
                <span className="block text-lg font-black text-amber-400">80mm</span>
                <span className="text-[10px] text-[#9BA8AB] uppercase font-bold">Zebra ZD230</span>
              </div>
            </div>
          </div>

          {/* Search bar & filter pills */}
          <div className="pt-2 flex flex-col sm:flex-row items-center gap-3">
            <div className="relative flex-1 w-full">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[#9BA8AB]" />
              <Input
                placeholder="Buscar por assunto (ex: checklist ctp, etiqueta, urgência, rev, exportar pdf, prova)..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 h-11 bg-[#11212D] border-[#4A5C6A]/70 text-white rounded-xl text-xs sm:text-sm placeholder:text-[#9BA8AB]/70 focus-visible:ring-blue-500"
              />
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#9BA8AB] hover:text-white"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            {/* Categories */}
            <div className="flex items-center gap-1.5 w-full sm:w-auto overflow-x-auto pb-1 sm:pb-0">
              {[
                { id: "all", label: "Todos" },
                { id: "fluxo", label: "Fluxo Fabril" },
                { id: "especifico", label: "Regras Críticas" },
                { id: "geral", label: "Geral" },
                { id: "faq", label: "FAQ / Dúvidas" },
              ].map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => setActiveCategory(cat.id)}
                  className={`px-3 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
                    activeCategory === cat.id
                      ? "bg-blue-600 text-white shadow-md shadow-blue-600/30"
                      : "bg-[#253745]/60 text-[#9BA8AB] hover:bg-[#253745] hover:text-white border border-[#4A5C6A]/40"
                  }`}
                >
                  {cat.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Main Content Area: Sidebar Navigation + Detailed Content */}
      <div className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-8 py-8 grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left Column: Index of Sections */}
        <aside className="lg:col-span-4 space-y-2">
          <div className="flex items-center justify-between pb-2 border-b border-[#253745]">
            <span className="text-xs font-extrabold uppercase tracking-wider text-[#9BA8AB] font-mono-tech">
              Índice de Tópicos ({filteredSections.length})
            </span>
          </div>

          <div className="space-y-1.5 max-h-[calc(100vh-280px)] overflow-y-auto pr-1">
            {filteredSections.map((sec) => {
              const Icon = sec.icon;
              const isSelected = sec.id === activeSection.id;
              return (
                <button
                  key={sec.id}
                  onClick={() => setSelectedSectionId(sec.id)}
                  className={`w-full text-left p-3 rounded-xl border transition-all flex items-start gap-3 cursor-pointer group ${
                    isSelected
                      ? "bg-[#253745] border-blue-500/60 shadow-lg shadow-blue-500/10 text-white"
                      : "bg-[#11212D]/60 hover:bg-[#253745]/60 border-[#253745] text-[#9BA8AB] hover:text-white"
                  }`}
                >
                  <div className={`p-2 rounded-lg shrink-0 mt-0.5 ${isSelected ? "bg-blue-600 text-white" : "bg-[#253745] text-[#9BA8AB]"}`}>
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className={`text-xs font-bold leading-tight ${isSelected ? "text-white" : "text-[#CCD0CF] group-hover:text-white"}`}>
                      {sec.title}
                    </h3>
                    <p className="text-[11px] text-[#9BA8AB] line-clamp-1 mt-0.5">
                      {sec.subtitle}
                    </p>
                  </div>
                  {isSelected && (
                    <ChevronRight className="h-4 w-4 text-blue-400 shrink-0 self-center" />
                  )}
                </button>
              );
            })}

            {filteredSections.length === 0 && (
              <div className="p-6 text-center text-xs text-[#9BA8AB]">
                Nenhum tópico encontrado para &quot;{searchTerm}&quot;.
              </div>
            )}
          </div>
        </aside>

        {/* Right Column: Active Topic Body */}
        <main className="lg:col-span-8 space-y-6">
          <article className="p-6 sm:p-8 rounded-2xl bg-[#11212D] border border-[#253745] shadow-xl space-y-6">
            {/* Header of Active Section */}
            <div className="space-y-3 pb-6 border-b border-[#253745]">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge className={`text-xs font-bold px-2.5 py-0.5 rounded-lg ${activeSection.badgeColor}`}>
                  SEÇÃO OFICIAL
                </Badge>
                <span className="text-xs text-[#9BA8AB] font-mono-tech">
                  Primacor Kaban • Módulo {activeSection.category.toUpperCase()}
                </span>
              </div>

              <div className="flex items-start gap-4">
                <div className="p-3 rounded-2xl bg-blue-500/15 border border-blue-500/30 text-blue-400 shrink-0">
                  <activeSection.icon className="h-7 w-7" />
                </div>
                <div>
                  <h2 className="text-xl sm:text-2xl font-black text-white">
                    {activeSection.title}
                  </h2>
                  <p className="text-xs sm:text-sm text-[#9BA8AB] mt-1 font-medium">
                    {activeSection.subtitle}
                  </p>
                </div>
              </div>
            </div>

            {/* Resumo executivo */}
            <div className="p-4 rounded-xl bg-[#253745]/40 border border-[#4A5C6A]/40 text-xs sm:text-sm text-[#CCD0CF] leading-relaxed flex items-start gap-3">
              <Info className="h-5 w-5 text-blue-400 shrink-0 mt-0.5" />
              <div>
                <strong className="text-white block mb-0.5 font-bold">Objetivo e Funcionamento:</strong>
                {activeSection.content.resumo}
              </div>
            </div>

            {/* Alertas Críticos (se houver) */}
            {activeSection.content.alertas && activeSection.content.alertas.length > 0 && (
              <div className="space-y-2">
                {activeSection.content.alertas.map((alerta, idx) => (
                  <div
                    key={idx}
                    className="p-3.5 rounded-xl bg-rose-500/15 border border-rose-500/40 text-rose-200 text-xs sm:text-sm flex items-start gap-3 font-medium"
                  >
                    <AlertTriangle className="h-5 w-5 text-rose-400 shrink-0 mt-0.5" />
                    <span>{alerta}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Passo a Passo */}
            <div className="space-y-4">
              <h3 className="text-sm font-extrabold uppercase tracking-wider text-white flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-blue-400" />
                Passo a Passo Operacional
              </h3>

              <div className="space-y-3">
                {activeSection.content.passoAPasso.map((passo) => (
                  <div
                    key={passo.passo}
                    className="p-4 rounded-xl bg-[#253745]/30 border border-[#253745] hover:border-[#4A5C6A]/60 transition-colors space-y-2"
                  >
                    <div className="flex items-center gap-3">
                      <span className="w-7 h-7 rounded-lg bg-blue-600 text-white font-black text-xs flex items-center justify-center shrink-0">
                        {passo.passo}
                      </span>
                      <h4 className="text-sm font-bold text-white">
                        {passo.titulo}
                      </h4>
                    </div>

                    <p className="text-xs sm:text-sm text-[#9BA8AB] leading-relaxed pl-10 whitespace-pre-line">
                      {passo.descricao}
                    </p>

                    {passo.dicaPro && (
                      <div className="ml-10 p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/25 text-emerald-300 text-[11px] sm:text-xs flex items-center gap-2">
                        <Check className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                        <span><strong>Dica Prática:</strong> {passo.dicaPro}</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Regras Importantes do Setor */}
            {activeSection.content.regrasImportantes && activeSection.content.regrasImportantes.length > 0 && (
              <div className="p-4 rounded-xl bg-[#253745]/50 border border-[#4A5C6A]/50 space-y-2.5">
                <h4 className="text-xs font-extrabold uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
                  <Bookmark className="h-3.5 w-3.5 text-amber-400" />
                  Regras Mandatórias de Qualidade
                </h4>
                <ul className="space-y-1.5 text-xs text-[#CCD0CF]">
                  {activeSection.content.regrasImportantes.map((regra, idx) => (
                    <li key={idx} className="flex items-start gap-2">
                      <span className="text-blue-400 font-bold shrink-0">•</span>
                      <span>{regra}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Bottom Section Navigator */}
            <div className="pt-6 border-t border-[#253745] flex items-center justify-between gap-4">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const currIdx = TUTORIAL_DATA.findIndex((s) => s.id === activeSection.id);
                  if (currIdx > 0) {
                    setSelectedSectionId(TUTORIAL_DATA[currIdx - 1].id);
                    window.scrollTo({ top: 120, behavior: "smooth" });
                  }
                }}
                disabled={TUTORIAL_DATA.findIndex((s) => s.id === activeSection.id) === 0}
                className="text-xs h-9 border-[#4A5C6A]/50 bg-[#253745] text-white hover:bg-[#253745]/80 rounded-xl"
              >
                ← Tópico Anterior
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const currIdx = TUTORIAL_DATA.findIndex((s) => s.id === activeSection.id);
                  if (currIdx < TUTORIAL_DATA.length - 1) {
                    setSelectedSectionId(TUTORIAL_DATA[currIdx + 1].id);
                    window.scrollTo({ top: 120, behavior: "smooth" });
                  }
                }}
                disabled={TUTORIAL_DATA.findIndex((s) => s.id === activeSection.id) === TUTORIAL_DATA.length - 1}
                className="text-xs h-9 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold shadow-md shadow-blue-600/20"
              >
                Próximo Tópico →
              </Button>
            </div>
          </article>
        </main>
      </div>

      {/* Footer */}
      <footer className="mt-auto border-t border-[#253745]/60 bg-[#11212D]/80 py-6 px-4 text-center text-xs text-[#9BA8AB]">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="font-extrabold text-white">Primacor Gráfica e Editora LTDA</span>
            <span>•</span>
            <span>Sistema Kaban v2.4</span>
          </div>
          <span>Acesso direto exclusivo via rota: <code className="text-blue-400 font-mono">/tutorial</code></span>
        </div>
      </footer>
    </div>
  );
}
