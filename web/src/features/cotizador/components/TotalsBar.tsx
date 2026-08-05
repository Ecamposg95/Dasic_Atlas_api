import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { confirm } from '@/lib/confirm';
import { Sigma, Percent, Coins, TrendingUp, AlertTriangle, Wallet, ChevronUp, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DocumentTotalsBar, type DocStat } from '@/components/document/DocumentTotalsBar';
import { toast } from '@/lib/toast';
import { useCotizador } from '../store';
import { useConfig } from '../hooks/useConfig';
import { useGuardarCotizacion } from '../hooks/useCotizacion';
import { agruparOCs } from '../lib/previewOC';
import {
  computeCostos,
  computeTotals,
  computeTotalsPorMoneda,
  resolveDirectionalTcs,
} from '../lib/calc';

function fmtMoney(n: number, moneda: string) {
  return `${moneda} $${n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function TotalsBar() {
  const navigate = useNavigate();
  const [err, setErr] = useState<string | null>(null);
  // Densidad: por defecto la barra muestra solo Total + Margen + acciones.
  // El usuario expande para ver el desglose completo + conteo de OCs.
  const [resumenOpen, setResumenOpen] = useState(false);
  // Guard síncrono contra doble submit: `isPending` se actualiza async vía render,
  // así que dos clicks rápidos (primario + secundario) podrían disparar 2 POST
  // antes de que los botones se deshabiliten, creando una orden duplicada.
  const submittingRef = useRef(false);
  const cart = useCotizador((s) => s.cart);
  const moneda = useCotizador((s) => s.moneda);
  const tc = useCotizador((s) => s.tc);
  const tcMnAUsd = useCotizador((s) => s.tc_mn_a_usd);
  const tcUsdAMn = useCotizador((s) => s.tc_usd_a_mn);
  const toleranciaTc = useCotizador((s) => s.tolerancia_tc);
  const cliente_id = useCotizador((s) => s.cliente_id);
  const lineasNoSoportadas = useCotizador((s) => s.lineasNoSoportadas);
  const editingId = useCotizador((s) => s.editingId);
  const editingEstatus = useCotizador((s) => s.editingEstatus);
  const { config } = useConfig();
  const guardar = useGuardarCotizacion();

  const tcs = resolveDirectionalTcs(tc, tcMnAUsd, tcUsdAMn, toleranciaTc);
  const { subtotal, iva, total } = computeTotals(cart, moneda, tcs, config.iva_rate);
  // Costo y margen "real": costo con DOF puro (lo que Dasic paga al proveedor)
  // vs subtotal (lo que cobra al cliente, ya con spread del TC). El margen
  // incluye tanto la utilidad explícita por línea como el spread del TC.
  const { costo, margen, margenPct } = computeCostos(cart, moneda, tcs, subtotal);
  const breakdown = useMemo(() => computeTotalsPorMoneda(cart), [cart]);
  // Solo mostrar el desglose por moneda nativa cuando la cot tiene mix:
  // hay líneas de las DOS monedas, o cualquier línea difiere de la moneda
  // de la cotización. Si todo es de una sola moneda igual a la de la cot,
  // el desglose sería redundante con el subtotal de arriba.
  const hayMixDeMonedas = breakdown.mxn_count > 0 && breakdown.usd_count > 0;
  const hayLineasEnOtraMoneda =
    (moneda === 'MXN' && breakdown.usd_count > 0) ||
    (moneda === 'USD' && breakdown.mxn_count > 0);
  const showBreakdown = hayMixDeMonedas || hayLineasEnOtraMoneda;

  const noEditable = !!editingEstatus && editingEstatus.toUpperCase() !== 'COTIZACION';
  const tieneNoSoportadas = lineasNoSoportadas.length > 0;
  // TC necesario si la cot es USD o tiene líneas en otra moneda. Implausible si
  // sigue < 5 (USD/MXN nunca baja de ahí) → bloquea guardar para no subvaluar ×2.
  const tcNecesario = moneda === 'USD' || hayLineasEnOtraMoneda;
  const tcImplausible = tcNecesario && (!Number.isFinite(tc) || tc < 5);

  const reasons: string[] = [];
  if (cart.length === 0) reasons.push('agrega productos');
  if (cliente_id == null) reasons.push('selecciona cliente');
  if (cart.some((l) => l.qty <= 0)) reasons.push('hay líneas con cantidad 0');
  if (tcImplausible) reasons.push('captura el TC de Banxico (TC actual implausible)');
  if (tieneNoSoportadas) reasons.push('cotización contiene líneas ad-hoc no soportadas');
  if (noEditable) reasons.push(`cotización en estatus ${editingEstatus}`);
  const disabled = reasons.length > 0 || guardar.isPending;

  async function onCancel() {
    if (editingId != null) {
      navigate('/spa/seguimiento');
      return;
    }
    if (cart.length === 0 || (await confirm({ mensaje: '¿Descartar cotización?', tono: 'danger' }))) {
      useCotizador.getState().reset();
      navigate('/spa/seguimiento');
    }
  }

  const margenStats = useMemo(() => {
    const criticas = cart.filter((l) => l.utilidad < 5).length;
    const bajas = cart.filter((l) => l.utilidad < 15).length;
    const avg = cart.length
      ? cart.reduce((acc, l) => acc + (Number(l.utilidad) || 0), 0) / cart.length
      : 0;
    return { criticas, bajas, avg };
  }, [cart]);

  // Proyección de OCs que nacerán al guardar. `agruparOCs(cart)` agrupa por
  // proveedor sugerido; cada grupo con proveedor_id != null es 1 OC a 1
  // proveedor real. El bucket "sin proveedor" (proveedor_id === null) genera
  // OC pero no cuenta como proveedor identificado.
  const ocInfo = useMemo(() => {
    const grupos = agruparOCs(cart);
    const proveedores = grupos.filter((g) => g.proveedor_id != null).length;
    return { ocs: grupos.length, proveedores };
  }, [cart]);

  // Todas las confirmaciones previas al guardado. Devuelve false si el usuario
  // cancela cualquiera de ellas; true si todo OK. Compartida por los flujos
  // "Guardar y quedarse", "Guardar e ir a Seguimiento" y "Ver PDF".
  async function validar(): Promise<boolean> {
    // Leer del store vivo (no del cierre del render): este `validar()` se invoca
    // también desde el listener `cot:ver-pdf` con deps [], que captura el closure
    // del primer render (cart/margenStats vacíos al montar). Recalcular aquí
    // garantiza el resultado correcto sin importar desde dónde se llame.
    const cartNow = useCotizador.getState().cart;
    const criticas = cartNow.filter((l) => l.utilidad < 5).length;
    const bajas = cartNow.filter((l) => l.utilidad < 15).length;

    if (criticas > 0) {
      if (
        !(await confirm({
          mensaje: `⚠ ${criticas} línea(s) con utilidad < 5 %. Riesgo de venta en pérdida. ¿Continuar?`,
          tono: 'warning',
        }))
      ) {
        return false;
      }
    } else if (bajas > 0) {
      if (!(await confirm({ mensaje: `${bajas} línea(s) con utilidad < 15 %. ¿Continuar?`, tono: 'warning' }))) {
        return false;
      }
    }

    const entregaParcial = cartNow.filter((l) => {
      const tiene = (v: unknown) => v != null && v !== '';
      const campos = [tiene(l.entrega_min), tiene(l.entrega_max), tiene(l.entrega_unidad)];
      return campos.some(Boolean) && !campos.every(Boolean);
    });
    if (entregaParcial.length > 0) {
      if (
        !(await confirm({
          mensaje: `${entregaParcial.length} línea(s) con tiempo de entrega incompleto (falta min, max o unidad). ¿Guardar de todas formas?`,
          tono: 'warning',
        }))
      ) {
        return false;
      }
    }
    return true;
  }

  // Arma el payload del guardado desde el estado vivo del store.
  function snapshot() {
    const s = useCotizador.getState();
    return {
      cliente_id: s.cliente_id,
      contacto_id: s.contacto_id,
      moneda: s.moneda,
      tc: s.tc,
      tc_mn_a_usd: s.tc_mn_a_usd,
      tc_usd_a_mn: s.tc_usd_a_mn,
      tolerancia_tc: s.tolerancia_tc,
      fecha_creacion: s.fecha_creacion,
      fecha_vencimiento: s.fecha_vencimiento,
      observaciones: s.observaciones,
      terminos_condiciones: s.terminos_condiciones,
      pdf_concepto_unificado: s.pdf_concepto_unificado,
      pdf_concepto_enabled: s.pdf_concepto_enabled,
      cart: s.cart,
    };
  }

  // Guarda y SE QUEDA en el editor. Tras un POST, setEditing(id) cambia el
  // store a modo edición → el siguiente guardado hace PUT (no duplica).
  // `afterSave` opcional permite encadenar (ej. abrir PDF) sin redirigir.
  async function onGuardarQuedarse(afterSave?: (data: { id: number; folio: string }) => void) {
    if (submittingRef.current) return;
    submittingRef.current = true;
    setErr(null);
    if (!(await validar())) { submittingRef.current = false; return; }
    guardar.mutate(snapshot(), {
      onSuccess: (data) => {
        useCotizador.getState().setEditing(data.id, data.folio);
        toast({ kind: 'success', title: `Guardado ${data.folio}` });
        afterSave?.(data);
      },
      onError: (e: { status?: number; detail?: string }) => {
        if (e.status === 401) { window.location.href = '/spa/login'; return; }
        toast({ kind: 'error', title: 'No se pudo guardar', description: e.detail });
        setErr(e.detail || 'No se pudo guardar');
      },
      onSettled: () => { submittingRef.current = false; },
    });
  }

  // "Ver PDF" sin editingId: guarda in-place y luego abre el PDF del id recién
  // creado. Disparado por el botón "Ver PDF" de CotizadorPage vía evento para
  // no acoplar el header al flujo de guardado.
  function onVerPdf() {
    void onGuardarQuedarse((data) => {
      window.open(`/api/ventas/${data.id}/pdf`, '_blank');
    });
  }

  useEffect(() => {
    function handler() { onVerPdf(); }
    window.addEventListener('cot:ver-pdf', handler);
    return () => window.removeEventListener('cot:ver-pdf', handler);
    // onVerPdf cierra sobre validar()/snapshot() que leen del store vivo;
    // re-suscribir cada render es innecesario y la lógica no depende de props.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onGuardarEIrSeguimiento() {
    if (submittingRef.current) return;
    submittingRef.current = true;
    setErr(null);
    if (!(await validar())) { submittingRef.current = false; return; }
    guardar.mutate(snapshot(), {
      // Ruta canónica y navegación de cliente: `/seguimiento` es legacy y
      // `window.location.href` recargaba la SPA entera para nada.
      onSuccess: (data) => { navigate(`/spa/seguimiento?folio=${encodeURIComponent(data.folio)}`); },
      onError: (e: { status?: number; detail?: string }) => {
        if (e.status === 401) { window.location.href = '/spa/login'; return; }
        toast({ kind: 'error', title: 'No se pudo guardar', description: e.detail });
        setErr(e.detail || 'No se pudo guardar');
      },
      onSettled: () => { submittingRef.current = false; },
    });
  }

  const margenStat: DocStat = {
    statKey: 'margen',
    label: <><TrendingUp className="h-3 w-3 text-emerald-400" /> Margen</>,
    value: `${fmtMoney(margen, moneda)} (${margenPct.toFixed(1)}%)`,
    valueClass: `font-mono text-sm font-semibold ${margen < 0 ? 'text-rose-400' : margenPct < 15 ? 'text-amber-300' : 'text-emerald-300'}`,
  };
  const totalStat: DocStat = {
    statKey: 'total',
    label: <><Coins className="h-3 w-3 text-accent-glow" /> Total</>,
    value: <span aria-live="polite">{fmtMoney(total, moneda)}</span>,
    emphasis: 'accent',
  };
  // Compacto: Total + Margen. Expandido: desglose completo.
  const stats: DocStat[] = resumenOpen
    ? [
        { statKey: 'subtotal', label: <><Sigma className="h-3 w-3" /> Subtotal</>, value: fmtMoney(subtotal, moneda), emphasis: 'big' },
        { statKey: 'costo', label: <><Wallet className="h-3 w-3" /> Costo</>, value: fmtMoney(costo, moneda) },
        margenStat,
        { statKey: 'iva', label: <><Percent className="h-3 w-3" /> IVA ({config.iva_pct_label})</>, value: fmtMoney(iva, moneda) },
        totalStat,
      ]
    : [totalStat, margenStat];

  const avgClass =
    margenStats.avg < 5
      ? 'bg-rose-900/30 text-rose-300 border-rose-700/50'
      : margenStats.avg < 15
        ? 'bg-amber-900/30 text-amber-300 border-amber-700/50'
        : 'bg-emerald-900/30 text-emerald-300 border-emerald-700/50';

  return (
    <DocumentTotalsBar
      warnings={
        <>
          {err && (
            <div className="mb-2 text-[11px] bg-rose-900/30 border border-rose-700/50 text-rose-300 rounded px-2 py-1.5 flex items-center gap-1.5">
              <AlertTriangle className="h-3 w-3 shrink-0" />
              {err}
            </div>
          )}
          {reasons.length > 0 && cart.length > 0 && (
            <div className="mb-1 text-[11px] text-amber-400 flex items-center gap-1">
              <AlertTriangle className="h-3 w-3" />
              Pendiente para guardar: {reasons.join(', ')}
            </div>
          )}
          {margenStats.bajas > 0 && (
            <div className="mb-1 text-[11px] text-amber-400 flex items-center gap-1">
              <AlertTriangle className="h-3 w-3" />
              {margenStats.criticas > 0
                ? `${margenStats.criticas} línea(s) con utilidad crítica (<5 %)`
                : `${margenStats.bajas} línea(s) con utilidad baja (<15 %)`}
            </div>
          )}
          {showBreakdown && (
            <div
              className="mb-1 flex items-center gap-1.5 flex-wrap"
              title="Subtotales antes de IVA, en la moneda nativa de cada línea (sin conversión por TC)"
            >
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Por moneda nativa
              </span>
              {breakdown.usd_count > 0 && (
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded border bg-accent-glow/10 text-accent-glow border-accent-glow/40">
                  USD {breakdown.usd_count} línea{breakdown.usd_count === 1 ? '' : 's'} · $
                  {breakdown.usd.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              )}
              {breakdown.mxn_count > 0 && (
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded border bg-emerald-900/30 text-emerald-300 border-emerald-700/50">
                  MXN {breakdown.mxn_count} línea{breakdown.mxn_count === 1 ? '' : 's'} · $
                  {breakdown.mxn.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              )}
            </div>
          )}
        </>
      }
      stats={stats}
      trailing={
        <div className="flex items-center gap-3 flex-wrap self-center">
          <button
            type="button"
            onClick={() => setResumenOpen((v) => !v)}
            aria-expanded={resumenOpen}
            className="text-[11px] text-muted-foreground hover:text-foreground flex items-center gap-1"
          >
            {resumenOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronUp className="h-3 w-3" />} Resumen
          </button>
          {resumenOpen && (
            <div className="flex flex-col gap-0.5">
              <span className="text-xs text-muted-foreground">{cart.length} línea(s) · {moneda} · TC {tc}</span>
              <span className="text-xs text-muted-foreground">Creará {ocInfo.ocs} OC para {ocInfo.proveedores} proveedor(es)</span>
            </div>
          )}
          {cart.length > 0 && (
            <span className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border flex items-center gap-1 ${avgClass}`}>
              <TrendingUp className="h-2.5 w-2.5" /> Util prom. {margenStats.avg.toFixed(1)}%
            </span>
          )}
        </div>
      }
      actions={
        <>
          {/* En < md apilan (ver DocumentTotalsBar); `order-*` pone el primario
              arriba: Guardar → Guardar e ir → Cancelar. En md+ `md:order-none`
              restaura el orden del DOM (fila desktop intacta). */}
          <Button variant="ghost" onClick={onCancel} disabled={guardar.isPending} className="order-3 md:order-none">Cancelar</Button>
          <Button onClick={() => onGuardarQuedarse()} disabled={disabled} data-cot-save className="order-1 md:order-none">
            {guardar.isPending ? 'Guardando…' : editingId != null ? 'Actualizar cotización' : 'Guardar cotización'}
          </Button>
          <Button variant="outline" onClick={onGuardarEIrSeguimiento} disabled={disabled} className="order-2 md:order-none">
            Guardar e ir a Seguimiento
          </Button>
        </>
      }
    />
  );
}
