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

export function useVentas(inventarioConSKURef: any, emitirSincronizacionCb: (carrito: any[]) => void) {
  const bodegaSeleccionada = ref<number | ''>(leerBodegaGuardada());

  // Cada vez que cambie, la guardamos
  watch(bodegaSeleccionada, (val) => {
    try {
      if (val === '' || val === null || val === undefined) localStorage.removeItem(CLAVE_BODEGA);
      else localStorage.setItem(CLAVE_BODEGA, String(val));
    } catch { /* sin storage disponible */ }
  });

  const codigoEscaneado = ref('');
  const carrito = ref<any[]>([]);
  const inputEscaner = ref<HTMLInputElement | null>(null);

  // Estados de crédito
  const condicionPago = ref('CONTADO'); 
  const clienteId = ref<number | null>(null);
  const adelanto = ref<number | null>(null);
  const numeroCuotas = ref(1);
  const frecuenciaPago = ref('SEMANAL');

  // Estados de la venta
  const clienteNombre = ref('');
  const tipoVenta = ref('MINORISTA');
  const metodoEntrega = ref('ENTREGA_INMEDIATA'); 
  const destinoEnvio = ref('');
  const modalTicket = ref(false);
  const ventaRealizada = ref<any>(null);

  const totalPagar = computed(() => {
    return carrito.value.reduce((sum, item) => sum + (item.cantidad * item.precioUnitario), 0);
  });

  const saldoPendiente = computed(() => {
    return totalPagar.value - (Number(adelanto.value) || 0);
  });

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
    let productoId: number;
    let nombre: string;
    let color: string;
    let talla: string;
    let stockMaximo: number;

    try {
      // 🚀 PLAN A: Intentamos buscar el código QR del proveedor en el endpoint de NestJS
      const res = await api.get(`/ventas/escanear/${sku}`);
      const dataBackend = res.data;

      productoId = Number(dataBackend.productoId);
      nombre = dataBackend.nombre;
      color = dataBackend.color;
      talla = dataBackend.talla;
      stockMaximo = Number(dataBackend.stockDisponible);

    } catch (error) {
      // 🔄 PLAN B (Fallback): Si el backend no encuentra el QR, buscamos por el SKU calculado local
      const prendaLocal = inventarioConSKURef.value.find(
        (i: any) => i.skuCalculado === sku && Number(i.bodegaId) === Number(bodegaSeleccionada.value)
      );

      if (!prendaLocal || prendaLocal.stock <= 0) {
        alert(`El producto escaneado o escrito (${sku}) no existe o no cuenta con stock físico disponible.`);
        codigoEscaneado.value = '';
        return;
      }

      productoId = Number(prendaLocal.productoId || prendaLocal.producto?.id);
      nombre = prendaLocal.producto?.nombre || 'Producto Genérico';
      color = prendaLocal.color;
      talla = prendaLocal.talla;
      stockMaximo = Number(prendaLocal.stock);
    }

    // 🎯 VALIDACIÓN INTELIGENTE: Buscamos en el carrito por variante real (ID + Color + Talla)
    // Esto evita duplicar filas si escanean el QR de fábrica o ingresan el código manual
    const itemEnCarrito = carrito.value.find(
      c => c.productoId === productoId && c.color === color && c.talla === talla
    );

    if (itemEnCarrito) {
      if (itemEnCarrito.cantidad + 1 > stockMaximo) {
        alert("Atención: No puedes superar el stock máximo disponible en el almacén.");
      } else {
        itemEnCarrito.cantidad++;
      }
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
    if (!prenda || Number(prenda.stock) <= 0) return alert('Esa prenda no tiene stock disponible.');

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
        return alert('Atención: No puedes superar el stock máximo disponible en el almacén.');
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
    totalPagar, saldoPendiente, procesarEscaneo, quitarDelCarrito, agregarPrendaManual
  };
}