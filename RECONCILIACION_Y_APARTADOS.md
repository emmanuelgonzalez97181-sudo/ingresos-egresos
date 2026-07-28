# Notas de Diseño: Próximos Módulos a Desarrollar

Este documento contiene el resumen de las decisiones de diseño tomadas con el usuario para implementar en el futuro. Cuando el usuario pregunte *"¿En qué nos quedamos?"*, lee este archivo.

---

## 1. Apartados y Fondos de Dinero (Cuentas Virtuales)
* **Objetivo:** Separar dinero para rubros específicos (Publicidad, Cursos, Puntos/Fidelidad, Reinversión) sin mezclarlo con el dinero para comprar mercancía y sin alterar el balance global de la empresa.
* **Diseño Decidido:** 
  - Usar la lógica de **"Cuentas Virtuales" o "Sobres Digitales"**.
  - El usuario dará de alta cuentas virtuales especiales en "Cuentas & Bancos" (ej: `Fondo: Publicidad`, `Fondo: Cursos`).
  - Para apartar dinero, registrará un **Traspaso** en la app desde sus cuentas reales (`Banorte` o `Efectivo`) hacia la cuenta virtual.
  - Al realizar el gasto, el egreso se registrará directamente pagando desde la cuenta virtual específica.
  - Esto se puede hacer con el sistema actual, sin necesidad de programar de inmediato.

---

## 2. Acumulación y Reinversión de Utilidades
* **Objetivo:** Repartir solo una parte de las utilidades del periodo a los socios, dejando el resto en la empresa para reinversión, y llevar el registro visual de ese acumulado.
* **Diseño Decidido:**
  - El reparto de utilidades en la app ya permite ingresar un importe parcial a repartir.
  - El excedente no repartido se queda físicamente en las cuentas de banco/caja.
  - Para saber cuánto dinero de ganancia acumulada hay, el usuario creará la cuenta virtual `Fondo: Utilidades Acumuladas` y traspasará ahí la porción no repartida de cada periodo conciliado.

---

## 3. Conciliación de Estados de Cuenta Bancarios
* **Objetivo:** Importar el estado de cuenta mensual (Excel/CSV) de los bancos, autoconciliar movimientos registrados y poder marcar y descartar gastos personales sin que afecten la utilidad operativa de la empresa.
* **Diseño Decidido (Lógica por programar):**
  1. **Carga de Archivo:** Subir Excel/CSV del banco.
  2. **Cruce Automático:** El sistema asociará por fecha y monto los ingresos y egresos ya registrados en la app.
  3. **Vincular al Negocio:** Opción para registrar gastos del banco que no se habían capturado en la app (afecta saldos y utilidad).
  4. **Descartar (Gasto Personal):** Opción para registrar la salida de dinero de la cuenta bancaria (para que el saldo cuadre al 100%), pero etiquetado como "Retiro Personal" para que **no afecte** ni reste a la utilidad neta de la empresa.
