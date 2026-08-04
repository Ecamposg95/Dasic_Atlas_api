import { useState } from 'react';
import { Modal, ModalFooter } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FormField } from '@/components/ui/form-field';
import type { Cliente, ClienteCreate, MonedaCredito } from '../types';

type Props = {
  mode: 'create' | 'edit';
  cliente?: Cliente;
  onSave: (data: ClienteCreate) => void;
  onClose: () => void;
  busy: boolean;
};

function fmtMoney(moneda: MonedaCredito, value: number | string) {
  const n = Number(value) || 0;
  return `${moneda} $${n.toLocaleString('es-MX', { minimumFractionDigits: 2 })}`;
}

export function ClienteFormModal({ mode, cliente, onSave, onClose, busy }: Props) {
  const [nombre, setNombre] = useState(cliente?.nombre_empresa ?? '');
  const [contacto, setContacto] = useState(cliente?.contacto_nombre ?? '');
  const [rfc, setRfc] = useState(cliente?.rfc_tax_id ?? '');
  const [email, setEmail] = useState(cliente?.email ?? '');
  const [telefono, setTelefono] = useState(cliente?.telefono ?? '');
  const [direccion, setDireccion] = useState(cliente?.direccion ?? '');
  const [limiteCredito, setLimiteCredito] = useState(
    cliente != null ? String(Number(cliente.limite_credito) || 0) : '0',
  );
  const [diasCredito, setDiasCredito] = useState(
    cliente != null ? String(cliente.dias_credito) : '0',
  );
  const [diaCorte, setDiaCorte] = useState(
    cliente?.dia_corte != null ? String(cliente.dia_corte) : '',
  );
  const [moneda, setMoneda] = useState<MonedaCredito>(
    cliente?.moneda_credito ?? 'MXN',
  );
  const [err, setErr] = useState<string | null>(null);

  function onSubmit() {
    setErr(null);
    if (nombre.trim().length < 2) {
      setErr('El nombre de empresa debe tener al menos 2 caracteres.');
      return;
    }

    const limiteNum = parseFloat(limiteCredito);
    const diasNum = parseInt(diasCredito, 10);
    const diaCorteNum = diaCorte.trim() ? parseInt(diaCorte, 10) : null;

    if (diaCorteNum != null && (diaCorteNum < 1 || diaCorteNum > 31)) {
      setErr('El día de corte debe estar entre 1 y 31.');
      return;
    }

    const payload: ClienteCreate = {
      nombre_empresa: nombre.trim(),
      contacto_nombre: contacto.trim() || null,
      rfc_tax_id: rfc.trim() || null,
      email: email.trim() || null,
      telefono: telefono.trim() || null,
      direccion: direccion.trim() || null,
      limite_credito: Number.isFinite(limiteNum) ? limiteNum : 0,
      dias_credito: Number.isFinite(diasNum) ? diasNum : 0,
      dia_corte: diaCorteNum,
      moneda_credito: moneda,
    };

    onSave(payload);
  }

  const limiteDisplay = fmtMoney(moneda, limiteCredito);

  return (
    <Modal
      title={mode === 'create' ? 'Nuevo cliente' : `Editar: ${cliente?.nombre_empresa ?? ''}`}
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
          <FormField label="Empresa" required>
            <Input
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Nombre de empresa"
            />
          </FormField>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <FormField label="Contacto">
              <Input
                value={contacto}
                onChange={(e) => setContacto(e.target.value)}
                placeholder="Nombre contacto"
              />
            </FormField>
            <FormField label="RFC / Tax ID">
              <Input
                value={rfc}
                onChange={(e) => setRfc(e.target.value)}
                placeholder="XAXX010101000"
              />
            </FormField>
            <FormField label="Email">
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="correo@ejemplo.com"
              />
            </FormField>
            <FormField label="Teléfono">
              <Input
                value={telefono}
                onChange={(e) => setTelefono(e.target.value)}
                placeholder="+52 800 000 0000"
              />
            </FormField>
          </div>

          <FormField label="Dirección">
            <textarea
              value={direccion}
              onChange={(e) => setDireccion(e.target.value)}
              rows={2}
              placeholder="Calle, colonia, ciudad, estado, CP"
              className="w-full text-sm rounded-md border border-border-strong bg-card px-3 py-2 placeholder:text-muted-foreground/70 focus:outline-none focus:ring-2 focus:ring-accent-glow/40"
            />
          </FormField>

          {/* Crédito */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            <FormField label="Límite crédito" hint={limiteDisplay}>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={limiteCredito}
                onChange={(e) => setLimiteCredito(e.target.value)}
              />
            </FormField>
            <FormField label="Días crédito">
              <Input
                type="number"
                min="0"
                value={diasCredito}
                onChange={(e) => setDiasCredito(e.target.value)}
              />
            </FormField>
            <FormField label="Día de corte (1-31)">
              <Input
                type="number"
                min="1"
                max="31"
                value={diaCorte}
                onChange={(e) => setDiaCorte(e.target.value)}
                placeholder="Opcional"
              />
            </FormField>
          </div>

          <FormField label="Moneda crédito">
            <select
              value={moneda}
              onChange={(e) => setMoneda(e.target.value as MonedaCredito)}
              className="h-10 w-full rounded-md border border-border-strong bg-card px-3 text-sm"
            >
              <option value="MXN">MXN</option>
              <option value="USD">USD</option>
            </select>
          </FormField>

          {err && (
            <div className="text-xs bg-rose-100 border border-rose-300 text-rose-700 dark:bg-rose-900/30 dark:border-rose-700/50 dark:text-rose-300 rounded p-2">
              {err}
            </div>
          )}
        </div>

        <ModalFooter>
          <Button type="button" variant="ghost" size="sm" onClick={onClose} disabled={busy}>
            Cancelar
          </Button>
          <Button type="submit" size="sm" disabled={busy}>
            {busy ? 'Guardando…' : mode === 'create' ? 'Crear cliente' : 'Guardar cambios'}
          </Button>
        </ModalFooter>
      </form>
    </Modal>
  );
}
