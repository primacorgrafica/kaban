# Primacor - Sistema de Gestão de Pré-impressão & Produção

Sistema interno de gerenciamento de ordens de serviço (O.S.), fluxo de pré-impressão, PCP, expedição e monitoramento de equipamentos da **Primacor Gráfica e Editora LTDA**.

## Tecnologias Utilizadas

- **Frontend**: React 18, TypeScript, Vite
- **Estilização**: Tailwind CSS, Radix UI (shadcn/ui), Lucide Icons
- **Backend & Database**: Supabase (PostgreSQL, Auth, Edge Functions, Realtime)
- **Gerenciamento de Estado/Cache**: TanStack React Query

## Execução Local

1. Instale as dependências:
   ```bash
   npm install
   ```

2. Configure as variáveis de ambiente no arquivo `.env`:
   ```env
   VITE_SUPABASE_URL="https://seu-projeto.supabase.co"
   VITE_SUPABASE_PUBLISHABLE_KEY="sua-chave-anon"
   ```

3. Inicie o servidor de desenvolvimento:
   ```bash
   npm run dev
   ```

4. Acesse no navegador:
   `http://localhost:8080`

## Scripts Disponíveis

- `npm run dev`: Inicia o servidor Vite local.
- `npm run build`: Gera o build de produção.
- `npm run preview`: Visualiza o build de produção localmente.
- `npm run test`: Executa os testes automatizados com Vitest.
