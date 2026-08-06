<script setup lang="ts">
import { ref, onMounted, computed, watch } from 'vue';
import api from '../api/axios'; 
import QrcodeVue from 'qrcode.vue'; 
import { useScanner } from '../composables/useScanner';
import { useVentas } from '../composables/useVentas';
import { useColaVentas } from '../composables/useColaVentas';

// 🔥 Importamos nuestros nuevos componentes modulares
import ModalNuevoCliente from '../components/ModalNuevoCliente.vue';
import ModalTicketVenta from '../components/ModalTicketVenta.vue';
import PanelVentasPendientes from '../components/ventas/PanelVentasPendientes.vue';
import GrillaPrendas from '../components/ventas/GrillaPrendas.vue';

interface Cliente {
  id: number;
  nombre: string;
  limiteCredito: number;
  saldoPendiente: number;
}

const bodegas = ref<any[]>([]);
const inventarioTotal = ref<any[]>([]);
const colores = ref<any[]>([]); 
const clientes = ref<Cliente[]>([]);
const cargando = ref(true);
const modalNuevoCliente = ref(false);

const cargarDatos = async () => {
  cargando.value = true;
  try {
    const [resBodegas, resInv, resColores, resClientes] = await Promise.all([
      api.get('/almacen-terminados/bodegas'),
      api.get('/almacen-terminados/inventario'),
      api.get('/colores'),
      api.get('/clientes').catch(() => ({ data: [] }))
    ]);
    bodegas.value = resBodegas.data.filter((b: any) => b.estado);
    inventarioTotal.value = resInv.data;
    colores.value = resColores.data;
    clientes.value = resClientes.data;
  } catch (error) {
    console.error("Error al cargar datos:", error);
  } finally {
    cargando.value = false;
  }
};

const inventarioConSKU = computed(() => {
  return inventarioTotal.value.map(item => {
    const colorObj = colores.value.find(c => c.codigo === item.color || c.nombre === item.color);
    const codigoColor = colorObj ? colorObj.codigo : String(item.color).substring(0, 3).toUpperCase();
    const idProd = item.productoId || item.producto?.id;
    return { ...item, skuCalculado: `PRD${idProd}-${codigoColor}-${item.talla}` };
  });
});

const {
  bodegaSeleccionada, codigoEscaneado, carrito, inputEscaner,
  condicionPago, clienteId, adelanto, numeroCuotas, frecuenciaPago,
  clienteNombre, tipoVenta, metodoEntrega, destinoEnvio, modalTicket, ventaRealizada,
  totalPagar, saldoPendiente, procesarEscaneo, quitarDelCarrito, agregarPrendaManual,
  cambiarCantidad, borradorRecuperado, limpiarBorrador, avisos, descartarAviso
} = useVentas(inventarioConSKU, (carritoActual) => emitirSincronizacion(carritoActual));

const { enviarVenta } = useColaVentas();

// Muestra el NOMBRE del color (los vendedores no manejan códigos como "NGR")
const nombreColor = (val: any) => {
  const c = colores.value.find((x) => x.codigo === val || x.nombre === val);
  return c ? c.nombre : val;
};

// 🔍 Búsqueda manual (cuando la etiqueta no se puede escanear)
const busquedaManual = ref('');
const resultadosBusqueda = computed(() => {
  const q = busquedaManual.value.trim().toLowerCase();
  if (!q || !bodegaSeleccionada.value) return [];
  return inventarioConSKU.value
    .filter((i: any) => Number(i.bodegaId) === Number(bodegaSeleccionada.value) && Number(i.stock) > 0)
    .filter((i: any) => {
      const txt = `${i.producto?.nombre || ''} ${i.skuCalculado || ''} ${i.color} ${i.talla}`.toLowerCase();
      return txt.includes(q);
    })
    .slice(0, 30);
});
const seleccionarPrenda = (prenda: any) => {
  agregarPrendaManual(prenda);
  busquedaManual.value = '';
};

// 🎯 Pestaña activa del panel principal. Arranca en la grilla táctil: es el flujo
// normal de venta ahora que la pistola dejó de ser confiable.
const pestana = ref<'grilla' | 'carrito'>('grilla');

