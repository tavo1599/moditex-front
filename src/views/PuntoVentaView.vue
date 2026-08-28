<script setup lang="ts">
import { ref, onMounted, computed, watch, nextTick } from 'vue'
import api from '../api/axios'
import { useVentas } from '../composables/useVentas'
import { useColaVentas } from '../composables/useColaVentas'

import ModalNuevoCliente from '../components/ModalNuevoCliente.vue'
import ModalTicketVenta from '../components/ModalTicketVenta.vue'
import PanelVentasPendientes from '../components/ventas/PanelVentasPendientes.vue'
import GrillaPrendas from '../components/ventas/GrillaPrendas.vue'

interface Cliente {
  id: number
  nombre: string
  limiteCredito: number
  saldoPendiente: number
}

const bodegas = ref<any[]>([])
const inventarioTotal = ref<any[]>([])
const colores = ref<any[]>([])
const clientes = ref<Cliente[]>([])
const cargando = ref(true)
const modalNuevoCliente = ref(false)

const cargarDatos = async () => {
  cargando.value = true
  try {
    const [resBodegas, resInv, resColores, resClientes] = await Promise.all([
      api.get('/almacen-terminados/bodegas'),
      api.get('/almacen-terminados/inventario'),
      api.get('/colores'),
      api.get('/clientes').catch(() => ({ data: [] })),
    ])
    bodegas.value = resBodegas.data.filter((b: any) => b.estado)
    inventarioTotal.value = resInv.data
    colores.value = resColores.data
    clientes.value = resClientes.data
  } catch (error) {
    console.error('Error al cargar datos:', error)
  } finally {
    cargando.value = false
  }
}

const inventarioConSKU = computed(() => {
  return inventarioTotal.value.map((item) => {
    const colorObj = colores.value.find((c) => c.codigo === item.color || c.nombre === item.color)
    const codigoColor = colorObj
      ? colorObj.codigo
      : String(item.color).substring(0, 3).toUpperCase()
    const idProd = item.productoId || item.producto?.id
    return { ...item, skuCalculado: `PRD${idProd}-${codigoColor}-${item.talla}` }
  })
})

// El escáner remoto (vincular el celular por PIN) se retiró de la caja: la venta
// se arma con la pistola física o buscando la prenda a mano, así que ya no queda
// carrito que sincronizar hacia otro dispositivo.
const {
  bodegaSeleccionada,
  codigoEscaneado,
  carrito,
  inputEscaner,
  condicionPago,
  clienteId,
  adelanto,
  numeroCuotas,
  frecuenciaPago,
  clienteNombre,
  tipoVenta,
  metodoEntrega,
  destinoEnvio,
  modalTicket,
  ventaRealizada,
  totalPagar,
  saldoPendiente,
  procesarEscaneo,
  quitarDelCarrito,
  agregarPrendaManual,
  cambiarCantidad,
  borradorRecuperado,
  limpiarBorrador,
  avisos,
  descartarAviso,
} = useVentas(inventarioConSKU, () => {})

const { enviarVenta } = useColaVentas()

// Muestra el NOMBRE del color (los vendedores no manejan códigos como "NGR")
const nombreColor = (val: any) => {
  const c = colores.value.find((x) => x.codigo === val || x.nombre === val)
  return c ? c.nombre : val
}

// 🎯 Pestaña del área grande. Arranca en el carrito: es la lista que el vendedor
// necesita tener a la vista mientras arma la venta.
const pestana = ref<'carrito' | 'grilla'>('carrito')

/* ──────────────────────────────────────────────────────────────
   🔍 BUSCADOR ÚNICO (arriba de la caja)
   La pistola dispara el SKU + Enter sobre este mismo campo, y si el vendedor
   escribe a mano aparecen las sugerencias. Un solo campo evita la duda de
   "¿dónde escribo?" cuando la etiqueta no lee.
   ────────────────────────────────────────────────────────────── */
const resultadosBusqueda = computed(() => {
  const q = codigoEscaneado.value.trim().toLowerCase()
  // Menos de 2 letras no filtra nada útil, y evita que el desplegable parpadee
  // mientras la pistola teclea el código de golpe.
  if (q.length < 2 || !bodegaSeleccionada.value) return []
  return inventarioConSKU.value
    .filter(
      (i: any) => Number(i.bodegaId) === Number(bodegaSeleccionada.value) && Number(i.stock) > 0,
    )
    .filter((i: any) => {
      const txt =
        `${i.producto?.nombre || ''} ${i.skuCalculado || ''} ${i.color} ${i.talla}`.toLowerCase()
      return txt.includes(q)
    })
    .slice(0, 25)
})

