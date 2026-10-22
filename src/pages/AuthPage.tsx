import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  ShieldCheck,
  ArrowRight,
  Lock,
  Mail,
  Eye,
  EyeOff,
  Activity,
  Cpu,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import logoImg from "@/assets/logo-sidebar.png";

/**
 * Minimalist, ultra-modern drifting particles canvas
 * Rendered at z-0 with crisp Nordic Slate tones (#CCD0CF / #9BA8AB)
 */
function MinimalParticles() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animationFrameId: number;
    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    const handleResize = () => {
      if (!canvas) return;
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    };
    window.addEventListener("resize", handleResize);

    // Responsive particle count with pleasant density
    const count = Math.min(Math.floor((width * height) / 16000), 75);
    const particles = Array.from({ length: Math.max(count, 45) }, () => ({
      x: Math.random() * width,
      y: Math.random() * height,
      vx: (Math.random() - 0.5) * 0.4,
      vy: (Math.random() - 0.5) * 0.4,
      radius: Math.random() * 1.8 + 1.2,
      baseAlpha: Math.random() * 0.35 + 0.45,
      color: Math.random() > 0.35 ? "204, 208, 207" : "155, 168, 171",
      pulseSpeed: Math.random() * 0.02 + 0.01,
      pulse: Math.random() * Math.PI * 2,
    }));

    let mouseX = -1000;
    let mouseY = -1000;
    const handleMouseMove = (e: MouseEvent) => {
      mouseX = e.clientX;
      mouseY = e.clientY;
    };
    window.addEventListener("mousemove", handleMouseMove);

    const render = () => {
      ctx.clearRect(0, 0, width, height);

      // Minimalist constellation links
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dx = particles[i].x - particles[j].x;
          const dy = particles[i].y - particles[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 125) {
            const alpha = (1 - dist / 125) * 0.22;
            ctx.strokeStyle = `rgba(155, 168, 171, ${alpha})`;
            ctx.lineWidth = 0.75;
            ctx.beginPath();
            ctx.moveTo(particles[i].x, particles[i].y);
            ctx.lineTo(particles[j].x, particles[j].y);
            ctx.stroke();
          }
        }
      }

      // Draw floating minimalist particles
      for (const p of particles) {
        p.x += p.vx;
        p.y += p.vy;
        p.pulse += p.pulseSpeed;

        if (p.x < 0) p.x = width;
        else if (p.x > width) p.x = 0;
        if (p.y < 0) p.y = height;
        else if (p.y > height) p.y = 0;

        // Gentle interactive mouse drift
        const mdx = p.x - mouseX;
        const mdy = p.y - mouseY;
        const mdist = Math.sqrt(mdx * mdx + mdy * mdy);
        if (mdist < 120 && mdist > 0) {
          const force = (1 - mdist / 120) * 0.9;
          p.x += (mdx / mdist) * force;
          p.y += (mdy / mdist) * force;
        }

        const currentAlpha = Math.min(1, Math.max(0.25, p.baseAlpha + Math.sin(p.pulse) * 0.15));
        ctx.fillStyle = `rgba(${p.color}, ${currentAlpha})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fill();
      }

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("mousemove", handleMouseMove);
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none fixed inset-0 z-0 h-full w-full"
    />
  );
}

const SHOWCASE_SLIDES = [
  {
    icon: ShieldCheck,
    tag: "SEGURANÇA & INTEGRIDADE",
    title: "Chão de Fábrica & Pré-Impressão",
    description:
      "Acompanhamento ponta a ponta do fluxo de O.S., controle rigoroso de facas, clichês e liberação de provas digitais.",
  },
  {
    icon: Activity,
    tag: "TELEMETRIA EM TEMPO REAL",
    title: "Monitoramento Operacional PCP",
    description:
      "Controle instantâneo de tempos acumulados por máquina, carga de produção e prevenção proativa de gargalos.",
  },
  {
    icon: Cpu,
    tag: "INTEGRAÇÃO CORPORATIVA",
    title: "SharePoint & E-mail Automatizado",
    description:
      "Sincronização corporativa de arquivos gráficos, detecção automática de respostas de clientes e auditoria de revisões.",
  },
];

export default function AuthPage() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [currentSlide, setCurrentSlide] = useState(0);

  // Auto-advance showcase slide every 6 seconds
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % SHOWCASE_SLIDES.length);
    }, 6000);
    return () => clearInterval(timer);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) {
      toast.error("Preencha todos os campos");
      return;
    }
    setLoading(true);
    const { error } = await signIn(email, password);
    setLoading(false);
    if (error) {
      toast.error(error.message);
    }
  };

  const activeSlideData = SHOWCASE_SLIDES[currentSlide];
  const ActiveSlideIcon = activeSlideData.icon;

  return (
    <div className="relative min-h-screen w-full flex items-center justify-center p-3 sm:p-6 lg:p-10 overflow-hidden bg-[#06141B] selection:bg-[#253745] selection:text-[#CCD0CF]">
      {/* Background Interactive Minimalist Particle Network (at z-0) */}
      <MinimalParticles />

      {/* Deep ambient glow orbs at z-0 matching Nordic Slate palette */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden select-none z-0">
        <div className="absolute -top-32 left-1/4 h-[520px] w-[520px] rounded-full bg-[#253745]/25 blur-[140px]" />
        <div className="absolute bottom-10 right-1/4 h-[480px] w-[480px] rounded-full bg-[#11212D]/60 blur-[130px]" />
        <div className="absolute top-1/2 -right-20 h-[380px] w-[380px] rounded-full bg-[#4A5C6A]/20 blur-[120px]" />
      </div>

      {/* Main Split Screen Container (at z-10) */}
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 14 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
        className="relative w-full max-w-5xl rounded-[32px] border border-[#4A5C6A]/50 bg-[#11212D]/90 backdrop-blur-2xl shadow-[0_30px_90px_rgba(6,20,27,0.95)] overflow-hidden grid grid-cols-1 lg:grid-cols-12 z-10"
      >
        {/* Subtle top edge highlight line */}
        <div className="absolute top-0 left-0 right-0 h-[1.5px] bg-gradient-to-r from-transparent via-[#CCD0CF]/40 to-transparent z-20 pointer-events-none" />

        {/* LEFT COLUMN: Clean, Elegant Login Form */}
        <div className="lg:col-span-7 p-7 sm:p-10 lg:p-12 flex flex-col justify-between">
          <div>
            {/* Logo SEM CONTORNO, BEM DESTACADA E MAIOR */}
            <div className="flex items-center justify-between mb-8">
              <div className="flex items-center">
                <img
                  src={logoImg}
                  alt="Primacor Gráfica"
                  className="h-24 sm:h-28 md:h-32 w-auto object-contain filter drop-shadow-[0_12px_36px_rgba(0,0,0,0.85)] hover:scale-105 transition-transform duration-300"
                />
              </div>

              <span className="text-[10px] font-mono-tech px-2.5 py-1 rounded-full bg-[#253745] text-[#CCD0CF] border border-[#4A5C6A]/60 font-bold tracking-wider shadow-xs">
                OS V2.0
              </span>
            </div>

            {/* Header Titles */}
            <div className="mb-6">
              <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white font-sans">
                Acessar Sistema
              </h1>
              <p className="text-xs sm:text-sm text-[#9BA8AB] mt-1.5 leading-relaxed font-sans">
                Insira suas credenciais operacionais para gerenciar o fluxo gráfico.
              </p>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* E-mail Operacional */}
              <div className="space-y-1.5">
                <Label
                  htmlFor="email"
                  className="text-xs font-medium text-[#CCD0CF] flex items-center gap-1.5 font-sans"
                >
                  <Mail className="h-3.5 w-3.5 text-[#9BA8AB]" />
                  <span>E-mail Operacional</span>
                </Label>
                <div className="relative">
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="admin@primacorgrafica.com.br"
                    autoFocus
                    autoComplete="email"
                    className="h-11 bg-[#06141B]/70 border border-[#4A5C6A]/60 text-white placeholder:text-[#9BA8AB]/40 rounded-xl text-sm focus:border-[#CCD0CF] focus:ring-1 focus:ring-[#CCD0CF]/40 transition-all font-sans"
                  />
                </div>
              </div>

              {/* Senha de Acesso */}
              <div className="space-y-1.5">
                <Label
                  htmlFor="password"
                  className="text-xs font-medium text-[#CCD0CF] flex items-center gap-1.5 font-sans"
                >
                  <Lock className="h-3.5 w-3.5 text-[#9BA8AB]" />
                  <span>Senha de Acesso</span>
                </Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••••••"
                    autoComplete="current-password"
                    className="h-11 pr-10 bg-[#06141B]/70 border border-[#4A5C6A]/60 text-white placeholder:text-[#9BA8AB]/40 rounded-xl text-sm focus:border-[#CCD0CF] focus:ring-1 focus:ring-[#CCD0CF]/40 transition-all font-sans"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[#9BA8AB] hover:text-[#CCD0CF] transition-colors p-1"
                    title={showPassword ? "Ocultar senha" : "Exibir senha"}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {/* Submit Button */}
              <Button
                type="submit"
                disabled={loading}
                className="w-full h-12 rounded-xl font-extrabold text-sm bg-[#CCD0CF] hover:bg-white text-[#06141B] shadow-[0_8px_24px_rgba(204,208,207,0.2)] transition-all cursor-pointer mt-4"
              >
                {loading ? (
                  <span className="flex items-center gap-2">
                    <span className="w-4 h-4 border-2 border-[#06141B] border-t-transparent rounded-full animate-spin" />
                    Autenticando...
                  </span>
                ) : (
                  <span className="flex items-center justify-center gap-2 font-bold tracking-wide">
                    Entrar no Sistema <ArrowRight className="h-4 w-4" />
                  </span>
                )}
              </Button>
            </form>
          </div>

          {/* Form Footer */}
          <div className="pt-6 mt-6 border-t border-[#4A5C6A]/40 flex items-center justify-between text-xs text-[#9BA8AB]">
            <span className="flex items-center gap-1.5 text-[11px] font-sans">
              <ShieldCheck className="h-3.5 w-3.5 text-[#CCD0CF]" />
              Acessos gerenciados pela Administração
            </span>
            <span className="text-[10px] font-mono-tech hidden sm:inline">
              Primacor Gráfica © {new Date().getFullYear()}
            </span>
          </div>
        </div>

        {/* RIGHT COLUMN: Showcase Hero Panel in Nordic Slate Palette */}
        <div className="lg:col-span-5 p-7 sm:p-10 flex flex-col items-center justify-between relative bg-gradient-to-br from-[#11212D] via-[#253745]/70 to-[#06141B] border-t lg:border-t-0 lg:border-l border-[#4A5C6A]/50 overflow-hidden">
          {/* Internal ambient radial glow behind the floating card */}
          <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 rounded-full bg-[#4A5C6A]/30 blur-[80px] pointer-events-none" />

          {/* Top telemetry status pill */}
          <div className="w-full flex items-center justify-between z-10">
            <span className="text-[10px] uppercase font-mono-tech font-bold text-[#9BA8AB] tracking-wider flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_8px_#34d399]" />
              SISTEMA OPERACIONAL ATIVO
            </span>
            <span className="text-[10px] font-mono-tech text-[#9BA8AB]">24/7</span>
          </div>

          {/* Center Floating 3D Glass Showcase Badge (Faithfully matching Reference Image) */}
          <div className="my-auto py-8 z-10 flex flex-col items-center text-center w-full">
            <motion.div
              key={currentSlide}
              initial={{ opacity: 0, y: 15, scale: 0.94 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -15, scale: 0.94 }}
              transition={{ duration: 0.35, ease: "easeOut" }}
              className="relative mb-8"
            >
              {/* Soft ambient backlight behind card */}
              <div className="absolute -inset-2 rounded-[36px] bg-[#4A5C6A]/20 blur-xl pointer-events-none" />

              {/* Outer 3D Frosted Glass Rounded Card */}
              <div className="relative w-48 h-56 sm:w-52 sm:h-60 rounded-[32px] bg-gradient-to-b from-[#253745]/80 via-[#11212D]/85 to-[#06141B]/90 border border-[#9BA8AB]/35 shadow-[0_25px_60px_rgba(6,20,27,0.9),inset_0_1px_2px_rgba(255,255,255,0.18)] backdrop-blur-2xl flex flex-col items-center justify-center p-6 group">
                {/* Glowing beacon light on top-right (identically placed as reference image) */}
                <div className="absolute top-5 right-6 flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#CCD0CF] opacity-80" />
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-white shadow-[0_0_10px_#FFFFFF,0_0_20px_#CCD0CF]" />
                </div>

                {/* Concentric radar rings centered around the icon badge */}
                <div className="absolute w-40 h-40 rounded-full border border-[#9BA8AB]/15 pointer-events-none" />
                <div className="absolute w-32 h-32 rounded-full border border-[#9BA8AB]/25 pointer-events-none" />
                <div className="absolute w-24 h-24 rounded-full border border-[#CCD0CF]/20 pointer-events-none" />

                {/* Central frosted squircle with glowing icon */}
                <div className="relative p-4 rounded-2xl bg-gradient-to-b from-[#4A5C6A]/60 to-[#253745]/90 border border-[#CCD0CF]/40 text-[#CCD0CF] shadow-[0_12px_28px_rgba(6,20,27,0.7),inset_0_1px_1px_rgba(255,255,255,0.3)] transition-transform group-hover:scale-105 duration-300">
                  <ActiveSlideIcon className="h-9 w-9 text-white drop-shadow-[0_2px_8px_rgba(255,255,255,0.3)]" />
                </div>

                {/* Bottom triple dots indicator (matching reference print) */}
                <div className="mt-5 flex items-center gap-1.5 opacity-70">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#CCD0CF]" />
                  <span className="w-1.5 h-1.5 rounded-full bg-[#CCD0CF]" />
                  <span className="w-1.5 h-1.5 rounded-full bg-[#CCD0CF]" />
                </div>
              </div>
            </motion.div>

            {/* Slide Text Content */}
            <AnimatePresence mode="wait">
              <motion.div
                key={activeSlideData.title}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.25 }}
                className="max-w-xs"
              >
                <h3 className="text-xl sm:text-2xl font-bold tracking-tight text-white font-sans">
                  {activeSlideData.title}
                </h3>
                <p className="text-xs text-[#9BA8AB] mt-2.5 leading-relaxed font-sans">
                  {activeSlideData.description}
                </p>
              </motion.div>
            </AnimatePresence>

            {/* Interactive Carousel Pagination Indicators (Matching Reference Print) */}
            <div className="flex items-center gap-2 mt-6">
              {SHOWCASE_SLIDES.map((_, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setCurrentSlide(idx)}
                  className={`transition-all duration-300 rounded-full cursor-pointer ${
                    currentSlide === idx
                      ? "w-8 h-1.5 bg-[#CCD0CF] shadow-[0_0_10px_rgba(204,208,207,0.6)]"
                      : "w-2 h-1.5 bg-[#4A5C6A] hover:bg-[#9BA8AB]"
                  }`}
                  title={`Slide ${idx + 1}`}
                />
              ))}
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
