// web/src/features/servicios/components/ServicioFormModal.tsx
import { useState, useEffect } from 'react';
import { Modal, ModalFooter } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { api } from '@/lib/api';
import { useCategoriasServicio } from '../hooks/useCategoriasServicio';
import type { Servicio, ServicioCreate } from '../types';

type Props = {
  mode: 'create' | 'edit';
  servicio?: Servicio;
  onSave: (data: ServicioCreate) => void;
  onClose: () => void;
  busy: boolean;
};

export function ServicioFormModal({ mode, servicio, onSave, onClose, busy }: Props) {
  const { data: categoriasData } = useCategoriasServicio();

  const [codigo, setCodigo] = useState(servicio?.codigo ?? '');
  const [nombre, setNombre] = useState(servicio?.nombre ?? '');
  const [descripcion, setDescripcion] = useState(servicio?.descripcion ?? '');
  const [categoria, setCategoria] = useState(servicio?.categoria_servicio ?? '');
  const [categoriaCustom, setCategoriaCustom] = useState('');
  const [costo, setCosto] = useState(
    servicio != null ? String(Number(servicio.costo) || 0) : '0',
  );
  const [moneda, setMoneda] = useState(servicio?.moneda ?? 'MXN');
  const [activo, setActivo] = useState(servicio?.activo ?? true);
  const [err, setErr] = useState<string | null>(null);

  // Deduplicate category list: sugeridas first, then any DB categories not already in sugeridas
  const categorias = [
    ...(categoriasData?.sugeridas ?? []),
    ...(
      categoriasData?.items
        .map((i) => i.categoria)
        .filter((c) => !(categoriasData?.sugeridas ?? []).includes(c)) ?? []
    ),
  ];

  // When category changes in create mode, fetch suggested next code
  useEffect(() => {
    if (mode !== 'create') return;
    api
      .get<{ codigo: string }>('/api/servicios/utils/proximo-codigo')
      .then((res) => {
        setCodigo(res.codigo);
      })
      .catch(() => {
        // silence — user can type manually
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categoria, categoriaCustom, mode]);

  function onSubmit() {
    setErr(null);
    const codigoFinal = codigo.trim().toUpperCase();
    if (codigoFinal.length < 2) {
      setErr('El código debe tener al menos 2 caracteres.');
      return;
    }
    if (nombre.trim().length < 2) {
      setErr('El nombre debe tener al menos 2 caracteres.');
      return;
    }
    const costoNum = parseFloat(costo);
    if (!Number.isFinite(costoNum) || costoNum < 0) {
      setErr('El costo debe ser un número mayor o igual a 0.');
      return;
    }

    const categoriaFinal =
      categoria === '__custom__'
        ? categoriaCustom.trim() || null
        : categoria || null;

    const payload: ServicioCreate = {
      codigo: codigoFinal,
      nombre: nombre.trim(),
      descripcion: descripcion.trim() || null,
      categoria_servicio: categoriaFinal,
      costo: costoNum,
      moneda: moneda.trim().toUpperCase(),
      activo,
    };

    onSave(payload);
  }

  return (
    <Modal
      title={mode === 'create' ? 'Nuevo servicio' : `Editar: ${servicio?.nombre ?? ''}`}
      onClose={onClose}
      size="lg"
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit();
        }}
      >
      <div className="space-y-3">
        {/* Categoría primero (en create dispara sugerencia de código) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <FormField label="Categoría">
            <select
              value={categoria}
              onChange={(e) => setCategoria(e.target.value)}
              className="h-10 w-full rounded-md border border-border-strong bg-card text-foreground px-3 text-sm"
            >
              <option value="">— Seleccionar —</option>
              {categorias.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
              <option value="__custom__">Otra…</option>
            </select>
          </FormField>
          {categoria === '__custom__' && (
            <FormField label="Nueva categoría">
              <Input
                value={categoriaCustom}
                onChange={(e) => setCategoriaCustom(e.target.value)}
                placeholder="ej. mantenimiento"
              />
            </FormField>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <FormField label="Código" required>
            <Input
              value={codigo}
              onChange={(e) => setCodigo(e.target.value.toUpperCase())}
              placeholder="SRV-0001"
              className="font-mono"
            />
          </FormField>
          <FormField label="Nombre" required>
            <Input
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Nombre del servicio"
            />
          </FormField>
        </div>

        <FormField label="Descripción">
          <textarea
            value={descripcion}
            onChange={(e) => setDescripcion(e.target.value)}
            rows={2}
            placeholder="Descripción detallada del servicio"
            className="w-full text-sm rounded-md border border-border-strong bg-card text-foreground px-3 py-2 placeholder:text-muted-foreground/70 focus:outline-none focus:ring-2 focus:ring-accent-glow/40"
          />
        </FormField>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
          <FormField label="Costo" required>
            <Input
              type="number"
              step="0.01"
              min="0"
              value={costo}
              onChange={(e) => setCosto(e.target.value)}
            />
          </FormField>
          <FormField label="Moneda">
            <select
              value={moneda}
              onChange={(e) => setMoneda(e.target.value)}
              className="h-10 w-full rounded-md border border-border-strong bg-card text-foreground px-3 text-sm"
            >
              <option value="MXN">MXN</option>
              <option value="USD">USD</option>
            </select>
          </FormField>
          <div className="flex items-end pb-1">
            <label className="flex items-center gap-2 text-sm text-foreground">
              <input
                type="checkbox"
                checked={activo}
                onChange={(e) => setActivo(e.target.checked)}
                className="rounded border-border-strong bg-card"
              />
              Activo
            </label>
          </div>
        </div>

        {err && (
          <div className="text-xs bg-rose-50 dark:bg-rose-900/30 border border-rose-300 dark:border-rose-700/50 rounded p-2 text-rose-700 dark:text-rose-300">
            {err}
          </div>
        )}
      </div>

      <ModalFooter>
        <Button type="button" variant="ghost" size="sm" onClick={onClose} disabled={busy}>
          Cancelar
        </Button>
        <Button type="submit" size="sm" disabled={busy}>
          {busy ? 'Guardando…' : mode === 'create' ? 'Crear servicio' : 'Guardar cambios'}
        </Button>
      </ModalFooter>
      </form>
    </Modal>
  );
}
