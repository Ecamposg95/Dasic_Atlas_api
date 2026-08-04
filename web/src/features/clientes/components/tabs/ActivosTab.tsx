import { useState } from 'react';
import { Pencil, Plus, Trash2, Wrench } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DataTable, DataTableBody, DataTableEmpty, DataTableHead, DataTableRow,
} from '@/components/ui/data-table';
import { EmptyState } from '@/components/ui/empty-state';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { Modal, ModalFooter } from '@/components/ui/modal';
import { Select } from '@/components/ui/select';
import { StatusBadge } from '@/components/ui/status-badge';
import { Textarea } from '@/components/ui/textarea';
import type { StatusTone } from '@/lib/status-tones';
import { confirm } from '@/lib/confirm';
import { toast } from '@/lib/toast';
import {
  useActivos, useEliminarActivo, useGuardarActivo, usePlantas,
} from '../../hooks/useInstalaciones';
import type { Activo, EstadoActivo } from '../../types';

// ─── ActivosTab ──────────────────────────────────────────────────────────────
// Activos instalados del cliente, filtrables por planta.

const ESTADOS: { value: EstadoActivo; label: string; tone: StatusTone }[] = [
  { value: 'operativo', label: 'Operativo', tone: 'success' },
  { value: 'mantenimiento', label: 'Mantenimiento', tone: 'warning' },
  { value: 'fuera_servicio', label: 'Fuera de servicio', tone: 'danger' },
  { value: 'baja', label: 'Baja', tone: 'neutral' },
];

const ESTADO_META = Object.fromEntries(ESTADOS.map((e) => [e.value, e])) as Record<
  EstadoActivo,
  (typeof ESTADOS)[number]
>;

export function ActivosTab({ clienteId }: { clienteId: number }) {
  const [plantaFiltro, setPlantaFiltro] = useState<number | null>(null);
  const { data: plantas } = usePlantas(clienteId);
  const { data: activos, isLoading } = useActivos(clienteId, plantaFiltro);
  const eliminar = useEliminarActivo(clienteId);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Activo | null>(null);

  function abrirNuevo() { setEditing(null); setModalOpen(true); }
  function abrirEditar(a: Activo) { setEditing(a); setModalOpen(true); }

  async function onEliminar(a: Activo) {
    if (await confirm({ mensaje: `¿Eliminar el activo "${a.nombre}"?`, tono: 'danger' })) {
      eliminar.mutate(a.id);
    }
  }

  const lista = activos ?? [];
  const vacio = !isLoading && lista.length === 0;

  return (
    <div className="p-1 space-y-2">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <Select
            className="h-9 w-52"
            aria-label="Filtrar por planta"
            value={plantaFiltro ?? ''}
            onChange={(e) => setPlantaFiltro(e.target.value ? parseInt(e.target.value, 10) : null)}
          >
            <option value="">Todas las plantas</option>
            {(plantas ?? []).map((p) => (
              <option key={p.id} value={p.id}>{p.nombre}</option>
            ))}
          </Select>
          <span className="text-sm text-muted-foreground">{lista.length} activo(s)</span>
        </div>
        <Button size="sm" onClick={abrirNuevo}><Plus className="h-3.5 w-3.5 mr-1" /> Nuevo activo</Button>
      </div>

      {vacio ? (
        <div className="bg-card border border-border rounded-xl">
          <EmptyState
            icon={Wrench}
            title={plantaFiltro != null ? 'Sin activos en esta planta' : 'Sin activos instalados'}
            description="Registra los equipos instalados del cliente para dar seguimiento a servicio y garantías."
            action={<Button size="sm" onClick={abrirNuevo}><Plus className="h-3.5 w-3.5 mr-1" /> Nuevo activo</Button>}
          />
        </div>
      ) : (
        <DataTable maxBodyHeight="24rem">
          <DataTableHead sticky>
            <tr>
              <th className="p-3 text-left">Nombre</th>
              <th className="p-3 text-left">Tipo</th>
              <th className="p-3 text-left">Fabricante / Modelo</th>
              <th className="p-3 text-left">Serie</th>
              <th className="p-3 text-left">Planta</th>
              <th className="p-3 text-left">Estado</th>
              <th className="p-3 text-right">Acciones</th>
            </tr>
          </DataTableHead>
          <DataTableBody>
            {isLoading && <DataTableEmpty colSpan={7}>Cargando activos…</DataTableEmpty>}
            {lista.map((a) => (
              <DataTableRow key={a.id}>
                <td className="p-3 text-foreground font-medium">{a.nombre}</td>
                <td className="p-3 text-muted-foreground">{a.tipo ?? '—'}</td>
                <td className="p-3 text-muted-foreground">
                  {[a.fabricante, a.modelo].filter(Boolean).join(' / ') || '—'}
                </td>
                <td className="p-3 text-muted-foreground">{a.serie ?? '—'}</td>
                <td className="p-3 text-muted-foreground">{a.planta_nombre ?? '—'}</td>
                <td className="p-3">
                  <StatusBadge
                    tone={ESTADO_META[a.estado]?.tone ?? 'neutral'}
                    label={ESTADO_META[a.estado]?.label ?? a.estado}
                  />
                </td>
                <td className="p-3">
                  <div className="flex items-center justify-end gap-1">
                    <button
                      type="button"
                      onClick={() => abrirEditar(a)}
                      className="p-1 text-muted-foreground hover:text-accent-glow"
                      title="Editar"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => void onEliminar(a)}
                      className="p-1 text-muted-foreground hover:text-rose-500"
                      title="Eliminar"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </td>
              </DataTableRow>
            ))}
          </DataTableBody>
        </DataTable>
      )}

      {modalOpen && (
        <ActivoFormModal
          key={editing?.id ?? 'new'}
          clienteId={clienteId}
          editing={editing}
          plantaInicial={plantaFiltro}
          onClose={() => setModalOpen(false)}
        />
      )}
    </div>
  );
}

