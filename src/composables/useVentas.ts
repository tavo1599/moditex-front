import { ref, computed, watch, nextTick } from 'vue';
import api from '../api/axios';
import { coincideSku, normalizarCodigo } from '../utils/sku';

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

  /* ──────────────────────────────────────────────────────────────
     🎨 LA CAJA VENDE POR TALLA, NO POR COLOR

     Elegir el color en el mostrador era lo que frenaba la venta. Ahora la línea
     del carrito es prenda + talla, con el stock sumado de todos sus colores, y
     el reparto por color se resuelve solo al cobrar (ver `construirDetalles`).

     El almacén NO pierde el color: sigue descontándose de una variante real. Lo
     único estimado es de cuál de los colores sale cada unidad, y eso se corrige
     con el conteo físico de inventario.
     ────────────────────────────────────────────────────────────── */

  /** Identidad de una línea de carrito: la caja ya no separa por color. */
  const claveLinea = (productoId: any, talla: any) => `${Number(productoId)}-${String(talla)}`;

  /** La clave de una línea, tolerando borradores viejos que no la traían. */
  const claveDe = (linea: any) => linea.clave || claveLinea(linea.productoId, linea.talla);

  /** Todas las variantes de color de esa prenda+talla en la bodega de la caja. */
  const variantesDeTalla = (productoId: any, talla: any): any[] =>
    inventarioConSKURef.value.filter(
      (i: any) =>
        Number(i.bodegaId) === Number(bodegaSeleccionada.value) &&
        Number(i.productoId || i.producto?.id) === Number(productoId) &&
        String(i.talla) === String(talla)
    );

  /** Stock de la talla sumando todos sus colores: es el tope que ve el vendedor. */
  const stockDeTalla = (productoId: any, talla: any): number =>
    variantesDeTalla(productoId, talla).reduce((s, v) => s + (Number(v.stock) || 0), 0);

  /** Arma una línea de carrito nueva ya con las dos listas de precio a bordo. */
  const nuevaLinea = (datos: {
    sku: string; productoId: number; nombre: string; colorPreferido?: string;
    talla: string; stockMaximo: number; producto?: any;
  }) => {
    const linea: any = {
      clave: claveLinea(datos.productoId, datos.talla),
      sku: datos.sku,
      productoId: datos.productoId,
      nombre: datos.nombre,
      // Solo se llena cuando la línea nació de un escaneo: ese color es dato
      // exacto (viene en la etiqueta) y se respeta antes que estimar.
      colorPreferido: datos.colorPreferido || '',
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

  /**
   * 🎨 REPARTO DE COLOR AL COBRAR
   *
   * La caja vende por talla, pero el almacén descuenta por color: alguien tiene
   * que decidir de qué color sale cada unidad. Lo decide el sistema, empezando
   * por el color con MÁS stock, así ningún color queda en negativo. Si vendes 5
   * de talla M y hay Negro 3 / Rojo 4, salen 4 Rojo + 1 Negro.
   *
   * El color escaneado manda sobre la estimación: la etiqueta trae el color real.
   */
  const construirDetalles = () => {
    const detalles: any[] = [];

    carrito.value.forEach((linea: any) => {
      let porRepartir = Number(linea.cantidad) || 0;
      if (porRepartir <= 0) return;

      // Suma sobre la fila que ya exista para esa variante en vez de repetirla:
      // al vender más de lo que registra el sistema, el sobrante cae sobre un
      // color que ya se había servido y el backend recibiría la misma variante
      // dos veces.
      const agregar = (color: string, cantidad: number) => {
        const yaEsta = detalles.find(
          (d) => d.productoId === Number(linea.productoId) &&
                 d.color === String(color) &&
                 d.talla === String(linea.talla)
        );
        if (yaEsta) {
          yaEsta.cantidad += Number(cantidad);
          return;
        }
        detalles.push({
          productoId: Number(linea.productoId),
          color: String(color),
          talla: String(linea.talla),
          cantidad: Number(cantidad),
          precioUnitario: Number(linea.precioUnitario)
        });
      };

      const variantes = variantesDeTalla(linea.productoId, linea.talla)
        .map((v: any) => ({ color: String(v.color), stock: Number(v.stock) || 0 }))
        .sort((a, b) => {
          if (linea.colorPreferido) {
            if (a.color === linea.colorPreferido) return -1;
            if (b.color === linea.colorPreferido) return 1;
          }
          return b.stock - a.stock;
        });

      variantes.forEach((v) => {
        if (porRepartir <= 0 || v.stock <= 0) return;
        const toma = Math.min(v.stock, porRepartir);
        agregar(v.color, toma);
        porRepartir -= toma;
      });

      // Se vendió más de lo que el sistema registra (pasa seguido: el físico va
      // adelante del sistema). El sobrante se carga al color escaneado, o al que
      // más stock tenía, y el aviso de "revisar inventario" ya salió al agregarlo.
      if (porRepartir > 0) {
        agregar(linea.colorPreferido || variantes[0]?.color || '', porRepartir);
      }
    });

    return detalles;
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

    const sku = normalizarCodigo(codigoEscaneado.value);
    if (!sku) return;

    // Variables de molde para capturar la prenda venga de donde venga
    let productoId = 0;
    let nombre = '';
    let color = '';
    let talla = '';
    let stockMaximo = 0;

    // 🔄 PLAN A (local): las etiquetas del sistema se resuelven directo con el
    // inventario. coincideSku reconoce el formato completo y el compacto.
    const bodega = Number(bodegaSeleccionada.value);
    const prendaLocal = inventarioConSKURef.value.find(
      (i: any) => Number(i.bodegaId) === bodega && coincideSku(sku, i.skuCalculado)
    );

    if (prendaLocal) {
      // Si el sistema marca 0 igual se vende: el aviso lo emite cambiarCantidad más
      // abajo, sin frenar al vendedor.
      productoId = Number(prendaLocal.productoId || prendaLocal.producto?.id);
      nombre = prendaLocal.producto?.nombre || 'Producto Genérico';
      color = prendaLocal.color;
      talla = prendaLocal.talla;
      // El tope es la talla completa, no solo el color escaneado: la línea del
      // carrito agrupa todos los colores de esa talla.
      stockMaximo = stockDeTalla(productoId, talla);
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

    // 🎯 Buscamos en el carrito por prenda + talla (el color ya no separa líneas):
    // escanear la etiqueta del sistema, el QR de fábrica o tocar la grilla suman
    // todos sobre la misma fila.
    const claveEscaneada = claveLinea(productoId, talla);
    const itemEnCarrito = carrito.value.find(c => claveDe(c) === claveEscaneada);

    if (itemEnCarrito) {
      // Refrescamos el tope con el stock recién consultado antes de subir la cantidad
      itemEnCarrito.stockMaximo = stockMaximo;
      // La línea pudo abrirse tocando la grilla (sin color). El escaneo sí trae el
      // color real, así que queda anotado para el reparto del cobro.
      if (!itemEnCarrito.colorPreferido && color) itemEnCarrito.colorPreferido = color;
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
          colorPreferido: color,
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

  /**
   * 🔍 Agrega una prenda al carrito SIN escanear: tocando la grilla de tallas o
   * eligiéndola del buscador. Útil cuando la etiqueta está rota o despegada.
   *
   * Acepta tanto una talla ya agrupada (lo que emite la grilla) como una fila
   * suelta del inventario: en ambos casos solo se leen prenda y talla, porque el
   * color no se decide en la caja.
   */
  const agregarPrendaManual = (prenda: any) => {
    if (!bodegaSeleccionada.value) return alert('Selecciona una bodega primero.');
    if (!prenda) return;

    const productoId = Number(prenda.productoId || prenda.producto?.id);
    const nombre = prenda.producto?.nombre || 'Producto';
    const talla = prenda.talla;
    const stockMaximo = stockDeTalla(productoId, talla);

    const clave = claveLinea(productoId, talla);
    const itemEnCarrito = carrito.value.find((c) => claveDe(c) === clave);

    if (itemEnCarrito) {
      itemEnCarrito.stockMaximo = stockMaximo;
      cambiarCantidad(itemEnCarrito, itemEnCarrito.cantidad + 1);
    } else {
      carrito.value.unshift(
        nuevaLinea({
          sku: `PRD${productoId}-${talla}`,
          productoId,
          nombre,
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
    avisos, descartarAviso, construirDetalles
  };
}