const seleccionarPrenda = (prenda: any) => {
  agregarPrendaManual(prenda)
  codigoEscaneado.value = ''
  pestana.value = 'carrito'
  nextTick(() => inputEscaner.value?.focus())
}

// Enter con sugerencias abiertas agrega la prenda; sin sugerencias es un código
// de la pistola (o un QR de proveedor) y se procesa como escaneo de siempre.
const alPresionarEnter = () => {
  if (!codigoEscaneado.value.trim()) return
  const encontradas = resultadosBusqueda.value
  if (encontradas.length === 0) return procesarEscaneo()
  if (encontradas.length === 1) return seleccionarPrenda(encontradas[0])
  // Con varias coincidencias decide el vendedor: no interrumpimos con alertas.
}

const agregarDesdeGrilla = (prenda: any) => agregarPrendaManual(prenda)

// Escribir la cantidad a mano: si el valor tecleado se corrige (vacío, decimales,
// menos de 1, o un exceso de stock que el vendedor no confirmó), hay que repintar
// el input. Vue no lo hace solo cuando la cantidad final termina siendo la misma
// que ya tenía, y el campo se quedaría en blanco.
const editarCantidad = (item: any, evento: Event) => {
  const input = evento.target as HTMLInputElement
  cambiarCantidad(item, input.value)
  input.value = String(item.cantidad)
}

const totalUnidades = computed(() =>
  carrito.value.reduce((s: number, c: any) => s + Number(c.cantidad || 0), 0),
)

const subtotalLinea = (item: any) =>
  (Number(item.precioUnitario) || 0) * (Number(item.cantidad) || 0)

const vaciarCarrito = () => {
  if (!carrito.value.length) return
  if (!confirm('¿Quitar todas las prendas del carrito?')) return
  carrito.value = []
}

// 🚦 Un solo lugar decide si la venta se puede cobrar, y el motivo se muestra
// junto al botón en vez de aparecer recién como alerta al tocarlo.
const bloqueoCobro = computed(() => {
  if (!bodegaSeleccionada.value) return 'Selecciona la bodega donde estás vendiendo.'
  if (carrito.value.length === 0) return 'Agrega al menos una prenda.'
  if (condicionPago.value !== 'CONTADO' && !clienteId.value)
    return 'El crédito necesita un cliente registrado.'
  if (metodoEntrega.value === 'ENVIO_AGENCIA' && !destinoEnvio.value.trim())
    return 'Falta la agencia de destino.'
  return ''
})

watch(clienteId, (id) => {
  if (id) {
    const c = clientes.value.find((item) => item.id === id)
    if (c) clienteNombre.value = c.nombre
  }
})

// 🔥 Recibe al cliente desde el modal y lo auto-selecciona
const alRegistrarCliente = (nuevoCliente: Cliente) => {
  clientes.value.push(nuevoCliente)
  clienteId.value = nuevoCliente.id
  clienteNombre.value = nuevoCliente.nombre
  modalNuevoCliente.value = false
}

// 🔥 Función segura para limpiar el POS SOLO cuando ya se imprimió el ticket
const limpiarCaja = () => {
  carrito.value = []
  clienteNombre.value = ''
  destinoEnvio.value = ''
  clienteId.value = null
  adelanto.value = null
  condicionPago.value = 'CONTADO'
  pestana.value = 'carrito'
  limpiarBorrador()
  cargarDatos()
  nextTick(() => inputEscaner.value?.focus())
}

// Cierra el modal del ticket y procede a limpiar
const cerrarModalTicket = () => {
  modalTicket.value = false
  limpiarCaja()
}

