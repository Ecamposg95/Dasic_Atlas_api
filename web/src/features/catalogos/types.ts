// Tipos para la feature de Catálogos (Marcas / Categorías / Unidades).
// Shapes derivados de /api/catalogos/*.

export type Marca = {
  id: number;
  abreviatura: string;
  nombre: string;
  categoria: string | null;
  n_productos: number;
  siguiente_sku: string | null;
};

export type MarcaCreate = {
  abreviatura: string;
  nombre: string;
  categoria?: string;
};

export type MarcaUpdate = {
  nombre?: string;
  categoria?: string;
};

// GET /api/catalogos/categorias-producto → { items: Categoria[] }
export type Categoria = {
  categoria: string;
  n_productos: number;
};

export type CategoriasProductoResponse = {
  items: Categoria[];
};

// GET /api/catalogos/unidades → List[UnidadMedidaResponse] — catálogo
// administrable `unidades_medida` (Task 4), ya no un diccionario derivado de
// `productos.unidad` distinct. Por default solo trae activas (`?todas=true`
// para uso admin incluye inactivas — sin consumidor en el frontend aún).
export type Unidad = {
  id: number;
  nombre: string;
  abreviatura: string;
  activa: boolean;
  orden: number;
};

export type UnidadesResponse = Unidad[];

// GET /api/catalogos/categorias-servicio → { en_uso: CategoriaServicio[], sugeridas: string[] }
// Derivado de servicios.categoria_servicio (sin CRUD propio).
export type CategoriaServicio = {
  categoria: string;
  n_servicios: number;
};

export type CategoriasServicioResponse = {
  en_uso: CategoriaServicio[];
  sugeridas: string[];
};

export type ResumenCatalogo = {
  total_marcas: number;
  total_productos: number;
  productos_con_marca: number;
  productos_sin_marca: number;
  total_categorias_producto: number;
  total_unidades: number;
  total_categorias_servicio: number;
};
