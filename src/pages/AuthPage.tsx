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
    <div className="relative min-h-screen w-full flex items-center justify-center p-4 overflow-hidden bg-[#070a12]">
      {/* Background Tech Mesh & Glow Gradients */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[500px] bg-cyan-500/10 rounded-full blur-[140px] opacity-70" />
        <div className="absolute bottom-10 left-1/3 w-[500px] h-[400px] bg-blue-600/10 rounded-full blur-[130px] opacity-60" />
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
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="relative mb-4 p-3 rounded-2xl bg-slate-900/80 border border-cyan-500/30 shadow-[0_0_30px_-5px_rgba(6,182,212,0.3)] backdrop-blur-xl">
            <img src={logoImg} alt="Primacor Gráfica" className="w-20 h-20 object-contain drop-shadow" />
            <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-emerald-500 rounded-full border-2 border-slate-950 flex items-center justify-center shadow-[0_0_10px_#10b981]">
              <span className="w-1.5 h-1.5 bg-white rounded-full animate-ping" />
            </div>
          </div>
          
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
            PRIMACOR <span className="text-xs px-2 py-0.5 rounded-full bg-cyan-500/15 border border-cyan-500/30 text-cyan-400 font-mono-tech uppercase font-medium">OS v2.0</span>
          </h1>
          <p className="text-xs text-slate-400 mt-1">Sistema Integrado de Pré-Impressão & PCP</p>

          {/* System Telemetry Badge */}
          <div className="mt-3 inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-900/70 border border-slate-800 text-[11px] text-slate-300 font-mono-tech">
            <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_6px_#34d399]" />
            <span>Supabase Cloud Active</span>
            <span className="text-slate-600">•</span>
            <span className="text-cyan-400">Pronto para operação</span>
          </div>
        </div>

        {/* Login Card */}
        <div className="w-full rounded-2xl border border-slate-800/80 bg-slate-900/70 backdrop-blur-2xl p-7 shadow-[0_20px_50px_rgba(0,0,0,0.6)] relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-cyan-500 to-transparent opacity-80" />
          
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-lg font-semibold text-white">Autenticação</h2>
              <p className="text-xs text-slate-400">Insira suas credenciais corporativas</p>
            </div>
            <div className="w-8 h-8 rounded-lg bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400">
              <ShieldCheck className="w-4 h-4" />
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label htmlFor="email" className="text-xs font-medium text-slate-300 flex items-center gap-1.5 mb-1.5">
                <Mail className="w-3.5 h-3.5 text-cyan-400" /> E-mail Operacional
              </Label>
              <div className="relative">
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@primacorgrafica.com.br"
                  className="bg-slate-950/70 border-slate-800 text-white placeholder:text-slate-500 text-sm focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/50 rounded-xl h-11 transition-all"
                  autoComplete="email"
                />
              </div>
            </div>

            <div>
              <Label htmlFor="password" className="text-xs font-medium text-slate-300 flex items-center gap-1.5 mb-1.5">
                <Lock className="w-3.5 h-3.5 text-cyan-400" /> Senha de Acesso
              </Label>
              <div className="relative">
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  className="bg-slate-950/70 border-slate-800 text-white placeholder:text-slate-500 text-sm focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/50 rounded-xl h-11 transition-all"
                  autoComplete="current-password"
                />
              </div>
            </div>

            <Button
              type="submit"
              disabled={loading}
              className="w-full h-11 mt-2 rounded-xl font-semibold text-sm bg-gradient-to-r from-cyan-500 via-blue-600 to-cyan-500 bg-[length:200%_auto] hover:bg-right transition-all duration-300 text-slate-950 shadow-[0_0_20px_-3px_rgba(6,182,212,0.4)] hover:shadow-[0_0_25px_rgba(6,182,212,0.6)] border-none"
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <span className="w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
                  Autenticando...
                </span>
              ) : (
                <span className="flex items-center justify-center gap-2 text-white font-medium">
                  Entrar no Sistema <ArrowRight className="w-4 h-4 text-cyan-300" />
                </span>
              )}
            </Button>
          </form>

          <div className="mt-6 pt-5 border-t border-slate-800/80 text-center">
            <p className="text-[11px] text-slate-400 flex items-center justify-center gap-1.5">
              <Activity className="w-3 h-3 text-cyan-400" />
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
