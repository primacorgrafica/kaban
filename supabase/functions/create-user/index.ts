import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const VALID_ROLES = new Set([
  "admin",
  "user",
  "coordenador",
  "operador",
  "vendedor",
  "orcamentista",
  "impressor",
  "entregador",
]);

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const jsonResponse = (body: Record<string, unknown>, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Verify caller is admin
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return jsonResponse({ error: "Não autorizado", error_code: "UNAUTHORIZED" }, 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Verify caller with anon client
    const anonClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user: caller } } = await anonClient.auth.getUser();
    if (!caller) {
      return jsonResponse({ error: "Sua sessão expirou. Entre novamente.", error_code: "UNAUTHORIZED" }, 401);
    }

    // Check admin role (only administrator can create any user account)
    const { data: isAdmin } = await anonClient.rpc("has_role", {
      _user_id: caller.id,
      _role: "admin",
    });
    if (!isAdmin) {
      return jsonResponse({ error: "Apenas administradores podem criar usuários", error_code: "FORBIDDEN" }, 403);
    }

    const body = await req.json();
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body.password === "string" ? body.password : "";
    const nome = typeof body.nome === "string" ? body.nome.trim() : "";
    const role = typeof body.role === "string" ? body.role : "";
    
    // Delivery driver specific metadata
    const telefone = typeof body.telefone === "string" ? body.telefone.trim() : null;
    const placa_veiculo = typeof body.placa_veiculo === "string" ? body.placa_veiculo.trim() : null;
    const modelo_veiculo = typeof body.modelo_veiculo === "string" ? body.modelo_veiculo.trim() : null;

    // Defense-in-depth: Entregadores must ONLY receive the 'entregador' module to prevent privilege escalation
    const raw_modulos = Array.isArray(body.modulos_acesso)
      ? body.modulos_acesso.filter((item: unknown): item is string => typeof item === "string")
      : [];
    const modulos_acesso = role === "entregador" ? ["entregador"] : raw_modulos;

    if (!email || !password || !nome) {
      return jsonResponse({ error: "E-mail, senha e nome são obrigatórios", error_code: "INVALID_INPUT" }, 400);
    }
    if (!EMAIL_PATTERN.test(email)) {
      return jsonResponse({ error: "Informe um e-mail válido.", error_code: "INVALID_EMAIL" }, 400);
    }
    if (password.length < 6) {
      return jsonResponse({ error: "A senha deve ter pelo menos 6 caracteres.", error_code: "INVALID_PASSWORD" }, 400);
    }
    if (!VALID_ROLES.has(role)) {
      return jsonResponse({ error: "Selecione um perfil válido.", error_code: "INVALID_ROLE" }, 400);
    }

    // Create user with service role (admin)
    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const { data: newUser, error: createError } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { nome },
    });

    if (createError) {
      const authCode = "code" in createError ? String((createError as any).code || "") : "";
      const normalizedMessage = createError.message.toLowerCase();
      let isDuplicate = authCode === "email_exists"
        || normalizedMessage.includes("already been registered")
        || normalizedMessage.includes("already registered");

      if (isDuplicate) {
        try {
          const { data: usersData } = await adminClient.auth.admin.listUsers({ perPage: 1000 });
          const exists = usersData?.users?.some(
            (u) => u.email?.trim().toLowerCase() === email
          );
          if (!exists) {
            isDuplicate = false;
          }
        } catch (checkErr) {
          console.warn("create-user email existence check failed", checkErr);
        }
      }

      console.error("create-user auth failure", {
        email,
        code: authCode,
        status: createError.status,
        message: createError.message,
        isDuplicate,
      });
      return jsonResponse(
        isDuplicate
          ? { error: "Já existe um usuário cadastrado com este e-mail.", error_code: "EMAIL_EXISTS" }
          : { error: `Não foi possível criar o acesso: ${createError.message}`, error_code: "AUTH_CREATE_FAILED" },
        isDuplicate ? 409 : 400,
      );
    }

    if (!newUser.user) {
      return jsonResponse({ error: "O serviço de acesso não retornou o novo usuário.", error_code: "AUTH_CREATE_FAILED" }, 500);
    }

    // Step 2: Assign role in user_roles
    const { error: roleError } = await adminClient.from("user_roles").insert({
      user_id: newUser.user.id,
      role,
    });

    if (roleError) {
      await adminClient.auth.admin.deleteUser(newUser.user.id);
      console.error("create-user role failure", { email, message: roleError.message });
      return jsonResponse({ error: `Não foi possível atribuir o perfil: ${roleError.message}`, error_code: "ROLE_CREATE_FAILED" }, 400);
    }

    // Step 3: Update profile modules
    let { data: profile, error: profileError } = await adminClient
      .from("profiles")
      .update({ modulos_acesso, email })
      .eq("user_id", newUser.user.id)
      .select("user_id")
      .maybeSingle();

    if (profileError && profileError.message?.toLowerCase().includes("email")) {
      const fallback = await adminClient
        .from("profiles")
        .update({ modulos_acesso })
        .eq("user_id", newUser.user.id)
        .select("user_id")
        .maybeSingle();
      profile = fallback.data;
      profileError = fallback.error;
    }

    // Step 4: Role-specific satellite tables with compensating rollback
    if (role === "vendedor") {
      try {
        await adminClient.from("vendedores").insert({
          nome,
          email,
          user_id: newUser.user.id,
        });
      } catch (vendErr) {
        console.warn("create-user vendedores sync warning:", vendErr);
      }
    }

    if (role === "entregador") {
      const { error: driverErr } = await adminClient.from("entregadores").insert({
        user_id: newUser.user.id,
        nome_completo: nome,
        telefone: telefone,
        placa_veiculo: placa_veiculo,
        modelo_veiculo: modelo_veiculo,
        ativo: true,
        criado_por: caller.id,
      });

      if (driverErr) {
        console.error("create-user entregadores failure, executing compensating rollback", { email, message: driverErr.message });
        // Compensating rollback: delete user_roles and auth.users to prevent orphaned state
        await adminClient.from("user_roles").delete().eq("user_id", newUser.user.id);
        await adminClient.auth.admin.deleteUser(newUser.user.id);
        return jsonResponse({
          error: `Não foi possível registrar a ficha do entregador: ${driverErr.message}`,
          error_code: "DRIVER_CREATE_FAILED",
        }, 400);
      }
    }

    if (profileError || !profile) {
      await adminClient.from("user_roles").delete().eq("user_id", newUser.user.id);
      if (role === "entregador") {
        await adminClient.from("entregadores").delete().eq("user_id", newUser.user.id);
      }
      await adminClient.auth.admin.deleteUser(newUser.user.id);
      console.error("create-user profile failure", { email, message: profileError?.message || "Perfil não encontrado" });
      return jsonResponse({ error: `Não foi possível configurar os setores: ${profileError?.message || "perfil não encontrado"}`, error_code: "PROFILE_UPDATE_FAILED" }, 400);
    }

    return jsonResponse({ success: true, user_id: newUser.user.id }, 200);
  } catch (err) {
    console.error("create-user unexpected failure", err);
    return jsonResponse({ error: `Erro inesperado ao criar usuário: ${(err as Error).message}`, error_code: "UNEXPECTED_ERROR" }, 500);
  }
});
