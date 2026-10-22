import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { ShieldCheck, ArrowRight, Lock, Mail, Activity, Sparkles } from "lucide-react";
import logoImg from "@/assets/logo-sidebar.png";

export default function AuthPage() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

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

  return (
    <div className="relative min-h-screen w-full flex items-center justify-center p-4 overflow-hidden bg-[#06141B]">
      {/* Background Tech Mesh & Glow Gradients */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[500px] bg-[#253745]/25 rounded-full blur-[140px] opacity-70" />
        <div className="absolute bottom-10 left-1/3 w-[500px] h-[400px] bg-[#11212D]/50 rounded-full blur-[130px] opacity-60" />
        <div 
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage: `linear-gradient(to right, #ffffff 1px, transparent 1px), linear-gradient(to bottom, #ffffff 1px, transparent 1px)`,
            backgroundSize: '40px 40px'
          }}
        />
      </div>

      <div className="relative w-full max-w-[440px] z-10 flex flex-col items-center">
        {/* Brand Header */}
        <div className="mb-7 flex flex-col items-center text-center">
          <div className="relative mb-4 p-4 rounded-3xl bg-[#11212D]/90 border border-[#4A5C6A]/60 shadow-[0_0_40px_-5px_rgba(6,20,27,0.7)] backdrop-blur-xl">
            <img src={logoImg} alt="Primacor Gráfica" className="w-36 h-36 md:w-40 md:h-40 object-contain drop-shadow-xl" />
            <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-emerald-500 rounded-full border-2 border-slate-950 flex items-center justify-center shadow-[0_0_10px_#10b981]">
              <span className="w-1.5 h-1.5 bg-white rounded-full animate-ping" />
            </div>
          </div>
          
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
            PRIMACOR <span className="text-xs px-2 py-0.5 rounded-full bg-[#253745] border border-[#4A5C6A] text-[#CCD0CF] font-mono-tech uppercase font-medium">OS v2.0</span>
          </h1>
          <p className="text-xs text-slate-400 mt-1">Sistema Integrado de Pré-Impressão & PCP</p>
        </div>

        {/* Login Card */}
        <div className="w-full rounded-2xl border border-[#4A5C6A]/60 bg-[#11212D]/90 backdrop-blur-2xl p-7 shadow-[0_20px_50px_rgba(0,0,0,0.6)] relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-[#9BA8AB] to-transparent opacity-80" />
          
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-lg font-semibold text-white">Autenticação</h2>
              <p className="text-xs text-slate-400">Insira suas credenciais corporativas</p>
            </div>
            <div className="w-8 h-8 rounded-lg bg-[#253745] border border-[#4A5C6A]/60 flex items-center justify-center text-[#CCD0CF]">
              <ShieldCheck className="w-4 h-4" />
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label htmlFor="email" className="text-xs font-medium text-slate-300 flex items-center gap-1.5 mb-1.5">
                <Mail className="w-3.5 h-3.5 text-[#9BA8AB]" /> E-mail Operacional
              </Label>
              <div className="relative">
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@primacorgrafica.com.br"
                  className="bg-slate-950/70 border-slate-800 text-white placeholder:text-slate-500 text-sm focus:border-[#9BA8AB] focus:ring-1 focus:ring-[#9BA8AB]/50 rounded-xl h-11 transition-all"
                  autoComplete="email"
                />
              </div>
            </div>

            <div>
              <Label htmlFor="password" className="text-xs font-medium text-slate-300 flex items-center gap-1.5 mb-1.5">
                <Lock className="w-3.5 h-3.5 text-[#9BA8AB]" /> Senha de Acesso
              </Label>
              <div className="relative">
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  className="bg-slate-950/70 border-slate-800 text-white placeholder:text-slate-500 text-sm focus:border-[#9BA8AB] focus:ring-1 focus:ring-[#9BA8AB]/50 rounded-xl h-11 transition-all"
                  autoComplete="current-password"
                />
              </div>
            </div>

            <Button
              type="submit"
              disabled={loading}
              className="w-full h-11 mt-2 rounded-xl font-bold text-sm bg-[#CCD0CF] hover:bg-white text-[#06141B] shadow-lg shadow-[#06141B]/40 transition-all border-none"
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <span className="w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
                  Autenticando...
                </span>
              ) : (
                <span className="flex items-center justify-center gap-2 text-[#06141B] font-bold">
                  Entrar no Sistema <ArrowRight className="w-4 h-4" />
                </span>
              )}
            </Button>
          </form>

          <div className="mt-6 pt-5 border-t border-slate-800/80 text-center">
            <p className="text-[11px] text-slate-400 flex items-center justify-center gap-1.5">
              <Activity className="w-3 h-3 text-[#9BA8AB]" />
              Acessos e perfis gerenciados pela Administração
            </p>
          </div>
        </div>

        {/* Footer info */}
        <p className="mt-6 text-[11px] text-slate-500 font-mono-tech text-center">
          PRIMACOR GRÁFICA E EDITORA LTDA © {new Date().getFullYear()}
        </p>
      </div>
    </div>
  );
}