const enviarVentaBackend = async () => {
  if (bloqueoCobro.value) return alert('⚠️ ' + bloqueoCobro.value)

  const payload = {
    almacenId: Number(bodegaSeleccionada.value),
    cliente: clienteNombre.value || 'Cliente de Mostrador',
    clienteNombre: clienteNombre.value || 'Cliente de Mostrador',
    tipoVenta: tipoVenta.value,
    metodoEntrega: metodoEntrega.value,
    requiereEnvio: metodoEntrega.value === 'ENVIO_AGENCIA',
    destinoEnvio: metodoEntrega.value === 'ENVIO_AGENCIA' ? destinoEnvio.value : undefined,
    detalles: carrito.value.map((c: any) => ({
      productoId: Number(c.productoId),
      color: String(c.color),
      talla: String(c.talla),
      cantidad: Number(c.cantidad),
      precioUnitario: Number(c.precioUnitario),
    })),
    condicionPago: condicionPago.value,
    clienteId: clienteId.value ? Number(clienteId.value) : undefined,
    adelanto: Number(adelanto.value) || 0,
    numeroCuotas: Number(numeroCuotas.value) || 1,
    frecuenciaPago: frecuenciaPago.value,
  }

  // Resumen legible para poder identificar la venta si queda en la cola de pendientes.
  const resumen = {
    cliente: clienteNombre.value || 'Cliente de Mostrador',
    total: totalPagar.value,
    items: totalUnidades.value,
    bodega:
      bodegas.value.find((b) => Number(b.id) === Number(bodegaSeleccionada.value))?.nombre || '—',
  }

  const resultado = await enviarVenta(payload, resumen)

  // ⛔ El servidor rechazó la venta por un motivo real (sin stock, datos inválidos).
  // No se encola porque reintentar daría el mismo error: el carrito se queda intacto
  // para que el vendedor corrija y vuelva a intentar.
  if (!resultado.ok && !resultado.encolada) {
    alert('Error: ' + resultado.mensaje)
    return
  }

  // 🛟 No hubo conexión, pero la venta NO se pierde: quedó guardada en este equipo
  // y se reintenta sola. La caja se libera para poder seguir atendiendo.
  if (!resultado.ok) {
    alert(
      '⚠️ No hay conexión con el servidor.\n\n' +
        'La venta quedó GUARDADA en este equipo y se enviará sola apenas vuelva el internet.\n' +
        'Puedes seguir vendiendo normalmente. No cierres sesión ni borres los datos del navegador.',
    )
    limpiarCaja()
    return
  }

  ventaRealizada.value = resultado.data

  // 🔄 Recargamos el inventario SIEMPRE apenas se registra la venta, para que la
  // siguiente venta ya vea el stock actualizado.
  await cargarDatos()

  if (metodoEntrega.value === 'ENTREGA_INMEDIATA' || metodoEntrega.value === 'RECOJO_TIENDA') {
    modalTicket.value = true // Abre el modal (el carrito se limpia al cerrarlo)
  } else {
    alert('✅ Venta registrada correctamente.')
    limpiarCaja() // Si es por agencia, limpia de inmediato sin ticket
  }
}

onMounted(() => {
  cargarDatos()
  nextTick(() => inputEscaner.value?.focus())
})
</script>

