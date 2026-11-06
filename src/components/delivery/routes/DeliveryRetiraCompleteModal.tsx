import { useState, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  CheckCircle2,
  Camera,
  Upload,
  Image as ImageIcon,
  FileText,
  X,
  Store,
  UserCheck,
} from "lucide-react";
import { toast } from "sonner";
import { uploadDeliveryProofFile, updateDriverDeliveryStatus } from "@/lib/deliveryService";
import type { Order } from "@/types/order";
import { cleanOsNumber } from "@/components/ProductionCard";

interface DeliveryRetiraCompleteModalProps {
  order: Order | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function DeliveryRetiraCompleteModal({
  order,
  open,
  onOpenChange,
  onSuccess,
}: DeliveryRetiraCompleteModalProps) {
  const [entreguePara, setEntreguePara] = useState("");
  const [obsEntrega, setObsEntrega] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!order) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setSelectedFile(file);
    if (file.type.startsWith("image/")) {
      const url = URL.createObjectURL(file);
      setPreviewUrl(url);
    } else {
      setPreviewUrl(null);
    }
  };

  const handleClearFile = () => {
    setSelectedFile(null);
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!entreguePara.trim()) {
      toast.error("Informe quem retirou o material.");
      return;
    }

    if (!selectedFile) {
      toast.error("É obrigatório anexar a foto do protocolo/canhoto de retirada assinado.");
      return;
    }

    setSubmitting(true);
    try {
      // 1. Upload do comprovante
      const uploadRes = await uploadDeliveryProofFile(order.id, selectedFile);
      if (!uploadRes.success) {
        toast.error(`Falha no upload do protocolo: ${uploadRes.error}`);
        setSubmitting(false);
        return;
      }

      // 2. Conclusão no banco de dados
      const statusRes = await updateDriverDeliveryStatus({
        orderId: order.id,
        newStatus: "entregue",
        entreguePara: entreguePara.trim(),
        obsEntrega: obsEntrega.trim()
          ? `[RETIRADA NO BALCÃO] ${obsEntrega.trim()}`
          : "[RETIRADA NO BALCÃO] Concluída com sucesso",
      });

      if (!statusRes.success) {
        toast.error(`Falha ao registrar entrega: ${statusRes.error}`);
        setSubmitting(false);
        return;
      }

      toast.success(
        `Retirada da O.S. #${cleanOsNumber(order.titulo)} confirmada com protocolo anexado!`
      );
      handleClearFile();
      setEntreguePara("");
      setObsEntrega("");
      onOpenChange(false);
      onSuccess?.();
    } catch (err: any) {
      toast.error(`Erro ao concluir retirada: ${err.message || err}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md bg-card border-border shadow-2xl p-6">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-500">
              <Store className="h-5 w-5" />
            </div>
            <div>
              <DialogTitle className="text-base font-bold text-foreground flex items-center gap-2">
                Concluir Retirada no Balcão
                <Badge variant="outline" className="text-xs font-mono font-normal">
                  OS #{cleanOsNumber(order.titulo)}
                </Badge>
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                Cliente: <strong>{order.cliente}</strong>
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4 mt-2">
          {/* Nome de quem retirou */}
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs font-semibold flex items-center gap-1.5">
              <UserCheck className="h-3.5 w-3.5 text-primary" />
              Nome de quem retirou *
            </Label>
            <Input
              required
              placeholder="Ex: João da Silva (Motorista / Próprio Cliente)"
              value={entreguePara}
              onChange={(e) => setEntreguePara(e.target.value)}
              className="text-xs h-8 bg-muted/30"
            />
          </div>

          {/* Anexo de Foto Obrigatória do Protocolo */}
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs font-semibold flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <Camera className="h-3.5 w-3.5 text-emerald-500" />
                Fotografia do Protocolo Assinado *
              </span>
              <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-normal">
                Obrigatório para concluir
              </span>
            </Label>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,application/pdf"
              capture="environment"
              className="hidden"
              onChange={handleFileChange}
            />

            {!selectedFile ? (
              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-border rounded-xl p-4 flex flex-col items-center justify-center gap-2 cursor-pointer hover:border-emerald-500/50 hover:bg-emerald-500/5 transition-all text-center"
              >
                <div className="p-2.5 rounded-full bg-muted text-muted-foreground">
                  <Upload className="h-5 w-5" />
                </div>
                <div className="text-xs font-medium text-foreground">
                  Clique para tirar foto ou selecionar comprovante
                </div>
                <div className="text-[10px] text-muted-foreground">
                  JPG, PNG ou PDF (comprovante/canhoto de retirada assinado)
                </div>
              </div>
            ) : (
              <div className="relative border rounded-xl p-2.5 bg-muted/20 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 overflow-hidden">
                  {previewUrl ? (
                    <img
                      src={previewUrl}
                      alt="Preview"
                      className="h-12 w-12 object-cover rounded-md border shrink-0"
                    />
                  ) : (
                    <div className="h-12 w-12 rounded-md bg-muted flex items-center justify-center shrink-0">
                      <FileText className="h-6 w-6 text-muted-foreground" />
                    </div>
                  )}
                  <div className="flex flex-col overflow-hidden">
                    <span className="text-xs font-medium truncate text-foreground">
                      {selectedFile.name}
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      {(selectedFile.size / 1024).toFixed(1)} KB
                    </span>
                  </div>
                </div>

                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground hover:text-red-500 shrink-0"
                  onClick={handleClearFile}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>

          {/* Observações da Retirada */}
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs text-muted-foreground">
              Observação Adicional (Opcional)
            </Label>
            <Textarea
              placeholder="Ex: Retirou 3 volumes lacrados, conferido no ato..."
              value={obsEntrega}
              onChange={(e) => setObsEntrega(e.target.value)}
              className="text-xs h-16 resize-none bg-muted/30"
            />
          </div>

          <DialogFooter className="mt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={submitting || !selectedFile || !entreguePara.trim()}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold gap-1.5"
            >
              <CheckCircle2 className="h-4 w-4" />
              {submitting ? "Gravando e Enviando..." : "Confirmar e Finalizar Retirada"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
