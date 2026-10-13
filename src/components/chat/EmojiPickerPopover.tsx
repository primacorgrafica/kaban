import { useState, useMemo } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Smile, Search } from "lucide-react";

interface EmojiItem {
  emoji: string;
  name: string;
  keywords: string[];
}

interface EmojiCategory {
  id: string;
  label: string;
  icon: string;
  emojis: EmojiItem[];
}

const EMOJI_CATEGORIES: EmojiCategory[] = [
  {
    id: "smileys",
    label: "Expressões",
    icon: "😀",
    emojis: [
      { emoji: "😀", name: "sorriso", keywords: ["alegre", "feliz", "smile"] },
      { emoji: "😃", name: "riso aberto", keywords: ["feliz", "alegre"] },
      { emoji: "😄", name: "sorriso olhos fechados", keywords: ["contente"] },
      { emoji: "😁", name: "sorrisão", keywords: ["dentes", "radiante"] },
      { emoji: "😆", name: "gargalhada", keywords: ["rir", "haha"] },
      { emoji: "😂", name: "rindo até chorar", keywords: ["rir", "chorando", "lol"] },
      { emoji: "🤣", name: "rolando de rir", keywords: ["rir", "engraçado"] },
      { emoji: "😊", name: "sorriso tímido", keywords: ["fofo", "gentil"] },
      { emoji: "😇", name: "anjo", keywords: ["inocente", "auréola"] },
      { emoji: "🙂", name: "sorriso suave", keywords: ["ok", "tranquilo"] },
      { emoji: "😉", name: "piscadela", keywords: ["piscar", "cumplicidade"] },
      { emoji: "😍", name: "olhos de coração", keywords: ["amor", "amei"] },
      { emoji: "🥰", name: "rosto apaixonado", keywords: ["carinho", "amor"] },
      { emoji: "😘", name: "beijo", keywords: ["beijinho", "afeto"] },
      { emoji: "😋", name: "delícia", keywords: ["gostoso", "língua"] },
      { emoji: "😎", name: "óculos escuros", keywords: ["estiloso", "top"] },
      { emoji: "🤓", name: "nerd", keywords: ["estudo", "óculos"] },
      { emoji: "🧐", name: "monóculo", keywords: ["analisando", "investigando"] },
      { emoji: "🤔", name: "pensativo", keywords: ["dúvida", "pensar"] },
      { emoji: "🤫", name: "silêncio", keywords: ["segredo", "quieto"] },
      { emoji: "🫡", name: "continência", keywords: ["sim senhor", "respeito", "entendido"] },
      { emoji: "🤐", name: "boca fechada", keywords: ["silêncio"] },
      { emoji: "🤨", name: "desconfiado", keywords: ["estranho"] },
      { emoji: "😐", name: "neutro", keywords: ["sem graça", "sério"] },
      { emoji: "😑", name: "sem expressão", keywords: ["cansado"] },
      { emoji: "😶", name: "sem boca", keywords: ["mudo"] },
      { emoji: "😏", name: "irônico", keywords: ["espertinho"] },
      { emoji: "😒", name: "desapontado", keywords: ["chateado"] },
      { emoji: "🙄", name: "olhos revirados", keywords: ["tédio", "saco"] },
      { emoji: "😬", name: "careta", keywords: ["nervoso", "climão"] },
      { emoji: "😮‍💨", name: "suspiro", keywords: ["alívio", "ufa"] },
      { emoji: "😴", name: "dormindo", keywords: ["sono", "zz"] },
    ],
  },
  {
    id: "gestures",
    label: "Gestos & Pessoas",
    icon: "👍",
    emojis: [
      { emoji: "👍", name: "joinha", keywords: ["legal", "positivo", "ok", "concordo"] },
      { emoji: "👎", name: "negativo", keywords: ["ruim", "desaprovo"] },
      { emoji: "👌", name: "perfeito", keywords: ["ok", "certo"] },
      { emoji: "✌️", name: "paz e amor", keywords: ["dois", "vitória"] },
      { emoji: "🤞", name: "dedos cruzados", keywords: ["sorte", "esperança"] },
      { emoji: "🤟", name: "te amo", keywords: ["rock", "amor"] },
      { emoji: "🤘", name: "rock on", keywords: ["música", "metal"] },
      { emoji: "🤙", name: "hang loose", keywords: ["suave", "liga nós"] },
      { emoji: "👈", name: "apontar esquerda", keywords: ["esquerda", "olha"] },
      { emoji: "👉", name: "apontar direita", keywords: ["direita", "olha"] },
      { emoji: "👆", name: "apontar cima", keywords: ["acima"] },
      { emoji: "👇", name: "apontar baixo", keywords: ["abaixo"] },
      { emoji: "☝️", name: "um momento", keywords: ["atenção"] },
      { emoji: "✋", name: "mão levantada", keywords: ["pare", "alto lá"] },
      { emoji: "🤚", name: "costas da mão", keywords: ["oi"] },
      { emoji: "🖐️", name: "mão aberta", keywords: ["cinco"] },
      { emoji: "👋", name: "tchau", keywords: ["olá", "aceno", "adeus"] },
      { emoji: "👏", name: "palmas", keywords: ["parabéns", "aplauso", "show"] },
      { emoji: "🤝", name: "aperto de mãos", keywords: ["fechado", "acordo", "parceria"] },
      { emoji: "🙌", name: "mãos para o alto", keywords: ["comemorar", "amém"] },
      { emoji: "👐", name: "mãos abertas", keywords: ["abraço"] },
      { emoji: "🤲", name: "palmas unidas", keywords: ["prece"] },
      { emoji: "🙏", name: "por favor", keywords: ["obrigado", "gratidão", "amém", "rezar"] },
      { emoji: "💪", name: "força", keywords: ["músculo", "foco", "vamos", "forte"] },
      { emoji: "🦾", name: "braço robótico", keywords: ["tecnologia"] },
    ],
  },
  {
    id: "symbols",
    label: "Símbolos & Cores",
    icon: "❤️",
    emojis: [
      { emoji: "❤️", name: "coração vermelho", keywords: ["amor", "coração"] },
      { emoji: "🧡", name: "coração laranja", keywords: ["amizade"] },
      { emoji: "💛", name: "coração amarelo", keywords: ["alegria"] },
      { emoji: "💚", name: "coração verde", keywords: ["esperança", "produção"] },
      { emoji: "💙", name: "coração azul", keywords: ["primacor", "lealdade"] },
      { emoji: "💜", name: "coração roxo", keywords: ["respeito"] },
      { emoji: "🖤", name: "coração preto", keywords: ["elegante"] },
      { emoji: "🤍", name: "coração branco", keywords: ["paz"] },
      { emoji: "💔", name: "coração partido", keywords: ["triste"] },
      { emoji: "🔥", name: "fogo", keywords: ["urgente", "chama", "top", "quente"] },
      { emoji: "✨", name: "brilho", keywords: ["mágico", "novo", "destaque"] },
      { emoji: "⭐", name: "estrela", keywords: ["favorito", "nota dez"] },
      { emoji: "🌟", name: "estrela brilhante", keywords: ["excelente"] },
      { emoji: "💥", name: "explosão", keywords: ["impacto", "bum"] },
      { emoji: "💯", name: "cem por cento", keywords: ["perfeito", "100"] },
      { emoji: "💢", name: "raiva", keywords: ["irritação"] },
      { emoji: "✔️", name: "check", keywords: ["concluído", "certo", "ok"] },
      { emoji: "✅", name: "check verde", keywords: ["aprovado", "feito"] },
      { emoji: "❌", name: "xis", keywords: ["errado", "cancelado", "não"] },
      { emoji: "⚠️", name: "aviso", keywords: ["atenção", "perigo", "alerta"] },
      { emoji: "🚨", name: "sirene", keywords: ["emergência", "urgência"] },
      { emoji: "⚡", name: "raio", keywords: ["rápido", "energia", "express"] },
    ],
  },
  {
    id: "objects",
    label: "Gráfica & Escritório",
    icon: "🖨️",
    emojis: [
      { emoji: "🖨️", name: "impressora", keywords: ["impressão", "print", "offset"] },
      { emoji: "📄", name: "folha de papel", keywords: ["documento", "arquivo"] },
      { emoji: "📑", name: "marcadores", keywords: ["folhas", "ordem"] },
      { emoji: "📦", name: "caixa", keywords: ["embalagem", "pacote", "entrega"] },
      { emoji: "📫", name: "caixa de correio", keywords: ["mensagem", "correio"] },
      { emoji: "🚚", name: "caminhão", keywords: ["expedição", "transporte", "entrega"] },
      { emoji: "🛵", name: "motoboy", keywords: ["moto", "entrega rápida"] },
      { emoji: "⏱️", name: "cronômetro", keywords: ["prazo", "tempo"] },
      { emoji: "⏰", name: "despertador", keywords: ["horário", "alerta"] },
      { emoji: "📅", name: "calendário", keywords: ["data", "agendamento"] },
      { emoji: "📌", name: "alfinete", keywords: ["fixar", "lembrete"] },
      { emoji: "📎", name: "clipe", keywords: ["anexo", "prender"] },
      { emoji: "✂️", name: "tesoura", keywords: ["corte", "refile", "acabamento"] },
      { emoji: "📏", name: "régua", keywords: ["medida", "tamanho", "gabarito"] },
      { emoji: "🎨", name: "paleta de cores", keywords: ["cmyk", "pantone", "design"] },
      { emoji: "🖋️", name: "caneta", keywords: ["assinatura", "aprovação"] },
      { emoji: "🔒", name: "cadeado fechado", keywords: ["seguro", "privado"] },
      { emoji: "🔓", name: "cadeado aberto", keywords: ["liberado"] },
      { emoji: "💬", name: "balão de fala", keywords: ["conversa", "chat"] },
    ],
  },
];

