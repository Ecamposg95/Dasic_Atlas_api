import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Coins, RefreshCw, Edit2 } from 'lucide-react';
import { useTcHoy } from '../hooks/useTcHoy';
import { useHistorialFx } from '../hooks/useHistorialFx';
import { api } from '@/lib/api';
import { toast } from '@/lib/toast';
import { useIsAdmin } from '@/lib/permissions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Modal, ModalFooter } from '@/components/ui/modal';
import { Card, CardContent } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton, SkeletonRows } from '@/components/ui/skeleton';
import {
  DataTable,
  DataTableHead,
  DataTableBody,
  DataTableRow,
  DataTableEmpty,
} from '@/components/ui/data-table';
import type { TipoCambio, FxOverridePayload } from '../types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmtFecha(iso: string): string {
  return new Date(iso + 'T00:00:00Z').toLocaleDateString('es-MX', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Modal Override
// ---------------------------------------------------------------------------

interface OverrideModalProps {
  onClose: () => void;
  onSaved: () => void;
}

function OverrideModal({ onClose, onSaved }: OverrideModalProps) {
  const [fecha, setFecha] = useState(today());
  const [tc, setTc] = useState('');
  const [nota, setNota] = useState('');
  const [err, setErr] = useState<string | null>(null);

  const qc = useQueryClient();
  const mutation = useMutation({
    mutationFn: (payload: FxOverridePayload) =>
      api.post<TipoCambio>('/api/fx/override', payload),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['fx-hoy'] });
      void qc.invalidateQueries({ queryKey: ['fx-historico'] });
      toast({ kind: 'success', title: 'Override guardado' });
      onSaved();
    },
    onError: (err) => {
      const status = (err as { status?: number }).status;
      if (status === 403) {
        toast({ kind: 'error', title: 'Sin permiso' });
      } else {
        const detail = (err as { detail?: string }).detail ?? 'Error al guardar override';
        toast({ kind: 'error', title: detail });
      }
    },
  });

  function onSubmit() {
    setErr(null);
    const tcNum = parseFloat(tc);
    if (!Number.isFinite(tcNum) || tcNum <= 0) {
      setErr('El TC debe ser mayor a 0.');
      return;
    }
    if (!fecha) {
      setErr('La fecha es requerida.');
      return;
    }
    mutation.mutate({
      fecha,
      usd_mxn: tcNum,
      nota: nota.trim() || null,
    });
  }

  return (
    <Modal title="Override manual TC" onClose={onClose} size="sm">
      <div className="space-y-3">
        <div>
          <label className="block text-xs text-muted-foreground mb-1">
            Fecha <span className="text-rose-600 dark:text-rose-400">*</span>
          </label>
          <Input
            type="date"
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
          />
        </div>
        <div>
          <label className="block text-xs text-muted-foreground mb-1">
            TC USD/MXN <span className="text-rose-600 dark:text-rose-400">*</span>
          </label>
          <Input
            type="number"
            step="0.0001"
            min="1"
            max="100"
            value={tc}
            onChange={(e) => setTc(e.target.value)}
            placeholder="Ej. 17.5000"
          />
        </div>
        <div>
          <label className="block text-xs text-muted-foreground mb-1">Nota (opcional)</label>
          <Input
            value={nota}
            onChange={(e) => setNota(e.target.value)}
            placeholder="Motivo del override…"
          />
        </div>
        {err && (
          <div className="text-xs bg-rose-50 dark:bg-rose-900/30 border border-rose-300 dark:border-rose-700/50 rounded p-2 text-rose-700 dark:text-rose-300">
            {err}
          </div>
        )}
      </div>
      <ModalFooter>
        <Button variant="ghost" size="sm" onClick={onClose} disabled={mutation.isPending}>
          Cancelar
        </Button>
        <Button size="sm" onClick={onSubmit} disabled={mutation.isPending}>
          {mutation.isPending ? 'Guardando…' : 'Guardar override'}
        </Button>
      </ModalFooter>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Página principal
// ---------------------------------------------------------------------------

export function FxPage() {
  const isAdmin = useIsAdmin();
  const [showOverride, setShowOverride] = useState(false);

  const qc = useQueryClient();
  const { data: tcHoy, isLoading: loadingHoy } = useTcHoy();
  const { data: historico, isLoading: loadingHist } = useHistorialFx(30);

  const refreshMutation = useMutation({
    mutationFn: () => api.post<TipoCambio>('/api/fx/refresh'),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['fx-hoy'] });
      void qc.invalidateQueries({ queryKey: ['fx-historico'] });
      toast({ kind: 'success', title: 'TC actualizado desde Banxico' });
    },
    onError: (err) => {
      const status = (err as { status?: number }).status;
      if (status === 403) {
        toast({ kind: 'error', title: 'Sin permiso' });
      } else {
        const detail = (err as { detail?: string }).detail ?? 'Error al refrescar TC';
        toast({ kind: 'error', title: detail });
      }
    },
  });

  const items = historico?.items ?? [];

  return (
    <div className="p-6 max-w-5xl mx-auto w-full space-y-6">
      {/* Header */}
      <PageHeader
        title={
          <span className="flex items-center gap-3">
            <Coins className="h-6 w-6 text-accent-glow" /> Tipo de cambio USD/MXN
          </span>
        }
      />

      {/* Card TC del día */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">TC Hoy</p>
              {loadingHoy ? (
                <Skeleton className="h-12 w-48" />
              ) : (
                <>
                  <p className="text-4xl font-bold tabular-nums text-accent-glow">
                    {tcHoy
                      ? Number(tcHoy.usd_mxn).toLocaleString('es-MX', {
                          minimumFractionDigits: 4,
                          maximumFractionDigits: 4,
                        })
                      : '—'}
                  </p>
                  <div className="flex items-center gap-2 mt-2 flex-wrap">
                    {tcHoy && (
                      <>
                        <Badge variant={tcHoy.fuente === 'MANUAL' ? 'amber' : 'default'}>
                          {tcHoy.fuente}
                        </Badge>
                        <span className="text-muted-foreground text-xs">{fmtFecha(tcHoy.fecha)}</span>
                      </>
                    )}
                  </div>
                </>
              )}
            </div>
            <div className="flex gap-2 flex-wrap">
              <Button
                size="sm"
                variant="secondary"
                disabled={refreshMutation.isPending}
                onClick={() => refreshMutation.mutate()}
              >
                <RefreshCw className="h-3.5 w-3.5 mr-1" />
                {refreshMutation.isPending ? 'Actualizando…' : 'Refrescar desde Banxico'}
              </Button>
              {isAdmin && (
                <Button size="sm" variant="outline" onClick={() => setShowOverride(true)}>
                  <Edit2 className="h-3.5 w-3.5 mr-1" />
                  Override manual
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Historial */}
      <div>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
          Historial últimos 30 días
        </h2>
        <DataTable>
          <DataTableHead>
            <tr>
              <th className="px-4 py-3 text-left">Fecha</th>
              <th className="px-4 py-3 text-right">TC USD/MXN</th>
              <th className="px-4 py-3 text-left">Fuente</th>
              <th className="px-4 py-3 text-left">Nota</th>
            </tr>
          </DataTableHead>
          <DataTableBody>
            {loadingHist ? (
              <SkeletonRows rows={5} cols={4} />
            ) : items.length === 0 ? (
              <DataTableEmpty colSpan={4}>
                <EmptyState icon={Coins} title="Sin historial disponible" className="py-0" />
              </DataTableEmpty>
            ) : (
              items.map((row) => (
                <DataTableRow key={row.fecha}>
                  <td className="px-4 py-3 text-muted-foreground text-sm">{fmtFecha(row.fecha)}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-foreground font-medium">
                    {Number(row.usd_mxn).toLocaleString('es-MX', {
                      minimumFractionDigits: 4,
                      maximumFractionDigits: 4,
                    })}
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={row.fuente === 'MANUAL' ? 'amber' : 'default'}>
                      {row.fuente}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground text-xs">
                    {row.nota ?? '—'}
                  </td>
                </DataTableRow>
              ))
            )}
          </DataTableBody>
        </DataTable>
      </div>

      {/* Modal override */}
      {showOverride && (
        <OverrideModal
          onClose={() => setShowOverride(false)}
          onSaved={() => setShowOverride(false)}
        />
      )}
    </div>
  );
}
