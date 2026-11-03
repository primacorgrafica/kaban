import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const jsonResponse = (body: Record<string, unknown>, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ALLOWED_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp", ".pdf"];
const MAX_FILE_SIZE_BYTES = 15 * 1024 * 1024; // 15 MB

/**
 * Obtém token de acesso App-Only no Azure AD / Microsoft Entra ID
 * (Sem exigir login individual de usuário Microsoft / M365)
 */
async function getMicrosoftAppOnlyToken(tenantId: string, clientId: string, clientSecret: string): Promise<string> {
  const tokenUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
  const params = new URLSearchParams();
  params.append("client_id", clientId);
  params.append("client_secret", clientSecret);
  params.append("scope", "https://graph.microsoft.com/.default");
  params.append("grant_type", "client_credentials");

  const response = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Falha na autenticação App-Only no Azure AD (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  return data.access_token;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !serviceRoleKey) {
      return jsonResponse({ error: "Configuração do Supabase ausente" }, 500);
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // 1. Validação de autenticação do chamador (JWT)
    const authHeader = req.headers.get("Authorization") || req.headers.get("authorization");
    if (!authHeader || !authHeader.toLowerCase().startsWith("bearer ")) {
      return jsonResponse(
        { error: "Cabeçalho de autorização (Bearer token) ausente ou inválido." },
        401
      );
    }

    const token = authHeader.replace(/^bearer\s+/i, "").trim();
    const { data: authData, error: authError } = await adminClient.auth.getUser(token);

    if (authError || !authData?.user) {
      return jsonResponse(
        { error: "Token de autenticação inválido ou expirado." },
        401
      );
    }

    const callerUser = authData.user;

    // 2. Validação estrita do payload (orderId UUID)
    const body = await req.json().catch(() => ({}));
    const { orderId } = body;

    if (!orderId || typeof orderId !== "string" || !UUID_REGEX.test(orderId)) {
      return jsonResponse(
        { error: "orderId inválido ou ausente. É obrigatório informar um UUID válido." },
        400
      );
    }

    // 3. Busca dados da O.S.
    const { data: order, error: orderErr } = await adminClient
      .from("orders")
      .select("id, titulo, entregue_para, status_entrega, entregador_id")
      .eq("id", orderId)
      .maybeSingle();

    if (orderErr || !order) {
      return jsonResponse({ error: "Ordem de serviço não encontrada." }, 404);
    }

    // 4. Verificação de autorização (entregador atribuído ou gestores autorizados: admin, coordenador)
    const { data: userRoles } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", callerUser.id);

    const rolesList: string[] = (userRoles || []).map((r: { role: string }) => r.role);
    if (callerUser.app_metadata?.role && typeof callerUser.app_metadata.role === "string") {
      rolesList.push(callerUser.app_metadata.role);
    }

    const isAuthorizedManager = rolesList.includes("admin") || rolesList.includes("coordenador");
    const isAssignedDriver = order.entregador_id === callerUser.id;

    if (!isAssignedDriver && !isAuthorizedManager) {
      return jsonResponse(
        {
          error: "Acesso negado: apenas o entregador atribuído a esta O.S. ou gestores autorizados (admin/coordenador) podem sincronizar o comprovante.",
        },
        403
      );
    }

    // 5. Credenciais Microsoft Entra ID (App Registration com permissões Files.ReadWrite.All ou Sites.Selected)
    const azureTenantId = Deno.env.get("AZURE_TENANT_ID");
    const azureClientId = Deno.env.get("AZURE_CLIENT_ID");
    const azureClientSecret = Deno.env.get("AZURE_CLIENT_SECRET");
    const sharepointSiteId = Deno.env.get("SHAREPOINT_SITE_ID");
    const sharepointDriveId = Deno.env.get("SHAREPOINT_DRIVE_ID");

    if (!azureTenantId || !azureClientId || !azureClientSecret) {
      return jsonResponse(
        {
          error: "Credenciais de App-Only da Microsoft ausentes (AZURE_TENANT_ID, AZURE_CLIENT_ID, AZURE_CLIENT_SECRET). Configure os secrets da Edge Function.",
          queue_status: "mantido_no_storage",
        },
        503
      );
    }

    // 6. Lista os arquivos do comprovante no Supabase Storage
    const { data: files, error: listErr } = await adminClient.storage
      .from("comprovantes-entrega")
      .list(orderId, { limit: 10, sortBy: { column: "created_at", order: "desc" } });

    if (listErr) {
      return jsonResponse({ error: `Erro ao acessar bucket: ${listErr.message}` }, 500);
    }

    const validFiles = (files || []).filter(
      (f) => f.name && !f.name.startsWith(".") && f.name !== ".emptyFolderPlaceholder"
    );

    if (validFiles.length === 0) {
      return jsonResponse({ message: "Nenhum arquivo pendente de sincronização para esta O.S." }, 200);
    }

    // 7. Obtém token App-Only do Microsoft Graph
    const accessToken = await getMicrosoftAppOnlyToken(azureTenantId, azureClientId, azureClientSecret);

    // 8. Resolve o Drive ID caso não esteja fixo no env
    let targetDriveId = sharepointDriveId;
    if (!targetDriveId) {
      const driveRes = await fetch(`https://graph.microsoft.com/v1.0/sites/${sharepointSiteId}/drive`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (driveRes.ok) {
        const driveData = await driveRes.json();
        targetDriveId = driveData.id;
      }
    }

    if (!targetDriveId) {
      throw new Error("Não foi possível identificar o drive do SharePoint.");
    }

    const uploadedItems = [];
    const cleanOs = (order.titulo || order.id).replace(/^OS[\s._-]*/i, "").trim();

    // 9. Itera sobre os arquivos e envia para a pasta PROTOCOLOS ENTREGAS
    for (const item of validFiles) {
      const storagePath = `${orderId}/${item.name}`;
      const ext = item.name.substring(item.name.lastIndexOf(".")).toLowerCase();
      if (!ALLOWED_EXTENSIONS.includes(ext)) {
        console.warn(`[SyncSharePoint] Arquivo com extensão não permitida ignorado: ${item.name}`);
        continue;
      }

      const { data: fileData, error: downloadErr } = await adminClient.storage
        .from("comprovantes-entrega")
        .download(storagePath);

      if (downloadErr || !fileData) {
        console.warn(`[SyncSharePoint] Falha ao baixar ${storagePath}:`, downloadErr);
        continue;
      }

      if (fileData.size > MAX_FILE_SIZE_BYTES) {
        console.warn(`[SyncSharePoint] Arquivo excede tamanho máximo de 15MB: ${item.name}`);
        continue;
      }

      const fileBuffer = await fileData.arrayBuffer();
      const rawExt = ext || ".jpg";
      const cleanRecebedor = order.entregue_para
        ? `_${order.entregue_para.replace(/[^a-zA-Z0-9]/g, "_")}`
        : "";
      const targetFileName = `OS_${cleanOs}_Protocolo_${Date.now()}${cleanRecebedor}${rawExt}`;

      const uploadUrl = `https://graph.microsoft.com/v1.0/drives/${targetDriveId}/root:/PROTOCOLOS ENTREGAS/${encodeURIComponent(
        targetFileName
      )}:/content`;

      const uploadRes = await fetch(uploadUrl, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": fileData.type || "image/jpeg",
        },
        body: fileBuffer,
      });

      if (!uploadRes.ok) {
        const upErrText = await uploadRes.text();
        throw new Error(`Erro ao enviar arquivo para o SharePoint (${uploadRes.status}): ${upErrText}`);
      }

      const driveItem = await uploadRes.json();

      // Grava metadados em order_attachments
      await adminClient.from("order_attachments").insert({
        order_id: orderId,
        nome_arquivo: driveItem.name || targetFileName,
        tamanho_bytes: driveItem.size || fileBuffer.byteLength,
        content_type: fileData.type || "image/jpeg",
        sharepoint_item_id: driveItem.id,
        sharepoint_web_url: driveItem.webUrl,
        sharepoint_path: `PROTOCOLOS ENTREGAS/${driveItem.name}`,
        status: "sincronizado",
      });

      // Remove do storage temporário
      await adminClient.storage.from("comprovantes-entrega").remove([storagePath]);
      uploadedItems.push(driveItem.name);
    }

    // 10. Atualiza a O.S. como sincronizada
    await adminClient
      .from("orders")
      .update({ status_comprovante_sync: "sincronizado" })
      .eq("id", orderId);

    return jsonResponse(
      {
        success: true,
        orderId,
        uploaded_count: uploadedItems.length,
        files: uploadedItems,
      },
      200
    );
  } catch (err: any) {
    console.error("[SyncSharePoint] Erro:", err);
    return jsonResponse({ error: err.message || "Erro desconhecido ao sincronizar com SharePoint" }, 500);
  }
});
