// Types for the CRM Pipeline / Kanban feature.
// Shapes mirror EXACT backend field names from /api/crm/*.

export type Pipeline = {
  id: number;
  organization_id: string | null;
  nombre: string;
  es_default: boolean;
  creado_en: string;
};

export type Stage = {
  id: number;
  organization_id: string | null;
  pipeline_id: number;
  nombre: string;
  orden: number;
  color: string | null;
  es_ganado: boolean;
  es_perdido: boolean;
};

export type Deal = {
  id: number;
  organization_id: string | null;
  pipeline_id: number;
  stage_id: number;
  titulo: string;
  cliente_id: number | null;
  orden_id: number | null;
  monto: number | null;
  moneda: string;
  owner_user_id: number | null;
  orden_en_stage: number;
  // Campos CRM v2 (pueden no venir en respuestas legacy → opcionales).
  probabilidad?: number | string | null;
  fecha_cierre_estimada?: string | null;
  proximo_paso?: string | null;
  notas?: string | null;
  creado_en: string;
  actualizado_en: string | null;
  cerrado_en: string | null;
};

// --- Detalle de deal (CRM v2) ---

export type ActividadTipo = 'nota' | 'llamada' | 'email' | 'reunion' | 'visita' | 'sistema';

export type Actividad = {
  id: number;
  tipo: ActividadTipo;
  descripcion: string;
  usuario_id: number | null;
  usuario_nombre: string | null;
  creado_en: string;
};

// POST /api/crm/deals/{id}/actividades body ('sistema' lo genera el backend).
export type ActividadCreate = {
  tipo: Exclude<ActividadTipo, 'sistema'>;
  descripcion: string;
};

// GET /api/crm/deals/{id} response.
// Decimales llegan como string desde el backend — coerciona con Number().
export type DealDetalle = {
  id: number;
  titulo: string;
  pipeline_id: number;
  stage_id: number;
  stage_nombre: string | null;
  cliente_id: number | null;
  cliente_nombre: string | null;
  orden_id: number | null;
  orden_folio: string | null;
  orden_estatus: string | null;
  orden_total: number | string | null;
  monto: number | string | null;
  moneda: string;
  probabilidad: number | string | null;
  fecha_cierre_estimada: string | null;
  proximo_paso: string | null;
  notas: string | null;
  owner_user_id: number | null;
  owner_nombre: string | null;
  creado_en: string;
  actualizado_en: string | null;
  cerrado_en: string | null;
  actividades: Actividad[];
};

// GET /api/crm/pipelines/{pipeline_id}/board response
export type Board = {
  pipeline: Pipeline;
  stages: Stage[];
  // Keys are stage ids as STRINGS (backend serialises dict keys as strings).
  deals_by_stage: Record<string, Deal[]>;
};

// POST body
export type DealCreate = {
  pipeline_id: number;
  titulo: string;
  stage_id?: number;
  cliente_id?: number | null;
  orden_id?: number | null;
  monto?: number | null;
  moneda?: string;
  owner_user_id?: number | null;
};

// PATCH body (all optional). Acepta además los campos CRM v2.
export type DealUpdate = Partial<Omit<DealCreate, 'pipeline_id'>> & {
  probabilidad?: number | null;
  fecha_cierre_estimada?: string | null;
  proximo_paso?: string | null;
  notas?: string | null;
};

// PATCH /move body
export type DealMove = {
  stage_id: number;
  orden_en_stage?: number;
};

// --- Métricas de pipeline (CRM v2) ---
// GET /api/crm/pipelines/{id}/metricas?dias=90
// Montos pueden llegar como string (Decimal serializado) y bajo `monto` o
// `monto_mxn` según versión del backend — coerciona con Number() y usa el que venga.

export type MetricaMonto = {
  count: number;
  monto?: number | string;
  monto_mxn?: number | string;
};

export type MetricaEtapa = MetricaMonto & {
  stage_id: number;
  nombre: string;
  color: string | null;
  es_ganado: boolean;
  es_perdido: boolean;
};

export type PipelineMetricas = {
  dias: number;
  por_etapa: MetricaEtapa[];
  abiertos: MetricaMonto;
  ganados: MetricaMonto;
  perdidos: MetricaMonto;
  tasa_ganado_pct: number | string;
};

// --- Configuración de etapas (CRM v2) ---

// POST /api/crm/pipelines/{id}/stages body
export type StageCreate = {
  nombre: string;
  color?: string;
};

// PATCH /api/crm/stages/{sid} body
export type StageUpdate = {
  nombre?: string;
  color?: string;
};
