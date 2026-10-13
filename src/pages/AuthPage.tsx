import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { LogIn } from "lucide-react";
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
    <div className="min-h-screen flex flex-col items-center justify-center p-4"
      style={{ background: "hsl(222 30% 12%)" }}
    >
      <div className="mb-8 flex flex-col items-center">
        <img src={logoImg} alt="Primacor Gráfica" className="w-56 h-56 object-contain" />
      </div>

      <div
        className="w-full max-w-md rounded-xl border p-6"
        style={{
          background: "hsl(222 25% 16%)",
          borderColor: "hsl(222 20% 24%)",
        }}
      >
        <div className="flex items-center justify-center gap-2 py-2.5 mb-6 text-sm font-semibold rounded-lg"
          style={{ background: "hsl(38 90% 55%)", color: "hsl(222 30% 12%)" }}
        >
          <LogIn className="h-4 w-4" />
          Entrar
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="email" className="text-white/80 text-sm font-semibold">Email</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="email@exemplo.com"
              className="mt-1 border-none text-white placeholder:text-white/30"
              style={{ background: "hsl(222 20% 20%)" }}
            />
          </div>
          <div>
            <Label htmlFor="password" className="text-white/80 text-sm font-semibold">Senha</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="mt-1 border-none text-white placeholder:text-white/30"
              style={{ background: "hsl(222 20% 20%)" }}
            />
          </div>
          <Button
            type="submit"
            className="w-full font-semibold text-sm border-none"
            disabled={loading}
            style={{
              background: "hsl(38 90% 55%)",
              color: "hsl(222 30% 12%)",
            }}
          >
            {loading ? "Aguarde..." : "Entrar"}
          </Button>
          <p className="text-center text-xs text-white/40 pt-2">
            O cadastro de novos usuários é feito apenas pelo administrador.
          </p>
        </form>
      </div>
    </div>
  );
}
