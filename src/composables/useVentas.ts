import { ref, computed, watch, nextTick } from 'vue';
import api from '../api/axios';
import { normalizarCodigo, coincideConPrenda } from '../utils/sku';

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
  /**
   * La lista de ESTA línea manda sobre la de la venta. Al mostrador entra un
   * mayorista que se lleva una prenda al menudeo: esa sola línea se pasa a
   * minorista con un clic, sin tocar el resto del carrito (`cambiarListaLinea`).
   * Si la línea no dice nada, vale la lista de la venta.
   */
  const listaDeLinea = (linea: any): string =>
    linea?.lista === 'MAYORISTA' || linea?.lista === 'MINORISTA' ? linea.lista : tipoVenta.value;

  const precioDeLista = (linea: any): number => {
    const mayorista = Number(linea?.precioMayorista) || 0;
    const minorista = Number(linea?.precioMinorista) || 0;
    const elegido = listaDeLinea(linea) === 'MAYORISTA' ? mayorista : minorista;
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

  /* ──────────────────────────────────────────────────────────────
     📏 LA TALLA TAMBIÉN PUEDE QUEDAR PARA DESPUÉS

     Una línea SIN talla ('') es la venta hecha de frente, sin preguntar nada:
     se toca la prenda y entra al carrito. El reparto entre tallas lo resuelve
     el sistema al cobrar, igual que ya hacía con el color, empezando por las
     que más stock tienen. Lo exacto se arregla en el conteo físico.
     ────────────────────────────────────────────────────────────── */
  const normalizarTalla = (talla: any): string =>
    talla === null || talla === undefined ? '' : String(talla).trim();

  /** true si esa línea se vendió sin elegir talla. */
  const esSinTalla = (linea: any): boolean => normalizarTalla(linea?.talla) === '';

  /** Identidad de una línea de carrito: la caja ya no separa por color. */
  const claveLinea = (productoId: any, talla: any) =>
    `${Number(productoId)}-${normalizarTalla(talla) || '*'}`;

  /** La clave de una línea, tolerando borradores viejos que no la traían. */
  const claveDe = (linea: any) => linea.clave || claveLinea(linea.productoId, linea.talla);

  /**
   * Variantes reales que puede surtir esa línea en la bodega de la caja:
   * los colores de esa talla, o TODAS las tallas y colores de la prenda si la
   * línea se vendió sin talla.
   */
  const variantesDeTalla = (productoId: any, talla: any): any[] => {
    const sinTalla = normalizarTalla(talla) === '';
    return inventarioConSKURef.value.filter(
      (i: any) =>
        Number(i.bodegaId) === Number(bodegaSeleccionada.value) &&
        Number(i.productoId || i.producto?.id) === Number(productoId) &&
        (sinTalla || String(i.talla) === String(talla))
    );
  };

  /**
   * Tope que ve el vendedor: el stock de la talla sumando sus colores, o el de
   * la prenda completa cuando la línea todavía no tiene talla.
   */
  const stockDeTalla = (productoId: any, talla: any): number =>
    variantesDeTalla(productoId, talla).reduce((s, v) => s + (Number(v.stock) || 0), 0);

  /** Arma una línea de carrito nueva ya con las dos listas de precio a bordo. */
  const nuevaLinea = (datos: {
    sku: string; productoId: number; nombre: string; colorPreferido?: string;
    talla?: string; stockMaximo: number; producto?: any;
  }) => {
    const talla = normalizarTalla(datos.talla);
    const linea: any = {
      clave: claveLinea(datos.productoId, talla),
      sku: datos.sku,
      productoId: datos.productoId,
      nombre: datos.nombre,
      // Solo se llena cuando la línea nació de un escaneo: ese color es dato
      // exacto (viene en la etiqueta) y se respeta antes que estimar.
      colorPreferido: datos.colorPreferido || '',
      // Vacía = sin elegir todavía; el sistema reparte las tallas al cobrar.
      talla,
      cantidad: 1,
      stockMaximo: datos.stockMaximo,
      stockForzado: datos.stockMaximo <= 0,
      // Lista de precio de esta línea. Nace con la de la venta y se cambia sola.
      lista: tipoVenta.value,
      // true cuando el precio se escribió a mano: la pantalla lo muestra para
      // que nadie crea que ese número salió de una lista.
      precioEditado: false,
      // Se guardan en la línea para poder recalcular al cambiar de lista sin
      // volver a consultar el inventario (y para que sobrevivan al borrador).
      precioMinorista: Number(datos.producto?.precioMinorista) || 0,
      precioMayorista: Number(datos.producto?.precioMayorista) || 0
    };
    linea.precioUnitario = precioDeLista(linea);

    const comoSeLlama = talla ? `${datos.nombre} (${talla})` : datos.nombre;
    if (linea.stockForzado) {
      avisar(`${comoSeLlama} quedó sin stock en el sistema. Revisar inventario.`);
    }
    if (linea.precioUnitario <= 0) {
      avisar(`${datos.nombre} no tiene precio configurado. Escríbelo a mano en el carrito.`);
    }
    return linea;
  };

  /**
   * 🎨📏 REPARTO DE COLOR (Y DE TALLA) AL COBRAR
   *
   * La caja vende rápido, pero el almacén descuenta por color y talla: alguien
   * tiene que decidir de qué variante sale cada unidad. Lo decide el sistema,
   * empezando por la que tiene MÁS stock, así ninguna queda en negativo. Si
   * vendes 5 de talla M y hay Negro 3 / Rojo 4, salen 4 Rojo + 1 Negro.
   *
   * Si la línea entró sin talla (venta de frente, sin preguntar), el reparto
   * mira todas las tallas de la prenda con el mismo criterio.
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
      const agregar = (color: string, talla: string, cantidad: number) => {
        const yaEsta = detalles.find(
          (d) => d.productoId === Number(linea.productoId) &&
                 d.color === String(color) &&
                 d.talla === String(talla)
        );
        if (yaEsta) {
          yaEsta.cantidad += Number(cantidad);
          return;
        }
        detalles.push({
          productoId: Number(linea.productoId),
          color: String(color),
          talla: String(talla),
          cantidad: Number(cantidad),
          precioUnitario: Number(linea.precioUnitario)
        });
      };

      const variantes = variantesDeTalla(linea.productoId, linea.talla)
        .map((v: any) => ({
          color: String(v.color),
          talla: String(v.talla),
          stock: Number(v.stock) || 0
        }))
        .sort((a, b) => {
          if (linea.colorPreferido) {
            const aEsEl = a.color === linea.colorPreferido;
            const bEsEl = b.color === linea.colorPreferido;
            if (aEsEl !== bEsEl) return aEsEl ? -1 : 1;
          }
          return b.stock - a.stock;
        });

      variantes.forEach((v) => {
        if (porRepartir <= 0 || v.stock <= 0) return;
        const toma = Math.min(v.stock, porRepartir);
        agregar(v.color, v.talla, toma);
        porRepartir -= toma;
      });

      // Se vendió más de lo que el sistema registra (pasa seguido: el físico va
      // adelante del sistema). El sobrante se carga a la variante escaneada, o a
      // la que más stock tenía, y el aviso de "revisar inventario" ya salió al
      // agregarlo al carrito.
      if (porRepartir > 0) {
        const respaldo = variantes[0];
        agregar(
          linea.colorPreferido || respaldo?.color || '',
          normalizarTalla(linea.talla) || respaldo?.talla || '',
          porRepartir
        );
      }
    });

    return detalles;
  };

  // Cambiar la lista de la VENTA es un "ponle esta lista a todo": reaplica los
  // precios a cada línea, incluidas las que estaban en la otra lista y las que
  // tenían precio escrito a mano. Para una sola prenda está `cambiarListaLinea`.
  watch(tipoVenta, (lista) => {
    if (carrito.value.length === 0) return;
    carrito.value.forEach((linea) => {
      linea.lista = lista;
      linea.precioEditado = false;
      linea.precioUnitario = precioDeLista(linea);
    });
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

  /**
   * 💵 PRECIO ESCRITO A MANO
   *
   * El regateo del mostrador no entra en ninguna lista. Se guarda en la línea y
   * se marca como editado para que en pantalla se vea que ese número lo puso una
   * persona. Ojo: cambiar la lista de toda la venta lo vuelve a pisar.
   */
  const cambiarPrecio = (item: any, valor: number | string) => {
    const precio = Math.round((Number(valor) || 0) * 100) / 100;
    item.precioUnitario = precio > 0 ? precio : 0;
    item.precioEditado = true;
    if (item.precioUnitario <= 0) {
      avisar(`${item.nombre} quedó en S/ 0.00. Revisa el precio antes de cobrar.`);
    }
    emitirSincronizacionCb(carrito.value);
  };

  /**
   * 🔁 UNA SOLA PRENDA A LA OTRA LISTA, DE UN CLIC
   *
   * Caso real: la venta está en MAYORISTA, el cliente se lleva seis prendas por
   * mayor y una sola al menudeo. Esa línea se cambia aquí y las demás se quedan
   * como están. Sin destino explícito, alterna entre las dos listas.
   */
  const cambiarListaLinea = (item: any, lista?: 'MINORISTA' | 'MAYORISTA') => {
    const destino = lista || (listaDeLinea(item) === 'MAYORISTA' ? 'MINORISTA' : 'MAYORISTA');
    item.lista = destino;
    item.precioEditado = false;
    item.precioUnitario = precioDeLista(item);

    // La lista existe pero la prenda no tiene ese precio configurado: se queda
    // con el otro (precioDeLista nunca deja un 0) y se avisa.
    const precioPedido =
      destino === 'MAYORISTA' ? Number(item.precioMayorista) || 0 : Number(item.precioMinorista) || 0;
    if (precioPedido <= 0) {
      avisar(
        `${item.nombre} no tiene precio ${destino === 'MAYORISTA' ? 'por mayor' : 'normal'} ` +
          `configurado. Escríbelo a mano en el carrito.`
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
    // inventario. coincideConPrenda reconoce la etiqueta de producción (formato
    // completo y compacto) y el código corto de la mercadería comprada.
    const bodega = Number(bodegaSeleccionada.value);
    const prendaLocal = inventarioConSKURef.value.find(
      (i: any) => Number(i.bodegaId) === bodega && coincideConPrenda(sku, i)
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
   *
   * Y acepta también una prenda SIN talla: así es la venta de frente de la caja
   * rápida, un toque y al carrito. La talla la reparte el cobro.
   */
  const agregarPrendaManual = (prenda: any) => {
    if (!bodegaSeleccionada.value) return alert('Selecciona una bodega primero.');
    if (!prenda) return;

    const productoId = Number(prenda.productoId || prenda.producto?.id);
    const nombre = prenda.producto?.nombre || prenda.nombre || 'Producto';
    const talla = normalizarTalla(prenda.talla);
    const stockMaximo = stockDeTalla(productoId, talla);

    const clave = claveLinea(productoId, talla);
    const itemEnCarrito = carrito.value.find((c) => claveDe(c) === clave);

    if (itemEnCarrito) {
      itemEnCarrito.stockMaximo = stockMaximo;
      cambiarCantidad(itemEnCarrito, itemEnCarrito.cantidad + 1);
    } else {
      carrito.value.unshift(
        nuevaLinea({
          sku: `PRD${productoId}-${talla || 'SURTIDO'}`,
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
    avisos, descartarAviso, construirDetalles,
    // Precio y lista por línea + talla pendiente de definir
    cambiarPrecio, cambiarListaLinea, listaDeLinea, esSinTalla, stockDeTalla
  };
}