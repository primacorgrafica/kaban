import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { DEPARTMENTS } from "@/types/production";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Link } from "react-router-dom";
import { ArrowLeft, LogOut, Shield, Users, Save, UserPlus, Trash2, Pencil, Circle, Mail } from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";

type AppRole = "admin" | "coordenador" | "operador" | "vendedor" | "user" | "orcamentista" | "impressor" | "entregador";

export const ACCESS_MODULES: { id: string; label: string }[] = [
  { id: "comercial", label: "Comercial" },
  { id: "pcp", label: "PCP" },
  { id: "pre_impressao", label: "Pré-Impressão" },
  { id: "ctp", label: "CTP" },
  { id: "digital", label: "Digital" },
  { id: "qualidade", label: "Qualidade" },
  { id: "expedicao", label: "Expedição" },
  { id: "entregas", label: "Gestão Entregas" },
  { id: "entregador", label: "Entregador (App Mobile)" },
  { id: "trabalhos_concluidos", label: "Trabalhos Concluídos" },
  { id: "compras", label: "Compras" },
  { id: "manutencao", label: "Manutenção" },
  { id: "dashboard", label: "Dashboard" },
  { id: "cadastros", label: "Cadastros" },
  { id: "utilidades", label: "Utilidades" },
];

export const normalizeModules = (modules: string[] = []): string[] => {
  const set = new Set<string>();
  modules.forEach((m) => {
    if (m === "producao") {
      set.add("pre_impressao");
      set.add("ctp");
      set.add("digital");
      set.add("qualidade");
    } else if (m === "cadastro") {
      set.add("cadastros");
    } else if (m === "gestao_entregas") {
      set.add("entregas");
    } else {
      set.add(m);
    }
  });
  return Array.from(set);
};



interface PresenceInfo {
  last_seen: string | null;
  logged_in_at: string | null;
  last_logout_at: string | null;
  last_session_duration_ms: number | null;
}

interface UserRow {
  user_id: string;
  nome: string;
  email?: string;
  role: AppRole | null;
  setor_vinculado: string | null;
  modulos_acesso: string[];
  dirty: boolean;
  last_sign_in_at?: string | null;
  presence?: PresenceInfo | null;
}

const ROLE_NAMES: Record<AppRole, string> = {
  admin: "Administrador",
  coordenador: "Coordenador",
  operador: "Operador",
  vendedor: "Vendedor",
  user: "Usuário",
  orcamentista: "Orçamentista",
  impressor: "Impressor",
  entregador: "Entregador",
};


// Perfis visíveis na interface
const VISIBLE_ROLES: AppRole[] = ["admin", "coordenador", "operador", "vendedor", "user", "orcamentista", "entregador"];

const ROLE_DOT_COLORS: Record<AppRole | "null", string> = {
  admin: "bg-red-400",
  coordenador: "bg-blue-400",
  operador: "bg-amber-400",
  vendedor: "bg-green-400",
  user: "bg-gray-400",
  orcamentista: "bg-purple-400",
  impressor: "bg-[#4A5C6A]",
  entregador: "bg-teal-400",
  null: "bg-gray-400",
};

const ROLE_COLORS: Record<AppRole, string> = {
  admin: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
  coordenador: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  operador: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  vendedor: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  user: "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300",
  orcamentista: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300",
  impressor: "bg-slate-100 text-slate-800 dark:bg-[#253745] dark:text-[#CCD0CF]",
  entregador: "bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-300",
};

