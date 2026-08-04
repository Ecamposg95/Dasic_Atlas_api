import { Pencil } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Drawer } from '@/components/ui/drawer';
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
    <Drawer
      size="lg"
      onClose={onClose}
      title={
        <div className="flex items-center gap-3 min-w-0">
          <div className="min-w-0">
            <div className="truncate">{empresa.nombre_empresa}</div>
            <p className="text-xs font-normal text-muted-foreground truncate">{empresa.rfc_tax_id ?? 'Sin RFC'}</p>
          </div>
          <button
            type="button"
            onClick={() => navigate(`/spa/empresas/${empresa.id}`)}
            className="text-sm font-normal text-accent-glow hover:underline shrink-0"
          >
            Ver ficha completa →
          </button>
        </div>
      }
    >
      <div className="space-y-6">
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
    </Drawer>
  );
}
