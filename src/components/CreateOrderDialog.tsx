import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
import type { Order } from "@/types/order";
import {
  Plus,
  Edit2,
  AlertTriangle,
  ArrowRight,
  ArrowLeft,
  Check,
  FileText,
  Printer,
  PackageCheck,
  Building,
  User,
  Hash,
  Sparkles,
  Calendar,
  Truck,
  ShieldAlert,
  Cloud,
  Upload,
  X,
  ShieldCheck,
  Loader2,
  Repeat,
  RotateCcw,
  Clock,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  SPECIAL_SUPPLIES,
  isSpecialSupplyActive,
  toggleSpecialSupplyActive,
  getSpecialSupplyCustomText,
  setSpecialSupplyCustomText,
} from "@/lib/processos";
import {
  getOrCreateOsFolder,
  uploadFileToSharePoint,
  SHAREPOINT_ROOT_FOLDER,
} from "@/lib/sharepointService";
import {
  getStoredMicrosoftUser,
  getActiveMicrosoftAccount,
  getSharePointAccessToken,
  type StoredMicrosoftUser,
} from "@/lib/msalClient";

function toLocalDatetimeString(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  const y = date.getFullYear();
  const m = pad(date.getMonth() + 1);
  const d = pad(date.getDate());
  const hh = pad(date.getHours());
  const mm = pad(date.getMinutes());
  return `${y}-${m}-${d}T${hh}:${mm}`;
}


export interface CreateOrderDialogProps {
  onAdd?: (data: {
    titulo: string;
    descricao: string;
    cliente: string;
    tipo_trabalho?: string;
    os_anterior?: string;
    observacao?: string;
    obs_prova?: string;
    saida_direta?: boolean;
    prova_digital?: boolean;
    prova_email?: boolean;
    endereco_entrega?: string;
    destinatario?: string;
    urgente?: boolean;
    urgente_prova?: boolean;
    urgente_impressao?: boolean;
    urgente_acabamento?: boolean;
    urgente_expedicao?: boolean;
    digital_color?: boolean;
    digital_pb?: boolean;
    prazo?: string;
    vendedor?: string;
    processos?: string[];
    nf?: string;
    protocolo?: string;
    empresa_entrega?: string;
    obs_entrega?: string;
    tipo_entrega?: string[];
    entrega_para?: string;
    entrega_endereco?: string;
    entrega_ac?: string;
    entrega_data_limite?: string;
    status_destino?: string;
    setor_destino?: string;
  }) => Promise<any> | any;
  onUpdate?: (id: string, data: Partial<Order>) => Promise<any> | any;
  orderToEdit?: Order | null;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  trigger?: React.ReactNode;
}

