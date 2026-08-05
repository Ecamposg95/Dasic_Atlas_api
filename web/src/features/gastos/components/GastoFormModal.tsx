import { useState } from 'react';
import { Modal, ModalFooter } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import type { Gasto, GastoCreate } from '../types';

const MONEDAS = ['MXN', 'USD'];

interface Props {
  mode: 'create' | 'edit';
  gasto?: Gasto;
  categorias: string[];
  onSave: (data: GastoCreate) => void;
  onClose: () => void;
  busy: boolean;
}

export function GastoFormModal({ mode, gasto, categorias, onSave, onClose, busy }: Props) {
  const [categoria, setCategoria] = useState(gasto?.categoria ?? '');
  const [categoriaCustom, setCategoriaCustom] = useState('');
  const [descripcion, setDescripcion] = useState(gasto?.descripcion ?? '');
  const [monto, setMonto] = useState(gasto ? String(gasto.monto) : '');
  const [moneda, setMoneda] = useState(gasto?.moneda ?? 'MXN');
  const [err, setErr] = useState<string | null>(null);

  // Allow selecting existing category or typing a new one
  const isNewCategoria = categoria === '__nueva__';
  const efectivaCategoria = isNewCategoria ? categoriaCustom.trim() : categoria;

  function onSubmit() {
    setErr(null);
    if (!efectivaCategoria) {
      setErr('La categoría es requerida.');
      return;
    }
    // El backend la limita a 80 caracteres (`GastoCreate` en routers/gastos.py).
    // Sin este check, pasarse devolvía un 422 con el mensaje crudo de Pydantic.
    if (efectivaCategoria.length > 80) {
      setErr(`La categoría no puede pasar de 80 caracteres (van ${efectivaCategoria.length}).`);
      return;
    }
    const montoNum = parseFloat(monto);
    if (!Number.isFinite(montoNum) || montoNum <= 0) {
      setErr('El monto debe ser mayor a 0.');
      return;
    }
    onSave({
      categoria: efectivaCategoria,
      descripcion: descripcion.trim() || null,
      monto: montoNum,
      moneda,
    });
  }

  return (
    <Modal
      title={mode === 'create' ? 'Nuevo gasto' : `Editar gasto #${gasto?.id}`}
      onClose={onClose}
      size="md"
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit();
        }}
      >
      <div className="space-y-3">
        {/* Categoría */}
        <FormField label="Categoría" required>
          <Select
            value={categoria}
            onChange={(e) => setCategoria(e.target.value)}
          >
            <option value="">— Selecciona —</option>
            {categorias.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
            <option value="__nueva__">+ Nueva categoría…</option>
          </Select>
        </FormField>

        {isNewCategoria && (
          <FormField label="Nueva categoría" required>
            <Input
              value={categoriaCustom}
              onChange={(e) => setCategoriaCustom(e.target.value)}
              placeholder="Ej. Viáticos, Papelería…"
              autoFocus
            />
          </FormField>
        )}

        {/* Descripción */}
        <FormField label="Descripción">
          <Input
            value={descripcion}
            onChange={(e) => setDescripcion(e.target.value)}
            placeholder="Detalle del gasto (opcional)"
          />
        </FormField>

        {/* Monto + Moneda */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <FormField label="Monto" required>
            <Input
              type="number"
              step="0.01"
              min="0.01"
              value={monto}
              onChange={(e) => setMonto(e.target.value)}
              placeholder="0.00"
            />
          </FormField>
          <FormField label="Moneda">
            <Select value={moneda} onChange={(e) => setMoneda(e.target.value)}>
              {MONEDAS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </Select>
          </FormField>
        </div>

        {err && (
          <div className="text-xs bg-rose-100 border border-rose-300 rounded p-2 text-rose-700 dark:bg-rose-900/30 dark:border-rose-700/50 dark:text-rose-300">
            {err}
          </div>
        )}
      </div>

      <ModalFooter>
        <Button type="button" variant="ghost" size="sm" onClick={onClose} disabled={busy}>
          Cancelar
        </Button>
        <Button type="submit" size="sm" disabled={busy}>
          {busy ? 'Guardando…' : mode === 'create' ? 'Registrar gasto' : 'Guardar cambios'}
        </Button>
      </ModalFooter>
      </form>
    </Modal>
  );
}
