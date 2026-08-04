from decimal import Decimal
from app import models


def test_unidad_medida_tabla(db):
    u = models.UnidadMedida(nombre="Metro", abreviatura="MTS", activa=True, orden=2)
    db.add(u)
    db.commit()
    assert db.query(models.UnidadMedida).filter_by(nombre="Metro").one().abreviatura == "MTS"


def test_detalle_remision_acepta_decimales_y_unidad(db):
    rem = models.Remision()
    db.add(rem)
    db.flush()
    det = models.DetalleRemision(
        remision_id=rem.id, descripcion="Cable", cantidad=Decimal("2.500"), unidad="MTS",
    )
    db.add(det)
    db.commit()
    assert det.cantidad == Decimal("2.500")
    assert det.unidad == "MTS"


def test_detalle_orden_clone_copia_unidad(db):
    """Espeja el patrón de copia usado en `recotizar()` (app/routers/ventas.py):
    al clonar una línea de OrdenVenta hacia la versión nueva, `unidad` se copia
    igual que `marca`/`clave_unidad_sat` — no debe perderse en el snapshot."""
    orden = models.OrdenVenta(folio="C-TEST-0001")
    db.add(orden)
    db.flush()

    det = models.DetalleOrden(
        orden_id=orden.id,
        descripcion_libre="Cable",
        cantidad=Decimal("2.500"),
        unidad="MTS",
        precio_unitario=Decimal("10.00"),
        subtotal=Decimal("25.00"),
    )
    db.add(det)
    db.flush()

    # Mismo patrón de copia campo-a-campo que el clone loop de recotizar().
    clon = models.DetalleOrden(
        orden_id=orden.id,
        producto_id=det.producto_id,
        servicio_id=det.servicio_id,
        sku_libre=det.sku_libre,
        descripcion_libre=det.descripcion_libre,
        moneda_origen_linea=det.moneda_origen_linea,
        costo_base_linea=det.costo_base_linea,
        clave_prod_serv=det.clave_prod_serv,
        clave_unidad_sat=det.clave_unidad_sat,
        marca=det.marca,
        mostrar_marca=det.mostrar_marca,
        cantidad=det.cantidad,
        unidad=det.unidad,
        precio_unitario=det.precio_unitario,
        utilidad_aplicada=det.utilidad_aplicada,
        descuento_aplicado=det.descuento_aplicado,
        descuento_proveedor=det.descuento_proveedor or Decimal("0"),
        subtotal=det.subtotal,
        tipo_linea=det.tipo_linea,
    )
    db.add(clon)
    db.commit()

    assert clon.unidad == "MTS"