export default function UserManagementPage() {
  const { signOut, user: currentUser, isAdmin } = useAuth();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Create user dialog state
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const createRequestInFlight = useRef(false);
  const [newUser, setNewUser] = useState({
    nome: "",
    email: "",
    password: "",
    role: "" as string,
    modulos_acesso: [] as string[],
  });

  // Edit user dialog state
  const [editTarget, setEditTarget] = useState<UserRow | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({ nome: "", email: "", password: "", modulos_acesso: [] as string[] });


  // Delete
  const [deleteTarget, setDeleteTarget] = useState<UserRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Dynamic role counts
  const roleCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const u of users) {
      const key = u.role || "sem_papel";
      counts[key] = (counts[key] || 0) + 1;
    }
    return counts;
  }, [users]);

  const fetchUsers = useCallback(async () => {
    if (!isAdmin) {
      setLoading(false);
      return;
    }

    try {
      const [profilesRes, { data: roles }, emailRes, { data: presenceData }] = await Promise.all([
        supabase.from("profiles").select("user_id, nome, setor_vinculado, modulos_acesso" as any),
        supabase.from("user_roles").select("user_id, role"),
        supabase.functions.invoke("list-users"),
        supabase.from("user_presence").select("*"),
      ]);

      const profiles = profilesRes?.data;
      const emailMap: Record<string, string> = emailRes?.data?.emails || {};
      const lastSignInMap: Record<string, string | null> = emailRes?.data?.lastSignIns || {};
      const presenceMap: Record<string, PresenceInfo> = {};
      (presenceData as any[])?.forEach((p: any) => {
        presenceMap[p.user_id] = {
          last_seen: p.last_seen,
          logged_in_at: p.logged_in_at,
          last_logout_at: p.last_logout_at,
          last_session_duration_ms: p.last_session_duration_ms,
        };
      });

      // Tenta carregar emails adicionais da coluna profiles.email se já disponível no banco
      const profileEmailMap: Record<string, string> = {};
      try {
        const { data: pEmailData } = await supabase.from("profiles").select("user_id, email" as any);
        if (pEmailData && Array.isArray(pEmailData)) {
          pEmailData.forEach((pe: any) => {
            if (pe.email) profileEmailMap[pe.user_id] = pe.email;
          });
        }
      } catch {
        // Coluna email ainda em processo de migração, usa emailMap de auth.users
      }

      // Tenta carregar emails de auth.users via RPC dedicada admin_get_user_emails
      const rpcEmails: Record<string, string> = {};
      const rpcLastSignIns: Record<string, string | null> = {};
      try {
        const { data: rpcEmailData, error: rpcErr } = await supabase.rpc("admin_get_user_emails" as any);
        if (!rpcErr && Array.isArray(rpcEmailData)) {
          rpcEmailData.forEach((item: any) => {
            if (item.user_id && item.email) rpcEmails[item.user_id] = item.email;
            if (item.user_id && item.last_sign_in_at) rpcLastSignIns[item.user_id] = item.last_sign_in_at;
          });
        }
      } catch {
        // RPC ainda não criada
      }

      if (profiles && Array.isArray(profiles)) {
        const roleMap: Record<string, AppRole> = {};
        roles?.forEach((r: any) => { roleMap[r.user_id] = r.role; });

        setUsers(
          profiles.map((p: any) => ({
            user_id: p.user_id,
            nome: p.nome,
            email: profileEmailMap[p.user_id] || (p as any).email || rpcEmails[p.user_id] || emailMap[p.user_id] || undefined,
            role: roleMap[p.user_id] || null,
            setor_vinculado: p.setor_vinculado || null,
            modulos_acesso: Array.isArray(p.modulos_acesso) ? p.modulos_acesso : [],
            dirty: false,
            last_sign_in_at: rpcLastSignIns[p.user_id] || lastSignInMap[p.user_id] || null,
            presence: presenceMap[p.user_id] || null,
          }))
        );
      }
    } catch (err) {
      console.error("[UserManagement] Erro ao carregar usuários:", err);
      toast.error("Erro ao carregar lista de usuários");
    } finally {
      setLoading(false);
    }
  }, [isAdmin]);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  const updateRole = (userId: string, newRole: AppRole) => {
    setUsers((prev) =>
      prev.map((u) =>
        u.user_id === userId ? { ...u, role: newRole, dirty: true } : u
      )
    );
  };

  const saveAll = async () => {
    const dirtyUsers = users.filter((u) => u.dirty);
    if (dirtyUsers.length === 0) {
      toast.info("Nenhuma alteração para salvar");
      return;
    }

    setSaving(true);

    for (const u of dirtyUsers) {
      if (u.role) {
        const { data: existing } = await supabase
          .from("user_roles")
          .select("id")
          .eq("user_id", u.user_id)
          .maybeSingle();

        if (existing) {
          await supabase
            .from("user_roles")
            .update({ role: u.role } as any)
            .eq("user_id", u.user_id);
        } else {
          await supabase
            .from("user_roles")
            .insert({ user_id: u.user_id, role: u.role } as any);
        }
      }

      // Salva modulos_acesso via RPC (com fallback para update direto)
      let modSaved = false;
      try {
        const { data: rpcRes, error: rpcErr } = await supabase.rpc("admin_update_user_profile" as any, {
          p_user_id: u.user_id,
          p_nome: u.nome,
          p_email: u.email || null,
          p_modulos_acesso: u.modulos_acesso,
        });
        if (!rpcErr && (rpcRes as any)?.success === true) {
          modSaved = true;
        }
      } catch { /* rpc fallback */ }

      if (!modSaved) {
        await supabase
          .from("profiles")
          .update({ modulos_acesso: u.modulos_acesso } as any)
          .eq("user_id", u.user_id);
      }

      if (u.role === "entregador") {
        try {
          await supabase.from("entregadores" as any).upsert(
            {
              user_id: u.user_id,
              nome_completo: u.nome,
              ativo: true,
            },
            { onConflict: "user_id" }
          );
        } catch { /* tabela entregadores ainda não implantada */ }
      }

    }

    setSaving(false);
    toast.success(`${dirtyUsers.length} usuário(s) atualizado(s)`);
    setUsers((prev) => prev.map((u) => ({ ...u, dirty: false })));
  };

  const extractFnResponse = async (res: any, fallback: string) => {
    let errorMsg = res?.data?.error;
    let errorCode = res?.data?.error_code;
    try {
      const ctx = res?.error?.context;
      if (ctx && typeof ctx.json === "function") {
        const body = await ctx.clone().json();
        if (body?.error) errorMsg = String(body.error);
        if (body?.error_code) errorCode = String(body.error_code);
      }
    } catch { /* ignore */ }
    return {
      error: (errorMsg || res?.error?.message || fallback) as string,
      errorCode: (errorCode || "") as string,
    };
  };

  const handleCreateUser = async () => {
    if (createRequestInFlight.current) return;

    const normalizedEmail = newUser.email.trim().toLowerCase();
    const normalizedName = newUser.nome.trim();
    const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!normalizedEmail || !newUser.password || !normalizedName || !newUser.role) {
      toast.error("Preencha todos os campos obrigatórios (incluindo perfil e e-mail)");
      return;
    }
    if (!EMAIL_REGEX.test(normalizedEmail)) {
      toast.error("Informe um endereço de e-mail válido (exemplo: usuario@primacorgrafica.com.br)");
      return;
    }
    if (newUser.password.length < 6) {
      toast.error("A senha deve ter pelo menos 6 caracteres");
      return;
    }

    createRequestInFlight.current = true;
    setCreating(true);
    try {
      let created = false;
      let errorMsg = "";
      let errorCode = "";

      const modulosToCreate =
        newUser.role === "entregador" && newUser.modulos_acesso.length === 0
          ? ["entregador"]
          : newUser.modulos_acesso;

      // 1. Tenta criar via RPC dedicada admin_create_user (PostgreSQL SECURITY DEFINER)
      try {
        const { data: rpcRes, error: rpcErr } = await supabase.rpc("admin_create_user" as any, {
          p_email: normalizedEmail,
          p_password: newUser.password,
          p_nome: normalizedName,
          p_role: newUser.role,
          p_modulos_acesso: modulosToCreate,
        });

        if (!rpcErr && (rpcRes as any)?.success === true) {
          created = true;
        } else if (rpcErr && !rpcErr.message?.includes("Could not find the function")) {
          errorMsg = rpcErr.message;
        } else if ((rpcRes as any)?.error) {
          errorMsg = (rpcRes as any).error;
          errorCode = (rpcRes as any).error_code || "";
        }
      } catch (err: any) {
        console.warn("[UserManagement] RPC admin_create_user:", err);
      }

      // 2. Fallback para Edge Function create-user caso disponível
      if (!created && !errorMsg) {
        try {
          const res = await supabase.functions.invoke("create-user", {
            body: {
              email: normalizedEmail,
              password: newUser.password,
              nome: normalizedName,
              role: newUser.role || undefined,
              modulos_acesso: modulosToCreate,
            },
          });

          if (!res.error && !res.data?.error) {
            created = true;
          } else if (res.error?.message && !res.error.message.includes("Failed to send a request")) {
            const extracted = await extractFnResponse(res, "Erro ao criar usuário");
            errorMsg = extracted.error;
            errorCode = extracted.errorCode;
          }
        } catch {
          // Edge function 404
        }
      }

      if (created) {
        toast.success("Usuário criado com sucesso!");
        setCreateOpen(false);
        setNewUser({ nome: "", email: "", password: "", role: "", modulos_acesso: [] });
        setLoading(true);
        fetchUsers();
      } else {
        toast.error(
          errorCode === "EMAIL_EXISTS"
            ? "Já existe um usuário cadastrado com este e-mail."
            : (errorMsg || "Erro ao criar usuário. Execute a função admin_create_user no Supabase."),
          { duration: 7000 }
        );
      }
    } catch (err: any) {
      toast.error(err.message || "Erro ao criar usuário");
    } finally {
      createRequestInFlight.current = false;
      setCreating(false);
    }
  };


  const handleDeleteUser = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      let deleted = false;
      let errorMsg = "";

      // 1. Tenta remover via RPC dedicada admin_delete_user (PostgreSQL SECURITY DEFINER)
      try {
        const { data: rpcRes, error: rpcErr } = await supabase.rpc("admin_delete_user" as any, {
          p_user_id: deleteTarget.user_id,
        });

        if (!rpcErr && (rpcRes as any)?.success === true) {
          deleted = true;
        } else if (rpcErr && !rpcErr.message?.includes("Could not find the function")) {
          errorMsg = rpcErr.message;
        } else if ((rpcRes as any)?.error) {
          errorMsg = (rpcRes as any).error;
        }
      } catch (err: any) {
        console.warn("[UserManagement] RPC admin_delete_user:", err);
      }

      // 2. Fallback para Edge Function delete-user caso disponível
      if (!deleted && !errorMsg) {
        try {
          const res = await supabase.functions.invoke("delete-user", {
            body: { user_id: deleteTarget.user_id },
          });
          if (!res.error && !res.data?.error) {
            deleted = true;
          } else if (res.error?.message && !res.error.message.includes("Failed to send a request")) {
            const { error: msg } = await extractFnResponse(res, "Erro ao remover usuário");
            errorMsg = msg;
          }
        } catch {
          // Edge function 404
        }
      }

      // 3. Fallback para deleção direta das tabelas se tiver permissão
      if (!deleted && !errorMsg) {
        try {
          await supabase.from("user_roles").delete().eq("user_id", deleteTarget.user_id);
          const { error: pErr } = await supabase.from("profiles").delete().eq("user_id", deleteTarget.user_id);
          if (!pErr) {
            deleted = true;
          }
        } catch {
          // ignore
        }
      }

      if (deleted) {
        toast.success(`Usuário "${deleteTarget.nome}" removido com sucesso`);
        setUsers((prev) => prev.filter((u) => u.user_id !== deleteTarget.user_id));
      } else {
        toast.error(
          errorMsg || "Não foi possível remover o usuário. Execute a função admin_delete_user no Supabase.",
          { duration: 7000 }
        );
      }
    } catch (err: any) {
      toast.error(err.message || "Erro ao remover usuário");
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  };

  const openEditDialog = (u: UserRow) => {
    setEditTarget(u);
    setEditForm({ nome: u.nome, email: u.email || "", password: "", modulos_acesso: normalizeModules(u.modulos_acesso || []) });
    setEditOpen(true);
  };

  const handleEditUser = async () => {
    if (!editTarget) return;
    if (!editForm.nome.trim()) {
      toast.error("Nome não pode ficar vazio");
      return;
    }
    if (editForm.password && editForm.password.length < 6) {
      toast.error("A senha deve ter pelo menos 6 caracteres");
      return;
    }

    const trimmedEmail = editForm.email.trim().toLowerCase();
    if (trimmedEmail) {
      const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!EMAIL_REGEX.test(trimmedEmail)) {
        toast.error("Informe um formato de e-mail válido (ex: usuario@primacorgrafica.com.br)");
        return;
      }
    }

    setEditing(true);
    let saved = false;
    let errorMessage: string | null = null;

    try {
      // 1. Tenta atualizar via RPC dedicada admin_update_user_profile (PostgreSQL SECURITY DEFINER)
      try {
        const { data: rpcRes, error: rpcErr } = await supabase.rpc("admin_update_user_profile" as any, {
          p_user_id: editTarget.user_id,
          p_nome: editForm.nome.trim(),
          p_email: trimmedEmail || null,
          p_modulos_acesso: editForm.modulos_acesso,
          p_password: editForm.password ? editForm.password.trim() : null,
        });

        if (!rpcErr && (rpcRes as any)?.success === true) {
          saved = true;
        } else if (rpcErr && !rpcErr.message?.includes("Could not find the function")) {
          errorMessage = rpcErr.message;
        }
      } catch (err: any) {
        console.warn("[UserManagement] RPC admin_update_user_profile falhou:", err);
      }

      // 2. Se a RPC não foi executada, tenta Edge Function edit-user caso esteja implantada
      if (!saved) {
        try {
          const body: any = { 
            user_id: editTarget.user_id, 
            nome: editForm.nome.trim(), 
            modulos_acesso: editForm.modulos_acesso 
          };
          if (trimmedEmail) body.email = trimmedEmail;
          if (editForm.password) body.password = editForm.password;

          const res = await supabase.functions.invoke("edit-user", { body });
          if (!res.error && !res.data?.error) {
            saved = true;
          } else if (res.error?.message && !res.error.message.includes("404")) {
            errorMessage = res.data?.error || res.error.message;
          }
        } catch {
          // Edge function 404
        }
      }

      // 3. Tenta atualização direta em profiles e vendedores com verificação estrita de linhas afetadas
      if (!saved) {
        try {
          const profilePayload: any = {
            nome: editForm.nome.trim(),
            modulos_acesso: editForm.modulos_acesso,
          };
          if (trimmedEmail) {
            profilePayload.email = trimmedEmail;
          }

          let { data: updatedRows, error: updateErr } = await supabase
            .from("profiles")
            .update(profilePayload as any)
            .eq("user_id", editTarget.user_id)
            .select();

          // Se falhou porque a coluna email ainda não existe, tenta atualizar sem ela
          if (updateErr && updateErr.message?.toLowerCase().includes("email")) {
            delete profilePayload.email;
            const retry = await supabase
              .from("profiles")
              .update(profilePayload as any)
              .eq("user_id", editTarget.user_id)
              .select();
            updateErr = retry.error;
            updatedRows = retry.data;
          }

          if (!updateErr && updatedRows && updatedRows.length > 0) {
            saved = true;
          } else if (!updateErr && (!updatedRows || updatedRows.length === 0)) {
            errorMessage = "O banco de dados não autorizou a gravação (bloqueio de RLS). Execute o script 'atualizar_emails_e_permissoes_supabase.sql' no Supabase SQL Editor para liberar o salvamento de usuários.";
          } else if (updateErr) {
            errorMessage = updateErr.message;
          }
        } catch (err: any) {
          errorMessage = err?.message || errorMessage;
        }

        // Tenta sincronizar vendedores por user_id e nome
        if (trimmedEmail) {
          try {
            await supabase.from("vendedores").update({ email: trimmedEmail, nome: editForm.nome.trim() } as any).eq("user_id", editTarget.user_id);
          } catch { /* ignore */ }
          try {
            await supabase.from("vendedores").update({ email: trimmedEmail } as any).ilike("nome", editForm.nome.trim());
          } catch { /* ignore */ }
        }
      }

      if (saved) {
        toast.success("Usuário atualizado com sucesso!");
        setUsers((prev) =>
          prev.map((u) =>
            u.user_id === editTarget.user_id
              ? {
                  ...u,
                  nome: editForm.nome.trim(),
                  email: trimmedEmail || u.email,
                  modulos_acesso: editForm.modulos_acesso,
                }
              : u
          )
        );
        setEditOpen(false);
        setEditTarget(null);
        await fetchUsers();
      } else {
        toast.error(
          errorMessage || "Não foi possível salvar as alterações no banco. Execute o script 'atualizar_emails_e_permissoes_supabase.sql' no Supabase SQL Editor.",
          { duration: 9000 }
        );
      }
    } catch (err: any) {
      toast.error(err.message || "Erro ao editar usuário");
    } finally {
      setEditing(false);
    }
  };

  if (!isAdmin) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-background p-6">
        <div className="max-w-md text-center flex flex-col items-center">
          <div className="w-12 h-12 rounded-full bg-destructive/10 text-destructive flex items-center justify-center mb-4">
            <Shield className="h-6 w-6" />
          </div>
          <h2 className="text-xl font-bold text-foreground">Acesso Restrito</h2>
          <p className="text-sm text-muted-foreground mt-2">
            Apenas administradores do sistema têm permissão para acessar o gerenciamento de usuários e controle de privilégios.
          </p>
          <Link to="/" className="mt-6">
            <Button variant="outline" className="gap-2">
              <ArrowLeft className="h-4 w-4" /> Voltar ao Início
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  const dirtyCount = users.filter((u) => u.dirty).length;

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar */}
      <aside
        className="hidden lg:flex w-56 flex-col text-sidebar-foreground"
        style={{ background: "var(--gradient-sidebar)" }}
      >
        <div className="px-5 py-5 flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold text-sidebar-primary-foreground" style={{ background: "var(--gradient-primary)" }}>
            <Shield className="h-4 w-4" />
          </div>
          <h1 className="text-base font-bold text-sidebar-primary-foreground tracking-tight">Usuários</h1>
        </div>

        <nav className="flex-1 px-3 space-y-0.5">
          <div className="px-3 py-2 text-xs text-sidebar-foreground/40 uppercase tracking-wider">Perfis</div>
          {VISIBLE_ROLES.map((role) => (
            <div key={role} className="flex items-center justify-between px-3 py-2 text-sm text-sidebar-foreground/70">
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${ROLE_DOT_COLORS[role]}`} />
                {ROLE_NAMES[role]}
              </div>
              <span className="text-xs text-sidebar-foreground/40">{roleCounts[role] || 0}</span>
            </div>
          ))}
          <div className="flex items-center justify-between px-3 py-2 text-sm text-sidebar-foreground/70">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-gray-500" />
               Sem perfil
            </div>
            <span className="text-xs text-sidebar-foreground/40">{roleCounts["sem_papel"] || 0}</span>
          </div>
          <div className="px-3 pt-2 border-t border-sidebar-border/30 mt-2">
            <div className="flex items-center justify-between text-sm text-sidebar-foreground/90 font-medium">
              <span>Total</span>
              <span>{users.length}</span>
            </div>
          </div>
        </nav>

        <div className="px-3 py-2 border-t border-sidebar-border/50">
          <Link
            to="/"
            className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm text-sidebar-foreground/60 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground transition-colors"
          >
            <ArrowLeft className="h-4 w-4" /> Voltar à Pré-Impressão
          </Link>
        </div>

        <div className="px-3 py-3 border-t border-sidebar-border/50">
          <div className="text-xs text-sidebar-foreground/40 truncate mb-2 px-3">{currentUser?.email}</div>
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent/50"
            onClick={signOut}
          >
            <LogOut className="h-4 w-4 mr-2" /> Sair
          </Button>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-14 border-b border-border/50 flex items-center gap-3 px-4 flex-shrink-0 glass">
          <Link to="/" className="lg:hidden">
            <ArrowLeft className="h-5 w-5 text-muted-foreground" />
          </Link>
          <Users className="h-5 w-5 text-primary" />
          <h2 className="text-sm font-bold text-foreground">Gerenciamento de Usuários</h2>
          <div className="flex-1" />

          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button size="sm" variant="outline" className="gap-1.5">
                <UserPlus className="h-4 w-4" />
                Novo Usuário
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Criar Novo Usuário</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-2">
                <div className="space-y-1.5">
                  <Label htmlFor="new-nome">Nome *</Label>
                  <Input
                    id="new-nome"
                    value={newUser.nome}
                    onChange={(e) => setNewUser((p) => ({ ...p, nome: e.target.value }))}
                    placeholder="Nome completo"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="new-email">E-mail *</Label>
                  <Input
                    id="new-email"
                    type="email"
                    value={newUser.email}
                    onChange={(e) => setNewUser((p) => ({ ...p, email: e.target.value }))}
                    placeholder="email@exemplo.com"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="new-password">Senha *</Label>
                  <Input
                    id="new-password"
                    type="password"
                    value={newUser.password}
                    onChange={(e) => setNewUser((p) => ({ ...p, password: e.target.value }))}
                    placeholder="Mínimo 6 caracteres"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Perfil *</Label>
                  <Select
                    value={newUser.role || "nenhum"}
                    onValueChange={(v) => setNewUser((p) => ({ ...p, role: v === "nenhum" ? "" : v }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="nenhum">Sem perfil</SelectItem>
                      <SelectItem value="admin">Administrador</SelectItem>
                      <SelectItem value="coordenador">Coordenador</SelectItem>
                      <SelectItem value="operador">Operador</SelectItem>
                      <SelectItem value="vendedor">Vendedor</SelectItem>
                      <SelectItem value="orcamentista">Orçamentista</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Setores de acesso</Label>
                  <div className="grid grid-cols-2 gap-2 rounded-md border p-3 max-h-56 overflow-y-auto">
                    {ACCESS_MODULES.map((m) => {
                      const checked = newUser.modulos_acesso.includes(m.id);
                      return (
                        <label key={m.id} className="flex items-center gap-2 text-sm cursor-pointer">
                          <Checkbox
                            checked={checked}
                            onCheckedChange={(v) =>
                              setNewUser((p) => ({
                                ...p,
                                modulos_acesso: v
                                  ? [...p.modulos_acesso, m.id]
                                  : p.modulos_acesso.filter((x) => x !== m.id),
                              }))
                            }
                          />
                          {m.label}
                        </label>
                      );
                    })}
                  </div>
                </div>



                <Button
                  className="w-full"
                  onClick={handleCreateUser}
                  disabled={creating}
                >
                  {creating ? "Criando..." : "Criar Usuário"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          {dirtyCount > 0 && (
            <Button size="sm" onClick={saveAll} disabled={saving} className="gap-1.5">
              <Save className="h-4 w-4" />
              {saving ? "Salvando..." : `Salvar (${dirtyCount})`}
            </Button>
          )}
        </header>

        <main className="flex-1 overflow-auto p-4">
          {loading ? (
            <div className="flex items-center justify-center h-full text-muted-foreground">Carregando...</div>
          ) : (
            <div className="rounded-lg border border-border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead className="w-[200px]">Usuário</TableHead>
                    <TableHead className="w-[180px]">Perfil</TableHead>
                    <TableHead className="w-[300px]">Setores de Acesso</TableHead>
                    <TableHead className="w-[180px]">Conexão</TableHead>
                    <TableHead className="w-[100px]">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.map((u) => (
                    <TableRow key={u.user_id} className={u.dirty ? "bg-amber-50/50 dark:bg-amber-900/10" : ""}>
                      <TableCell>
                        <div>
                          <div className="font-medium text-sm">{u.nome}</div>
                          {u.email ? (
                            <div className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                              <Mail className="h-3 w-3 text-primary/70 shrink-0" />
                              <span className="truncate max-w-[200px]">{u.email}</span>
                            </div>
                          ) : (
                            <div className="text-[10px] text-amber-500 font-medium flex items-center gap-1 mt-0.5">
                              <span>⚠ Sem e-mail cadastrado</span>
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Select
                          value={u.role || "sem_papel"}
                          onValueChange={(v) => updateRole(u.user_id, v as AppRole)}
                        >
                          <SelectTrigger className="h-8 w-[180px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="sem_papel" disabled>Sem perfil</SelectItem>
                            <SelectItem value="admin">Administrador</SelectItem>
                            <SelectItem value="coordenador">Coordenador</SelectItem>
                            <SelectItem value="operador">Operador</SelectItem>
                            <SelectItem value="vendedor">Vendedor</SelectItem>
                            <SelectItem value="orcamentista">Orçamentista</SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {u.modulos_acesso.length === 0 ? (
                            <span className="text-xs text-muted-foreground">Todos</span>
                          ) : (
                            normalizeModules(u.modulos_acesso).map((modId) => {
                              const mod = ACCESS_MODULES.find((m) => m.id === modId);
                              return (
                                <Badge key={modId} variant="secondary" className="text-[10px] px-1.5 py-0">
                                  {mod?.label || modId}
                                </Badge>
                              );
                            })
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        {(() => {
                          const presence = u.presence;
                          const isOnline = presence?.last_seen && 
                            (Date.now() - new Date(presence.last_seen).getTime()) < 2 * 60 * 1000; // 2min threshold
                          
                          const formatDuration = (ms: number) => {
                            const mins = Math.floor(ms / 60000);
                            const hours = Math.floor(mins / 60);
                            const days = Math.floor(hours / 24);
                            if (days > 0) return `${days}d ${hours % 24}h`;
                            if (hours > 0) return `${hours}h ${mins % 60}min`;
                            return `${mins}min`;
                          };

                          return (
                            <div className="space-y-0.5">
                              <div className="flex items-center gap-1.5">
                                <Circle className={`h-2.5 w-2.5 fill-current ${isOnline ? "text-green-500" : "text-muted-foreground/40"}`} />
                                <span className={`text-xs font-medium ${isOnline ? "text-green-600 dark:text-green-400" : "text-muted-foreground"}`}>
                                  {isOnline ? "Online" : "Offline"}
                                </span>
                              </div>
                              {u.last_sign_in_at && (
                                <div className="text-[10px] text-muted-foreground leading-tight">
                                  Último login: {format(new Date(u.last_sign_in_at), "dd/MM/yy HH:mm", { locale: ptBR })}
                                </div>
                              )}
                              {presence?.last_session_duration_ms && presence.last_session_duration_ms > 0 && !isOnline && (
                                <div className="text-[10px] text-muted-foreground leading-tight">
                                  Última sessão: {formatDuration(presence.last_session_duration_ms)}
                                </div>
                              )}
                              {isOnline && presence?.logged_in_at && (
                                <div className="text-[10px] text-muted-foreground leading-tight">
                                  Conectado há {formatDistanceToNow(new Date(presence.logged_in_at), { locale: ptBR })}
                                </div>
                              )}
                            </div>
                          );
                        })()}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground hover:text-foreground"
                            onClick={() => openEditDialog(u)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          {u.user_id !== currentUser?.id && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                              onClick={() => setDeleteTarget(u)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </main>
      </div>

      {/* Delete dialog */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover usuário</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja remover <strong>{deleteTarget?.nome}</strong>? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteUser}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? "Removendo..." : "Remover"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Edit dialog */}
      <Dialog open={editOpen} onOpenChange={(open) => { if (!open) { setEditOpen(false); setEditTarget(null); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Editar Usuário</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <Label htmlFor="edit-nome">Nome</Label>
              <Input
                id="edit-nome"
                value={editForm.nome}
                onChange={(e) => setEditForm((p) => ({ ...p, nome: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-email">E-mail</Label>
              <Input
                id="edit-email"
                type="email"
                value={editForm.email}
                onChange={(e) => setEditForm((p) => ({ ...p, email: e.target.value }))}
                placeholder="email@primacorgrafica.com.br"
              />
              <p className="text-[11px] text-muted-foreground">
                Utilizado para login e recebimento de notificações automáticas de O.S.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-password">Nova Senha</Label>
              <Input
                id="edit-password"
                type="password"
                value={editForm.password}
                onChange={(e) => setEditForm((p) => ({ ...p, password: e.target.value }))}
                placeholder="Deixe vazio para manter a atual"
              />
            </div>
            <div className="space-y-2">
              <Label>Setores de acesso</Label>
              <div className="grid grid-cols-2 gap-2 rounded-md border p-3 max-h-56 overflow-y-auto">
                {ACCESS_MODULES.map((m) => {
                  const checked = editForm.modulos_acesso.includes(m.id);
                  return (
                    <label key={m.id} className="flex items-center gap-2 text-sm cursor-pointer">
                      <Checkbox
                        checked={checked}
                        onCheckedChange={(v) =>
                          setEditForm((p) => ({
                            ...p,
                            modulos_acesso: v
                              ? [...p.modulos_acesso, m.id]
                              : p.modulos_acesso.filter((x) => x !== m.id),
                          }))
                        }
                      />
                      {m.label}
                    </label>
                  );
                })}
              </div>
            </div>

            <Button
              className="w-full"
              onClick={handleEditUser}
              disabled={editing}
            >
              {editing ? "Salvando..." : "Salvar Alterações"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
