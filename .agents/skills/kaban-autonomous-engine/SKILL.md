---
name: kaban-autonomous-engine
description: >-
  Autonomous architecture engineering, continuous health monitoring, query optimization,
  and self-healing telemetry for the Primacor Kaban system.
---

# Kaban Autonomous Engine (KAE) — Skill & Runbook

This skill equips Antigravity with specialized architectural protocols to monitor, optimize, and maintain the **Primacor Kaban** production system at peak speed, high reliability, and real-time synchronization, even under loads of tens of thousands of Orders of Service (O.S.).

---

## 1. Architectural Principles of Kaban Autonomous Engine

The Kaban Autonomous Engine is structured around 5 decoupled, resilient pillars:

```
┌─────────────────────────────────────────────────────────────────────────┐
│                       KABAN AUTONOMOUS ENGINE                           │
├────────────────────────────────┬────────────────────────────────────────┤
│ 1. Telemetry & Watchdog        │ Autonomous 24/7 Health & Edge Heartbeat │
│ 2. Query & Keyset Pagination   │ Zero-Scan Projections & Archive Split  │
│ 3. Realtime Stream Optimizer   │ Filtered Subscriptions & Reconciler    │
│ 4. Background Sync Pipeline    │ Resilient Graph API & Dedup Engine     │
│ 5. Self-Healing & Diagnostics  │ Auto-Recovery, Index Guard & Alerts    │
└────────────────────────────────┴────────────────────────────────────────┘
```

### Pillar 1: Independent 24/7 Telemetry & Watchdog
- **Decoupled from Antigravity**: Operates through Supabase PostgreSQL triggers, Edge Functions / cron jobs, and client telemetry beacons.
- **Heartbeat Record**: Writes to `system_health_telemetry` table (latency, active WebSocket channels, pending sync jobs, error rates).
- **Proactive Alerts**: Injects operational warnings into `avisos` table whenever critical thresholds (e.g. Graph API 503, connection pool saturation, unindexed sequential scans) are detected.

### Pillar 2: Query & Keyset Pagination Engine
- **Active vs. Archive Segregation**:
  - `activeOrders`: Queries strictly `arquivado = false`, with sector filtering and lightweight column projection (`id, titulo, cliente, status, setor, prioridade, posicao, updated_at`).
  - `archivedOrders`: Never dumped in bulk into browser heap. Loaded on-demand via paginated cursor/search or virtualized infinite scroll.
- **Index Guard**: Enforces composite indexes on `(arquivado, setor, posicao)`, `(status, arquivado)`, and full-text `gin` indexes on `(titulo, cliente)`.

### Pillar 3: Realtime Stream Optimizer
- **Channel Partitioning**:
  - Global channel only for critical lifecycle mutations (`INSERT`, `DELETE`, status transitions).
  - High-frequency drag-and-drop position updates debounced or scoped to active department view.
- **Post-Reconnection Delta Reconciliation**:
  - On `SUBSCRIBED` transition after a network drop, fetches only delta mutations (`updated_at > lastSyncTime`) instead of wiping and re-downloading all orders.

### Pillar 4: Background Sync Pipeline (Outlook & SharePoint)
- **Time-Windowed Email Sync**:
  - Queries `order_email_events` with rolling window (e.g. `email_datetime >= now() - interval '30 days'`), preventing quadratic memory growth.
- **SharePoint Resilient Queue**:
  - Large chunked uploads (5 MB slices) backed by pending upload state.
  - Automatic retry with exponential backoff on Microsoft Graph API rate limits (HTTP 429) or transient timeouts.

### Pillar 5: Self-Healing & Diagnostics
- Automated scripts to detect orphaned orders, missing foreign keys, stale approval locks, and duplicate email fingerprints without human intervention.

---

## 2. Diagnostic & Optimization Runbooks

### Runbook A: Database Query & Index Health Check
When inspecting database performance or preparing migrations:
1. Verify existing indexes on `orders`, `order_email_events`, `order_attachments`, and `profiles`.
2. Check for missing composite indexes on filter combinations:
   - `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_orders_active_flow ON public.orders (arquivado, setor, posicao) WHERE arquivado = false;`
   - `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_orders_text_search ON public.orders USING gin (to_tsvector('portuguese', coalesce(titulo, '') || ' ' || coalesce(cliente, '')));`
3. Audit slow query logs using Supabase Studio or `pg_stat_statements`.

### Runbook B: Client-Side Heap & Realtime Audit
1. Verify that `useOrders.ts` does not load archived orders into the primary Kanban board memory.
2. Confirm that `applyOrderPayload` performs surgical immutable updates rather than full array re-allocation.
3. Validate WebSocket heartbeat states (`ONLINE`, `RECONNECTING`, `OFFLINE`).

### Runbook C: Background Sync & SharePoint Verification
1. Verify Microsoft Graph API token validity and refresh cycles via `msalClient.ts`.
2. Ensure `runEmailSync` handles HTTP 503 timeouts gracefully without breaking other mailboxes.
3. Validate that file uploads exceeding 4 MB utilize chunked upload sessions (`sharepointService.ts`).

---

## 3. Autonomous Engine Architecture File Structure
- `src/lib/autonomousEngine/`:
  - `telemetry.ts`: Client health metrics aggregator & heartbeat beacon.
  - `queryOptimizer.ts`: Projections, cached queries, and keyset paginators.
  - `selfHealing.ts`: Consistency checkers and recovery routines.
- `supabase/functions/kaban-telemetry-cron/`:
  - Standalone serverless cron checking database health, stalled orders, and Graph API connectivity independent of any user session.
- `supabase/migrations/`:
  - Dedicated index optimization and telemetry schema migrations.
