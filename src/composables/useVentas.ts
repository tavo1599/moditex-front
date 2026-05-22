import { ref, computed, watch, nextTick } from 'vue';
import api from '../api/axios';

export function useVentas(inventarioConSKURef: any, emitirSincronizacionCb: (carrito: any[]) => void) {
  const bodegaSeleccionada = ref<number | ''>('');
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

  const procesarEscaneo = () => {
    if (!bodegaSeleccionada.value) {
      alert("Selecciona una bodega primero.");
      codigoEscaneado.value = '';
      return;
    }

    const sku = codigoEscaneado.value.trim().toUpperCase();
    if (!sku) return;

    const prenda = inventarioConSKURef.value.find(
      (i: any) => i.skuCalculado === sku && Number(i.bodegaId) === Number(bodegaSeleccionada.value)
    );

    if (!prenda || prenda.stock <= 0) {
      alert(`El producto ${sku} no se encontró o no tiene stock en esta bodega.`);
      codigoEscaneado.value = '';
      return;
    }

    const itemEnCarrito = carrito.value.find(c => c.sku === sku);

    if (itemEnCarrito) {
      if (itemEnCarrito.cantidad + 1 > prenda.stock) {
        alert("No hay más stock disponible en almacén para esta variante.");
      } else {
        itemEnCarrito.cantidad++;
      }
    } else {
      carrito.value.unshift({
        sku: sku,
        productoId: prenda.productoId || prenda.producto?.id,
        nombre: prenda.producto?.nombre || 'Producto Genérico',
        color: prenda.color,
        talla: prenda.talla,
        cantidad: 1,
        stockMaximo: prenda.stock,
        precioUnitario: prenda.producto?.precioVenta || 0 
      });
    }
    
    codigoEscaneado.value = '';
    
    const beep = new Audio('https://actions.google.com/sounds/v1/alarms/beep_short.ogg');
    beep.volume = 0.3;
    beep.play().catch(() => {});

    emitirSincronizacionCb(carrito.value);
    nextTick(() => inputEscaner.value?.focus());
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
    totalPagar, saldoPendiente, procesarEscaneo, quitarDelCarrito
  };
}