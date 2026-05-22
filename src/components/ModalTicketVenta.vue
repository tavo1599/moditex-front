<script setup lang="ts">
const props = defineProps({
  show: Boolean,
  ventaRealizada: Object,
  carrito: { type: Array as () => any[], default: () => [] },
  clienteNombre: String,
  condicionPago: String,
  totalPagar: { type: Number, default: 0 },
  saldoPendiente: { type: Number, default: 0 }
});

const emit = defineEmits(['close']);

const imprimirTicket = () => {
  const ventana = window.open('', 'PRINT', 'height=600,width=400');
  const fecha = new Date().toLocaleString();
  
  ventana!.document.write(`
    <html><head><style>
      @page { margin: 0; }
      body { font-family: 'Courier New', Courier, monospace; width: 280px; padding: 10px; font-size: 12px; line-height: 1.2; color: #000; }
      .text-center { text-align: center; }
      .bold { font-weight: bold; }
      .divider { border-bottom: 1px dashed #000; margin: 10px 0; }
      .flex { display: flex; justify-content: space-between; }
      .item-qty { width: 30px; }
      .item-name { flex-grow: 1; padding-right: 5px; }
    </style></head><body>
      <div class="text-center bold" style="font-size: 18px; margin-bottom: 5px;">MODITEX</div>
      <div class="text-center">Venta de Ropa al por Mayor y Menor</div>
      <div class="divider"></div>
      <div>TICKET N°: ${props.ventaRealizada?.correlativo || props.ventaRealizada?.id || '0001'}</div>
      <div>FECHA: ${fecha}</div>
      <div>CLIENTE: ${props.clienteNombre || 'PÚBLICO GENERAL'}</div>
      <div>CONDICIÓN: ${props.condicionPago}</div>
      <div class="divider"></div>
      <div class="bold flex">
        <span class="item-qty">CT</span>
        <span class="item-name">DESCRIPCIÓN</span>
        <span>TOTAL</span>
      </div>
      <div class="divider"></div>
      ${props.carrito.map(item => `
        <div class="flex" style="margin-bottom: 5px;">
          <span class="item-qty">${item.cantidad}</span>
          <span class="item-name">${item.nombre} <br><small>T:${item.talla} | C:${item.color}</small></span>
          <span>S/ ${(item.cantidad * item.precioUnitario).toFixed(2)}</span>
        </div>
      `).join('')}
      <div class="divider"></div>
      <div class="flex flex-col text-right">
        <div>TOTAL FACTURADO: S/ ${props.totalPagar.toFixed(2)}</div>
        <div>TOTAL COBRADO: S/ ${(Number(props.ventaRealizada?.totalPagado) || props.totalPagar).toFixed(2)}</div>
        ${props.condicionPago !== 'CONTADO' ? `<div>SALDO RESTANTE: S/ ${props.saldoPendiente.toFixed(2)}</div>` : ''}
      </div>
      <div class="divider"></div>
      <div class="text-center bold" style="margin-top: 10px;">¡GRACIAS POR SU COMPRA!</div>
    </body></html>
  `);

  ventana!.document.close();
  ventana!.focus();
  setTimeout(() => {
    ventana!.print();
    ventana!.close();
  }, 500);
};
</script>

<template>
  <div v-if="show" class="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[200] p-4">
    <div class="bg-white rounded-[2rem] w-full max-w-sm overflow-hidden shadow-2xl animate-[zoomIn_0.3s_ease-out]">
      <div class="bg-green-500 p-6 text-white text-center">
        <div class="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-3 text-3xl">✅</div>
        <h3 class="text-xl font-black italic">VENTA EXITOSA</h3>
        <p class="text-green-100 text-xs font-bold uppercase tracking-widest mt-1">Ticket Computarizado</p>
      </div>
      
      <div class="p-6 space-y-4 text-center">
        <p class="text-gray-500 text-xs font-medium">La venta y los cronogramas financieros se han guardado con éxito.</p>
        <div class="flex flex-col gap-2">
          <button @click="imprimirTicket" class="w-full bg-gray-900 text-white py-3 rounded-xl font-black text-sm flex items-center justify-center gap-2 hover:bg-black transition-all">
            🖨️ IMPRIMIR COMPROBANTE
          </button>
          <button @click="emit('close')" class="w-full bg-gray-100 text-gray-500 py-3 rounded-xl font-bold hover:bg-gray-200 text-xs transition-all border border-gray-200">
            Cerrar Ventana
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
@keyframes zoomIn {
  from { opacity: 0; transform: translate(-50%, -50%) scale(0.8); }
  to { opacity: 1; transform: translate(-50%, -50%) scale(1); }
}
</style>