// ─── ActivoFormModal ─────────────────────────────────────────────────────────

function ActivoFormModal({
  clienteId, editing, plantaInicial, onClose,
}: {
  clienteId: number;
  editing: Activo | null;
  plantaInicial: number | null;
  onClose: () => void;
}) {
  const { data: plantas } = usePlantas(clienteId);
  const guardar = useGuardarActivo(clienteId);

  const [nombre, setNombre] = useState(editing?.nombre ?? '');
  const [plantaId, setPlantaId] = useState<number | null>(editing ? editing.planta_id : plantaInicial);
  const [tipo, setTipo] = useState(editing?.tipo ?? '');
  const [fabricante, setFabricante] = useState(editing?.fabricante ?? '');
  const [modelo, setModelo] = useState(editing?.modelo ?? '');
  const [serie, setSerie] = useState(editing?.serie ?? '');
  const [ubicacion, setUbicacion] = useState(editing?.ubicacion ?? '');
  // slice(0, 10): tolera fechas ISO con hora — input type=date solo acepta YYYY-MM-DD.
  const [fechaInstalacion, setFechaInstalacion] = useState((editing?.fecha_instalacion ?? '').slice(0, 10));
  const [garantiaHasta, setGarantiaHasta] = useState((editing?.garantia_hasta ?? '').slice(0, 10));
  const [estado, setEstado] = useState<EstadoActivo>(editing?.estado ?? 'operativo');
  const [notas, setNotas] = useState(editing?.notas ?? '');

  function onSave() {
    if (!nombre.trim()) { toast({ kind: 'warning', title: 'El nombre es obligatorio' }); return; }
    guardar.mutate(
      {
        id: editing?.id,
        data: {
          nombre: nombre.trim(),
          planta_id: plantaId,
          tipo: tipo.trim() || null,
          fabricante: fabricante.trim() || null,
          modelo: modelo.trim() || null,
          serie: serie.trim() || null,
          ubicacion: ubicacion.trim() || null,
          fecha_instalacion: fechaInstalacion || null,
          garantia_hasta: garantiaHasta || null,
          estado,
          notas: notas.trim() || null,
        },
      },
      {
        onSuccess: () => {
          toast({ kind: 'success', title: editing ? 'Activo actualizado' : 'Activo creado' });
          onClose();
        },
      },
    );
  }

  return (
    <Modal title={editing ? 'Editar activo' : 'Nuevo activo'} onClose={onClose} size="lg">
      <form onSubmit={(e) => { e.preventDefault(); onSave(); }}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <FormField label="Nombre" required>
            <Input value={nombre} onChange={(e) => setNombre(e.target.value)} />
          </FormField>
          <FormField label="Planta">
            <Select
              className="h-10"
              value={plantaId ?? ''}
              onChange={(e) => setPlantaId(e.target.value ? parseInt(e.target.value, 10) : null)}
            >
              <option value="">— Sin planta —</option>
              {(plantas ?? []).map((p) => (
                <option key={p.id} value={p.id}>{p.nombre}</option>
              ))}
            </Select>
          </FormField>
          <FormField label="Tipo">
            <Input value={tipo} onChange={(e) => setTipo(e.target.value)} placeholder="Bomba, compresor…" />
          </FormField>
          <FormField label="Ubicación">
            <Input value={ubicacion} onChange={(e) => setUbicacion(e.target.value)} placeholder="Nave 2, línea A…" />
          </FormField>
          <FormField label="Fabricante">
            <Input value={fabricante} onChange={(e) => setFabricante(e.target.value)} />
          </FormField>
          <FormField label="Modelo">
            <Input value={modelo} onChange={(e) => setModelo(e.target.value)} />
          </FormField>
          <FormField label="No. de serie">
            <Input value={serie} onChange={(e) => setSerie(e.target.value)} />
          </FormField>
          <FormField label="Estado">
            <Select
              className="h-10"
              value={estado}
              onChange={(e) => setEstado(e.target.value as EstadoActivo)}
            >
              {ESTADOS.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </Select>
          </FormField>
          <FormField label="Fecha de instalación">
            <Input type="date" value={fechaInstalacion} onChange={(e) => setFechaInstalacion(e.target.value)} />
          </FormField>
          <FormField label="Garantía hasta">
            <Input type="date" value={garantiaHasta} onChange={(e) => setGarantiaHasta(e.target.value)} />
          </FormField>
          <FormField label="Notas" className="sm:col-span-2">
            <Textarea rows={3} value={notas} onChange={(e) => setNotas(e.target.value)} />
          </FormField>
        </div>
        <ModalFooter>
          <Button type="button" variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button type="submit" disabled={guardar.isPending}>{guardar.isPending ? 'Guardando…' : 'Guardar'}</Button>
        </ModalFooter>
      </form>
    </Modal>
  );
}
