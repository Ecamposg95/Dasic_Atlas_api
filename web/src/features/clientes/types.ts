// Tipos para la feature de Clientes.
// Shape derivado de GET /api/clientes/.

export type MonedaCredito = 'MXN' | 'USD';

export type Cliente = {
  id: number;
  nombre_empresa: string;
  contacto_nombre: string | null;
  rfc_tax_id: string | null;
  email: string | null;
  telefono: string | null;
  direccion: string | null;
  limite_credito: number | string;
  dias_credito: number;
  dia_corte: number | null;
  moneda_credito: MonedaCredito;
  saldo_actual: number | string;
  creado_por_id: number | null;
  n_contactos?: number;
  estatus?: string;
  ultima_compra?: string | null;
};

export type ClienteCreate = {
  nombre_empresa: string;
  contacto_nombre?: string | null;
  rfc_tax_id?: string | null;
  email?: string | null;
  telefono?: string | null;
  direccion?: string | null;
  limite_credito?: number;
  dias_credito?: number;
  dia_corte?: number | null;
  moneda_credito?: MonedaCredito;
};

export type ClienteUpdate = Partial<ClienteCreate>;

export type { Contacto, ContactoInput } from '@/features/contactos/types';

export type TransaccionCuenta = {
  id: number;
  fecha: string;
  monto: number | string;
  tipo: string;
  descripcion: string;
  referencia_id: number | null;
};

export type CargoAbierto = {
  id: number;
  orden_venta_id: number | null;
  folio: string | null;
  fecha: string | null;
  fecha_vencimiento: string | null;
  descripcion: string;
  monto: number;
  monto_pagado: number;
  saldo_pendiente: number;
  estatus_pago: string;
  dias_atraso: number;
};

export type CxCClienteResponse = {
  cliente: {
    id: number;
    nombre_empresa: string;
    saldo_actual: number;
    limite_credito: number;
    dias_credito: number;
    moneda_credito: string;
  };
  cargos: CargoAbierto[];
};

export type EmpresaDuplicadaMiembro = {
  id: number;
  nombre_empresa: string;
  contacto_nombre: string | null;
  saldo_actual: number;
  limite_credito: number;
  dias_credito: number;
  n_ordenes: number;
  n_transacciones: number;
  n_remisiones: number;
  n_contactos: number;
};

export type GrupoDuplicado = {
  rfc: string;
  miembros: EmpresaDuplicadaMiembro[];
};

export type MergeResult = {
  survivor_id: number;
  merged: number;
  remapped: { ordenes: number; transacciones: number; remisiones: number; contactos: number };
};

export type EstatusEmpresa = 'activo' | 'inactivo' | 'prospecto';

export type EmpresaResumen = {
  total_vendido: number;
  n_ventas: number;
  n_cotizaciones: number;
  ticket_promedio: number;
  ultima_compra: string | null;
  saldo_actual: number;
  limite_credito: number;
  credito_disponible: number;
  estatus: string;
};

export type ActividadEvento = {
  tipo: 'cotizacion' | 'venta' | 'remision' | 'pago' | 'cargo';
  fecha: string | null;
  ref: string | number | null;
  monto: number | null;
  moneda: string | null;
  descripcion: string;
};

export type NotaEmpresa = {
  id: number;
  cliente_id: number;
  autor_id: number | null;
  autor_nombre: string | null;
  texto: string;
  creado_en: string | null;
};

// ─── Plantas y Activos instalados (instalaciones del cliente) ────────────────

export type Planta = {
  id: number;
  cliente_id: number;
  nombre: string;
  direccion: string | null;
  ciudad: string | null;
  notas: string | null;
  creado_en: string | null;
};

export type PlantaInput = {
  nombre: string;
  direccion?: string | null;
  ciudad?: string | null;
  notas?: string | null;
};

export type EstadoActivo = 'operativo' | 'mantenimiento' | 'fuera_servicio' | 'baja';

export type Activo = {
  id: number;
  cliente_id: number;
  planta_id: number | null;
  planta_nombre: string | null;
  nombre: string;
  tipo: string | null;
  fabricante: string | null;
  modelo: string | null;
  serie: string | null;
  ubicacion: string | null;
  fecha_instalacion: string | null;
  garantia_hasta: string | null;
  estado: EstadoActivo;
  notas: string | null;
  creado_en: string | null;
};

export type ActivoInput = {
  nombre: string;
  planta_id?: number | null;
  tipo?: string | null;
  fabricante?: string | null;
  modelo?: string | null;
  serie?: string | null;
  ubicacion?: string | null;
  fecha_instalacion?: string | null;
  garantia_hasta?: string | null;
  estado?: EstadoActivo;
  notas?: string | null;
};

export type DealEnlazado = {
  id: number;
  titulo: string;
  monto: number | null;
  moneda: string | null;
  stage: string | null;
  owner: string | null;
  creado_en: string | null;
  cerrado_en: string | null;
};
