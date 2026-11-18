import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  BookOpen, ArrowLeft, Search, CheckCircle2, AlertTriangle, Monitor,
  Users, KeyRound, ArrowRight, Eye, MessageSquare, Bell, Flame,
  HelpCircle, Compass, Check, Layers, Factory, ShieldCheck, Truck,
  ClipboardList, Clock, Sparkles, MoveRight, MousePointerClick, Filter
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export default function TutorialPage() {
  const navigate = useNavigate();
  const [activeSection, setActiveSection] = useState("primeiros-passos");

  const scrollTo = (id: string) => {
    setActiveSection(id);
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  return (
    <div className="min-h-screen bg-[#06141B] text-[#CCD0CF] font-sans selection:bg-blue-600 selection:text-white">
      {/* ─── Top Bar ─── */}
      <header className="sticky top-0 z-40 bg-[#11212D]/95 backdrop-blur-md border-b border-[#253745] px-4 sm:px-8 py-3.5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center font-bold text-white text-base shadow-md">
            P
          </div>
          <div>
            <h1 className="text-sm sm:text-base font-extrabold text-white leading-tight">
              Manual do Colaborador — Primacor Kaban
            </h1>
            <p className="text-[11px] text-[#9BA8AB] hidden sm:block">
              Guia prático passo a passo para novos integrantes da equipe
            </p>
          </div>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={() => navigate("/")}
          className="text-xs h-9 gap-1.5 bg-[#253745] hover:bg-[#253745]/80 text-white border-[#4A5C6A]/60 rounded-xl cursor-pointer"
        >
          <ArrowLeft className="h-3.5 w-3.5 text-blue-400" />
          <span>Voltar ao Sistema</span>
        </Button>
      </header>

      {/* ─── Hero Welcome Banner ─── */}
      <div className="bg-gradient-to-b from-[#11212D] to-[#06141B] border-b border-[#253745] py-12 px-4 sm:px-8">
        <div className="max-w-5xl mx-auto space-y-4 text-center sm:text-left">
          <Badge className="bg-blue-500/15 text-blue-400 border-blue-500/30 text-xs px-3 py-1 font-semibold">
            BEM-VINDO À EQUIPE PRIMACOR
          </Badge>
          <h2 className="text-3xl sm:text-4xl font-black text-white tracking-tight">
            Como usar o Kaban no seu dia a dia
          </h2>
          <p className="text-sm sm:text-base text-[#9BA8AB] max-w-3xl leading-relaxed">
            Este manual foi feito para você que acabou de chegar ou quer tirar dúvidas sobre como a nossa fábrica se comunica. Aqui você aprende como entrar no sistema, como entender os cartões de trabalho (O.S.), como atualizar suas tarefas e passar o serviço para o próximo colega.
          </p>

          {/* Quick Anchor Bar */}
          <div className="pt-4 flex flex-wrap gap-2 justify-center sm:justify-start">
            {[
              { id: "primeiros-passos", label: "1. Primeiro Acesso & Login" },
              { id: "o-que-e-kanban", label: "2. O que é o Quadro Kaban" },
              { id: "anatomia-card", label: "3. Entendendo o Card da O.S." },
              { id: "como-mover-atualizar", label: "4. Como Mover e Atualizar" },
              { id: "como-buscar", label: "5. Como Buscar Trabalhos" },
              { id: "fluxo-setores", label: "6. Seu Setor no Fluxo" },
              { id: "regras-ouro", label: "7. Regras de Ouro da Fábrica" },
            ].map((btn) => (
              <button
                key={btn.id}
                onClick={() => scrollTo(btn.id)}
                className={`text-xs px-3 py-1.5 rounded-xl border transition-all cursor-pointer font-medium ${
                  activeSection === btn.id
                    ? "bg-blue-600 text-white border-blue-500 shadow-sm"
                    : "bg-[#253745]/70 text-[#9BA8AB] border-[#4A5C6A]/40 hover:text-white hover:bg-[#253745]"
                }`}
              >
                {btn.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ─── Main Content Container ─── */}
      <main className="max-w-5xl mx-auto px-4 sm:px-8 py-10 space-y-16">

        {/* ─── SEÇÃO 1: PRIMEIRO ACESSO & LOGIN ─── */}
        <section id="primeiros-passos" className="space-y-6 scroll-mt-20">
          <div className="border-b border-[#253745] pb-3 flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-blue-600/20 text-blue-400 flex items-center justify-center font-bold text-sm">
              1
            </div>
            <div>
              <h3 className="text-xl font-bold text-white">Primeiro Acesso & Login</h3>
              <p className="text-xs text-[#9BA8AB]">Como entrar no sistema e configurar seu acesso</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-5 rounded-2xl bg-[#11212D] border border-[#253745] space-y-3">
              <div className="p-2.5 w-fit rounded-xl bg-blue-500/10 text-blue-400">
                <Users className="h-5 w-5" />
              </div>
              <h4 className="text-sm font-bold text-white">1. Receba seu Usuário</h4>
              <p className="text-xs text-[#9BA8AB] leading-relaxed">
                A coordenação ou TI irá fornecer seu e-mail de acesso (geralmente seu e-mail corporativo ou nome de operador) e sua senha inicial.
              </p>
            </div>

            <div className="p-5 rounded-2xl bg-[#11212D] border border-[#253745] space-y-3">
              <div className="p-2.5 w-fit rounded-xl bg-emerald-500/10 text-emerald-400">
                <KeyRound className="h-5 w-5" />
              </div>
              <h4 className="text-sm font-bold text-white">2. Como Alterar sua Senha</h4>
              <p className="text-xs text-[#9BA8AB] leading-relaxed">
                No menu lateral, no rodapé onde aparece o seu nome, existe a opção de alterar senha. Escolha uma senha segura e fácil de você lembrar.
              </p>
            </div>

            <div className="p-5 rounded-2xl bg-[#11212D] border border-[#253745] space-y-3">
              <div className="p-2.5 w-fit rounded-xl bg-purple-500/10 text-purple-400">
                <Monitor className="h-5 w-5" />
              </div>
              <h4 className="text-sm font-bold text-white">3. Tela Inicial</h4>
              <p className="text-xs text-[#9BA8AB] leading-relaxed">
                Ao entrar, você verá o quadro com os trabalhos do seu setor. O sistema atualiza sozinho — você não precisa ficar apertando F5 na página.
              </p>
            </div>
          </div>
        </section>

        {/* ─── SEÇÃO 2: O QUE É O QUADRO KABAN ─── */}
        <section id="o-que-e-kanban" className="space-y-6 scroll-mt-20">
          <div className="border-b border-[#253745] pb-3 flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-blue-600/20 text-blue-400 flex items-center justify-center font-bold text-sm">
              2
            </div>
            <div>
              <h3 className="text-xl font-bold text-white">O que é o Quadro Kaban e Como Ele Funciona</h3>
              <p className="text-xs text-[#9BA8AB]">Como a fábrica inteira enxerga o ritmo do trabalho</p>
            </div>
          </div>

          <div className="p-6 rounded-2xl bg-[#11212D] border border-[#253745] space-y-4">
            <p className="text-sm text-[#CCD0CF] leading-relaxed">
              O Kaban funciona como um grande painel visual dividido em <strong>colunas</strong>. Cada coluna representa uma etapa do trabalho:
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 pt-2">
              <div className="p-4 rounded-xl bg-[#06141B] border border-blue-500/30 text-center space-y-1">
                <span className="text-[10px] font-bold text-blue-400 uppercase tracking-wider">Passo 1</span>
                <h5 className="text-sm font-bold text-white">Entrada</h5>
                <p className="text-xs text-[#9BA8AB]">Trabalho que acabou de chegar para o seu setor.</p>
              </div>

              <div className="p-4 rounded-xl bg-[#06141B] border border-amber-500/30 text-center space-y-1">
                <span className="text-[10px] font-bold text-amber-400 uppercase tracking-wider">Passo 2</span>
                <h5 className="text-sm font-bold text-white">Em Execução</h5>
                <p className="text-xs text-[#9BA8AB]">Você puxou o trabalho e está executando agora.</p>
              </div>

              <div className="p-4 rounded-xl bg-[#06141B] border border-purple-500/30 text-center space-y-1">
                <span className="text-[10px] font-bold text-purple-400 uppercase tracking-wider">Passo 3</span>
                <h5 className="text-sm font-bold text-white">Aguardando / Pausa</h5>
                <p className="text-xs text-[#9BA8AB]">Esperando aprovação do cliente ou insumo.</p>
              </div>

              <div className="p-4 rounded-xl bg-[#06141B] border border-emerald-500/30 text-center space-y-1">
                <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider">Passo 4</span>
                <h5 className="text-sm font-bold text-white">Saída</h5>
                <p className="text-xs text-[#9BA8AB]">Pronto para seguir para o próximo setor da fábrica.</p>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-blue-500/10 border border-blue-500/20 text-xs text-blue-200 flex items-center gap-2.5">
              <Sparkles className="h-4 w-4 text-blue-400 shrink-0" />
              <span>
                <strong>Lógica simples:</strong> Os trabalhos sempre entram pela esquerda e caminham para a direita conforme você vai realizando cada tarefa.
              </span>
            </div>
          </div>
        </section>

        {/* ─── SEÇÃO 3: ANATOMIA DE UM CARD DE O.S. ─── */}
        <section id="anatomia-card" className="space-y-6 scroll-mt-20">
          <div className="border-b border-[#253745] pb-3 flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-blue-600/20 text-blue-400 flex items-center justify-center font-bold text-sm">
              3
            </div>
            <div>
              <h3 className="text-xl font-bold text-white">Entendendo o Card da O.S.</h3>
              <p className="text-xs text-[#9BA8AB]">O que significa cada pedaço de informação dentro do cartão</p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Mock Visual do Card */}
            <div className="lg:col-span-5 p-5 rounded-2xl bg-[#11212D] border border-blue-500/40 shadow-xl space-y-3.5">
              <div className="flex items-center justify-between">
                <Badge className="bg-rose-500/20 text-rose-400 border border-rose-500/40 text-[10px] font-bold uppercase tracking-wider">
                  URGENTE
                </Badge>
                <span className="text-[11px] text-amber-400 font-bold flex items-center gap-1 font-mono-tech">
                  <Clock className="h-3 w-3" />
                  Entrega: Hoje 17:00
                </span>
              </div>

              <div>
                <span className="text-xs font-mono-tech text-[#9BA8AB] block font-bold">O.S. #73677</span>
                <h4 className="text-base font-black text-white uppercase leading-tight mt-0.5">
                  COLEGIO BURITIS AGOSTINIANO
                </h4>
                <p className="text-xs text-[#CCD0CF] mt-1">
                  64 LIVROS - 1º Ano - Receitas Para a Vida (Tiragem: 200 un)
                </p>
              </div>

              <div className="pt-2 border-t border-[#253745] flex items-center justify-between text-xs text-[#9BA8AB]">
                <span>Vendedor: <strong>Wellington</strong></span>
                <span>Operador: <strong>André</strong></span>
              </div>

              <div className="p-2.5 rounded-xl bg-[#06141B] border border-[#253745] text-[11px] text-[#9BA8AB]">
                💬 <em>&quot;Atenção com a dobra do caderno 3&quot;</em>
              </div>
            </div>

            {/* Explicação dos Campos */}
            <div className="lg:col-span-7 space-y-3 text-xs leading-relaxed">
              <div className="p-3.5 rounded-xl bg-[#11212D] border border-[#253745] flex items-start gap-3">
                <div className="w-5 h-5 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center font-bold shrink-0 mt-0.5">A</div>
                <div>
                  <strong className="text-white block text-sm">Número da O.S. & Cliente:</strong>
                  Identifica o serviço. O número da O.S. é único. Sempre que você conversar com outro colega ou encarregado, use esse número como referência.
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-[#11212D] border border-[#253745] flex items-start gap-3">
                <div className="w-5 h-5 rounded-full bg-rose-500/20 text-rose-400 flex items-center justify-center font-bold shrink-0 mt-0.5">B</div>
                <div>
                  <strong className="text-white block text-sm">Selo URGENTE (Vermelho):</strong>
                  Trabalhos com essa marcação têm prioridade máxima. Eles devem passar na frente de outros serviços nas máquinas e bancadas.
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-[#11212D] border border-[#253745] flex items-start gap-3">
                <div className="w-5 h-5 rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center font-bold shrink-0 mt-0.5">C</div>
                <div>
                  <strong className="text-white block text-sm">Data e Hora de Entrega:</strong>
                  Informa quando o cliente precisa receber o material. Fique atento para não deixar o horário estourar.
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-[#11212D] border border-[#253745] flex items-start gap-3">
                <div className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold shrink-0 mt-0.5">D</div>
                <div>
                  <strong className="text-white block text-sm">Observações e Avisos:</strong>
                  Informações técnicas deixadas pelo Comercial, Pré-Impressão ou operador anterior sobre como o produto deve ser executado.
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ─── SEÇÃO 4: COMO MOVER E ATUALIZAR ─── */}
        <section id="como-mover-atualizar" className="space-y-6 scroll-mt-20">
          <div className="border-b border-[#253745] pb-3 flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-blue-600/20 text-blue-400 flex items-center justify-center font-bold text-sm">
              4
            </div>
            <div>
              <h3 className="text-xl font-bold text-white">Como Mover e Atualizar o Trabalho</h3>
              <p className="text-xs text-[#9BA8AB]">As ações básicas que você fará centenas de vezes no dia</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            <div className="p-5 rounded-2xl bg-[#11212D] border border-[#253745] space-y-3">
              <div className="p-2.5 w-fit rounded-xl bg-blue-500/10 text-blue-400">
                <MousePointerClick className="h-5 w-5" />
              </div>
              <h4 className="text-sm font-bold text-white">1. Clicar para Abrir</h4>
              <p className="text-xs text-[#9BA8AB] leading-relaxed">
                Dê um clique em cima do card da O.S. Uma tela com todas as informações completas vai se abrir, mostrando arquivos anexados, histórico de alterações e detalhes.
              </p>
            </div>

            <div className="p-5 rounded-2xl bg-[#11212D] border border-[#253745] space-y-3">
              <div className="p-2.5 w-fit rounded-xl bg-amber-500/10 text-amber-400">
                <MoveRight className="h-5 w-5" />
              </div>
              <h4 className="text-sm font-bold text-white">2. Arrastar de Coluna</h4>
              <p className="text-xs text-[#9BA8AB] leading-relaxed">
                Você pode clicar no card, segurar e arrastar para a coluna ao lado (ex: de <em>Entrada</em> para <em>Produção</em>). Isso avisa toda a fábrica que o serviço começou.
              </p>
            </div>

            <div className="p-5 rounded-2xl bg-[#11212D] border border-[#253745] space-y-3">
              <div className="p-2.5 w-fit rounded-xl bg-emerald-500/10 text-emerald-400">
                <CheckCircle2 className="h-5 w-5" />
              </div>
              <h4 className="text-sm font-bold text-white">3. Concluir sua Etapa</h4>
              <p className="text-xs text-[#9BA8AB] leading-relaxed">
                Ao terminar o trabalho, mova para a última coluna (<em>Saída</em>) ou clique no botão de enviar para o próximo setor. Nunca deixe o trabalho concluído parado na coluna de produção.
              </p>
            </div>
          </div>
        </section>

        {/* ─── SEÇÃO 5: COMO BUSCAR TRABALHOS ─── */}
        <section id="como-buscar" className="space-y-6 scroll-mt-20">
          <div className="border-b border-[#253745] pb-3 flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-blue-600/20 text-blue-400 flex items-center justify-center font-bold text-sm">
              5
            </div>
            <div>
              <h3 className="text-xl font-bold text-white">Como Buscar e Encontrar Qualquer O.S.</h3>
              <p className="text-xs text-[#9BA8AB]">Encontre um trabalho em menos de 2 segundos</p>
            </div>
          </div>

          <div className="p-6 rounded-2xl bg-[#11212D] border border-[#253745] space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-4 rounded-xl bg-[#06141B] border border-[#253745] space-y-2">
                <div className="flex items-center gap-2 text-white font-bold text-sm">
                  <Search className="h-4 w-4 text-blue-400" />
                  Barra de Pesquisa no Topo
                </div>
                <p className="text-xs text-[#9BA8AB] leading-relaxed">
                  Basta digitar o número da O.S. (ex: <code className="text-blue-400">73677</code>) ou o nome do cliente. O quadro filtra na hora apenas os cards correspondentes.
                </p>
              </div>

              <div className="p-4 rounded-xl bg-[#06141B] border border-[#253745] space-y-2">
                <div className="flex items-center gap-2 text-white font-bold text-sm">
                  <Flame className="h-4 w-4 text-rose-400" />
                  Filtro de Urgentes
                </div>
                <p className="text-xs text-[#9BA8AB] leading-relaxed">
                  Ao lado da barra de busca existe um botão com triângulo vermelho &quot;Urgentes&quot;. Clique nele para ver somente o que precisa de atenção imediata.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* ─── SEÇÃO 6: SEU SETOR NO FLUXO DA FÁBRICA ─── */}
        <section id="fluxo-setores" className="space-y-6 scroll-mt-20">
          <div className="border-b border-[#253745] pb-3 flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-blue-600/20 text-blue-400 flex items-center justify-center font-bold text-sm">
              6
            </div>
            <div>
              <h3 className="text-xl font-bold text-white">Como os Setores se Conectam</h3>
              <p className="text-xs text-[#9BA8AB]">Entenda de quem você recebe o trabalho e para quem você passa</p>
            </div>
          </div>

          <div className="space-y-3">
            {[
              {
                setor: "Comercial / Atendimento",
                icon: ClipboardList,
                recebe: "Recebe o pedido do cliente",
                faz: "Abre a O.S. com dados, tiragem, prazos e anexa os arquivos.",
                passaPara: "Pré-Impressão",
                cor: "text-purple-400",
                bg: "bg-purple-500/10 border-purple-500/30"
              },
              {
                setor: "Pré-Impressão",
                icon: Monitor,
                recebe: "Recebe a O.S. do Comercial",
                faz: "Analisa o arquivo, confere sangrias, monta folha, gera prova para aprovação do cliente e confere os 13 itens de segurança.",
                passaPara: "CTP (Matrizes) ou Digital",
                cor: "text-blue-400",
                bg: "bg-blue-500/10 border-blue-500/30"
              },
              {
                setor: "CTP (Computer-to-Plate)",
                icon: Layers,
                recebe: "Recebe os arquivos liberados da Pré-Impressão",
                faz: "Grava as chapas térmicas no laser com encaixes perfeitos para as impressoras offset.",
                passaPara: "Impressão Offset / Chão de Fábrica",
                cor: "text-amber-400",
                bg: "bg-amber-500/10 border-amber-500/30"
              },
              {
                setor: "Chão de Fábrica (Impressão & Acabamento)",
                icon: Factory,
                recebe: "Recebe as chapas e o papel cortado",
                faz: "Imprime, dobra, alceia, grampeia, cola lombada, faz corte & vinco e empacota os volumes.",
                passaPara: "Inspeção & Qualidade",
                cor: "text-orange-400",
                bg: "bg-orange-500/10 border-orange-500/30"
              },
              {
                setor: "Inspeção & Qualidade",
                icon: ShieldCheck,
                recebe: "Recebe os produtos finalizados do acabamento",
                faz: "Confere a contagem, inspeciona defeitos e gera as etiquetas de embalagem identificando os pacotes.",
                passaPara: "Expedição",
                cor: "text-emerald-400",
                bg: "bg-emerald-500/10 border-emerald-500/30"
              },
              {
                setor: "Expedição & Entregas",
                icon: Truck,
                recebe: "Recebe os pacotes conferidos e etiquetados",
                faz: "Organiza os romaneios, despacha via moto/carro ou entrega no balcão e colhe o comprovante assinado.",
                passaPara: "Cliente Final (O.S. Concluída)",
                cor: "text-cyan-400",
                bg: "bg-cyan-500/10 border-cyan-500/30"
              }
            ].map((s, idx) => {
              const Icon = s.icon;
              return (
                <div key={idx} className={`p-4 rounded-2xl border ${s.bg} flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 text-xs`}>
                  <div className="flex items-center gap-3">
                    <div className={`p-2.5 rounded-xl bg-[#06141B] ${s.cor}`}>
                      <Icon className="h-5 w-5" />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-white">{s.setor}</h4>
                      <p className="text-[#9BA8AB] mt-0.5">{s.faz}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0 bg-[#06141B]/70 px-3 py-1.5 rounded-xl border border-[#253745]">
                    <span className="text-[10px] text-[#9BA8AB] uppercase">Passa para:</span>
                    <strong className="text-white text-xs">{s.passaPara}</strong>
                    <ArrowRight className="h-3.5 w-3.5 text-blue-400" />
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* ─── SEÇÃO 7: REGRAS DE OURO DA FÁBRICA ─── */}
        <section id="regras-ouro" className="space-y-6 scroll-mt-20">
          <div className="border-b border-[#253745] pb-3 flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-blue-600/20 text-blue-400 flex items-center justify-center font-bold text-sm">
              7
            </div>
            <div>
              <h3 className="text-xl font-bold text-white">Regras de Ouro da Primacor</h3>
              <p className="text-xs text-[#9BA8AB]">Boas práticas para o trabalho fluir sem erros nem retrabalho</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-5 rounded-2xl bg-[#11212D] border border-emerald-500/30 space-y-2 text-xs">
              <div className="flex items-center gap-2 text-emerald-400 font-bold text-sm">
                <Check className="h-4 w-4 stroke-[3]" />
                Regra 1: Mantenha seu quadro atualizado
              </div>
              <p className="text-[#9BA8AB] leading-relaxed">
                Se você começou a trabalhar em uma O.S., arraste para a coluna de andamento. Se terminou, passe adiante. Quando o sistema está atualizado, ninguém precisa ficar gritando pelo galpão perguntando onde está o serviço.
              </p>
            </div>

            <div className="p-5 rounded-2xl bg-[#11212D] border border-emerald-500/30 space-y-2 text-xs">
              <div className="flex items-center gap-2 text-emerald-400 font-bold text-sm">
                <Check className="h-4 w-4 stroke-[3]" />
                Regra 2: Leia sempre as observações do card
              </div>
              <p className="text-[#9BA8AB] leading-relaxed">
                Antes de colocar papel na máquina ou dobrar um impresso, leia as anotações do card. Detalhes como tipo de dobra, cor de verniz ou embalagem especial sempre ficam anotados ali.
              </p>
            </div>

            <div className="p-5 rounded-2xl bg-[#11212D] border border-amber-500/30 space-y-2 text-xs">
              <div className="flex items-center gap-2 text-amber-400 font-bold text-sm">
                <AlertTriangle className="h-4 w-4" />
                Regra 3: Na dúvida, nunca adivinhe
              </div>
              <p className="text-[#9BA8AB] leading-relaxed">
                Se uma arte parecer estranha, faltar papel ou o texto parecer cortado, pause o trabalho e fale imediatamente com o encarregado ou a pré-impressão. É melhor tirar a dúvida em 1 minuto do que perder um milheiro de papel.
              </p>
            </div>

            <div className="p-5 rounded-2xl bg-[#11212D] border border-rose-500/30 space-y-2 text-xs">
              <div className="flex items-center gap-2 text-rose-400 font-bold text-sm">
                <Flame className="h-4 w-4" />
                Regra 4: Urgência é prioridade absoluta
              </div>
              <p className="text-[#9BA8AB] leading-relaxed">
                Trabalhos com etiqueta vermelha de URGÊNCIA foram combinados com a diretoria ou cliente para sair imediatamente. Coloque-os na frente das outras tarefas da bancada.
              </p>
            </div>
          </div>
        </section>

      </main>

      {/* ─── Footer ─── */}
      <footer className="border-t border-[#253745] bg-[#11212D] py-8 px-4 sm:px-8 text-center text-xs text-[#9BA8AB] mt-12">
        <div className="max-w-5xl mx-auto space-y-2">
          <p className="font-bold text-white">Primacor Gráfica e Editora LTDA — Sistema Kaban</p>
          <p>Manual de Integração e Onboarding do Colaborador • Acesso direto via <code>/tutorial</code></p>
        </div>
      </footer>
    </div>
  );
}
