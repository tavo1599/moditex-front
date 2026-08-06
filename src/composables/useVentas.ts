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

  // 🔔 AVISOS NO BLOQUEANTES
  // El stock del sistema y el físico se desfasan seguido. Antes esto salía como
  // confirm(), que congela la caja hasta que alguien haga clic: en pleno mostrador
  // eso interrumpe la venta. Ahora la venta NO se detiene nunca por stock; solo se
  // deja un aviso a un costado para revisar el inventario después.
  const avisos = ref<{ id: number; texto: string }[]>([]);
  let siguienteAvisoId = 0;

  const avisar = (texto: string) => {
    const id = ++siguienteAvisoId;
    // Si el mismo aviso ya está en pantalla no lo repetimos (escanear 5 veces la
    // misma prenda sin stock llenaría la pantalla de avisos idénticos).
    if (avisos.value.some(a => a.texto === texto)) return;
    avisos.value.push({ id, texto });
    setTimeout(() => descartarAviso(id), 8000);
  };

  const descartarAviso = (id: number) => {
    avisos.value = avisos.value.filter(a => a.id !== id);
  };

  // 💵 LISTAS DE PRECIO
  // Cada prenda tiene precio minorista y mayorista. `tipoVenta` decide cuál se usa.
  // Si la lista elegida está en cero (todavía no la configuraron) caemos a la otra
  // antes que meter un 0 al carrito y vender regalado por descuido.
  const precioDeLista = (linea: any): number => {
    const mayorista = Number(linea?.precioMayorista) || 0;
    const minorista = Number(linea?.precioMinorista) || 0;
    const elegido = tipoVenta.value === 'MAYORISTA' ? mayorista : minorista;
    return elegido || minorista || mayorista || 0;
  };

  /** Arma una línea de carrito nueva ya con las dos listas de precio a bordo. */
  const nuevaLinea = (datos: {
    sku: string; productoId: number; nombre: string; color: string;
    talla: string; stockMaximo: number; producto?: any;
  }) => {
    const linea: any = {
      sku: datos.sku,
      productoId: datos.productoId,
      nombre: datos.nombre,
      color: datos.color,
      talla: datos.talla,
      cantidad: 1,
      stockMaximo: datos.stockMaximo,
      stockForzado: datos.stockMaximo <= 0,
      // Se guardan en la línea para poder recalcular al cambiar de lista sin
      // volver a consultar el inventario (y para que sobrevivan al borrador).
      precioMinorista: Number(datos.producto?.precioMinorista) || 0,
      precioMayorista: Number(datos.producto?.precioMayorista) || 0
    };
    linea.precioUnitario = precioDeLista(linea);

    if (linea.stockForzado) {
      avisar(`${datos.nombre} (${datos.talla}) quedó sin stock en el sistema. Revisar inventario.`);
    }
    if (linea.precioUnitario <= 0) {
      avisar(`${datos.nombre} no tiene precio configurado. Escríbelo a mano en el carrito.`);
    }
    return linea;
  };

  // Al cambiar de lista se reaplican los precios a todo el carrito. Es una acción
  // deliberada del vendedor, así que pisa también los precios editados a mano.
  watch(tipoVenta, (lista) => {
    if (carrito.value.length === 0) return;
    carrito.value.forEach((linea) => { linea.precioUnitario = precioDeLista(linea); });
    avisar(`Precios actualizados a la lista ${lista === 'MAYORISTA' ? 'MAYORISTA' : 'MINORISTA'}.`);
    emitirSincronizacionCb(carrito.value);
  });

  /**
   * Cambia la cantidad de una línea del carrito (input manual o botones +/−).
   *
   * Vender 5 polos iguales ya no obliga a escanear 5 veces: se escanea uno y se
   * escribe la cantidad. Pasarse del stock del sistema no bloquea: se registra y
   * queda avisado.
   */
  const cambiarCantidad = (item: any, valor: number | string) => {
    let cantidad = Math.floor(Number(valor));
    if (!isFinite(cantidad) || cantidad < 1) cantidad = 1;

    const disponible = Number(item.stockMaximo) || 0;

    item.cantidad = cantidad;
    item.stockForzado = cantidad > disponible;

    if (item.stockForzado) {
      avisar(
        disponible <= 0
          ? `${item.nombre} (${item.talla}) quedó sin stock en el sistema. Revisar inventario.`
          : `${item.nombre} (${item.talla}): vendes ${cantidad} y el sistema solo registra ${disponible}. Revisar inventario.`
      );
    }

    emitirSincronizacionCb(carrito.value);
  };

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
      // Si el sistema marca 0 igual se vende: el aviso lo emite cambiarCantidad más
      // abajo, sin frenar al vendedor.
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
      // Refrescamos el tope con el stock recién consultado antes de subir la cantidad
      itemEnCarrito.stockMaximo = stockMaximo;
      cambiarCantidad(itemEnCarrito, itemEnCarrito.cantidad + 1);
    } else {
      // Buscamos el producto local para leer sus dos listas de precio
      const referenciaPrenda = inventarioConSKURef.value.find(
        (i: any) => Number(i.productoId || i.producto?.id) === productoId
      );

      carrito.value.unshift(
        nuevaLinea({
          sku, // Guardamos el código exacto que disparó el láser
          productoId,
          nombre,
          color,
          talla,
          stockMaximo,
          producto: referenciaPrenda?.producto
        })
      );
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

    const productoId = Number(prenda.productoId || prenda.producto?.id);
    const nombre = prenda.producto?.nombre || 'Producto';
    const color = prenda.color;
    const talla = prenda.talla;
    const stockMaximo = Number(prenda.stock);

    const itemEnCarrito = carrito.value.find(
      (c) => c.productoId === productoId && c.color === color && c.talla === talla,
    );

    if (itemEnCarrito) {
      itemEnCarrito.stockMaximo = stockMaximo;
      cambiarCantidad(itemEnCarrito, itemEnCarrito.cantidad + 1);
    } else {
      carrito.value.unshift(
        nuevaLinea({
          sku: prenda.skuCalculado || `PRD${productoId}-${color}-${talla}`,
          productoId,
          nombre,
          color,
          talla,
          stockMaximo,
          producto: prenda.producto
        })
      );
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
    cambiarCantidad, borradorRecuperado, limpiarBorrador,
    avisos, descartarAviso
  };
}