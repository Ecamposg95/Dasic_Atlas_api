import { useState } from 'react';
import { confirm } from '@/lib/confirm';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { FileClock, Play, Trash2, ChevronLeft, ChevronRight } from 'lucide-react';
import { useBorradores, BORRADORES_PAGE_SIZE } from '../hooks/useBorradores';
import { api } from '@/lib/api';
import { toast } from '@/lib/toast';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState } from '@/components/ui/empty-state';
import { SkeletonRows } from '@/components/ui/skeleton';
import {
  DataTable,
  DataTableHead,
  DataTableBody,
  DataTableRow,
  DataTableEmpty,
} from '@/components/ui/data-table';
import type { BorradorItem } from '../types';

const PAGE_SIZE = BORRADORES_PAGE_SIZE;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDistancia(isoString: string | null): string {
  if (!isoString) return '—';
  const date = new Date(isoString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return 'hace un momento';
  if (diffMin < 60) return `hace ${diffMin} min`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `hace ${diffH}h`;
  const diffD = Math.floor(diffH / 24);
  if (diffD === 1) return 'hace 1 día';
  if (diffD < 30) return `hace ${diffD} días`;
  const diffM = Math.floor(diffD / 30);
  if (diffM === 1) return 'hace 1 mes';
  return `hace ${diffM} meses`;
}

function formatTotal(total: number, moneda: string): string {
  const formatted = total.toLocaleString('es-MX', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${moneda === 'USD' ? '$' : '$'} ${formatted} ${moneda}`;
}

// ---------------------------------------------------------------------------
// Fila de borrador
// ---------------------------------------------------------------------------

interface RowProps {
  item: BorradorItem;
  onDiscard: (id: number) => void;
  isDiscarding: boolean;
  onContinuar: (id: number) => void;
}

function BorradorRow({ item, onDiscard, isDiscarding, onContinuar }: RowProps) {
  return (
    <DataTableRow>
      <td className="px-4 py-3 font-mono text-xs text-accent-glow">{item.folio}</td>
      <td className="px-4 py-3 text-foreground">
        {item.cliente_nombre ?? <span className="text-muted-foreground/70 italic">Sin cliente</span>}
      </td>
      <td className="px-4 py-3 text-right tabular-nums">
        {formatTotal(item.total, item.moneda)}
      </td>
      <td className="px-4 py-3 text-muted-foreground text-xs">{formatDistancia(item.actualizado_en)}</td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-2 justify-end">
          <Button
            size="sm"
            variant="secondary"
            title="Continuar editando"
            onClick={() => onContinuar(item.id)}
          >
            <Play className="h-3.5 w-3.5 mr-1" />
            Continuar
          </Button>
          <Button
            size="sm"
            variant="outline"
            title="Descartar borrador"
            disabled={isDiscarding}
            onClick={() => onDiscard(item.id)}
            className="text-rose-400 border-rose-900 hover:bg-rose-950 hover:text-rose-300"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </td>
    </DataTableRow>
  );
}

// ---------------------------------------------------------------------------
// Página principal
// ---------------------------------------------------------------------------

export function BorradoresPage() {
  const [page, setPage] = useState(1);
  const qc = useQueryClient();
  const navigate = useNavigate();

  const { data, isLoading, isPlaceholderData } = useBorradores(page);

  const cancelar = useMutation({
    mutationFn: (id: number) => api.post(`/api/ventas/${id}/cancelar`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['borradores'] });
      toast({ kind: 'success', title: 'Borrador descartado' });
    },
    onError: () => {
      toast({ kind: 'error', title: 'No se pudo descartar el borrador' });
    },
  });

  async function handleDiscard(id: number) {
    if (!(await confirm({ mensaje: '¿Descartar este borrador? La acción lo cancelará y no podrá deshacerse.', tono: 'danger' }))) {
      return;
    }
    cancelar.mutate(id);
  }

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const hasMore = page < totalPages;
  const hasPrev = page > 1;

  return (
    <div className="p-6 max-w-7xl mx-auto w-full space-y-6">
      {/* Header */}
      <PageHeader
        title={
          <span className="flex items-center gap-3">
            <FileClock className="h-6 w-6 text-accent-glow" /> Borradores de cotizaciones
          </span>
        }
        description={
          !isLoading && (
            <>
              ({total} {total === 1 ? 'borrador' : 'borradores'})
            </>
          )
        }
      />

      {/* Tabla — altura acotada + header sticky para que la página no scrollee de más */}
      <DataTable maxBodyHeight="calc(100vh - 16rem)">
        <DataTableHead sticky>
          <tr>
            <th className="px-4 py-3 text-left">Folio</th>
            <th className="px-4 py-3 text-left">Cliente</th>
            <th className="px-4 py-3 text-right">Total</th>
            <th className="px-4 py-3 text-left">Última edición</th>
            <th className="px-4 py-3 text-right">Acciones</th>
          </tr>
        </DataTableHead>
        <DataTableBody>
          {isLoading ? (
            <SkeletonRows rows={6} cols={5} />
          ) : items.length === 0 ? (
            <DataTableEmpty colSpan={5}>
              <EmptyState
                icon={FileClock}
                title="No hay borradores pendientes"
                description="Las cotizaciones guardadas sin enviar aparecerán aquí."
                className="py-0"
              />
            </DataTableEmpty>
          ) : (
            items.map((item) => (
              <BorradorRow
                key={item.id}
                item={item}
                onDiscard={handleDiscard}
                isDiscarding={cancelar.isPending && cancelar.variables === item.id}
                onContinuar={(id) => navigate(`/ventas/cotizador?edit=${id}`)}
              />
            ))
          )}
        </DataTableBody>
      </DataTable>

      {/* Paginación */}
      {(hasPrev || hasMore) && (
        <div
          className={`flex items-center justify-between text-sm text-muted-foreground ${isPlaceholderData ? 'opacity-50' : ''}`}
        >
          <Button
            variant="outline"
            size="sm"
            disabled={!hasPrev || isPlaceholderData}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            <ChevronLeft className="h-4 w-4 mr-1" />
            Anterior
          </Button>

          <span>
            Página {page} de {totalPages}
          </span>

          <Button
            variant="outline"
            size="sm"
            disabled={!hasMore || isPlaceholderData}
            onClick={() => setPage((p) => p + 1)}
          >
            Siguiente
            <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        </div>
      )}
    </div>
  );
}