export function CreateOrderDialog({
  onAdd,
  onUpdate,
  orderToEdit,
  open: controlledOpen,
  onOpenChange,
  trigger,
}: CreateOrderDialogProps) {
  const isEdit = Boolean(orderToEdit);
  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = typeof controlledOpen !== "undefined";
  const open = isControlled ? controlledOpen : internalOpen;
  const setOpen = (val: boolean) => {
    if (isControlled) {
      onOpenChange?.(val);
    } else {
      setInternalOpen(val);
    }
  };
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [isChecking, setIsChecking] = useState(false);
  const [vendedores, setVendedores] = useState<{ id: string; nome: string }[]>([]);
  const [stagedFiles, setStagedFiles] = useState<File[]>([]);
  const [msUser, setMsUser] = useState<StoredMicrosoftUser | null>(() => getStoredMicrosoftUser());
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitStatusText, setSubmitStatusText] = useState("");
  const [currentUploadFile, setCurrentUploadFile] = useState<string | null>(null);
  const [currentUploadProgress, setCurrentUploadProgress] = useState<number>(0);
  const [currentUploadFileIndex, setCurrentUploadFileIndex] = useState<number>(0);
  const [currentUploadTotalFiles, setCurrentUploadTotalFiles] = useState<number>(0);
  const [currentUploadSpeedOrBytes, setCurrentUploadSpeedOrBytes] = useState<string>("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void getActiveMicrosoftAccount().then((acc) => {
      if (acc) {
        setMsUser({ name: acc.name || acc.username, username: acc.username });
      }
    });
  }, []);



  const getInitialForm = (order?: Order | null) => {
    if (!order) {
      return {
        titulo: "",
        descricao: "",
        cliente: "",
        tipo_trabalho: "novo",
        os_anterior: "",
        revisao: 1,
        observacao: "",
        obs_prova: "",
        saida_direta: false,
        prova_digital: false,
        prova_email: false,
        endereco_entrega: "",
        destinatario: "",
        destinatario_email: "",
        email_prova: "",
        obs_prova_email: "",
        urgente: false,
        urgente_prova: false,
        urgente_impressao: false,
        urgente_acabamento: false,
        urgente_expedicao: false,
        digital_color: false,
        digital_pb: false,
        prazo: "",
        vendedor: "",
        processos: [] as string[],
        tem_nf: false,
        tem_protocolo: false,
        empresa_entrega: "PRIMACOR",
        obs_entrega: "",
        tipo_entrega: [] as string[],
        entrega_para: "",
        entrega_endereco: "",
        entrega_ac: "",
        entrega_data_limite: "",
        status_destino: "",
        setor_destino: "",
      };
    }

    let destinatario = order.destinatario || "";
    let destinatario_email = "";
    let endereco_entrega = order.endereco_entrega || "";
    let email_prova = "";
    let obs_prova = order.obs_prova || "";
    let obs_prova_email = "";

    if (order.prova_digital && order.prova_email) {
      if (destinatario.includes(" | ") || destinatario.includes("Digital:")) {
        const dMatch = destinatario.match(/Digital:\s*(.*?)(?:\s*\|\s*E-mail:|$)/i);
        const eMatch = destinatario.match(/E-mail:\s*(.*)/i);
        if (dMatch) destinatario = dMatch[1].trim();
        if (eMatch) destinatario_email = eMatch[1].trim();
      } else {
        destinatario_email = destinatario;
      }
      if (endereco_entrega.includes(" | ") || endereco_entrega.includes("Endereço:")) {
        const endMatch = endereco_entrega.match(/Endereço:\s*(.*?)(?:\s*\|\s*E-mail:|$)/i);
        const emMatch = endereco_entrega.match(/E-mail:\s*(.*)/i);
        if (endMatch) endereco_entrega = endMatch[1].trim();
        if (emMatch) email_prova = emMatch[1].trim();
      } else {
        email_prova = endereco_entrega;
      }
      if (obs_prova.includes(" | ") || obs_prova.includes("Digital:")) {
        const dMatch = obs_prova.match(/Digital:\s*(.*?)(?:\s*\|\s*E-mail:|$)/i);
        const eMatch = obs_prova.match(/E-mail:\s*(.*)/i);
        if (dMatch) obs_prova = dMatch[1].trim();
        if (eMatch) obs_prova_email = eMatch[1].trim();
      } else {
        obs_prova_email = obs_prova;
      }
    } else if (order.prova_email && !order.prova_digital) {
      destinatario_email = destinatario;
      email_prova = endereco_entrega;
      obs_prova_email = obs_prova;
      destinatario = "";
      endereco_entrega = "";
      obs_prova = "";
    }

    return {
      titulo: order.titulo || "",
      descricao: order.descricao || "",
      cliente: order.cliente || "",
      tipo_trabalho: order.tipo_trabalho || "novo",
      os_anterior: order.os_anterior || "",
      revisao: order.revisao || 1,
      observacao: order.observacao || "",
      obs_prova,
      saida_direta: order.saida_direta || false,
      prova_digital: order.prova_digital || false,
      prova_email: order.prova_email || false,
      endereco_entrega,
      destinatario,
      destinatario_email,
      email_prova,
      obs_prova_email,
      urgente: order.urgente || false,
      urgente_prova: order.urgente_prova || false,
      urgente_impressao: order.urgente_impressao || false,
      urgente_acabamento: order.urgente_acabamento || false,
      urgente_expedicao: order.urgente_expedicao || false,
      digital_color: order.digital_color || false,
      digital_pb: order.digital_pb || false,
      prazo: order.prazo ? toLocalDatetimeString(new Date(order.prazo)) : "",
      vendedor: order.vendedor || "",
      processos: order.processos ? [...order.processos] : [],
      tem_nf: order.nf === "SIM" || !!order.nf,
      tem_protocolo: order.protocolo === "SIM" || !!order.protocolo,
      empresa_entrega: order.empresa_entrega || "PRIMACOR",
      obs_entrega: order.obs_entrega || "",
      tipo_entrega: order.tipo_entrega ? [...order.tipo_entrega] : [],
      entrega_para: order.entrega_para || "",
      entrega_endereco: order.entrega_endereco || "",
      entrega_ac: order.entrega_ac || "",
      entrega_data_limite: order.entrega_data_limite ? toLocalDatetimeString(new Date(order.entrega_data_limite)) : "",
      status_destino: order.status || "",
      setor_destino: order.setor || "",
    };
  };

  const [form, setForm] = useState(() => getInitialForm(orderToEdit));

  useEffect(() => {
    if (open) {
      setStep(1);
      setStagedFiles([]);
      setCurrentUploadFile(null);
      setCurrentUploadProgress(0);
      setCurrentUploadFileIndex(0);
      setCurrentUploadTotalFiles(0);
      setCurrentUploadSpeedOrBytes("");
      setForm(getInitialForm(orderToEdit));

      supabase
        .from("vendedores")
        .select("id, nome")
        .order("nome")
        .then(({ data }) => {
          if (data) setVendedores(data);
        });
    }
  }, [open, orderToEdit]);

  const toggleProcesso = (sigla: string) => {
    setForm((f) => {
      let newProcessos = f.processos.includes(sigla)
        ? f.processos.filter((p) => p !== sigla)
        : [...f.processos, sigla];

      // CTP e OFF são vinculados na lógica gráfica
      if (sigla === "CTP" && !f.processos.includes("CTP") && !newProcessos.includes("OFF")) {
        newProcessos.push("OFF");
      }
      if (sigla === "OFF" && !f.processos.includes("OFF") && !newProcessos.includes("CTP")) {
        newProcessos.push("CTP");
      }

      return { ...f, processos: newProcessos };
    });
  };

  const toggleTipoEntrega = (tipo: string) => {
    setForm((f) => ({
      ...f,
      tipo_entrega: f.tipo_entrega.includes(tipo)
        ? f.tipo_entrega.filter((t) => t !== tipo)
        : [...f.tipo_entrega, tipo],
    }));
  };

  const resetForm = () => {
    setStep(1);
    setStagedFiles([]);
    setCurrentUploadFile(null);
    setCurrentUploadProgress(0);
    setCurrentUploadFileIndex(0);
    setCurrentUploadTotalFiles(0);
    setCurrentUploadSpeedOrBytes("");
    setForm(getInitialForm(orderToEdit));
  };

  const validateStep1 = () => {
    if (!form.titulo.trim()) {
      toast.error("Informe o Nº da O.S.");
      return false;
    }
    if (!form.cliente.trim()) {
      toast.error("Informe o Nome do Cliente");
      return false;
    }
    if (form.tipo_trabalho === "repeticao" && !form.os_anterior.trim()) {
      toast.error("Informe o N.º O.S ANTERIOR");
      return false;
    }
    if (!form.vendedor) {
      toast.error("Selecione o Vendedor responsável");
      return false;
    }
    return true;
  };


  const validateStep2 = () => {
    if (!form.prova_email && !form.prova_digital && !form.saida_direta) {
      toast.error("Selecione ao menos uma opção de Prova (Digital, E-mail ou Saída Direta)");
      return false;
    }
    if (form.urgente_prova && !form.prazo) {
      toast.error("Informe o Prazo da Prova Urgente");
      return false;
    }
    return true;
  };

  const handleNext = () => {
    if (step === 1) {
      if (validateStep1()) setStep(2);
    } else if (step === 2) {
      if (validateStep2()) setStep(3);
    }
  };

  const handleBack = () => {
    if (step === 3) setStep(2);
    else if (step === 2) setStep(1);
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!validateStep1() || !validateStep2()) return;

    const osTitulo = form.titulo.trim();

    // MODO EDIÇÃO
    if (isEdit && orderToEdit) {
      if (osTitulo !== orderToEdit.titulo.trim()) {
        setIsChecking(true);
        const { data: existing } = await supabase
          .from("orders")
          .select("id")
          .eq("titulo", osTitulo)
          .neq("id", orderToEdit.id)
          .limit(1);
        setIsChecking(false);

        if (existing && existing.length > 0) {
          toast.error("Número de O.S. já existente em outra ordem: " + osTitulo);
          setStep(1);
          return;
        }
      }

      const allProcessos = [...form.processos];
      const effectiveDescricao = form.descricao.trim() || osTitulo || "Serviço";
      const filesToUpload = [...stagedFiles];

      setIsSubmitting(true);
      setSubmitStatusText("Atualizando Ordem de Serviço...");

      try {
        if (filesToUpload.length > 0) {
          setSubmitStatusText("Conectando ao SharePoint corporativo...");
          try {
            await getSharePointAccessToken(true);
          } catch (authErr: any) {
            console.error("Falha ao autenticar Microsoft 365:", authErr);
            toast.error(`Falha na autenticação Microsoft 365: ${authErr?.message || authErr}`);
            setIsSubmitting(false);
            setSubmitStatusText("");
            return;
          }
        }

        const updatePayload: Partial<Order> = {
          titulo: osTitulo,
          descricao: effectiveDescricao,
          cliente: form.cliente.trim().toUpperCase(),
          tipo_trabalho: form.tipo_trabalho,
          os_anterior: form.tipo_trabalho === "repeticao" ? form.os_anterior.trim() || null : null,
          observacao: form.observacao.trim() || null,
          saida_direta: form.saida_direta,
          prova_digital: form.prova_digital,
          prova_email: form.prova_email,
          obs_prova: (() => {
            if (form.prova_digital && form.prova_email) {
              const parts = [];
              if (form.obs_prova.trim()) parts.push(`Digital: ${form.obs_prova.trim()}`);
              if (form.obs_prova_email.trim()) parts.push(`E-mail: ${form.obs_prova_email.trim()}`);
              return parts.length > 0 ? parts.join(" | ") : null;
            }
            if (form.prova_digital) return form.obs_prova.trim() || null;
            if (form.prova_email) return (form.obs_prova_email || form.obs_prova).trim() || null;
            return null;
          })(),
          endereco_entrega: (() => {
            if (form.prova_digital && form.prova_email) {
              const parts = [];
              if (form.endereco_entrega.trim()) parts.push(`Endereço: ${form.endereco_entrega.trim()}`);
              if (form.email_prova.trim()) parts.push(`E-mail: ${form.email_prova.trim()}`);
              return parts.length > 0 ? parts.join(" | ") : null;
            }
            if (form.prova_digital) return form.endereco_entrega.trim() || null;
            if (form.prova_email) return (form.email_prova || form.endereco_entrega).trim() || null;
            return null;
          })(),
          destinatario: (() => {
            if (form.prova_digital && form.prova_email) {
              const digitalAc = form.destinatario.trim();
              const emailAc = form.destinatario_email.trim();
              if (digitalAc && emailAc && digitalAc !== emailAc) {
                return `Digital: ${digitalAc} | E-mail: ${emailAc}`;
              }
              return digitalAc || emailAc || null;
            }
            if (form.prova_digital) return form.destinatario.trim() || null;
            if (form.prova_email) return (form.destinatario_email || form.destinatario).trim() || null;
            return null;
          })(),
          urgente:
            form.urgente_prova ||
            form.urgente_impressao ||
            form.urgente_acabamento ||
            form.urgente_expedicao,
          urgente_prova: form.urgente_prova,
          urgente_impressao: form.urgente_impressao,
          urgente_acabamento: form.urgente_acabamento,
          urgente_expedicao: form.urgente_expedicao,
          digital_color: form.digital_color,
          digital_pb: form.digital_pb,
          prazo: form.prazo ? new Date(form.prazo).toISOString() : null,
          vendedor: form.vendedor || null,
          processos: allProcessos.length > 0 ? allProcessos : [],
          nf: form.tem_nf ? (orderToEdit.nf || "SIM") : null,
          protocolo: form.tem_protocolo ? (orderToEdit.protocolo || "SIM") : null,
          empresa_entrega: form.empresa_entrega || null,
          obs_entrega: form.obs_entrega.trim() || null,
          tipo_entrega: form.tipo_entrega.length > 0 ? form.tipo_entrega : [],
          entrega_para: form.entrega_para.trim() || null,
          entrega_endereco: form.entrega_endereco.trim() || null,
          entrega_ac: form.entrega_ac.trim() || null,
          entrega_data_limite: form.entrega_data_limite
            ? new Date(form.entrega_data_limite).toISOString()
            : null,
        };

        if (onUpdate) {
          await Promise.resolve(onUpdate(orderToEdit.id, updatePayload));
        }

        if (filesToUpload.length > 0) {
          setSubmitStatusText("Conectando ao SharePoint...");
          const folder = await getOrCreateOsFolder(orderToEdit.id, osTitulo);
          setCurrentUploadTotalFiles(filesToUpload.length);

          for (let i = 0; i < filesToUpload.length; i++) {
            const file = filesToUpload[i];
            const sizeMb = (file.size / (1024 * 1024)).toFixed(1);
            setCurrentUploadFileIndex(i + 1);
            setCurrentUploadFile(file.name);
            setCurrentUploadProgress(0);
            setCurrentUploadSpeedOrBytes(`0.0 MB / ${sizeMb} MB (0%)`);
            setSubmitStatusText(`Enviando anexo ${i + 1} de ${filesToUpload.length}: ${file.name}...`);

            await uploadFileToSharePoint(
              file,
              folder,
              ({ percent, loaded, total }) => {
                const loadedMb = (loaded / (1024 * 1024)).toFixed(1);
                const totalMb = (total / (1024 * 1024)).toFixed(1);
                setCurrentUploadProgress(percent);
                setCurrentUploadSpeedOrBytes(`${loadedMb} MB / ${totalMb} MB (${percent}%)`);
              }
            );
          }
        }

        toast.success(`O.S. #${osTitulo} atualizada com sucesso!`);
        setOpen(false);
      } catch (err: any) {
        console.error("Erro ao atualizar O.S.:", err);
        toast.error(`Erro ao atualizar O.S.: ${err?.message || err}`);
      } finally {
        setIsSubmitting(false);
        setSubmitStatusText("");
        setCurrentUploadFile(null);
      }
      return;
    }

    // MODO CRIAÇÃO
    setIsChecking(true);
    const { data: existing } = await supabase
      .from("orders")
      .select("id")
      .eq("titulo", osTitulo)
      .limit(1);
    setIsChecking(false);

    if (existing && existing.length > 0) {
      toast.error("Número de O.S. já existente: " + osTitulo);
      setStep(1);
      return;
    }

    const allProcessos = [...form.processos];
    const effectiveDescricao = form.descricao.trim() || form.titulo.trim() || "Serviço";
    const filesToUpload = [...stagedFiles];

    setIsSubmitting(true);
    setSubmitStatusText("Iniciando criação da O.S....");

    try {
      // 1. Se houver anexos, pré-valida e adquire token SharePoint IMEDIATAMENTE (no contexto do clique)
      if (filesToUpload.length > 0) {
        setSubmitStatusText("Conectando ao SharePoint corporativo...");
        try {
          await getSharePointAccessToken(true);
        } catch (authErr: any) {
          console.error("Falha ao autenticar Microsoft 365:", authErr);
          toast.error(`Falha na autenticação Microsoft 365: ${authErr?.message || authErr}`);
          setIsSubmitting(false);
          setSubmitStatusText("");
          return;
        }
      }

      // 2. Criação do registro da Ordem de Serviço no banco de dados
      setSubmitStatusText("Salvando Ordem de Serviço...");
      const result = await Promise.resolve(
        onAdd({
          titulo: osTitulo,
          descricao: effectiveDescricao,
          cliente: form.cliente.trim().toUpperCase(),
          tipo_trabalho: form.tipo_trabalho,
          os_anterior: form.tipo_trabalho === "repeticao" ? form.os_anterior.trim() || undefined : undefined,
          observacao: form.observacao.trim() || undefined,
          saida_direta: form.saida_direta,
          prova_digital: form.prova_digital,
          prova_email: form.prova_email,
          obs_prova: (() => {
            if (form.prova_digital && form.prova_email) {
              const parts = [];
              if (form.obs_prova.trim()) parts.push(`Digital: ${form.obs_prova.trim()}`);
              if (form.obs_prova_email.trim()) parts.push(`E-mail: ${form.obs_prova_email.trim()}`);
              return parts.length > 0 ? parts.join(" | ") : undefined;
            }
            if (form.prova_digital) return form.obs_prova.trim() || undefined;
            if (form.prova_email) return (form.obs_prova_email || form.obs_prova).trim() || undefined;
            return undefined;
          })(),
          endereco_entrega: (() => {
            if (form.prova_digital && form.prova_email) {
              const parts = [];
              if (form.endereco_entrega.trim()) parts.push(`Endereço: ${form.endereco_entrega.trim()}`);
              if (form.email_prova.trim()) parts.push(`E-mail: ${form.email_prova.trim()}`);
              return parts.length > 0 ? parts.join(" | ") : undefined;
            }
            if (form.prova_digital) return form.endereco_entrega.trim() || undefined;
            if (form.prova_email) return (form.email_prova || form.endereco_entrega).trim() || undefined;
            return undefined;
          })(),
          destinatario: (() => {
            if (form.prova_digital && form.prova_email) {
              const digitalAc = form.destinatario.trim();
              const emailAc = form.destinatario_email.trim();
              if (digitalAc && emailAc && digitalAc !== emailAc) {
                return `Digital: ${digitalAc} | E-mail: ${emailAc}`;
              }
              return digitalAc || emailAc || undefined;
            }
            if (form.prova_digital) return form.destinatario.trim() || undefined;
            if (form.prova_email) return (form.destinatario_email || form.destinatario).trim() || undefined;
            return undefined;
          })(),
          urgente:
            form.urgente_prova ||
            form.urgente_impressao ||
            form.urgente_acabamento ||
            form.urgente_expedicao,
          urgente_prova: form.urgente_prova,
          urgente_impressao: form.urgente_impressao,
          urgente_acabamento: form.urgente_acabamento,
          urgente_expedicao: form.urgente_expedicao,
          digital_color: form.digital_color,
          digital_pb: form.digital_pb,
          prazo: form.prazo ? new Date(form.prazo).toISOString() : undefined,
          vendedor: form.vendedor || undefined,
          processos: allProcessos.length > 0 ? allProcessos : undefined,
          nf: form.tem_nf ? "SIM" : undefined,
          protocolo: form.tem_protocolo ? "SIM" : undefined,
          empresa_entrega: form.empresa_entrega || undefined,
          obs_entrega: form.obs_entrega.trim() || undefined,
          tipo_entrega: form.tipo_entrega.length > 0 ? form.tipo_entrega : undefined,
          entrega_para: form.entrega_para.trim() || undefined,
          entrega_endereco: form.entrega_endereco.trim() || undefined,
          entrega_ac: form.entrega_ac.trim() || undefined,
          entrega_data_limite: form.entrega_data_limite
            ? new Date(form.entrega_data_limite).toISOString()
            : undefined,
          status_destino: form.status_destino || undefined,
          setor_destino: form.setor_destino || undefined,
        })
      );

      // 3. Upload dos arquivos diretamente para o SharePoint Corporativo
      if (filesToUpload.length > 0) {
        let targetOrderId = (result as any)?.id;
        if (!targetOrderId) {
          const { data: latest } = await supabase
            .from("orders")
            .select("id")
            .eq("titulo", osTitulo)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          targetOrderId = latest?.id;
        }

        if (targetOrderId) {
          setSubmitStatusText("Criando pasta da O.S. no SharePoint...");
          const folder = await getOrCreateOsFolder(targetOrderId, osTitulo);

          setCurrentUploadTotalFiles(filesToUpload.length);
          let uploadedCount = 0;

          for (let i = 0; i < filesToUpload.length; i++) {
            const file = filesToUpload[i];
            const sizeMb = (file.size / (1024 * 1024)).toFixed(1);

            setCurrentUploadFileIndex(i + 1);
            setCurrentUploadFile(file.name);
            setCurrentUploadProgress(0);
            setCurrentUploadSpeedOrBytes(`0.0 MB / ${sizeMb} MB (0%)`);

            setSubmitStatusText(
              `Enviando anexo ${i + 1} de ${filesToUpload.length}: ${file.name} (${sizeMb} MB)...`
            );

            const driveItem = await uploadFileToSharePoint(
              file,
              folder,
              (percent) => {
                setCurrentUploadProgress(percent);
                const loadedMb = ((file.size * percent) / (100 * 1024 * 1024)).toFixed(1);
                setCurrentUploadSpeedOrBytes(`${loadedMb} MB / ${sizeMb} MB (${percent}%)`);
              }
            );

            setCurrentUploadProgress(100);
            setCurrentUploadSpeedOrBytes(`${sizeMb} MB / ${sizeMb} MB (100%)`);

            await (supabase.from("order_attachments" as any) as any).insert({
              order_id: targetOrderId,
              nome_arquivo: driveItem.name || file.name,
              tamanho_bytes: driveItem.size || file.size,
              content_type: driveItem.file?.mimeType || file.type || "application/octet-stream",
              sharepoint_item_id: driveItem.id,
              sharepoint_folder_id: folder.folderId,
              sharepoint_folder_name: folder.folderName,
              sharepoint_drive_id: folder.driveId,
              sharepoint_site_id: folder.siteId,
              sharepoint_web_url: driveItem.webUrl,
              sharepoint_path: `${SHAREPOINT_ROOT_FOLDER}/${folder.folderName}/${driveItem.name}`,
              status: "concluido",
            });
            uploadedCount++;
          }
          toast.success(
            `O.S. criada e ${uploadedCount} anexo(s) enviados para o SharePoint com sucesso!`
          );
        } else {
          toast.success("O.S. criada com sucesso!");
        }
      } else {
        toast.success("O.S. criada com sucesso!");
      }

      resetForm();
      setOpen(false);
    } catch (submitErr: any) {
      console.error("Erro ao salvar O.S. e anexos:", submitErr);
      toast.error(`Falha: ${submitErr?.message || submitErr}`);
    } finally {
      setIsSubmitting(false);
      setSubmitStatusText("");
    }
  };



  const stepsConfig = [
    { id: 1, title: "Identificação", desc: "Nº O.S., Cliente & Serviço", icon: FileText },
    { id: 2, title: "Especificações", desc: "Prova & Impressão", icon: Printer },
    { id: 3, title: "Logística", desc: "Expedição & Entrega", icon: PackageCheck },
  ];

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (isSubmitting) return;
        setOpen(v);
        if (!v) resetForm();
      }}
    >
      {trigger ? (
        <DialogTrigger asChild>{trigger}</DialogTrigger>
      ) : !isEdit ? (
        <DialogTrigger asChild>
          <Button
            size="sm"
            className="gap-2 bg-slate-900 hover:bg-slate-800 text-white dark:bg-[#CCD0CF] dark:hover:bg-white dark:text-[#06141B] dark:border-[#CCD0CF] font-bold shadow-md shadow-[#06141B]/20 rounded-xl transition-all"
          >
            <Plus className="h-4 w-4" />
            <span>Nova O.S.</span>
          </Button>
        </DialogTrigger>
      ) : null}

      <DialogContent
        onPointerDownOutside={(e) => e.preventDefault()}
        className="max-w-4xl p-0 overflow-hidden border border-border bg-card text-card-foreground shadow-2xl backdrop-blur-2xl rounded-2xl flex flex-col max-h-[92vh]"
      >

        {/* Top Header & Modern Stepper */}
        <div className="px-6 pt-5 pb-4 border-b border-border bg-muted/30 shrink-0">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2.5">
              <div className="h-9 w-9 rounded-xl bg-[#253745] border border-[#4A5C6A]/60 flex items-center justify-center text-[#CCD0CF]">
                {isEdit ? <Edit2 className="h-4 w-4" /> : <Sparkles className="h-4 w-4" />}
              </div>
              <div>
                <DialogTitle className="text-base font-bold text-foreground tracking-tight flex items-center gap-2">
                  {isEdit ? "Editar Ordem de Serviço" : "Nova Ordem de Serviço"}
                  <span className="text-[10px] font-mono-tech px-2 py-0.5 rounded-full bg-[#253745] border border-[#4A5C6A]/60 text-[#CCD0CF] font-normal">
                    {isEdit ? `O.S. #${orderToEdit?.titulo}` : "PRIMACOR OS v2.0"}
                  </span>
                </DialogTitle>
                <p className="text-xs text-muted-foreground">
                  {isEdit
                    ? "Edite as especificações técnicas, processos ou dados de entrega da O.S."
                    : "Preencha os dados técnicos da produção gráfica passo a passo"}
                </p>
              </div>
            </div>

            {/* Step Counter Badge */}
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-muted border border-border text-xs font-mono-tech text-foreground">
              <span className="text-[#CCD0CF] font-bold">Passo {step}</span>
              <span className="text-muted-foreground">/</span>
              <span>3</span>
            </div>
          </div>

          {/* Stepper Wizard Bar */}
          <div className="grid grid-cols-3 gap-3">
            {stepsConfig.map((s) => {
              const Icon = s.icon;
              const isActive = step === s.id;
              const isPast = step > s.id;
              return (
                <button
                  type="button"
                  key={s.id}
                  onClick={() => {
                    if (isEdit) setStep(s.id as 1 | 2 | 3);
                    else if (s.id < step) setStep(s.id as 1 | 2 | 3);
                    else if (s.id === 2 && step === 1 && validateStep1()) setStep(2);
                    else if (s.id === 3 && step === 2 && validateStep2()) setStep(3);
                  }}
                  className={`flex items-center gap-3 p-2.5 rounded-xl border transition-all text-left ${
                    isActive
                      ? "bg-[#253745] border-[#4A5C6A] text-foreground shadow-xs"
                      : isPast || isEdit
                      ? "bg-card border-emerald-500/30 text-foreground hover:bg-accent cursor-pointer"
                      : "bg-muted/40 border-border/60 text-muted-foreground cursor-not-allowed"
                  }`}
                >
                  <div
                    className={`h-7 w-7 rounded-lg flex items-center justify-center shrink-0 text-xs font-bold transition-all ${
                      isActive
                        ? "bg-[#CCD0CF] text-[#06141B] font-black shadow-xs"
                        : isPast
                        ? "bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {isPast ? <Check className="h-3.5 w-3.5" /> : s.id}
                  </div>
                  <div className="min-w-0">
                    <p
                      className={`text-xs font-semibold truncate ${
                        isActive ? "text-[#CCD0CF]" : isPast ? "text-foreground" : "text-muted-foreground"
                      }`}
                    >
                      {s.title}
                    </p>
                    <p className="text-[10px] text-muted-foreground truncate hidden sm:block">
                      {s.desc}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Barra de Progresso Real-time de Upload para o SharePoint */}
        {isSubmitting && (currentUploadTotalFiles > 0 || stagedFiles.length > 0) && (
          <div className="mx-6 mt-4 p-4 rounded-2xl bg-[#11212D] border border-[#4A5C6A] shadow-xl space-y-3 animate-in fade-in-50 duration-200">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="h-9 w-9 rounded-xl bg-[#253745] border border-[#4A5C6A]/60 flex items-center justify-center text-[#CCD0CF]">
                  <Cloud className="h-5 w-5 animate-pulse" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-foreground flex items-center gap-2">
                    <span>Enviando anexo para o SharePoint Corporativo</span>
                    {currentUploadTotalFiles > 0 && (
                      <Badge variant="outline" className="text-[10px] font-mono-tech border-[#4A5C6A] text-[#CCD0CF] bg-[#253745]">
                        Arquivo {currentUploadFileIndex} de {currentUploadTotalFiles}
                      </Badge>
                    )}
                  </h4>
                  <p className="text-[11px] text-muted-foreground truncate max-w-md font-mono-tech" title={currentUploadFile || ""}>
                    {currentUploadFile || submitStatusText}
                  </p>
                </div>
              </div>
              <span className="text-base font-mono-tech font-bold text-[#CCD0CF]">
                {currentUploadProgress}%
              </span>
            </div>

            <div className="space-y-1.5">
              <Progress
                value={currentUploadProgress}
                className="h-2.5 bg-slate-900 border border-[#4A5C6A]/40"
              />
              <div className="flex items-center justify-between text-[10px] text-muted-foreground font-mono-tech">
                <span className="text-[#9BA8AB] font-medium">
                  {currentUploadSpeedOrBytes || "Transmitindo dados..."}
                </span>
                <span>SharePoint Primacor</span>
              </div>
            </div>
          </div>
        )}

        {/* Step Content Container (Centralized, No Ugly Scrollbar) */}
        <div className="p-6 flex-1 overflow-y-auto max-h-[58vh]">
          {/* ════════════ ETAPA 1: IDENTIFICAÇÃO & CLIENTE ════════════ */}
          {step === 1 && (
            <div className="space-y-4 animate-in fade-in-50 duration-200">
              <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
                {/* Nº OS */}
                <div className="md:col-span-4 space-y-1.5">
                  <Label
                    htmlFor="titulo"
                    className="text-xs font-medium text-foreground flex items-center gap-1.5"
                  >
                    <Hash className="h-3.5 w-3.5 text-[#9BA8AB] dark:text-[#CCD0CF]" />
                    <span>Nº da O.S.</span>
                    <span className="text-rose-500">*</span>
                  </Label>
                  <Input
                    id="titulo"
                    autoFocus
                    value={form.titulo}
                    onChange={(e) => setForm((f) => ({ ...f, titulo: e.target.value }))}
                    className="h-10 bg-background border-input text-foreground placeholder:text-muted-foreground focus:border-[#4A5C6A] focus:ring-1 focus:ring-[#9BA8AB]/40 rounded-xl font-mono-tech text-sm font-semibold tracking-wider"
                  />
                </div>

                {/* Cliente */}
                <div className="md:col-span-8 space-y-1.5">
                  <Label
                    htmlFor="cliente"
                    className="text-xs font-medium text-foreground flex items-center gap-1.5"
                  >
                    <Building className="h-3.5 w-3.5 text-[#9BA8AB] dark:text-[#CCD0CF]" />
                    <span>Cliente / Razão Social</span>
                    <span className="text-rose-500">*</span>
                  </Label>
                  <Input
                    id="cliente"
                    value={form.cliente}
                    onChange={(e) => setForm((f) => ({ ...f, cliente: e.target.value.toUpperCase() }))}
                    className="h-10 bg-background border-input text-foreground placeholder:text-muted-foreground focus:border-[#4A5C6A] focus:ring-1 focus:ring-[#9BA8AB]/40 rounded-xl text-sm uppercase"
                  />
                </div>
              </div>

              {/* Descrição do Serviço */}
              <div className="space-y-1.5">
                <Label
                  htmlFor="descricao"
                  className="text-xs font-medium text-foreground flex items-center gap-1.5"
                >
                  <FileText className="h-3.5 w-3.5 text-[#9BA8AB] dark:text-[#CCD0CF]" />
                  <span>Descrição do Serviço / Produto</span>
                  <span className="text-rose-500">*</span>
                </Label>
                <Input
                  id="descricao"
                  value={form.descricao}
                  onChange={(e) => setForm((f) => ({ ...f, descricao: e.target.value }))}
                  className="h-10 bg-background border-input text-foreground placeholder:text-muted-foreground focus:border-[#4A5C6A] focus:ring-1 focus:ring-[#9BA8AB]/40 rounded-xl text-sm"
                />
              </div>

              {/* Tipo de Trabalho: Novo vs Repetição */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-medium text-foreground flex items-center gap-1.5">
                    <Sparkles className="h-3.5 w-3.5 text-[#9BA8AB]" />
                    <span>Tipo de Trabalho</span>
                  </Label>
                  {form.tipo_trabalho === "repeticao" && (
                    <Badge variant="outline" className="text-[10px] bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30 font-bold uppercase">
                      Repetição de O.S.
                    </Badge>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-2 h-10">
                  <button
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, tipo_trabalho: "novo", os_anterior: "" }))}
                    className={`h-full rounded-xl text-xs font-semibold border transition-all flex items-center justify-center gap-2 ${
                      form.tipo_trabalho !== "repeticao"
                        ? "bg-[#253745] border-[#4A5C6A] text-[#CCD0CF] shadow-sm font-bold"
                        : "bg-card border-border text-muted-foreground hover:text-foreground hover:bg-accent"
                    }`}
                  >
                    <FileText className="h-3.5 w-3.5" />
                    <span>Trabalho Novo</span>
                    {form.tipo_trabalho !== "repeticao" && <Check className="h-3.5 w-3.5 ml-0.5" />}
                  </button>
                  <button
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, tipo_trabalho: "repeticao" }))}
                    className={`h-full rounded-xl text-xs font-semibold border transition-all flex items-center justify-center gap-2 ${
                      form.tipo_trabalho === "repeticao"
                        ? "bg-amber-500/20 border-amber-500/50 text-amber-700 dark:text-amber-300 shadow-sm font-bold"
                        : "bg-card border-border text-muted-foreground hover:text-foreground hover:bg-accent"
                    }`}
                  >
                    <Repeat className="h-3.5 w-3.5 text-amber-500" />
                    <span>Repetição</span>
                    {form.tipo_trabalho === "repeticao" && <Check className="h-3.5 w-3.5 ml-0.5" />}
                  </button>
                </div>
              </div>

              {/* Campo N.º O.S ANTERIOR (quando for Repetição) */}
              {form.tipo_trabalho === "repeticao" && (
                <div className="p-3.5 rounded-xl border border-amber-500/40 bg-amber-500/5 dark:bg-amber-950/20 space-y-1.5 animate-in fade-in-50 duration-200">
                  <Label
                    htmlFor="os_anterior"
                    className="text-xs font-bold text-amber-700 dark:text-amber-400 flex items-center gap-1.5 uppercase tracking-wide"
                  >
                    <Hash className="h-3.5 w-3.5 text-amber-500" />
                    <span>N.º O.S ANTERIOR</span>
                    <span className="text-rose-500">*</span>
                  </Label>
                  <Input
                    id="os_anterior"
                    value={form.os_anterior}
                    onChange={(e) => setForm((f) => ({ ...f, os_anterior: e.target.value }))}
                    placeholder="Digite o número da O.S. anterior (Ex: 69387)"
                    className="h-10 bg-background border-amber-500/40 text-foreground placeholder:text-muted-foreground focus:border-amber-500 focus:ring-1 focus:ring-amber-500/40 rounded-xl font-mono-tech text-sm font-bold tracking-wider"
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Informe o número da O.S. anterior para referência da pré-impressão e produção.
                  </p>
                </div>
              )}

              {/* Campo Revisão (em modo edição) */}
              {isEdit && (
                <div className="p-3.5 rounded-xl border border-[#4A5C6A]/60 bg-[#253745]/20 space-y-1.5 animate-in fade-in-50 duration-200">
                  <div className="flex items-center justify-between">
                    <Label
                      htmlFor="revisao"
                      className="text-xs font-bold text-foreground flex items-center gap-1.5 uppercase tracking-wide"
                    >
                      <RotateCcw className="h-3.5 w-3.5 text-[#9BA8AB]" />
                      <span>Revisão da O.S. (REV)</span>
                    </Label>
                    <span className="text-[11px] font-mono-tech text-muted-foreground">
                      Atual: Rev {form.revisao || 1}
                    </span>
                  </div>
                  <Input
                    id="revisao"
                    type="number"
                    min={1}
                    value={form.revisao || 1}
                    onChange={(e) => {
                      const val = parseInt(e.target.value, 10);
                      setForm((f) => ({ ...f, revisao: isNaN(val) ? 1 : Math.max(1, val) }));
                    }}
                    className="h-9 bg-background border-input text-foreground font-mono-tech text-sm font-bold rounded-lg w-32"
                  />
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
                {/* Vendedor */}
                <div className="md:col-span-12 space-y-1.5">
                  <Label className="text-xs font-medium text-foreground flex items-center gap-1.5">
                    <User className="h-3.5 w-3.5 text-[#9BA8AB] dark:text-[#CCD0CF]" />
                    <span>Vendedor Responsável</span>
                    <span className="text-rose-500">*</span>
                  </Label>
                  <Select
                    value={form.vendedor}
                    onValueChange={(v) => setForm((f) => ({ ...f, vendedor: v }))}
                  >
                    <SelectTrigger className="h-10 bg-background border-input text-foreground rounded-xl focus:border-[#4A5C6A] focus:ring-1 focus:ring-[#9BA8AB]/40">
                      <SelectValue placeholder="Selecione o vendedor" />
                    </SelectTrigger>
                    <SelectContent className="bg-popover border-border text-popover-foreground rounded-xl shadow-xl">
                      {vendedores.map((v) => (
                        <SelectItem
                          key={v.id}
                          value={v.nome}
                          className="hover:bg-accent hover:text-accent-foreground cursor-pointer"
                        >
                          {v.nome}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Observações Gerais */}
              <div className="space-y-1.5">
                <Label htmlFor="observacao" className="text-xs font-medium text-foreground">
                  Observações Gerais da Ordem
                </Label>
                <Textarea
                  id="observacao"
                  value={form.observacao}
                  onChange={(e) => setForm((f) => ({ ...f, observacao: e.target.value }))}
                  placeholder="Informações adicionais, detalhes de faca, arquivos recebidos..."
                  className="min-h-[70px] bg-background border-input text-foreground placeholder:text-muted-foreground focus:border-[#4A5C6A] focus:ring-1 focus:ring-[#9BA8AB]/40 rounded-xl text-xs"
                />
              </div>

              {/* Anexos da O.S. para o SharePoint Corporativo */}
              <div className="p-3.5 rounded-xl border border-border bg-muted/30 space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                    <Cloud className="h-3.5 w-3.5 text-[#9BA8AB]" />
                    <span>Anexos da O.S. (SharePoint)</span>
                  </Label>
                  <div className="flex items-center gap-2">
                    {msUser && (
                      <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-[10px] text-emerald-400 font-medium">
                        <ShieldCheck className="h-3 w-3 text-emerald-400" />
                        <span className="truncate max-w-[150px]" title={msUser.username}>
                          {msUser.name || msUser.username}
                        </span>
                      </div>
                    )}
                    <span className="text-[10px] text-muted-foreground uppercase font-mono-tech">
                      {stagedFiles.length > 0
                        ? `${stagedFiles.length} ${stagedFiles.length === 1 ? "arquivo" : "arquivos"}`
                        : "Opcional"}
                    </span>
                  </div>
                </div>

                <div
                  onClick={(e) => {
                    e.stopPropagation();
                    fileInputRef.current?.click();
                  }}
                  className="border border-dashed border-[#4A5C6A]/50 hover:border-[#9BA8AB] bg-background/60 hover:bg-background/90 rounded-xl p-3.5 text-center cursor-pointer transition-all"
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    className="hidden"
                    onChange={(e) => {
                      if (e.target.files) {
                        const newFiles = Array.from(e.target.files);
                        setStagedFiles((prev) => {
                          const existing = new Set(prev.map((f) => `${f.name}_${f.size}`));
                          return [...prev, ...newFiles.filter((f) => !existing.has(`${f.name}_${f.size}`))];
                        });
                        e.target.value = "";
                      }
                    }}
                  />
                  <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
                    <Upload className="h-4 w-4 text-[#9BA8AB]" />
                    <span>Clique ou arraste arquivos para enviar ao SharePoint ao criar a O.S.</span>
                  </div>
                </div>

                {stagedFiles.length > 0 && (
                  <div className="space-y-1.5 max-h-28 overflow-y-auto pr-1">
                    {stagedFiles.map((file, idx) => (
                      <div
                        key={`${file.name}_${idx}`}
                        className="flex items-center justify-between text-[11px] bg-background/80 px-2.5 py-1.5 rounded-lg border border-border"
                      >
                        <span className="truncate max-w-[260px] text-foreground font-medium">{file.name}</span>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-muted-foreground font-mono-tech">
                            {(file.size / (1024 * 1024)).toFixed(1)} MB
                          </span>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setStagedFiles((prev) => prev.filter((_, i) => i !== idx));
                            }}
                            className="text-muted-foreground hover:text-red-400 p-0.5"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}



          {/* ════════════ ETAPA 2: PROVA & IMPRESSÃO ════════════ */}
          {step === 2 && (
            <div className="space-y-5 animate-in fade-in-50 duration-200">
              {/* BLOCO DE PROVA */}
              <div className="p-4 rounded-xl border border-border bg-muted/20 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-[#CCD0CF] shadow-[0_0_8px_rgba(204,208,207,0.6)]" />
                    <Label className="text-xs font-bold text-foreground uppercase tracking-wider">
                      Tipo de Prova <span className="text-rose-500">*</span>
                    </Label>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      setForm((f) => {
                        const nextUrgent = !f.urgente_prova;
                        let nextPrazo = f.prazo;
                        if (nextUrgent && !nextPrazo) {
                          const d = new Date();
                          d.setHours(d.getHours() + 2);
                          nextPrazo = toLocalDatetimeString(d);
                        }
                        return { ...f, urgente_prova: nextUrgent, prazo: nextPrazo };
                      })
                    }
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold transition-all border ${
                      form.urgente_prova
                        ? "bg-rose-500/20 border-rose-500/50 text-rose-600 dark:text-rose-300 shadow-[0_0_12px_rgba(244,63,94,0.3)] animate-pulse"
                        : "bg-card border-border text-muted-foreground hover:text-foreground hover:bg-accent"
                    }`}
                  >
                    <AlertTriangle className="h-3.5 w-3.5 text-rose-500" />
                    <span>Prova Urgente</span>
                  </button>
                </div>

                {/* CAMPO DE PRAZO PARA PROVA URGENTE */}
                {form.urgente_prova && (
                  <div className="p-3 rounded-xl border border-rose-500/40 bg-rose-500/10 dark:bg-rose-950/20 space-y-2 animate-in fade-in-50 duration-200">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-1.5 text-xs font-bold text-rose-600 dark:text-rose-300 uppercase tracking-wider">
                        <Clock className="h-3.5 w-3.5 text-rose-500 animate-pulse" />
                        <span>Prazo da Prova Urgente <span className="text-rose-500">*</span></span>
                      </div>
                      <span className="text-[10px] text-muted-foreground font-medium">
                        Contagem regressiva no card inicia ao criar a O.S.
                      </span>
                    </div>

                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                      <Input
                        type="datetime-local"
                        value={form.prazo}
                        onChange={(e) => setForm((f) => ({ ...f, prazo: e.target.value }))}
                        className="h-9 text-xs bg-background/90 border-rose-500/40 focus-visible:ring-rose-500 font-mono-tech flex-1"
                      />
                      <div className="flex items-center gap-1 shrink-0 overflow-x-auto pb-0.5">
                        {[
                          { label: "+1h", hours: 1 },
                          { label: "+2h", hours: 2 },
                          { label: "+4h", hours: 4 },
                          { label: "+6h", hours: 6 },
                          { label: "+24h", hours: 24 },
                        ].map((preset) => (
                          <button
                            key={preset.label}
                            type="button"
                            onClick={() => {
                              const d = new Date();
                              d.setHours(d.getHours() + preset.hours);
                              setForm((f) => ({ ...f, prazo: toLocalDatetimeString(d) }));
                            }}
                            className="px-2.5 py-1 text-[11px] font-bold rounded-lg bg-card border border-rose-500/30 text-rose-600 dark:text-rose-300 hover:bg-rose-500/20 transition-all font-mono-tech shadow-2xs"
                          >
                            {preset.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-3 gap-3">
                  {/* Digital */}
                  <button
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, prova_digital: !f.prova_digital }))}
                    className={`p-3 rounded-xl border text-center transition-all flex flex-col items-center gap-1 ${
                      form.prova_digital
                        ? "bg-sky-500/20 border-sky-400 text-sky-700 dark:text-sky-300 font-bold shadow-[0_0_15px_-3px_rgba(14,165,233,0.3)]"
                        : "bg-card border-border text-muted-foreground hover:text-foreground hover:border-border/80"
                    }`}
                  >
                    <span className="text-xs">Prova Digital</span>
                    <span className="text-[10px] text-muted-foreground">Impressão direta</span>
                  </button>

                  {/* E-mail */}
                  <button
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, prova_email: !f.prova_email }))}
                    className={`p-3 rounded-xl border text-center transition-all flex flex-col items-center gap-1 ${
                      form.prova_email
                        ? "bg-pink-500/20 border-pink-400 text-pink-700 dark:text-pink-300 font-bold shadow-[0_0_15px_-3px_rgba(236,72,153,0.3)]"
                        : "bg-card border-border text-muted-foreground hover:text-foreground hover:border-border/80"
                    }`}
                  >
                    <span className="text-xs">Prova E-mail</span>
                    <span className="text-[10px] text-muted-foreground">Envio em PDF</span>
                  </button>

                  {/* Saída Direta */}
                  <button
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, saida_direta: !f.saida_direta }))}
                    className={`p-3 rounded-xl border text-center transition-all flex flex-col items-center gap-1 ${
                      form.saida_direta
                        ? "bg-amber-500/20 border-amber-400 text-amber-700 dark:text-amber-300 font-bold shadow-[0_0_15px_-3px_rgba(245,158,11,0.3)]"
                        : "bg-card border-border text-muted-foreground hover:text-foreground hover:border-border/80"
                    }`}
                  >
                    <span className="text-xs">Saída Direta</span>
                    <span className="text-[10px] text-muted-foreground">Sem aprovação</span>
                  </button>
                </div>

                {/* Detalhes: PROVA DIGITAL */}
                {form.prova_digital && (
                  <div className="pt-2.5 border-t border-border space-y-1.5">
                    <div className="flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-sky-500 shadow-[0_0_6px_#0ea5e9]" />
                      <span className="text-[11px] font-bold uppercase tracking-wider text-sky-700 dark:text-sky-300 font-mono-tech">
                        Prova Digital
                      </span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                      <Input
                        value={form.destinatario}
                        onChange={(e) => setForm((f) => ({ ...f, destinatario: e.target.value }))}
                        placeholder="Aos Cuidados (A/C)..."
                        className="h-8 bg-background border-input text-xs text-foreground placeholder:text-muted-foreground rounded-lg"
                      />
                      <Input
                        value={form.endereco_entrega}
                        onChange={(e) => setForm((f) => ({ ...f, endereco_entrega: e.target.value }))}
                        placeholder="Endereço..."
                        className="h-8 bg-background border-input text-xs text-foreground placeholder:text-muted-foreground rounded-lg"
                      />
                      <Input
                        value={form.obs_prova}
                        onChange={(e) => setForm((f) => ({ ...f, obs_prova: e.target.value }))}
                        placeholder="Obs específicas de prova..."
                        className="h-8 bg-background border-input text-xs text-foreground placeholder:text-muted-foreground rounded-lg"
                      />
                    </div>
                  </div>
                )}

                {/* Detalhes: PROVA E-MAIL */}
                {form.prova_email && (
                  <div className="pt-2.5 border-t border-border space-y-1.5">
                    <div className="flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-pink-500 shadow-[0_0_6px_#ec4899]" />
                      <span className="text-[11px] font-bold uppercase tracking-wider text-pink-700 dark:text-pink-300 font-mono-tech">
                        Prova E-mail
                      </span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                      <Input
                        value={form.destinatario_email}
                        onChange={(e) => setForm((f) => ({ ...f, destinatario_email: e.target.value }))}
                        placeholder="Aos Cuidados (A/C)..."
                        className="h-8 bg-background border-input text-xs text-foreground placeholder:text-muted-foreground rounded-lg"
                      />
                      <Input
                        value={form.email_prova}
                        onChange={(e) => setForm((f) => ({ ...f, email_prova: e.target.value }))}
                        placeholder="E-mails..."
                        className="h-8 bg-background border-input text-xs text-foreground placeholder:text-muted-foreground rounded-lg"
                      />
                      <Input
                        value={form.obs_prova_email}
                        onChange={(e) => setForm((f) => ({ ...f, obs_prova_email: e.target.value }))}
                        placeholder="Obs específica de prova..."
                        className="h-8 bg-background border-input text-xs text-foreground placeholder:text-muted-foreground rounded-lg"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* SUPRIMENTOS & PROCESSOS ESPECIAIS (PANTONE - FACA - CLICHÊ - OUTROS) */}
              <div className="p-4 rounded-xl border border-border bg-muted/20 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-amber-500 shadow-[0_0_8px_#f59e0b]" />
                    <Label className="text-xs font-bold text-foreground uppercase tracking-wider">
                      Suprimentos & Processos Especiais
                    </Label>
                  </div>
                  <span className="text-[11px] text-muted-foreground font-mono-tech">
                    Faca e Clichê ficam amarelos; Pantone e Outros ficam rosa clarinho
                  </span>
                </div>

                {/* Seleção: PANTONE - FACA - CLICHÊ - OUTROS */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1">
                  {SPECIAL_SUPPLIES.map((item) => {
                    const active = isSpecialSupplyActive(form.processos, item.id);
                    const isPink = item.id === "PANTONE" || item.id === "OUTROS";
                    return (
                      <button
                        type="button"
                        key={item.id}
                        onClick={() => {
                          setForm((f) => ({
                            ...f,
                            processos: toggleSpecialSupplyActive(f.processos, item.id),
                          }));
                        }}
                        className={`p-3 rounded-xl border-2 transition-all flex flex-col items-center justify-center gap-1.5 text-center cursor-pointer ${
                          active
                            ? isPink
                              ? "bg-pink-100/90 dark:bg-pink-950/40 border-pink-400 dark:border-pink-500/70 text-pink-800 dark:text-pink-200 font-extrabold shadow-[0_0_15px_rgba(244,114,182,0.25)] scale-[1.02]"
                              : "bg-amber-500/20 border-amber-500 text-amber-700 dark:text-amber-300 font-extrabold shadow-[0_0_15px_rgba(245,158,11,0.25)] scale-[1.02]"
                            : "bg-card border-border text-muted-foreground hover:text-foreground hover:bg-accent hover:border-border/80"
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <span
                            className={`w-2.5 h-2.5 rounded-full transition-all ${
                              active
                                ? isPink
                                  ? "bg-pink-500 shadow-[0_0_8px_#ec4899]"
                                  : "bg-amber-500 shadow-[0_0_8px_#f59e0b]"
                                : "bg-muted-foreground/30"
                            }`}
                          />
                          <span className="font-mono-tech font-black text-sm tracking-wider">
                            {item.label}
                          </span>
                        </div>
                        <span className="text-[11px] font-medium opacity-80">
                          {active ? "Marcado (Pendente no Card)" : "Clique para marcar"}
                        </span>
                      </button>
                    );
                  })}
                </div>

                {/* CAMPO DE NÚMEROS DO PANTONE */}
                {isSpecialSupplyActive(form.processos, "PANTONE") && (
                  <div className="p-3 rounded-xl border border-pink-300 dark:border-pink-800/80 bg-pink-50/70 dark:bg-pink-950/20 space-y-1.5 animate-in fade-in-50 duration-200">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs font-bold text-pink-700 dark:text-pink-300 uppercase flex items-center gap-1.5">
                        <Sparkles className="h-3.5 w-3.5 text-pink-500" />
                        Números dos Pantones
                      </Label>
                      <span className="text-[10px] text-muted-foreground font-mono-tech">Ex: 485 C, Reflex Blue, 871 C</span>
                    </div>
                    <Input
                      value={getSpecialSupplyCustomText(form.processos, "PANTONE")}
                      onChange={(e) => {
                        const val = e.target.value;
                        setForm((f) => ({
                          ...f,
                          processos: setSpecialSupplyCustomText(f.processos, "PANTONE", val),
                        }));
                      }}
                      placeholder="Informe os números dos pantones desta O.S..."
                      className="h-8.5 bg-background border-pink-300 dark:border-pink-800/80 text-xs text-foreground placeholder:text-muted-foreground rounded-lg font-mono-tech"
                    />
                  </div>
                )}

                {/* CAMPO DE PREENCHIMENTO MANUAL: OUTROS */}
                {isSpecialSupplyActive(form.processos, "OUTROS") && (
                  <div className="p-3 rounded-xl border border-pink-300 dark:border-pink-800/80 bg-pink-50/70 dark:bg-pink-950/20 space-y-1.5 animate-in fade-in-50 duration-200">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs font-bold text-pink-700 dark:text-pink-300 uppercase flex items-center gap-1.5">
                        <Sparkles className="h-3.5 w-3.5 text-pink-500" />
                        Especificação de Outros Suprimentos / Processos
                      </Label>
                      <span className="text-[10px] text-muted-foreground font-mono-tech">Preenchimento manual</span>
                    </div>
                    <Input
                      value={getSpecialSupplyCustomText(form.processos, "OUTROS")}
                      onChange={(e) => {
                        const val = e.target.value;
                        setForm((f) => ({
                          ...f,
                          processos: setSpecialSupplyCustomText(f.processos, "OUTROS", val),
                        }));
                      }}
                      placeholder="Descreva o suprimento ou processo especial necessário..."
                      className="h-8.5 bg-background border-pink-300 dark:border-pink-800/80 text-xs text-foreground placeholder:text-muted-foreground rounded-lg"
                    />
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ════════════ ETAPA 3: LOGÍSTICA ════════════ */}
          {step === 3 && (
            <div className="space-y-4 animate-in fade-in-50 duration-200">

              {/* EXPEDIÇÃO & LOGÍSTICA */}
              <div className="p-4 rounded-xl border border-border bg-muted/20 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Truck className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                    <Label className="text-xs font-bold text-foreground uppercase tracking-wider">
                      Expedição & Entrega
                    </Label>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      setForm((f) => ({ ...f, urgente_expedicao: !f.urgente_expedicao }))
                    }
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold transition-all border ${
                      form.urgente_expedicao
                        ? "bg-rose-500/20 border-rose-500/50 text-rose-600 dark:text-rose-300 shadow-[0_0_12px_rgba(244,63,94,0.3)] animate-pulse"
                        : "bg-card border-border text-muted-foreground hover:text-foreground hover:bg-accent"
                    }`}
                  >
                    <AlertTriangle className="h-3.5 w-3.5 text-rose-500" />
                    <span>Entrega Urgente</span>
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {/* Modal / Veículo */}
                  <div className="space-y-1">
                    <span className="text-[10px] font-mono-tech text-muted-foreground">Transporte:</span>
                    <div className="flex gap-1.5">
                      {["MOTO", "CARRO", "RETIRA"].map((t) => {
                        const active = form.tipo_entrega.includes(t);
                        return (
                          <button
                            type="button"
                            key={t}
                            onClick={() => toggleTipoEntrega(t)}
                            className={`flex-1 py-1 px-1.5 rounded-lg text-[11px] font-bold border transition-all ${
                              active
                                ? "bg-emerald-600 text-white border-emerald-400 shadow-sm"
                                : "bg-card border-border text-muted-foreground hover:text-foreground hover:bg-accent"
                            }`}
                          >
                            {t}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Documentos */}
                  <div className="space-y-1">
                    <span className="text-[10px] font-mono-tech text-muted-foreground">Documentação:</span>
                    <div className="flex gap-1.5">
                      <button
                        type="button"
                        onClick={() => setForm((f) => ({ ...f, tem_nf: !f.tem_nf }))}
                        className={`flex-1 py-1 px-1.5 rounded-lg text-[11px] font-bold border transition-all ${
                          form.tem_nf
                            ? "bg-[#253745] text-[#CCD0CF] border-[#4A5C6A] shadow-sm"
                            : "bg-card border-border text-muted-foreground hover:text-foreground hover:bg-accent"
                        }`}
                      >
                        NF
                      </button>
                      <button
                        type="button"
                        onClick={() => setForm((f) => ({ ...f, tem_protocolo: !f.tem_protocolo }))}
                        className={`flex-1 py-1 px-1.5 rounded-lg text-[11px] font-bold border transition-all ${
                          form.tem_protocolo
                            ? "bg-[#253745] text-[#CCD0CF] border-[#4A5C6A] shadow-sm"
                            : "bg-card border-border text-muted-foreground hover:text-foreground hover:bg-accent"
                        }`}
                      >
                        Protocolo
                      </button>
                    </div>
                  </div>

                  {/* Origem */}
                  <div className="space-y-1">
                    <span className="text-[10px] font-mono-tech text-muted-foreground">Origem:</span>
                    <div className="flex gap-1">
                      {["PRIMACOR", "IMPRIMASET", "CLIENTE"].map((emp) => (
                        <button
                          type="button"
                          key={emp}
                          onClick={() => setForm((f) => ({ ...f, empresa_entrega: emp }))}
                          className={`flex-1 py-1 px-1 rounded-lg text-[10px] font-bold border transition-all truncate ${
                            form.empresa_entrega === emp
                              ? "bg-[#253745] text-[#CCD0CF] border-[#4A5C6A] shadow-sm"
                              : "bg-card border-border text-muted-foreground hover:text-foreground hover:bg-accent"
                          }`}
                        >
                          {emp === "IMPRIMASET" ? "Imprim." : emp.charAt(0) + emp.slice(1).toLowerCase()}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Destinatário & Observações de Entrega */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                  <Input
                    value={form.entrega_para}
                    onChange={(e) => setForm((f) => ({ ...f, entrega_para: e.target.value }))}
                    placeholder="Entregar para (Nome da Empresa ou Local)..."
                    className="h-8 bg-background border-input text-xs text-foreground placeholder:text-muted-foreground rounded-lg"
                  />
                  <Input
                    value={form.obs_entrega}
                    onChange={(e) => setForm((f) => ({ ...f, obs_entrega: e.target.value }))}
                    placeholder="Observações de entrega (horário, restrições, etc.)..."
                    className="h-8 bg-background border-input text-xs text-foreground placeholder:text-muted-foreground rounded-lg"
                  />
                </div>

                {/* Endereço & Data Limite */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                  <Input
                    value={form.entrega_endereco}
                    onChange={(e) => setForm((f) => ({ ...f, entrega_endereco: e.target.value }))}
                    placeholder="Endereço de entrega final..."
                    className="h-8 bg-background border-input text-xs text-foreground placeholder:text-muted-foreground rounded-lg"
                  />
                  <div className="flex gap-2">
                    <Input
                      value={form.entrega_ac}
                      onChange={(e) => setForm((f) => ({ ...f, entrega_ac: e.target.value }))}
                      placeholder="A/C..."
                      className="h-8 flex-1 bg-background border-input text-xs text-foreground placeholder:text-muted-foreground rounded-lg"
                    />
                    <Input
                      type="datetime-local"
                      value={form.entrega_data_limite}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, entrega_data_limite: e.target.value }))
                      }
                      className="h-8 w-44 bg-background border-input text-xs text-foreground placeholder:text-muted-foreground rounded-lg"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Bottom Navigation Footer */}
        <div className="px-6 py-4 border-t border-border bg-muted/30 flex items-center justify-between shrink-0">
          <div>
            {step > 1 ? (
              <Button
                type="button"
                variant="ghost"
                onClick={handleBack}
                className="text-xs text-foreground hover:bg-accent gap-1.5 rounded-xl h-10 px-4"
              >
                <ArrowLeft className="h-4 w-4" />
                <span>Voltar</span>
              </Button>
            ) : (
              <Button
                type="button"
                variant="ghost"
                onClick={() => setOpen(false)}
                className="text-xs text-muted-foreground hover:text-foreground rounded-xl h-10 px-4"
              >
                Cancelar
              </Button>
            )}
          </div>

          <div className="flex items-center gap-2.5">
            {step < 3 ? (
              <Button
                type="button"
                onClick={handleNext}
                className="bg-slate-900 hover:bg-slate-800 text-white dark:bg-[#CCD0CF] dark:hover:bg-white dark:text-[#06141B] text-xs font-semibold rounded-xl h-10 px-5 gap-1.5 shadow-md"
              >
                <span>Avançar para {step === 1 ? "Especificações" : "Logística"}</span>
                <ArrowRight className="h-4 w-4" />
              </Button>
            ) : (
              <Button
                type="button"
                disabled={isChecking || isSubmitting}
                onClick={() => handleSubmit()}
                className="bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white text-xs font-bold rounded-xl h-10 px-6 gap-2 shadow-lg shadow-emerald-500/25 transition-all"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin text-white" />
                    <span className="truncate max-w-[280px]">
                      {currentUploadTotalFiles > 0
                        ? `Enviando ${currentUploadProgress}% (${currentUploadFileIndex}/${currentUploadTotalFiles})`
                        : submitStatusText || "Salvando..."}
                    </span>
                  </>
                ) : (
                  <>
                    <Check className="h-4 w-4" />
                    <span>{isChecking ? "Verificando O.S...." : isEdit ? "Atualizar O.S." : "Criar Ordem de Serviço"}</span>
                  </>
                )}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
