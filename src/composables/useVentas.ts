import { ref, computed, watch, nextTick } from 'vue';
import api from '../api/axios';

// Recordamos la última bodega elegida para no tener que seleccionarla cada vez
// que se cambia de vista (se guarda en el navegador y se puede cambiar normal).
const CLAVE_BODEGA = 'pv_bodega_seleccionada';
const leerBodegaGuardada = (): number | '' => {
  try {
    const v = localStorage.getItem(CLAVE_BODEGA);
    return v ? Number(v) : '';
  } catch { return ''; }
};

// 💾 Borrador de la venta en curso. Antes el carrito solo vivía en memoria: si se
// recargaba la página, se iba la luz o el navegador se cerraba, se perdía todo lo
// cargado y había que volver a marcar prenda por prenda. Ahora se guarda en cada
// cambio y se restaura al volver a abrir la caja.
const CLAVE_BORRADOR = 'pv_borrador_venta';
const leerBorrador = (): any => {
  try {
    const crudo = localStorage.getItem(CLAVE_BORRADOR);
    return crudo ? JSON.parse(crudo) : null;
  } catch { return null; }
};

export function useVentas(inventarioConSKURef: any, emitirSincronizacionCb: (carrito: any[]) => void) {
  const bodegaSeleccionada = ref<number | ''>(leerBodegaGuardada());

  // Cada vez que cambie, la guardamos
  watch(bodegaSeleccionada, (val) => {
    try {
      if (val === '' || val === null || val === undefined) localStorage.removeItem(CLAVE_BODEGA);
      else localStorage.setItem(CLAVE_BODEGA, String(val));
    } catch { /* sin storage disponible */ }
  });

  const borrador = leerBorrador();

  const codigoEscaneado = ref('');
  const carrito = ref<any[]>(borrador?.carrito ?? []);
  const inputEscaner = ref<HTMLInputElement | null>(null);

  // Estados de crédito
  const condicionPago = ref(borrador?.condicionPago ?? 'CONTADO');
  const clienteId = ref<number | null>(borrador?.clienteId ?? null);
  const adelanto = ref<number | null>(borrador?.adelanto ?? null);
  const numeroCuotas = ref(1);
  const frecuenciaPago = ref('SEMANAL');

  // Estados de la venta
  const clienteNombre = ref(borrador?.clienteNombre ?? '');
  const tipoVenta = ref(borrador?.tipoVenta ?? 'MINORISTA');
  const metodoEntrega = ref(borrador?.metodoEntrega ?? 'ENTREGA_INMEDIATA');
  const destinoEnvio = ref(borrador?.destinoEnvio ?? '');
  const modalTicket = ref(false);
  const ventaRealizada = ref<any>(null);

  /** true si al abrir la caja se recuperó una venta a medio armar. */
  const borradorRecuperado = ref(Boolean(borrador?.carrito?.length));

  const guardarBorrador = () => {
    try {
      if (carrito.value.length === 0 && !clienteNombre.value) {
        localStorage.removeItem(CLAVE_BORRADOR);
        return;
      }
      localStorage.setItem(CLAVE_BORRADOR, JSON.stringify({
        carrito: carrito.value,
        condicionPago: condicionPago.value,
        clienteId: clienteId.value,
        clienteNombre: clienteNombre.value,
        adelanto: adelanto.value,
        tipoVenta: tipoVenta.value,
        metodoEntrega: metodoEntrega.value,
        destinoEnvio: destinoEnvio.value,
        guardadoEn: new Date().toISOString()
      }));
    } catch { /* sin storage disponible */ }
  };

  const limpiarBorrador = () => {
    borradorRecuperado.value = false;
    try { localStorage.removeItem(CLAVE_BORRADOR); } catch { /* noop */ }
  };

  // Cualquier cambio en la venta en curso se persiste de inmediato.
  watch(
    [carrito, condicionPago, clienteId, clienteNombre, adelanto, tipoVenta, metodoEntrega, destinoEnvio],
    guardarBorrador,
    { deep: true }
  );

  const totalPagar = computed(() => {
    return carrito.value.reduce((sum, item) => sum + (item.cantidad * item.precioUnitario), 0);
  });

  const saldoPendiente = computed(() => {
    return totalPagar.value - (Number(adelanto.value) || 0);
  });

  // El stock del sistema y el físico se desfasan seguido. Bloquear la venta por eso
  // hacía que el vendedor la apuntara en papel (y se perdiera). Preferimos registrar
  // la venta real y marcar la variante para revisión de inventario.
  const confirmarVentaSinStock = (referencia: string) =>
    confirm(
      `⚠️ El sistema marca 0 unidades de ${referencia} en esta bodega.\n\n` +
      `Si la prenda la tienes físicamente, acepta: la venta se registra igual y la ` +
      `variante queda marcada para revisar el inventario.\n\n¿Vender de todas formas?`
    );

  const confirmarExcesoStock = (disponible: number) =>
    confirm(
      `⚠️ El sistema solo registra ${disponible} unidad(es) disponible(s).\n\n` +
      `¿Agregar una más de todas formas? Quedará marcada para revisar el inventario.`
    );

  // 🔥 CONVERTIMOS A ASYNC PARA PODER CONECTARSE CON EL BACKEND EN TIEMPO REAL
  const procesarEscaneo = async () => {
    if (!bodegaSeleccionada.value) {
      alert("Selecciona una bodega primero.");
      codigoEscaneado.value = '';
      return;
    }

    const sku = codigoEscaneado.value.trim().toUpperCase().replace(/'/g, '-');
    if (!sku) return;

    // Variables de molde para capturar la prenda venga de donde venga
    let productoId = 0;
    let nombre = '';
    let color = '';
    let talla = '';
    let stockMaximo = 0;

    // 🔄 PLAN A (local): las etiquetas del sistema se resuelven directo con el
    // inventario. Reconocemos AMBOS formatos del código de barras:
    //   • completo  → 'PRD4-MLC-S'  (etiquetas viejas)
    //   • compacto  → '4MLCS'       (etiquetas nuevas, la mitad de barras)
    // Comparamos contra el skuCalculado tal cual y también sin 'PRD' ni guiones.
    const bodega = Number(bodegaSeleccionada.value);
    const prendaLocal = inventarioConSKURef.value.find((i: any) => {
      if (Number(i.bodegaId) !== bodega) return false;
      const full = String(i.skuCalculado || '').toUpperCase();
      const compacto = full.replace(/^PRD/, '').replace(/-/g, '');
      return full === sku || compacto === sku;
    });

    if (prendaLocal) {
      // El sistema puede estar desfasado del físico. Antes esto BLOQUEABA la venta:
      // el vendedor tenía la prenda en la mano y no podía cobrarla, así que la
      // anotaba en papel y esa venta se perdía. Ahora se avisa y se deja decidir.
      if (Number(prendaLocal.stock) <= 0 && !confirmarVentaSinStock(sku)) {
        codigoEscaneado.value = '';
        return;
      }
      productoId = Number(prendaLocal.productoId || prendaLocal.producto?.id);
      nombre = prendaLocal.producto?.nombre || 'Producto Genérico';
      color = prendaLocal.color;
      talla = prendaLocal.talla;
      stockMaximo = Number(prendaLocal.stock);
    } else {
      // 🚀 PLAN B (backend): no es del sistema → puede ser un QR de proveedor
      try {
        const res = await api.get(`/ventas/escanear/${sku}`);
        const dataBackend = res.data;
        productoId = Number(dataBackend.productoId);
        nombre = dataBackend.nombre;
        color = dataBackend.color;
        talla = dataBackend.talla;
        stockMaximo = Number(dataBackend.stockDisponible);
      } catch (error) {
        alert(`El producto escaneado o escrito (${sku}) no existe o no cuenta con stock físico disponible.`);
        codigoEscaneado.value = '';
        return;
      }
    }

    // 🎯 VALIDACIÓN INTELIGENTE: Buscamos en el carrito por variante real (ID + Color + Talla)
    // Esto evita duplicar filas si escanean el QR de fábrica o ingresan el código manual
    const itemEnCarrito = carrito.value.find(
      c => c.productoId === productoId && c.color === color && c.talla === talla
    );

    if (itemEnCarrito) {
      if (itemEnCarrito.cantidad + 1 > stockMaximo) {
        if (!confirmarExcesoStock(stockMaximo)) {
          codigoEscaneado.value = '';
          return;
        }
        itemEnCarrito.stockForzado = true;
      }
      itemEnCarrito.cantidad++;
    } else {
      // Buscamos el precio base configurado de forma local para no perder la reactividad
      const referenciaPrenda = inventarioConSKURef.value.find(
        (i: any) => Number(i.productoId || i.producto?.id) === productoId
      );
      const precioVentaBase = referenciaPrenda?.producto?.precioVenta || 0;

      carrito.value.unshift({
        sku: sku, // Guardamos el código exacto que disparó el láser
        productoId: productoId,
        nombre: nombre,
        color: color,
        talla: talla,
        cantidad: 1,
        stockMaximo: stockMaximo,
        stockForzado: stockMaximo <= 0,
        precioUnitario: precioVentaBase
      });
    }
    
    codigoEscaneado.value = '';
    
    // Alerta auditiva de confirmación
    const beep = new Audio('https://actions.google.com/sounds/v1/alarms/beep_short.ogg');
    beep.volume = 0.3;
    beep.play().catch(() => {});

    emitirSincronizacionCb(carrito.value);
    nextTick(() => inputEscaner.value?.focus());
  };

  // 🔍 Agrega una prenda al carrito SIN escanear (buscándola en el inventario).
  // Útil cuando la etiqueta está rota, borrosa o despegada.
  const agregarPrendaManual = (prenda: any) => {
    if (!bodegaSeleccionada.value) return alert('Selecciona una bodega primero.');
    if (!prenda) return;
    if (Number(prenda.stock) <= 0 && !confirmarVentaSinStock(prenda.producto?.nombre || 'esta prenda')) return;

    const productoId = Number(prenda.productoId || prenda.producto?.id);
    const nombre = prenda.producto?.nombre || 'Producto';
    const color = prenda.color;
    const talla = prenda.talla;
    const stockMaximo = Number(prenda.stock);

    const itemEnCarrito = carrito.value.find(
      (c) => c.productoId === productoId && c.color === color && c.talla === talla,
    );

    if (itemEnCarrito) {
      if (itemEnCarrito.cantidad + 1 > stockMaximo) {
        if (!confirmarExcesoStock(stockMaximo)) return;
        itemEnCarrito.stockForzado = true;
      }
      itemEnCarrito.cantidad++;
    } else {
      carrito.value.unshift({
        sku: prenda.skuCalculado || `PRD${productoId}-${color}-${talla}`,
        productoId,
        nombre,
        color,
        talla,
        cantidad: 1,
        stockMaximo,
        stockForzado: stockMaximo <= 0,
        precioUnitario: prenda.producto?.precioVenta || 0,
      });
    }

    emitirSincronizacionCb(carrito.value);
  };

  const quitarDelCarrito = (index: number) => {
    carrito.value.splice(index, 1);
    emitirSincronizacionCb(carrito.value);
    nextTick(() => inputEscaner.value?.focus());
  };

  return {
    bodegaSeleccionada, codigoEscaneado, carrito, inputEscaner,
    condicionPago, clienteId, adelanto, numeroCuotas, frecuenciaPago,
    clienteNombre, tipoVenta, metodoEntrega, destinoEnvio, modalTicket, ventaRealizada,
    totalPagar, saldoPendiente, procesarEscaneo, quitarDelCarrito, agregarPrendaManual,
    borradorRecuperado, limpiarBorrador
  };
}