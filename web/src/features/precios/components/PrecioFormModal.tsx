import { useState } from 'react';
import { Modal, ModalFooter } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import type { PrecioProveedorCreate, Moneda } from '../types';

interface Producto {
  id: number;
  nombre: string;
  sku: string | null;
}

interface Proveedor {
  id: number;
  nombre_empresa: string;
}

interface Props {
  productos: Producto[];
  proveedores: Proveedor[];
  onSave: (data: PrecioProveedorCreate) => void;
  onClose: () => void;
  busy: boolean;
}

export function PrecioFormModal({ productos, proveedores, onSave, onClose, busy }: Props) {
  const [productoId, setProductoId] = useState<string>('');
  const [proveedorId, setProveedorId] = useState<string>('');
  const [descripcionLibre, setDescripcionLibre] = useState('');
  const [precio, setPrecio] = useState('');
  const [moneda, setMoneda] = useState<Moneda>('MXN');
  const [vigDesde, setVigDesde] = useState('');
  const [vigHasta, setVigHasta] = useState('');
  const [notas, setNotas] = useState('');
  const [err, setErr] = useState<string | null>(null);

  function onSubmit() {
    setErr(null);
    if (!proveedorId) {
      setErr('El proveedor es requerido.');
      return;
    }
    if (!productoId && !descripcionLibre.trim()) {
      setErr('Selecciona un producto o escribe una descripción libre.');
      return;
    }
    const precioNum = parseFloat(precio);
    if (!Number.isFinite(precioNum) || precioNum <= 0) {
      setErr('El precio debe ser mayor a 0.');
      return;
    }
    onSave({
      proveedor_id: Number(proveedorId),
      producto_id: productoId ? Number(productoId) : null,
      descripcion_busqueda: descripcionLibre.trim() || null,
      precio: precioNum,
      moneda,
      fecha_vigencia_desde: vigDesde || null,
      fecha_vigencia_hasta: vigHasta || null,
      notas: notas.trim() || null,
    });
  }

  return (
    <Modal title="Registrar precio" onClose={onClose} size="md">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit();
        }}
      >
      <div className="space-y-3">
        {/* Proveedor */}
        <FormField label="Proveedor" required>
          <Select value={proveedorId} onChange={(e) => setProveedorId(e.target.value)}>
            <option value="">— Selecciona —</option>
            {proveedores.map((p) => (
              <option key={p.id} value={String(p.id)}>
                {p.nombre_empresa}
              </option>
            ))}
          </Select>
        </FormField>

        {/* Producto */}
        <FormField label="Producto (catálogo)">
          <Select value={productoId} onChange={(e) => setProductoId(e.target.value)}>
            <option value="">— Selecciona o usa descripción libre —</option>
            {productos.map((p) => (
              <option key={p.id} value={String(p.id)}>
                {p.sku ? `[${p.sku}] ` : ''}{p.nombre}
              </option>
            ))}
          </Select>
        </FormField>

        {/* Descripción libre */}
        {!productoId && (
          <FormField label="Descripción libre" required>
            <Input
              value={descripcionLibre}
              onChange={(e) => setDescripcionLibre(e.target.value)}
              placeholder="Nombre del producto/servicio tal como lo ofrece el proveedor"
            />
          </FormField>
        )}

        {/* Precio + moneda */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <FormField label="Precio" required>
            <Input
              type="number"
              step="0.01"
              min="0.01"
              value={precio}
              onChange={(e) => setPrecio(e.target.value)}
              placeholder="0.00"
            />
          </FormField>
          <FormField label="Moneda">
            <Select value={moneda} onChange={(e) => setMoneda(e.target.value as Moneda)}>
              <option value="MXN">MXN</option>
              <option value="USD">USD</option>
            </Select>
          </FormField>
        </div>

        {/* Vigencia */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <FormField label="Vigencia desde">
            <Input
              type="date"
              value={vigDesde}
              onChange={(e) => setVigDesde(e.target.value)}
            />
          </FormField>
          <FormField label="Vigencia hasta">
            <Input
              type="date"
              value={vigHasta}
              onChange={(e) => setVigHasta(e.target.value)}
            />
          </FormField>
        </div>

        {/* Notas */}
        <FormField label="Notas">
          <Input
            value={notas}
            onChange={(e) => setNotas(e.target.value)}
            placeholder="Condiciones, volumen mínimo, etc. (opcional)"
          />
        </FormField>

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
          {busy ? 'Guardando…' : 'Registrar precio'}
        </Button>
      </ModalFooter>
      </form>
    </Modal>
  );
}
