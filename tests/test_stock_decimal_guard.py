from decimal import Decimal

import pytest
from fastapi import HTTPException

from app.services.stock_service import cantidad_entera_para_stock


def test_cantidad_entera_para_stock_acepta_decimal_entero():
    assert cantidad_entera_para_stock(Decimal("3"), "ABC-1") == 3
    assert isinstance(cantidad_entera_para_stock(Decimal("3"), "ABC-1"), int)


def test_cantidad_entera_para_stock_acepta_decimal_entero_con_ceros_decimales():
    # Numeric(12,3) puede traer "3.000" (mismo valor, distinta representación).
    assert cantidad_entera_para_stock(Decimal("3.000"), "ABC-1") == 3


def test_cantidad_entera_para_stock_rechaza_fraccion():
    with pytest.raises(HTTPException) as exc_info:
        cantidad_entera_para_stock(Decimal("2.5"), "CABLE-MTS")
    assert exc_info.value.status_code == 400
    assert "CABLE-MTS" in exc_info.value.detail
    assert "entera" in exc_info.value.detail