// Al agregar desde la grilla, en móvil el carrito no se ve; un contador en la
// pestaña da el feedback sin sacar al vendedor de la grilla.
const agregarDesdeGrilla = (prenda: any) => agregarPrendaManual(prenda);

// Escribir la cantidad a mano: si el valor tecleado se corrige (vacío, decimales,
// menos de 1, o un exceso de stock que el vendedor no confirmó), hay que repintar
// el input. Vue no lo hace solo cuando la cantidad final termina siendo la misma
// que ya tenía, y el campo se quedaría en blanco.
const editarCantidad = (item: any, evento: Event) => {
  const input = evento.target as HTMLInputElement;
  cambiarCantidad(item, input.value);
  input.value = String(item.cantidad);
};

const { pinConexion, movilVinculado, mostrarVinculacion, urlVinculacion, emitirSincronizacion } = useScanner(
  () => procesarEscaneo(),
  codigoEscaneado
);

watch(clienteId, (id) => {
  if (id) {
    const c = clientes.value.find(item => item.id === id);
    if (c) clienteNombre.value = c.nombre;
  }
});

// 🔥 Recibe al cliente desde el modal y lo auto-selecciona
const alRegistrarCliente = (nuevoCliente: Cliente) => {
  clientes.value.push(nuevoCliente);
  clienteId.value = nuevoCliente.id;
  clienteNombre.value = nuevoCliente.nombre;
  modalNuevoCliente.value = false;
};

// 🔥 Función segura para limpiar el POS SOLO cuando ya se imprimió el ticket
const limpiarCaja = () => {
  carrito.value = [];
  clienteNombre.value = '';
  destinoEnvio.value = '';
  clienteId.value = null;
  adelanto.value = null;
  condicionPago.value = 'CONTADO';
  limpiarBorrador();
  cargarDatos();
  emitirSincronizacion([]);
};

// Cierra el modal del ticket y procede a limpiar
const cerrarModalTicket = () => {
  modalTicket.value = false;
  limpiarCaja();
};

const enviarVentaBackend = async () => {
  if (carrito.value.length === 0) return alert("El carrito está vacío.");
  
  if (metodoEntrega.value === 'ENVIO_AGENCIA' && !destinoEnvio.value.trim()) {
    return alert("⚠️ Ingresa la dirección de destino.");
  }

  if (condicionPago.value !== 'CONTADO' && !clienteId.value) {
    return alert("⚠️ Debes seleccionar un cliente registrado para ventas al crédito.");
  }

  const payload = {
    almacenId: Number(bodegaSeleccionada.value),
    cliente: clienteNombre.value || 'Cliente de Mostrador',
    clienteNombre: clienteNombre.value || 'Cliente de Mostrador',
    tipoVenta: tipoVenta.value,
    metodoEntrega: metodoEntrega.value,
    requiereEnvio: metodoEntrega.value === 'ENVIO_AGENCIA',
    destinoEnvio: metodoEntrega.value === 'ENVIO_AGENCIA' ? destinoEnvio.value : undefined,
    detalles: carrito.value.map(c => ({
      productoId: Number(c.productoId),
      color: String(c.color),
      talla: String(c.talla),
      cantidad: Number(c.cantidad),
      precioUnitario: Number(c.precioUnitario)
    })),
    condicionPago: condicionPago.value,
    clienteId: clienteId.value ? Number(clienteId.value) : undefined,
    adelanto: Number(adelanto.value) || 0,
    numeroCuotas: Number(numeroCuotas.value) || 1,
    frecuenciaPago: frecuenciaPago.value
  };

  // Resumen legible para poder identificar la venta si queda en la cola de pendientes.
  const resumen = {
    cliente: clienteNombre.value || 'Cliente de Mostrador',
    total: totalPagar.value,
    items: carrito.value.reduce((s, c) => s + Number(c.cantidad || 0), 0),
    bodega: bodegas.value.find(b => Number(b.id) === Number(bodegaSeleccionada.value))?.nombre || '—'
  };

  const resultado = await enviarVenta(payload, resumen);

  // ⛔ El servidor rechazó la venta por un motivo real (sin stock, datos inválidos).
  // No se encola porque reintentar daría el mismo error: el carrito se queda intacto
  // para que el vendedor corrija y vuelva a intentar.
  if (!resultado.ok && !resultado.encolada) {
    alert('Error: ' + resultado.mensaje);
    return;
  }

  // 🛟 No hubo conexión, pero la venta NO se pierde: quedó guardada en este equipo
  // y se reintenta sola. La caja se libera para poder seguir atendiendo.
  if (!resultado.ok) {
    alert(
      '⚠️ No hay conexión con el servidor.\n\n' +
      'La venta quedó GUARDADA en este equipo y se enviará sola apenas vuelva el internet.\n' +
      'Puedes seguir vendiendo normalmente. No cierres sesión ni borres los datos del navegador.'
    );
    limpiarCaja();
    return;
  }

  ventaRealizada.value = resultado.data;

  // 🔄 Recargamos el inventario SIEMPRE apenas se registra la venta, para que la
  // siguiente venta ya vea el stock actualizado (antes solo se recargaba al cerrar
  // el ticket, y si no se cerraba bien el stock quedaba viejo → "no hay stock").
  await cargarDatos();

  if (metodoEntrega.value === 'ENTREGA_INMEDIATA' || metodoEntrega.value === 'RECOJO_TIENDA') {
    modalTicket.value = true; // Abre el modal (el carrito se limpia al cerrarlo)
  } else {
    alert("✅ Venta registrada correctamente.");
    limpiarCaja(); // Si es por agencia, limpia de inmediato sin ticket
  }
};