<template>
  <!-- En pantallas grandes la caja ocupa el alto completo y cada columna tiene su
       propio scroll; en móvil/tablet se apila y la página scrollea normal. -->
  <div class="font-urbanist flex flex-col gap-3 lg:h-[calc(100vh-4rem)] max-w-[1700px] mx-auto">
    <!-- ═══════════ CABECERA ═══════════ -->
    <header class="shrink-0 flex flex-wrap items-center justify-between gap-3">
      <div class="min-w-0">
        <h1 class="text-xl md:text-2xl font-black text-gray-800 tracking-tight leading-none">
          Punto de Venta
        </h1>
        <p class="text-[11px] md:text-xs text-gray-400 font-bold mt-1">
          Escanea o busca la prenda, revisa la lista y cobra.
        </p>
      </div>

      <div
        class="bg-white border border-gray-200 rounded-2xl shadow-sm flex items-center gap-2 pl-3 pr-1 w-full sm:w-auto"
      >
        <span class="text-lg shrink-0">🏢</span>
        <select
          v-model="bodegaSeleccionada"
          class="w-full sm:w-56 bg-transparent border-none font-black text-gray-700 outline-none focus:ring-0 text-xs py-3 cursor-pointer"
        >
          <option value="" disabled>Selecciona la bodega...</option>
          <option v-for="b in bodegas" :key="b.id" :value="b.id">{{ b.nombre }}</option>
        </select>
      </div>
    </header>

    <!-- 🛟 Ventas que no se pudieron enviar: quedan guardadas aquí hasta que salgan -->
    <div class="shrink-0">
      <PanelVentasPendientes />
    </div>

    <!-- 💾 Aviso de venta recuperada tras un cierre inesperado -->
    <div
      v-if="borradorRecuperado && carrito.length"
      class="shrink-0 rounded-2xl border-2 border-blue-200 bg-blue-50 px-4 py-2.5 flex flex-wrap items-center justify-between gap-3"
    >
      <p class="text-xs md:text-sm font-bold text-blue-900">
        💾 Se recuperó una venta a medio armar ({{ carrito.length }} ítem{{
          carrito.length === 1 ? '' : 's'
        }}). Revísala antes de cobrar.
      </p>
      <button
        @click="borradorRecuperado = false"
        class="text-[10px] font-black uppercase tracking-wider text-blue-700 hover:text-blue-900 border border-blue-200 px-3 py-1.5 rounded-lg"
      >
        Entendido
      </button>
    </div>

    <!-- ═══ CUERPO: lista grande (izquierda) + panel de cobro (derecha) ═══ -->
    <div class="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-12 gap-3 lg:gap-4">
      <!-- ─────────── ÁREA GRANDE ─────────── -->
      <section class="lg:col-span-8 xl:col-span-9 flex flex-col min-h-0 gap-3">
        <!-- 🔎 BUSCADOR / PISTOLA (siempre arriba) -->
        <div class="relative shrink-0 z-30">
          <div
            class="bg-gray-900 rounded-2xl px-3 py-2.5 shadow-lg shadow-gray-900/10 flex items-center gap-2 border-2 border-transparent focus-within:border-blue-500 transition-colors"
          >
            <span class="text-xl shrink-0">🔍</span>
            <input
              ref="inputEscaner"
              type="text"
              v-model="codigoEscaneado"
              @keyup.enter="alPresionarEnter"
              placeholder="Escanea el código o escribe nombre, SKU, color o talla..."
              class="flex-1 min-w-0 bg-transparent text-white text-base md:text-lg font-bold outline-none placeholder-gray-600 py-1.5"
            />
            <button
              v-if="codigoEscaneado"
              @click="codigoEscaneado = ''"
              class="shrink-0 w-9 h-9 rounded-xl bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700 font-black flex items-center justify-center transition-colors"
              title="Limpiar"
            >
              ✕
            </button>
          </div>

          <p v-if="!bodegaSeleccionada" class="text-[11px] text-orange-600 font-black mt-1.5 px-1">
            ⚠️ Selecciona una bodega arriba para poder vender.
          </p>

          <!-- Sugerencias -->
          <div
            v-if="resultadosBusqueda.length"
            class="absolute z-50 left-0 right-0 mt-2 bg-white rounded-2xl shadow-2xl border border-gray-200 max-h-[55vh] overflow-y-auto"
          >
            <button
              v-for="p in resultadosBusqueda"
              :key="p.id"
              @click="seleccionarPrenda(p)"
              class="w-full text-left px-4 py-3 hover:bg-blue-50 active:bg-blue-100 border-b border-gray-50 last:border-none flex justify-between items-center gap-3"
            >
              <div class="min-w-0">
                <p class="font-black text-gray-800 text-sm truncate">{{ p.producto?.nombre }}</p>
                <div class="flex flex-wrap gap-1 mt-1">
                  <span class="text-[10px] font-bold bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded"
                    >T. {{ p.talla }}</span
                  >
                  <span
                    class="text-[10px] font-bold bg-purple-50 text-purple-700 px-1.5 py-0.5 rounded"
                    >{{ nombreColor(p.color) }}</span
                  >
                  <span class="text-[10px] font-mono text-gray-400">{{ p.skuCalculado }}</span>
                </div>
              </div>
              <span class="text-[11px] font-black text-emerald-600 shrink-0">{{ p.stock }} u.</span>
            </button>
          </div>
          <p
            v-else-if="codigoEscaneado.trim().length >= 2 && bodegaSeleccionada"
            class="text-[11px] text-gray-400 font-bold mt-1.5 px-1"
          >
            Sin coincidencias con stock aquí. Si es un código de etiqueta, presiona Enter.
          </p>
        </div>

        <!-- 🗂️ PESTAÑAS -->
        <div
          class="shrink-0 grid grid-cols-2 gap-2 bg-white p-1.5 rounded-2xl border border-gray-200 shadow-sm"
        >
          <button
            @click="pestana = 'carrito'"
            :class="
              pestana === 'carrito'
                ? 'bg-gray-900 text-white shadow'
                : 'text-gray-500 hover:bg-gray-50'
            "
            class="px-3 py-3 rounded-xl font-black text-[11px] md:text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-2"
          >
            🛒 Productos agregados
            <span
              v-if="carrito.length"
              class="bg-blue-600 text-white text-[10px] font-black min-w-[20px] h-5 px-1.5 rounded-full flex items-center justify-center"
              >{{ carrito.length }}</span
            >
          </button>
          <button
            @click="pestana = 'grilla'"
            :class="
              pestana === 'grilla'
                ? 'bg-gray-900 text-white shadow'
                : 'text-gray-500 hover:bg-gray-50'
            "
            class="px-3 py-3 rounded-xl font-black text-[11px] md:text-xs uppercase tracking-wider transition-all"
          >
            👕 Buscar prendas
          </button>
        </div>

        <!-- 📋 CONTENIDO GRANDE -->
        <div
          class="flex-1 min-h-0 h-[46vh] lg:h-auto bg-white rounded-2xl border border-gray-200 shadow-sm flex flex-col overflow-hidden"
        >
          <!-- ── Lista de productos agregados ── -->
          <div v-show="pestana === 'carrito'" class="flex-1 min-h-0 flex flex-col">
            <div
              v-if="carrito.length"
              class="shrink-0 px-4 py-2.5 border-b border-gray-100 bg-gray-50/60 flex items-center justify-between gap-3"
            >
              <p class="text-[10px] font-black uppercase tracking-widest text-gray-400">
                {{ carrito.length }} línea{{ carrito.length === 1 ? '' : 's' }} ·
                {{ totalUnidades }} unidad{{ totalUnidades === 1 ? '' : 'es' }}
              </p>
              <button
                @click="vaciarCarrito"
                class="text-[10px] font-black uppercase tracking-wider text-gray-400 hover:text-red-600 border border-gray-200 hover:border-red-200 px-3 py-1.5 rounded-lg transition-colors"
              >
                Vaciar
              </button>
            </div>

            <div class="flex-1 min-h-0 overflow-y-auto p-3 md:p-4">
              <div
                v-if="carrito.length === 0"
                class="h-full flex flex-col items-center justify-center text-center gap-3 py-10"
              >
                <span class="text-4xl opacity-30">🛒</span>
                <p class="font-black text-gray-400 text-sm">Todavía no agregas prendas.</p>
                <p class="text-xs text-gray-400 font-bold max-w-xs">
                  Escanea la etiqueta con la pistola, escribe en el buscador de arriba o entra a
                  <b>Buscar prendas</b>.
                </p>
                <button
                  @click="pestana = 'grilla'"
                  class="mt-1 bg-gray-900 text-white px-5 py-3 rounded-xl font-black text-xs uppercase tracking-wider hover:bg-gray-800"
                >
                  👕 Buscar prendas
                </button>
              </div>

              <div v-else class="space-y-2.5">
                <div
                  v-for="(item, index) in carrito"
                  :key="item.sku"
                  class="bg-white border border-gray-200 rounded-2xl p-3 md:px-4 flex flex-col md:flex-row md:items-center gap-3 hover:border-gray-300 transition-colors"
                >
                  <!-- Identificación -->
                  <div class="flex-1 min-w-0">
                    <p class="font-black text-gray-800 text-sm md:text-base leading-tight">
                      {{ item.nombre }}
                    </p>
                    <div class="flex flex-wrap gap-1.5 mt-1.5">
                      <span
                        class="text-[11px] md:text-[10px] font-bold bg-blue-50 text-blue-700 px-2 py-0.5 rounded border border-blue-100"
                        >Talla {{ item.talla }}</span
                      >
                      <span
                        class="text-[11px] md:text-[10px] font-bold bg-purple-50 text-purple-700 px-2 py-0.5 rounded border border-purple-100"
                        >{{ nombreColor(item.color) }}</span
                      >
                      <span class="text-[10px] md:text-[9px] font-mono text-gray-400 py-0.5">{{
                        item.sku
                      }}</span>
                      <span
                        v-if="item.stockForzado"
                        class="text-[11px] md:text-[10px] font-bold bg-amber-50 text-amber-700 px-2 py-0.5 rounded border border-amber-200"
                        title="El sistema no registraba stock suficiente. Revisar inventario."
                      >
                        ⚠️ Revisar stock
                      </span>
                    </div>
                  </div>

                  <!-- Precio · Cantidad · Subtotal -->
                  <div
                    class="flex items-end gap-2 md:gap-3 bg-gray-50 md:bg-transparent p-2 md:p-0 rounded-xl border md:border-0 border-gray-100"
                  >
                    <div class="flex flex-col items-center">
                      <span class="text-[8px] text-gray-400 font-black uppercase mb-1"
                        >P. Unit.</span
                      >
                      <div class="relative">
                        <span
                          class="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] font-black text-gray-400"
                          >S/</span
                        >
                        <input
                          type="number"
                          v-model.number="item.precioUnitario"
                          @focus="($event.target as HTMLInputElement).select()"
                          class="w-[86px] bg-white border border-gray-300 h-11 pl-7 pr-2 text-right rounded-xl font-black text-gray-800 text-sm outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                        />
                      </div>
                    </div>

                    <div class="flex flex-col items-center">
                      <span class="text-[8px] text-gray-400 font-black uppercase mb-1"
                        >Cantidad</span
                      >
                      <div class="flex items-center gap-1">
                        <button
                          @click="cambiarCantidad(item, item.cantidad - 1)"
                          :disabled="item.cantidad <= 1"
                          class="w-11 h-11 md:w-9 md:h-9 rounded-xl bg-white border border-gray-300 text-gray-600 font-black text-lg leading-none flex items-center justify-center hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed active:scale-90 transition-all"
                          title="Quitar una unidad"
                        >
                          −
                        </button>
                        <input
                          type="number"
                          min="1"
                          :value="item.cantidad"
                          @change="editarCantidad(item, $event)"
                          @focus="($event.target as HTMLInputElement).select()"
                          class="w-14 h-11 md:h-9 bg-white border border-gray-300 text-center rounded-xl font-black text-base text-blue-600 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                          title="Escribe la cantidad y presiona Enter"
                        />
                        <button
                          @click="cambiarCantidad(item, item.cantidad + 1)"
                          class="w-11 h-11 md:w-9 md:h-9 rounded-xl bg-white border border-gray-300 text-gray-600 font-black text-lg leading-none flex items-center justify-center hover:bg-gray-100 active:scale-90 transition-all"
                          title="Agregar una unidad"
                        >
                          +
                        </button>
                      </div>
                    </div>

                    <div class="flex flex-col items-end ml-auto md:ml-0 md:w-24">
                      <span class="text-[8px] text-gray-400 font-black uppercase mb-1"
                        >Subtotal</span
                      >
                      <span
                        class="h-11 md:h-9 flex items-center font-black font-mono text-gray-900 text-base md:text-sm"
                        >S/ {{ subtotalLinea(item).toFixed(2) }}</span
                      >
                    </div>

                    <button
                      @click="quitarDelCarrito(index)"
                      class="w-11 h-11 md:w-9 md:h-9 shrink-0 self-end text-gray-300 hover:text-red-500 bg-white hover:bg-red-50 border border-gray-200 hover:border-red-200 rounded-xl transition-all flex items-center justify-center font-black"
                      title="Quitar del carrito"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- ── Grilla táctil: toca la prenda, luego la celda de talla y color ── -->
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
        </div>
      </section>

      <!-- ─────────── PANEL DE COBRO (derecha) ─────────── -->
      <aside class="lg:col-span-4 xl:col-span-3 flex flex-col min-h-0">
        <div class="flex-1 min-h-0 lg:overflow-y-auto space-y-3 lg:pr-1">
          <!-- 👤 CLIENTE -->
          <div class="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 space-y-3">
            <h3
              class="font-black text-gray-800 text-[10px] uppercase tracking-widest flex items-center gap-2"
            >
              <span>👤</span> Cliente
            </h3>

            <div>
              <label class="block text-[9px] font-black text-gray-400 uppercase tracking-wider mb-1"
                >Registrado <span class="text-gray-300">(obligatorio al crédito)</span></label
              >
              <div class="flex gap-2">
                <select
                  v-model="clienteId"
                  class="w-full min-w-0 p-3 bg-gray-50 rounded-xl border border-gray-200 font-bold text-xs outline-none focus:bg-white focus:border-blue-500"
                >
                  <option :value="null">— Sin cliente registrado —</option>
                  <option v-for="c in clientes" :key="c.id" :value="c.id">{{ c.nombre }}</option>
                </select>
                <button
                  @click="modalNuevoCliente = true"
                  class="bg-gray-900 text-white w-12 shrink-0 rounded-xl hover:bg-gray-800 transition text-xl font-black"
                  title="Registrar nuevo cliente"
                >
                  +
                </button>
              </div>
            </div>

            <div>
              <label class="block text-[9px] font-black text-gray-400 uppercase tracking-wider mb-1"
                >Nombre en la boleta</label
              >
              <input
                v-model="clienteNombre"
                type="text"
                placeholder="Público General"
                class="w-full bg-gray-50 border border-gray-200 text-gray-800 font-bold p-3 rounded-xl text-xs outline-none focus:bg-white focus:border-blue-500"
              />
            </div>
          </div>

          <!-- 💵 LISTA DE PRECIOS
               Cambia el precio de todo el carrito. La boleta que se entrega es la
               misma en ambos casos: no emitimos facturas. -->
          <div class="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 space-y-3">
            <h3
              class="font-black text-gray-800 text-[10px] uppercase tracking-widest flex items-center gap-2"
            >
              <span>💵</span> Lista de precios
            </h3>
            <div class="grid grid-cols-2 gap-2">
              <button
                @click="tipoVenta = 'MINORISTA'"
                :class="
                  tipoVenta === 'MINORISTA'
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-gray-50 text-gray-500 border-gray-200 hover:border-blue-300'
                "
                class="border py-3 rounded-xl font-black text-[11px] uppercase tracking-wider transition-all"
              >
                Minorista
              </button>
              <button
                @click="tipoVenta = 'MAYORISTA'"
                :class="
                  tipoVenta === 'MAYORISTA'
                    ? 'bg-purple-600 text-white border-purple-600'
                    : 'bg-gray-50 text-gray-500 border-gray-200 hover:border-purple-300'
                "
                class="border py-3 rounded-xl font-black text-[11px] uppercase tracking-wider transition-all"
              >
                Mayorista
              </button>
            </div>
          </div>

          <!-- 📒 FORMA DE PAGO -->
          <div class="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 space-y-3">
            <h3
              class="font-black text-gray-800 text-[10px] uppercase tracking-widest flex items-center gap-2"
            >
              <span>📒</span> Forma de pago
            </h3>
            <div class="grid grid-cols-2 gap-2">
              <button
                @click="condicionPago = 'CONTADO'"
                :class="
                  condicionPago === 'CONTADO'
                    ? 'bg-emerald-600 text-white border-emerald-600'
                    : 'bg-gray-50 text-gray-500 border-gray-200 hover:border-emerald-300'
                "
                class="border py-3 rounded-xl font-black text-[11px] uppercase tracking-wider transition-all"
              >
                Contado
              </button>
              <button
                @click="condicionPago = 'CREDITO_FLEXIBLE'"
                :class="
                  condicionPago === 'CREDITO_FLEXIBLE'
                    ? 'bg-orange-600 text-white border-orange-600'
                    : 'bg-gray-50 text-gray-500 border-gray-200 hover:border-orange-300'
                "
                class="border py-3 rounded-xl font-black text-[11px] uppercase tracking-wider transition-all"
              >
                Crédito libre
              </button>
            </div>

            <div
              v-if="condicionPago !== 'CONTADO'"
              class="space-y-3 p-3 bg-orange-50/50 rounded-xl border border-orange-100 animate-[fadeIn_0.2s_ease-out]"
            >
              <div>
                <label
                  class="block text-[9px] font-black text-gray-400 uppercase tracking-wider mb-1"
                  >Adelanto</label
                >
                <div class="relative">
                  <span
                    class="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-black text-gray-400"
                    >S/</span
                  >
                  <input
                    v-model.number="adelanto"
                    type="number"
                    placeholder="0.00"
                    @focus="($event.target as HTMLInputElement).select()"
                    class="w-full bg-white border border-gray-200 p-3 pl-9 rounded-xl font-black text-sm outline-none focus:border-orange-500"
                  />
                </div>
              </div>
              <p
                v-if="!clienteId"
                class="text-[10px] font-black text-orange-700 bg-orange-100 border border-orange-200 rounded-xl p-2.5"
              >
                ⚠️ Elige arriba el cliente registrado que se lleva el crédito.
              </p>
              <p v-else class="text-[10px] font-bold text-orange-600">
                Crédito libre: el cliente abona cuando pueda. Sin límite de crédito.
              </p>
            </div>
          </div>

          <!-- 🚚 ENTREGA -->
          <div class="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 space-y-3">
            <h3
              class="font-black text-gray-800 text-[10px] uppercase tracking-widest flex items-center gap-2"
            >
              <span>🚚</span> Entrega
            </h3>
            <div class="grid grid-cols-3 gap-2">
              <button
                @click="metodoEntrega = 'ENTREGA_INMEDIATA'"
                :class="
                  metodoEntrega === 'ENTREGA_INMEDIATA'
                    ? 'border-blue-600 bg-blue-50 text-blue-700'
                    : 'border-gray-200 text-gray-500 hover:border-blue-300'
                "
                class="border py-2.5 rounded-xl flex flex-col items-center gap-1 transition-all"
              >
                <span class="text-lg">🛍️</span
                ><span class="text-[8px] font-black uppercase">Mostrador</span>
              </button>
              <button
                @click="metodoEntrega = 'RECOJO_TIENDA'"
                :class="
                  metodoEntrega === 'RECOJO_TIENDA'
                    ? 'border-orange-600 bg-orange-50 text-orange-700'
                    : 'border-gray-200 text-gray-500 hover:border-orange-300'
                "
                class="border py-2.5 rounded-xl flex flex-col items-center gap-1 transition-all"
              >
                <span class="text-lg">🏃</span
                ><span class="text-[8px] font-black uppercase">Almacén</span>
              </button>
              <button
                @click="metodoEntrega = 'ENVIO_AGENCIA'"
                :class="
                  metodoEntrega === 'ENVIO_AGENCIA'
                    ? 'border-purple-600 bg-purple-50 text-purple-700'
                    : 'border-gray-200 text-gray-500 hover:border-purple-300'
                "
                class="border py-2.5 rounded-xl flex flex-col items-center gap-1 transition-all"
              >
                <span class="text-lg">🚚</span
                ><span class="text-[8px] font-black uppercase">Agencia</span>
              </button>
            </div>

            <div v-if="metodoEntrega === 'ENVIO_AGENCIA'" class="animate-[fadeIn_0.2s_ease-out]">
              <input
                v-model="destinoEnvio"
                type="text"
                placeholder="Ej: Shalom - Agencia Cusco"
                class="w-full bg-purple-50/50 border border-purple-200 p-3 rounded-xl text-xs font-bold text-purple-900 outline-none focus:border-purple-500"
              />
            </div>
          </div>
        </div>

        <!-- 💰 TOTAL + COBRAR (fijo al pie de la columna en escritorio) -->
        <div class="hidden lg:block shrink-0 mt-3">
          <div class="bg-gray-900 rounded-2xl p-4 shadow-xl space-y-3">
            <div class="flex items-end justify-between gap-2">
              <span class="text-[9px] text-gray-400 font-black uppercase tracking-widest pb-1"
                >Total a pagar</span
              >
              <span class="text-3xl font-black text-emerald-400 font-mono leading-none"
                >S/ {{ totalPagar.toFixed(2) }}</span
              >
            </div>
            <div
              v-if="condicionPago !== 'CONTADO'"
              class="flex items-end justify-between gap-2 border-t border-gray-800 pt-2"
            >
              <span class="text-[9px] text-gray-400 font-black uppercase tracking-widest pb-0.5"
                >Saldo deuda</span
              >
              <span class="text-xl font-black text-red-400 font-mono leading-none"
                >S/ {{ saldoPendiente.toFixed(2) }}</span
              >
            </div>

            <button
              @click="enviarVentaBackend"
              :disabled="!!bloqueoCobro"
              class="w-full bg-emerald-500 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded-xl font-black text-base hover:bg-emerald-600 transition-all shadow-lg flex items-center justify-center gap-2 active:scale-[0.98] py-4"
            >
              <span>💵</span> COBRAR
            </button>
            <p v-if="bloqueoCobro" class="text-[10px] font-bold text-amber-400 text-center">
              {{ bloqueoCobro }}
            </p>
          </div>
        </div>
      </aside>
    </div>

    <!-- 💰 BARRA DE COBRO MÓVIL/TABLET: siempre a la mano sin tener que scrollear -->
    <div
      class="lg:hidden sticky bottom-0 z-40 -mx-4 md:-mx-8 px-4 md:px-8 pt-3 pb-3 bg-gradient-to-t from-gray-50 via-gray-50 to-transparent"
    >
      <div class="bg-gray-900 rounded-2xl p-3 shadow-2xl flex items-center gap-3">
        <div class="min-w-0 pl-1">
          <span class="block text-[8px] text-gray-400 font-black uppercase tracking-widest">
            Total{{ condicionPago !== 'CONTADO' ? ' · deuda S/ ' + saldoPendiente.toFixed(2) : '' }}
          </span>
          <span class="block text-2xl font-black text-emerald-400 font-mono leading-tight"
            >S/ {{ totalPagar.toFixed(2) }}</span
          >
        </div>
        <button
          @click="enviarVentaBackend"
          :disabled="!!bloqueoCobro"
          class="flex-1 bg-emerald-500 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded-xl font-black text-sm hover:bg-emerald-600 transition-all flex items-center justify-center gap-2 active:scale-[0.98] py-4"
        >
          <span>💵</span> COBRAR
        </button>
      </div>
      <p v-if="bloqueoCobro" class="text-[10px] font-black text-amber-600 text-center mt-1.5">
        {{ bloqueoCobro }}
      </p>
    </div>
  </div>

  <!-- 🔔 AVISOS FLOTANTES
       Reemplazan a los confirm() de stock: informan sin frenar la venta.
       Se van solos a los 8 segundos y no bloquean ningún clic de la caja. -->
  <div
    class="fixed bottom-28 lg:bottom-4 right-4 z-[90] flex flex-col gap-2 max-w-[360px] pointer-events-none"
  >
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
      >
        ✕
      </button>
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
  from {
    opacity: 0;
    transform: translateY(-5px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
input[type='number']::-webkit-inner-spin-button,
input[type='number']::-webkit-outer-spin-button {
  -webkit-appearance: none;
  margin: 0;
}
input[type='number'] {
  -moz-appearance: textfield;
}
</style>
