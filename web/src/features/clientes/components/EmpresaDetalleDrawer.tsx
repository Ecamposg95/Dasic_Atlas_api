import { X, Pencil } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import type { Cliente } from '../types';
import { ContactosTab } from './tabs/ContactosTab';
import { EstadoCuentaTab } from './tabs/EstadoCuentaTab';

function fmtMoney(n: number | string, m = 'MXN') {
  return `${m} $${Number(n || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}`;
}

export function EmpresaDetalleDrawer({ empresa, onEditarDatos, onClose }: {
  empresa: Cliente;
  onEditarDatos: () => void;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-background/60"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="h-full w-full max-w-2xl overflow-y-auto bg-card border-l border-border shadow-2xl">
        <div className="sticky top-0 z-10 flex items-center justify-between px-5 py-4 border-b border-border bg-card/90 backdrop-blur">
          <div>
            <h2 className="text-lg font-semibold">{empresa.nombre_empresa}</h2>
            <p className="text-xs text-muted-foreground">{empresa.rfc_tax_id ?? 'Sin RFC'}</p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate(`/spa/empresas/${empresa.id}`)}
              className="text-sm text-accent-glow hover:underline"
            >
              Ver ficha completa →
            </button>
            <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="h-5 w-5" /></button>
          </div>
        </div>

        <div className="p-5 space-y-6">
          {/* Datos & crédito */}
          <section>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Datos & crédito</h3>
              <Button size="sm" variant="outline" onClick={onEditarDatos}><Pencil className="h-3.5 w-3.5 mr-1" /> Editar</Button>
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><span className="text-muted-foreground">Crédito:</span> {fmtMoney(empresa.limite_credito, empresa.moneda_credito)}</div>
              <div><span className="text-muted-foreground">Saldo:</span> {fmtMoney(empresa.saldo_actual, empresa.moneda_credito)}</div>
              <div><span className="text-muted-foreground">Días crédito:</span> {empresa.dias_credito}</div>
              <div><span className="text-muted-foreground">Día corte:</span> {empresa.dia_corte ?? '—'}</div>
            </div>
          </section>

          {/* Contactos */}
          <section>
            <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-2">Contactos</h3>
            <ContactosTab clienteId={empresa.id} />
          </section>

          {/* Estado de cuenta / CxC / Órdenes */}
          <EstadoCuentaTab clienteId={empresa.id} monedaCredito={empresa.moneda_credito} />
        </div>
      </div>
    </div>
  );
}