onMounted(() => {
  cargarDatos();
});
</script>

<template>
  <div class="p-2 md:p-6 space-y-6 max-w-[1600px] mx-auto min-h-screen bg-gray-50/50 font-urbanist">
    
    <header class="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-4">
      <div>
        <h1 class="text-2xl md:text-3xl font-black text-gray-800 tracking-tight">Caja de Facturación</h1>
        <p class="text-xs md:text-sm text-gray-500 font-medium">Escanea, cobra y gestiona entregas en tiempo real de forma responsiva.</p>
      </div>
      
      <div class="bg-white p-2 rounded-xl shadow-sm border border-gray-200 flex items-center gap-3 w-full md:w-auto">
        <span class="pl-2 text-xl">🏢</span>
        <select v-model="bodegaSeleccionada" class="w-full md:w-64 border-none bg-transparent font-bold text-gray-700 outline-none focus:ring-0 text-xs py-2 cursor-pointer">
          <option value="" disabled>Selecciona la Bodega Actual...</option>
          <option v-for="b in bodegas" :key="b.id" :value="b.id">{{ b.nombre }}</option>
        </select>
      </div>
    </header>

    <!-- 🛟 Ventas que no se pudieron enviar: quedan guardadas aquí hasta que salgan -->
    <PanelVentasPendientes />

    <!-- 💾 Aviso de venta recuperada tras un cierre inesperado -->
    <div v-if="borradorRecuperado && carrito.length" class="rounded-2xl border-2 border-blue-200 bg-blue-50 px-5 py-3 flex flex-wrap items-center justify-between gap-3">
      <p class="text-sm font-bold text-blue-900">
        💾 Se recuperó una venta a medio armar ({{ carrito.length }} ítem{{ carrito.length === 1 ? '' : 's' }}). Revísala antes de cobrar.
      </p>
      <button @click="borradorRecuperado = false" class="text-[10px] font-black uppercase tracking-wider text-blue-700 hover:text-blue-900 border border-blue-200 px-3 py-1.5 rounded-lg">
        Entendido
      </button>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-12 gap-6">

      <!-- En móvil usamos display:contents para poder intercalar el carrito entre estas tarjetas -->
      <div class="contents lg:block lg:col-span-4 lg:space-y-4">

        <!-- Sin overflow-hidden: recortaba el desplegable del buscador. z-20 para que quede sobre las tarjetas de abajo -->
        <div class="order-1 lg:order-none bg-gray-900 rounded-3xl p-6 shadow-xl shadow-gray-900/10 relative z-20">
          <div class="flex items-center gap-3 mb-4">
            <div class="w-8 h-8 bg-gray-800 rounded-full flex items-center justify-center border border-gray-700">
              <span class="text-sm">🔫</span>
            </div>
            <label class="text-blue-400 font-black uppercase tracking-widest text-[10px]">Pistola Láser FÍSICA</label>
          </div>
          <input 
            ref="inputEscaner"
            type="text" 
            v-model="codigoEscaneado"
            @keyup.enter="procesarEscaneo"
            placeholder="Escanea aquí..."
            class="w-full bg-black/50 border-2 border-gray-700 p-4 rounded-xl text-xl text-center outline-none focus:border-blue-500 focus:bg-gray-950 transition-all placeholder-gray-700 text-white font-mono font-bold"
          />

          <!-- 🔍 Búsqueda manual: para etiquetas rotas/borrosas o sin sticker -->
          <div class="mt-4 pt-4 border-t border-gray-800 relative">
            <label class="text-gray-400 font-black uppercase tracking-widest text-[10px] block mb-2">O busca la prenda a mano</label>
            <input
              v-model="busquedaManual"
              type="text"
              placeholder="Nombre, SKU, color o talla..."
              class="w-full bg-gray-800/60 border border-gray-700 p-3 rounded-xl text-sm outline-none focus:border-blue-500 text-white placeholder-gray-600 font-bold"
            />
            <p v-if="!bodegaSeleccionada" class="text-[10px] text-orange-400 font-bold mt-1.5">Selecciona una bodega para poder buscar.</p>

            <!-- Resultados -->
            <div v-if="resultadosBusqueda.length" class="absolute z-50 left-0 right-0 mt-2 bg-white rounded-2xl shadow-2xl border border-gray-200 max-h-[60vh] overflow-y-auto">
              <button
                v-for="p in resultadosBusqueda"
                :key="p.id"
                @click="seleccionarPrenda(p)"
                class="w-full text-left px-4 py-3 hover:bg-blue-50 border-b border-gray-50 last:border-none flex justify-between items-center gap-3"
              >
                <div class="min-w-0">
                  <p class="font-black text-gray-800 text-sm truncate">{{ p.producto?.nombre }}</p>
                  <div class="flex flex-wrap gap-1 mt-1">
                    <span class="text-[10px] font-bold bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded">T. {{ p.talla }}</span>
                    <span class="text-[10px] font-bold bg-purple-50 text-purple-700 px-1.5 py-0.5 rounded">{{ nombreColor(p.color) }}</span>
                    <span class="text-[10px] font-mono text-gray-400">{{ p.skuCalculado }}</span>
                  </div>
                </div>
                <span class="text-[11px] font-black text-emerald-600 shrink-0">{{ p.stock }} u.</span>
              </button>
            </div>
            <p v-else-if="busquedaManual && bodegaSeleccionada" class="text-[10px] text-gray-500 font-bold mt-2">Sin resultados con stock en esta bodega.</p>
          </div>
        </div>

        <div class="order-3 lg:order-none bg-white rounded-3xl p-6 border border-gray-200 shadow-sm space-y-4">
          <h3 class="font-black text-gray-800 text-xs uppercase tracking-wider flex items-center gap-2"><span>📒</span> Modalidad Comercial</h3>
          <div class="grid grid-cols-2 gap-2">
            <button @click="condicionPago = 'CONTADO'" :class="condicionPago === 'CONTADO' ? 'bg-emerald-600 text-white' : 'bg-gray-100 text-gray-400'" class="p-3 rounded-xl font-black text-[11px] transition-all">CONTADO</button>
            <button @click="condicionPago = 'CREDITO_FLEXIBLE'" :class="condicionPago === 'CREDITO_FLEXIBLE' ? 'bg-orange-600 text-white' : 'bg-gray-100 text-gray-400'" class="p-3 rounded-xl font-black text-[11px] transition-all">CRÉDITO LIBRE</button>
          </div>

          <div v-if="condicionPago !== 'CONTADO'" class="space-y-3 p-4 bg-gray-50 rounded-2xl border border-gray-100 animate-[fadeIn_0.2s_ease-out]">
            <div>
              <label class="block text-[9px] font-black text-gray-400 uppercase tracking-wider mb-1">Titular de la Línea</label>
              <div class="flex gap-2">
                <select v-model="clienteId" class="w-full p-3 bg-white rounded-xl border border-gray-200 font-bold text-xs outline-none">
                  <option :value="null" disabled>Selecciona un Mayorista...</option>
                  <option v-for="c in clientes" :key="c.id" :value="c.id">{{ c.nombre }}</option>
                </select>
                <button @click="modalNuevoCliente = true" class="bg-gray-900 text-white px-4 rounded-xl hover:bg-gray-800 transition text-lg font-black shrink-0" title="Nuevo Cliente">
                  +
                </button>
              </div>
            </div>

            <div>
              <label class="block text-[9px] font-black text-gray-400 uppercase tracking-wider mb-1">Monto Inicial (Adelanto)</label>
              <div class="relative">
                <span class="absolute left-3 top-3.5 text-xs font-bold text-gray-400">S/</span>
                <input v-model.number="adelanto" type="number" placeholder="0.00" class="w-full bg-white border border-gray-200 p-3 pl-8 rounded-xl font-black text-sm outline-none" />
              </div>
            </div>

            <p class="text-[10px] font-bold text-orange-500 bg-orange-50 border border-orange-100 rounded-xl p-2.5">
              Crédito libre: el cliente abona cuando pueda. Sin límite de crédito.
            </p>
          </div>
        </div>

        <div class="order-4 lg:order-none bg-white rounded-3xl shadow-sm border border-gray-200 flex flex-col overflow-hidden">
          <button @click="mostrarVinculacion = !mostrarVinculacion" class="w-full p-5 flex justify-between items-center bg-white hover:bg-gray-50 transition-colors focus:outline-none">
             <div class="flex items-center gap-3">
               <div class="w-8 h-8 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center border border-blue-100"><span class="text-sm">📱</span></div>
               <div class="text-left">
                 <h3 class="font-black text-gray-800 text-[10px] uppercase tracking-widest">Escáner Remoto</h3>
                 <p class="text-[9px] font-bold mt-0.5" :class="movilVinculado ? 'text-green-500' : 'text-gray-400'">{{ movilVinculado ? 'Conectado' : 'Toca para vincular' }}</p>
               </div>
             </div>
             <svg :class="{'rotate-180': mostrarVinculacion}" class="w-4 h-4 text-gray-400 transition-transform duration-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path></svg>
          </button>

          <div v-show="mostrarVinculacion" class="px-5 pb-5 pt-2 border-t border-gray-50 animate-[fadeIn_0.2s_ease-out]">
            <div v-if="!movilVinculado" class="bg-gray-50/50 border-2 border-dashed border-gray-200 rounded-2xl p-4 flex flex-col items-center justify-center">
              <div class="bg-white p-2 rounded-xl border border-gray-100 mb-4">
                <qrcode-vue :value="urlVinculacion" :size="110" level="H" render-as="svg" />
              </div>
              <div class="text-xl font-mono font-black text-gray-800 tracking-[0.2em] bg-white px-4 py-2 rounded-xl border border-gray-200">
                {{ pinConexion }}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="order-2 lg:order-none lg:col-span-8 bg-white rounded-3xl shadow-xl border border-gray-100 flex flex-col overflow-hidden h-[70vh] lg:h-[75vh]">
        
        <div class="px-4 py-3 border-b border-gray-100 bg-gray-50/50 flex items-center gap-2 shrink-0">
          <button
            @click="pestana = 'grilla'"
            :class="pestana === 'grilla' ? 'bg-gray-900 text-white shadow-sm' : 'bg-white text-gray-500 border border-gray-200 hover:text-gray-800'"
            class="flex-1 px-4 py-2.5 rounded-xl font-black text-xs uppercase tracking-wider transition-all"
          >
            👕 Prendas
          </button>
          <button
            @click="pestana = 'carrito'"
            :class="pestana === 'carrito' ? 'bg-gray-900 text-white shadow-sm' : 'bg-white text-gray-500 border border-gray-200 hover:text-gray-800'"
            class="flex-1 px-4 py-2.5 rounded-xl font-black text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-2"
          >
            🛒 Carrito
            <span
              v-if="carrito.length"
              class="bg-blue-600 text-white text-[10px] font-black min-w-[20px] h-5 px-1.5 rounded-full flex items-center justify-center"
            >{{ carrito.length }}</span>
          </button>
        </div>

        <!-- 🎯 GRILLA TÁCTIL: toca la prenda, luego la celda de talla y color -->
        <div v-show="pestana === 'grilla'" class="flex-1 min-h-0">
          <GrillaPrendas
            :inventario="inventarioConSKU"
            :colores="colores"
            :carrito="carrito"
            :bodegaId="bodegaSeleccionada"
            :listaPrecio="tipoVenta"
            @agregar="agregarDesdeGrilla"
          />
        </div>

        <div v-show="pestana === 'carrito'" class="flex-1 overflow-y-auto p-4 space-y-3 bg-gray-50/20">
          <div v-if="carrito.length === 0" class="h-full flex flex-col items-center justify-center text-gray-400 gap-3">
            <p class="font-bold text-gray-400">La boleta está vacía actualmente.</p>
            <button @click="pestana = 'grilla'" class="bg-gray-900 text-white px-4 py-2.5 rounded-xl font-black text-xs uppercase tracking-wider hover:bg-gray-800">
              👕 Ir a Prendas
            </button>
          </div>
          
          <div v-else class="space-y-3">
            <div v-for="(item, index) in carrito" :key="item.sku" class="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
              <div class="flex-1 min-w-0">
                <p class="font-black text-gray-800 text-base md:text-base leading-tight">{{ item.nombre }}</p>
                <div class="flex flex-wrap gap-1.5 mt-2">
                  <span class="text-[12px] md:text-[10px] font-bold bg-blue-50 text-blue-700 px-2.5 py-1 md:py-0.5 rounded border border-blue-100">Talla {{ item.talla }}</span>
                  <span class="text-[12px] md:text-[10px] font-bold bg-purple-50 text-purple-700 px-2.5 py-1 md:py-0.5 rounded border border-purple-100">{{ nombreColor(item.color) }}</span>
                  <span class="text-[10px] md:text-[9px] font-mono text-gray-400 px-1 py-1 md:py-0.5">{{ item.sku }}</span>
                  <span v-if="item.stockForzado" class="text-[11px] md:text-[10px] font-bold bg-amber-50 text-amber-700 px-2.5 py-1 md:py-0.5 rounded border border-amber-200" title="El sistema no registraba stock suficiente. Revisar inventario.">
                    ⚠️ Revisar stock
                  </span>
                </div>
              </div>
              
              <div class="flex items-center gap-4 bg-gray-50 p-2 rounded-xl border border-gray-100 w-full sm:w-auto justify-between sm:justify-end">
                <div class="flex flex-col items-center">
                  <span class="text-[8px] text-gray-400 font-black uppercase mb-1">Precio (S/)</span>
                  <input type="number" v-model.number="item.precioUnitario" class="w-16 bg-white border border-gray-300 p-1.5 text-center rounded-lg font-bold text-gray-800 text-xs outline-none focus:ring-2 focus:ring-blue-500/20" />
                </div>
                <div class="flex flex-col items-center">
                  <span class="text-[8px] text-gray-400 font-black uppercase mb-1">Cant.</span>
                  <div class="flex items-center gap-1">
                    <button
                      @click="cambiarCantidad(item, item.cantidad - 1)"
                      :disabled="item.cantidad <= 1"
                      class="w-7 h-7 rounded-lg bg-white border border-gray-300 text-gray-600 font-black text-base leading-none flex items-center justify-center hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed active:scale-90 transition-all"
                      title="Quitar una unidad"
                    >−</button>

                    <input
                      type="number"
                      min="1"
                      :value="item.cantidad"
                      @change="editarCantidad(item, $event)"
                      @focus="($event.target as HTMLInputElement).select()"
                      class="w-14 bg-white border border-gray-300 py-1.5 text-center rounded-lg font-black text-sm text-blue-600 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                      title="Escribe la cantidad y presiona Enter"
                    />

                    <button
                      @click="cambiarCantidad(item, item.cantidad + 1)"
                      class="w-7 h-7 rounded-lg bg-white border border-gray-300 text-gray-600 font-black text-base leading-none flex items-center justify-center hover:bg-gray-100 active:scale-90 transition-all"
                      title="Agregar una unidad"
                    >+</button>
                  </div>
                </div>
                <button @click="quitarDelCarrito(index)" class="text-gray-300 hover:text-red-500 bg-white hover:bg-red-50 border border-transparent hover:border-red-200 p-2 rounded-lg transition-all">✕</button>
              </div>
            </div>
          </div>
        </div>

        <div class="bg-white border-t border-gray-100 p-4 md:p-6 shrink-0 shadow-[0_-10px_30px_rgba(0,0,0,0.02)] z-10">
          
          <div class="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
            <div>
              <label class="block text-[9px] font-black text-gray-400 uppercase tracking-wider mb-1">Cliente / Razón Social</label>
              <input v-model="clienteNombre" type="text" placeholder="Público General" class="w-full bg-gray-50 border border-gray-200 text-gray-800 font-bold p-2.5 rounded-xl text-xs outline-none focus:bg-white" />
            </div>
            <!-- 💵 Cambia la lista de precios de todo el carrito. La boleta que se
                 entrega es la misma en ambos casos: no emitimos facturas. -->
            <div>
              <label class="block text-[9px] font-black text-gray-400 uppercase tracking-wider mb-1">Lista de Precios</label>
              <div class="grid grid-cols-2 gap-2">
                <button
                  @click="tipoVenta = 'MINORISTA'"
                  :class="tipoVenta === 'MINORISTA' ? 'bg-blue-600 text-white border-blue-600' : 'bg-gray-50 text-gray-500 border-gray-200 hover:border-blue-300'"
                  class="border p-2.5 rounded-xl font-black text-[11px] uppercase tracking-wider transition-all"
                >
                  Minorista
                </button>
                <button
                  @click="tipoVenta = 'MAYORISTA'"
                  :class="tipoVenta === 'MAYORISTA' ? 'bg-purple-600 text-white border-purple-600' : 'bg-gray-50 text-gray-500 border-gray-200 hover:border-purple-300'"
                  class="border p-2.5 rounded-xl font-black text-[11px] uppercase tracking-wider transition-all"
                >
                  Mayorista
                </button>
              </div>
            </div>
          </div>

          <div class="mb-4 bg-white border border-gray-200 rounded-xl p-3 shadow-sm">
            <label class="block text-[9px] font-black text-gray-400 uppercase tracking-wider mb-2">Despacho y Logística</label>
            <div class="grid grid-cols-3 gap-2">
              <button @click="metodoEntrega = 'ENTREGA_INMEDIATA'" :class="metodoEntrega === 'ENTREGA_INMEDIATA' ? 'border-blue-600 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-500'" class="border p-2 rounded-xl flex flex-col items-center gap-0.5 transition-all">
                <span class="text-base">🛍️</span><span class="text-[8px] font-black uppercase">Mostrador</span>
              </button>
              <button @click="metodoEntrega = 'RECOJO_TIENDA'" :class="metodoEntrega === 'RECOJO_TIENDA' ? 'border-orange-600 bg-orange-50 text-orange-700' : 'border-gray-200 text-gray-500'" class="border p-2 rounded-xl flex flex-col items-center gap-0.5 transition-all">
                <span class="text-base">🏃‍♂️</span><span class="text-[8px] font-black uppercase">Almacén</span>
              </button>
              <button @click="metodoEntrega = 'ENVIO_AGENCIA'" :class="metodoEntrega === 'ENVIO_AGENCIA' ? 'border-purple-600 bg-purple-50 text-purple-700' : 'border-gray-200 text-gray-500'" class="border p-2 rounded-xl flex flex-col items-center gap-0.5 transition-all">
                <span class="text-base">🚚</span><span class="text-[8px] font-black uppercase">Agencia</span>
              </button>
            </div>
            
            <div v-if="metodoEntrega === 'ENVIO_AGENCIA'" class="mt-3 animate-[fadeIn_0.2s_ease-out]">
              <input v-model="destinoEnvio" type="text" placeholder="Ej: Shalom - Agencia Cusco" class="w-full bg-purple-50/50 border border-purple-200 p-2.5 rounded-xl text-xs font-bold text-purple-900 outline-none">
            </div>
          </div>

          <div class="flex flex-col sm:flex-row gap-4 items-stretch">
            <div class="bg-gray-900 text-white px-6 py-3 rounded-2xl flex flex-row gap-4 justify-around items-center shrink-0 shadow-lg flex-1 sm:flex-initial">
              <div class="text-center">
                <span class="text-[8px] text-gray-400 font-black uppercase tracking-wider block">Total Bruto</span>
                <span class="text-xl font-black text-green-400 font-mono">S/ {{ totalPagar.toFixed(2) }}</span>
              </div>
              <div v-if="condicionPago !== 'CONTADO'" class="text-center border-l border-gray-700 pl-4">
                <span class="text-[8px] text-gray-400 font-black uppercase tracking-wider block">Saldo Deuda</span>
                <span class="text-xl font-black text-red-400 font-mono">S/ {{ saldoPendiente.toFixed(2) }}</span>
              </div>
            </div>

            <button @click="enviarVentaBackend" :disabled="carrito.length === 0" class="flex-1 bg-green-500 disabled:bg-gray-300 text-white rounded-2xl font-black text-base hover:bg-green-600 transition-all shadow-lg flex items-center justify-center gap-2 active:scale-[0.98] py-3">
              <span>💵</span> FINALIZAR OPERACIÓN
            </button>
          </div>
        </div>

      </div>
    </div>
  </div>

  <!-- 🔔 AVISOS FLOTANTES
       Reemplazan a los confirm() de stock: informan sin frenar la venta.
       Se van solos a los 8 segundos y no bloquean ningún clic de la caja. -->
  <div class="fixed bottom-4 right-4 z-[90] flex flex-col gap-2 max-w-[360px] pointer-events-none">
    <div
      v-for="a in avisos"
      :key="a.id"
      class="bg-amber-50 border-2 border-amber-300 rounded-2xl shadow-lg px-4 py-3 flex items-start gap-3 pointer-events-auto animate-[fadeIn_0.2s_ease-out]"
    >
      <span class="text-lg leading-none shrink-0">⚠️</span>
      <p class="text-xs font-bold text-amber-900 flex-1 leading-snug">{{ a.texto }}</p>
      <button
        @click="descartarAviso(a.id)"
        class="text-amber-400 hover:text-amber-700 font-black text-sm leading-none shrink-0"
        title="Cerrar aviso"
      >✕</button>
    </div>
  </div>

  <ModalNuevoCliente
    :show="modalNuevoCliente"
    @close="modalNuevoCliente = false"
    @cliente-registrado="alRegistrarCliente"
  />

  <ModalTicketVenta 
    :show="modalTicket"
    :ventaRealizada="ventaRealizada"
    :carrito="carrito"
    :clienteNombre="clienteNombre"
    :condicionPago="condicionPago"
    :totalPagar="totalPagar"
    :saldoPendiente="saldoPendiente"
    @close="cerrarModalTicket"
  />
</template>

<style scoped>
@keyframes fadeIn { 
  from { opacity: 0; transform: translateY(-5px); } 
  to { opacity: 1; transform: translateY(0); } 
}
input[type="number"]::-webkit-inner-spin-button,
input[type="number"]::-webkit-outer-spin-button {
  -webkit-appearance: none;
  margin: 0;
}
input[type="number"] {
  -moz-appearance: textfield;
}
</style>