interface EmojiPickerPopoverProps {
  onSelectEmoji: (emoji: string) => void;
  trigger?: React.ReactNode;
}

export function EmojiPickerPopover({ onSelectEmoji, trigger }: EmojiPickerPopoverProps) {
  const [open, setOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("smileys");

  // Filtro de busca
  const filteredEmojis = useMemo(() => {
    if (!searchTerm.trim()) {
      const cat = EMOJI_CATEGORIES.find((c) => c.id === selectedCategory);
      return cat ? cat.emojis : EMOJI_CATEGORIES[0].emojis;
    }

    const term = searchTerm.toLowerCase();
    const results: EmojiItem[] = [];

    EMOJI_CATEGORIES.forEach((cat) => {
      cat.emojis.forEach((item) => {
        if (
          item.name.toLowerCase().includes(term) ||
          item.keywords.some((k) => k.toLowerCase().includes(term))
        ) {
          results.push(item);
        }
      });
    });

    return results;
  }, [searchTerm, selectedCategory]);

  const handleSelect = (emoji: string) => {
    onSelectEmoji(emoji);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {trigger || (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-slate-400 hover:text-cyan-400 hover:bg-cyan-500/10 rounded-lg transition-colors"
            title="Inserir Emoji"
          >
            <Smile className="h-5 w-5" />
          </Button>
        )}
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align="start"
        className="w-72 sm:w-80 p-3 bg-popover backdrop-blur-xl border border-border text-popover-foreground rounded-2xl shadow-2xl z-50 animate-in fade-in zoom-in-95"
      >
        {/* Search */}
        <div className="relative mb-2.5">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Buscar emoji..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-8 h-8 text-xs bg-muted/50 border-input text-foreground placeholder:text-muted-foreground rounded-xl"
            autoFocus
          />
        </div>

        {/* Categories Bar */}
        {!searchTerm && (
          <div className="flex items-center gap-1 border-b border-border pb-2 mb-2 overflow-x-auto scrollbar-none">
            {EMOJI_CATEGORIES.map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => setSelectedCategory(cat.id)}
                className={`p-1.5 text-base rounded-lg transition-all ${
                  selectedCategory === cat.id
                    ? "bg-cyan-500/20 ring-1 ring-cyan-500/40 scale-110"
                    : "opacity-60 hover:opacity-100 hover:bg-accent"
                }`}
                title={cat.label}
              >
                {cat.icon}
              </button>
            ))}
          </div>
        )}

        {/* Emoji Grid */}
        <div className="grid grid-cols-7 gap-1 max-h-48 overflow-y-auto p-1 scrollbar-thin">
          {filteredEmojis.length === 0 ? (
            <div className="col-span-7 py-6 text-center text-xs text-slate-500">
              Nenhum emoji encontrado
            </div>
          ) : (
            filteredEmojis.map((item, idx) => (
              <button
                key={`${item.emoji}-${idx}`}
                type="button"
                onClick={() => handleSelect(item.emoji)}
                className="h-8 w-8 text-lg flex items-center justify-center rounded-lg hover:bg-cyan-500/20 hover:scale-125 transition-transform"
                title={item.name}
              >
                {item.emoji}
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
