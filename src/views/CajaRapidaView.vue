<script setup lang="ts">
import { ref, computed, onMounted, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import api from '../api/axios'
import { useVentas } from '../composables/useVentas'
import { useColaVentas } from '../composables/useColaVentas'
import { ordenarTallas } from '../utils/tallas'
import { coincideConPrenda } from '../utils/sku'

import ModalTicketVenta from '../components/ModalTicketVenta.vue'
import PanelVentasPendientes from '../components/ventas/PanelVentasPendientes.vue'

/**
 * ⚡ CAJA RÁPIDA
 *
 * Punto de venta reducido a lo mínimo para cajeros: botones grandes, colores
 * fijos por prenda y dos toques por venta (prenda → talla). Sin sidebar, sin
 * pestañas, sin pistola obligatoria.
 *
 * Comparte TODO el motor con la caja completa (useVentas + useColaVentas), así
 * que hereda el carrito persistente, la cola de ventas que no se pierden, los
 * avisos no bloqueantes y el reparto de color al cobrar. Lo único distinto es
 * la pantalla: aquí no hay envío por agencia, comprobantes ni crédito con
 * cuotas. Para eso está /punto-venta.
 */

const router = useRouter()

const bodegas = ref<any[]>([])
const inventarioTotal = ref<any[]>([])
const colores = ref<any[]>([])
const clientes = ref<any[]>([])
const cargando = ref(true)

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
  } catch (e) {
    console.error('Error cargando la caja:', e)
  } finally {
    cargando.value = false
  }
}

const inventarioConSKU = computed(() =>
  inventarioTotal.value.map((item) => {
    const colorObj = colores.value.find((c) => c.codigo === item.color || c.nombre === item.color)
    const codigoColor = colorObj ? colorObj.codigo : String(item.color).substring(0, 3).toUpperCase()
    const idProd = item.productoId || item.producto?.id
    return { ...item, skuCalculado: `PRD${idProd}-${codigoColor}-${item.talla}` }
  }),
)

const {
  bodegaSeleccionada,
  codigoEscaneado,
  inputEscaner,
  procesarEscaneo,
  carrito,
  condicionPago,
  clienteId,
  clienteNombre,
  tipoVenta,
  metodoEntrega,
  modalTicket,
  ventaRealizada,
  totalPagar,
  saldoPendiente,
  quitarDelCarrito,
  agregarPrendaManual,
  cambiarCantidad,
  limpiarBorrador,
  avisos,
  descartarAviso,
  construirDetalles,
} = useVentas(inventarioConSKU, () => {})

const { enviarVenta, hayPendientes } = useColaVentas()

/* ──────────────────────────────────────────────────────────────
   🎨 COLOR FIJO POR PRENDA
   El cajero aprende la pantalla por color y posición, no leyendo. El color sale
   del id del producto, así que una prenda siempre cae en el mismo color aunque
   cambie el orden o el stock.
   Las clases van completas (nada de interpolar) para que Tailwind las conserve.
   ────────────────────────────────────────────────────────────── */
const PALETA = [
  'bg-indigo-500 hover:bg-indigo-600 active:bg-indigo-700',
  'bg-emerald-500 hover:bg-emerald-600 active:bg-emerald-700',
  'bg-rose-500 hover:bg-rose-600 active:bg-rose-700',
  'bg-amber-500 hover:bg-amber-600 active:bg-amber-700',
  'bg-sky-500 hover:bg-sky-600 active:bg-sky-700',
  'bg-violet-500 hover:bg-violet-600 active:bg-violet-700',
  'bg-teal-500 hover:bg-teal-600 active:bg-teal-700',
  'bg-orange-500 hover:bg-orange-600 active:bg-orange-700',
  'bg-fuchsia-500 hover:bg-fuchsia-600 active:bg-fuchsia-700',
  'bg-cyan-600 hover:bg-cyan-700 active:bg-cyan-800',
]
const colorDePrenda = (productoId: any) =>
  PALETA[Math.abs(Number(productoId) || 0) % PALETA.length]

/* ──────────────────────────────────────────────────────────────
   🔫 UN SOLO CAMPO: BUSCAR Y ESCANEAR
   La pistola teclea el código y manda Enter. Ese mismo campo filtra la grilla
   mientras el cajero escribe. Si lo que llega es una etiqueta conocida, la
   prenda se agrega sola y el campo se limpia; si no, solo filtra.
   ────────────────────────────────────────────────────────────── */
const busqueda = codigoEscaneado

/** El foco vuelve siempre al campo: sin foco la pistola no escribe en ningún lado. */
const enfocarEscaner = () => nextTick(() => inputEscaner.value?.focus())

const inventarioBodega = computed(() =>
  bodegaSeleccionada.value === ''
    ? []
    : inventarioConSKU.value.filter((i: any) => Number(i.bodegaId) === Number(bodegaSeleccionada.value)),
)

const precioVisible = (producto: any): number => {
  const may = Number(producto?.precioMayorista) || 0
  const min = Number(producto?.precioMinorista) || 0
  const elegido = tipoVenta.value === 'MAYORISTA' ? may : min
  return elegido || min || may || 0
}

const prendas = computed(() => {
  const mapa = new Map<number, any>()
  inventarioBodega.value.forEach((item: any) => {
    const id = Number(item.productoId || item.producto?.id)
    if (!mapa.has(id)) {
      mapa.set(id, {
        id,
        nombre: item.producto?.nombre || 'Producto',
        precio: precioVisible(item.producto),
        stock: 0,
      })
    }
    mapa.get(id).stock += Number(item.stock) || 0
  })

  const q = busqueda.value.trim().toLowerCase()
  return Array.from(mapa.values())
    .filter((p) => !q || p.nombre.toLowerCase().includes(q))
    .sort((a, b) => b.stock - a.stock || a.nombre.localeCompare(b.nombre))
})

/** ¿Lo tecleado es una etiqueta del sistema? Ese camino manda: trae el color real. */
const pareceEtiqueta = computed(() => {
  const q = codigoEscaneado.value.trim()
  if (!q) return false
  return inventarioBodega.value.some((i: any) => coincideConPrenda(q, i))
})

/**
 * Enter en el campo. Con una etiqueta reconocida agrega la prenda al toque.
 * Si no coincide con nada de la grilla, igual se intenta como escaneo para que
 * un QR de proveedor funcione y el cajero reciba un mensaje claro si no existe.
 * Mientras tanto, lo escrito solo filtra: no molestamos con alertas al teclear.
 */
const alPresionarEnter = async () => {
  if (!codigoEscaneado.value.trim()) return
  if (pareceEtiqueta.value || prendas.value.length === 0) {
    await procesarEscaneo()
  }
  enfocarEscaner()
}

/* ── Paso 2: elegir talla ──────────────────────────────────── */
const prendaAbierta = ref<any>(null)

const tallasDePrenda = computed(() => {
  if (!prendaAbierta.value) return []
  const porTalla = new Map<string, any>()
  inventarioBodega.value
    .filter((i: any) => Number(i.productoId || i.producto?.id) === Number(prendaAbierta.value.id))
    .forEach((i: any) => {
      const talla = String(i.talla ?? '—')
      if (!porTalla.has(talla)) {
        porTalla.set(talla, { talla, stock: 0, productoId: prendaAbierta.value.id, producto: i.producto })
      }
      porTalla.get(talla).stock += Number(i.stock) || 0
    })

  const orden = ordenarTallas(Array.from(porTalla.keys()))
  return orden.map((t) => porTalla.get(t))
})

/** Unidades de esa prenda+talla que ya están en el carrito. */
const enCarrito = (productoId: any, talla: string) => {
  const linea = carrito.value.find(
    (c: any) => Number(c.productoId) === Number(productoId) && String(c.talla) === String(talla),
  )
  return linea ? Number(linea.cantidad) : 0
}

const abrirPrenda = (prenda: any) => {
  prendaAbierta.value = prenda
}

const tocarTalla = (fila: any) => {
  agregarPrendaManual({ productoId: fila.productoId, producto: fila.producto, talla: fila.talla })
}

const cerrarTallas = () => {
  prendaAbierta.value = null
  enfocarEscaner()
}

/* ── Carrito ───────────────────────────────────────────────── */
const totalUnidades = computed(() =>
  carrito.value.reduce((s: number, c: any) => s + Number(c.cantidad || 0), 0),
)

const vaciarCarrito = () => {
  if (!carrito.value.length) return
  if (!confirm('¿Quitar todas las prendas del carrito?')) return
  carrito.value = []
}

const carritoAbiertoMovil = ref(false)

/* ── Cobro ─────────────────────────────────────────────────── */
const cobrando = ref(false)

const bloqueoCobro = computed(() => {
  if (!bodegaSeleccionada.value) return 'Elige la tienda arriba'
  if (carrito.value.length === 0) return 'Agrega prendas'
  if (condicionPago.value !== 'CONTADO' && !clienteId.value) return 'Elige el cliente del crédito'
  return ''
})

const limpiarCaja = () => {
  carrito.value = []
  clienteNombre.value = ''
  clienteId.value = null
  condicionPago.value = 'CONTADO'
  prendaAbierta.value = null
  carritoAbiertoMovil.value = false
  limpiarBorrador()
  cargarDatos()
  enfocarEscaner()
}

const cerrarModalTicket = () => {
  modalTicket.value = false
  limpiarCaja()
}

const cobrar = async () => {
  if (bloqueoCobro.value) return
  cobrando.value = true
  try {
    // La caja rápida siempre entrega en mostrador: no maneja envíos por agencia.
    metodoEntrega.value = 'ENTREGA_INMEDIATA'

    const payload = {
      almacenId: Number(bodegaSeleccionada.value),
      cliente: clienteNombre.value || 'Cliente de Mostrador',
      clienteNombre: clienteNombre.value || 'Cliente de Mostrador',
      tipoVenta: tipoVenta.value,
      metodoEntrega: 'ENTREGA_INMEDIATA',
      requiereEnvio: false,
      detalles: construirDetalles(),
      condicionPago: condicionPago.value,
      clienteId: clienteId.value ? Number(clienteId.value) : undefined,
      adelanto: 0,
      numeroCuotas: 1,
      frecuenciaPago: 'SEMANAL',
    }

    const resumen = {
      cliente: clienteNombre.value || 'Cliente de Mostrador',
      total: totalPagar.value,
      items: totalUnidades.value,
      bodega: bodegas.value.find((b) => Number(b.id) === Number(bodegaSeleccionada.value))?.nombre || '—',
    }

    const resultado = await enviarVenta(payload, resumen)

    if (!resultado.ok && !resultado.encolada) {
      alert('No se pudo cobrar: ' + resultado.mensaje)
      return
    }

    if (!resultado.ok) {
      alert(
        '⚠️ Sin internet.\n\nLa venta quedó GUARDADA en este equipo y se enviará sola ' +
          'cuando vuelva la conexión. Puedes seguir vendiendo.',
      )
      limpiarCaja()
      return
    }

    ventaRealizada.value = resultado.data
    await cargarDatos()
    modalTicket.value = true
  } finally {
    cobrando.value = false
  }
}

const salir = () => router.push('/')

onMounted(async () => {
  await cargarDatos()
  // Si solo hay una tienda, la elegimos sola: un paso menos para el cajero.
  if (!bodegaSeleccionada.value && bodegas.value.length === 1) {
    bodegaSeleccionada.value = bodegas.value[0].id
  }
  // El foco solo se toma donde hay teclado/pistola. En una tablet táctil
  // levantaría el teclado en pantalla y taparía media caja.
  const tienePuntero =
    typeof window !== 'undefined' && window.matchMedia?.('(pointer: fine)')?.matches
  if (tienePuntero) enfocarEscaner()
})
</script>

<template>
  <div class="fixed inset-0 bg-slate-100 flex flex-col font-sans select-none">

    <!-- ╔══ BARRA SUPERIOR ══╗ -->
    <header class="bg-slate-900 text-white px-3 md:px-5 py-3 flex items-center gap-3 shrink-0 shadow-lg">
      <div class="flex items-center gap-2 shrink-0">
        <span class="text-2xl">⚡</span>
        <h1 class="text-lg md:text-xl font-black tracking-tight hidden sm:block">Caja Rápida</h1>
      </div>

      <select
        v-model="bodegaSeleccionada"
        class="bg-slate-800 border-2 border-slate-700 rounded-xl px-3 py-2.5 font-bold text-sm md:text-base outline-none focus:border-sky-400 cursor-pointer min-w-0 flex-1 md:flex-initial md:w-56"
      >
        <option value="" disabled>🏪 Elige la tienda...</option>
        <option v-for="b in bodegas" :key="b.id" :value="b.id">{{ b.nombre }}</option>
      </select>

      <!-- Lista de precios: cambia los precios de todo el carrito -->
      <div class="hidden md:flex bg-slate-800 rounded-xl p-1 gap-1 shrink-0">
        <button
          @click="tipoVenta = 'MINORISTA'"
          :class="tipoVenta === 'MINORISTA' ? 'bg-sky-500 text-white' : 'text-slate-400 hover:text-white'"
          class="px-4 py-2 rounded-lg font-black text-xs uppercase tracking-wider transition-colors"
        >Normal</button>
        <button
          @click="tipoVenta = 'MAYORISTA'"
          :class="tipoVenta === 'MAYORISTA' ? 'bg-violet-500 text-white' : 'text-slate-400 hover:text-white'"
          class="px-4 py-2 rounded-lg font-black text-xs uppercase tracking-wider transition-colors"
        >Por mayor</button>
      </div>

      <button
        @click="cargarDatos"
        :disabled="cargando"
        class="ml-auto bg-slate-800 hover:bg-slate-700 px-3 py-2.5 rounded-xl font-bold text-lg shrink-0 disabled:opacity-40"
        title="Actualizar stock"
      >{{ cargando ? '⏳' : '🔄' }}</button>

      <button
        @click="salir"
        class="bg-slate-800 hover:bg-red-600 px-3 py-2.5 rounded-xl font-bold text-sm shrink-0 transition-colors"
        title="Salir de la caja"
      >🚪</button>
    </header>

    <!-- Ventas que no se pudieron enviar: solo ocupa espacio si hay alguna -->
    <div v-if="hayPendientes" class="px-3 md:px-5 pt-3 shrink-0">
      <PanelVentasPendientes />
    </div>

    <!-- ╔══ CUERPO ══╗ -->
    <div class="flex-1 flex min-h-0">

      <!-- ── PRENDAS ── -->
      <div class="flex-1 flex flex-col min-w-0">

        <div class="px-3 md:px-5 py-3 shrink-0">
          <input
            ref="inputEscaner"
            v-model="busqueda"
            type="text"
            placeholder="🔫 Escanea la etiqueta o escribe el nombre..."
            autocomplete="off"
            @keyup.enter="alPresionarEnter"
            class="w-full bg-white border-2 rounded-2xl px-5 py-3.5 text-base font-bold text-slate-700 outline-none shadow-sm transition-colors"
            :class="pareceEtiqueta ? 'border-emerald-500 ring-4 ring-emerald-100' : 'border-slate-200 focus:border-sky-500'"
          />
        </div>

        <div class="flex-1 overflow-y-auto px-3 md:px-5 pb-28 lg:pb-5">
          <div v-if="!bodegaSeleccionada" class="h-full flex items-center justify-center text-center p-8">
            <div>
              <p class="text-6xl mb-4">🏪</p>
              <p class="text-xl font-black text-slate-400">Elige la tienda arriba para empezar</p>
            </div>
          </div>

          <div v-else-if="cargando && prendas.length === 0" class="h-full flex items-center justify-center">
            <p class="text-xl font-black text-slate-400">Cargando prendas...</p>
          </div>

          <div v-else-if="prendas.length === 0" class="h-full flex items-center justify-center text-center p-8">
            <p class="text-xl font-black text-slate-400">No hay prendas con ese nombre.</p>
          </div>

          <div v-else class="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-3">
            <button
              v-for="p in prendas"
              :key="p.id"
              @click="abrirPrenda(p)"
              :class="colorDePrenda(p.id)"
              class="text-white rounded-3xl p-4 min-h-[128px] flex flex-col justify-between text-left shadow-md transition-all active:scale-95"
            >
              <span class="font-black text-base md:text-lg leading-tight line-clamp-3 drop-shadow-sm">
                {{ p.nombre }}
              </span>
              <span class="flex items-end justify-between gap-2 mt-2">
                <span class="font-black text-xl md:text-2xl drop-shadow-sm">
                  {{ p.precio > 0 ? `S/ ${p.precio.toFixed(2)}` : 'S/ —' }}
                </span>
                <span class="bg-black/25 rounded-lg px-2 py-0.5 text-xs font-black shrink-0">
                  {{ p.stock }}
                </span>
              </span>
            </button>
          </div>
        </div>
      </div>

      <!-- ── CARRITO (escritorio) ── -->
      <aside class="hidden lg:flex w-[400px] xl:w-[440px] bg-white border-l-2 border-slate-200 flex-col shrink-0">
        <div class="px-5 py-4 border-b-2 border-slate-100 flex items-center justify-between shrink-0">
          <h2 class="text-xl font-black text-slate-800">🛒 Venta</h2>
          <button
            v-if="carrito.length"
            @click="vaciarCarrito"
            class="text-xs font-black uppercase tracking-wider text-slate-400 hover:text-red-600 border-2 border-slate-200 hover:border-red-200 px-3 py-1.5 rounded-xl transition-colors"
          >Vaciar</button>
        </div>

        <div class="flex-1 overflow-y-auto p-4 space-y-2.5">
          <div v-if="carrito.length === 0" class="h-full flex items-center justify-center text-center">
            <div>
              <p class="text-6xl mb-3">🛒</p>
              <p class="font-black text-slate-300 text-lg">Toca una prenda<br />para empezar</p>
            </div>
          </div>

          <div
            v-for="(item, i) in carrito"
            :key="item.clave || item.sku"
            class="bg-slate-50 border-2 border-slate-100 rounded-2xl p-3"
          >
            <div class="flex items-start justify-between gap-2 mb-2">
              <div class="min-w-0">
                <p class="font-black text-slate-800 leading-tight">{{ item.nombre }}</p>
                <div class="flex items-center gap-1.5 mt-1">
                  <span class="bg-slate-800 text-white text-xs font-black px-2 py-0.5 rounded-md">
                    T. {{ item.talla }}
                  </span>
                  <span v-if="item.stockForzado" class="bg-amber-100 text-amber-700 text-[10px] font-black px-2 py-0.5 rounded-md">
                    ⚠️ Revisar stock
                  </span>
                </div>
              </div>
              <button
                @click="quitarDelCarrito(i)"
                class="text-slate-300 hover:text-red-500 text-2xl leading-none font-black shrink-0 px-1"
              >×</button>
            </div>

            <div class="flex items-center justify-between gap-2">
              <div class="flex items-center gap-2">
                <button
                  @click="cambiarCantidad(item, item.cantidad - 1)"
                  :disabled="item.cantidad <= 1"
                  class="w-11 h-11 rounded-xl bg-white border-2 border-slate-200 text-slate-700 font-black text-2xl leading-none flex items-center justify-center active:scale-90 disabled:opacity-30 transition-all"
                >−</button>
                <span class="w-10 text-center font-black text-2xl text-slate-900 tabular-nums">{{ item.cantidad }}</span>
                <button
                  @click="cambiarCantidad(item, item.cantidad + 1)"
                  class="w-11 h-11 rounded-xl bg-white border-2 border-slate-200 text-slate-700 font-black text-2xl leading-none flex items-center justify-center active:scale-90 transition-all"
                >+</button>
              </div>
              <span class="font-black text-lg text-slate-900 tabular-nums">
                S/ {{ ((Number(item.precioUnitario) || 0) * item.cantidad).toFixed(2) }}
              </span>
            </div>
          </div>
        </div>

        <!-- Pie de cobro -->
        <div class="border-t-2 border-slate-100 p-4 space-y-3 shrink-0">
          <div class="grid grid-cols-2 gap-2">
            <button
              @click="condicionPago = 'CONTADO'"
              :class="condicionPago === 'CONTADO' ? 'bg-emerald-500 text-white border-emerald-500' : 'bg-white text-slate-400 border-slate-200'"
              class="border-2 py-3 rounded-2xl font-black text-sm uppercase tracking-wider transition-all"
            >💵 Contado</button>
            <button
              @click="condicionPago = 'CREDITO_FLEXIBLE'"
              :class="condicionPago !== 'CONTADO' ? 'bg-orange-500 text-white border-orange-500' : 'bg-white text-slate-400 border-slate-200'"
              class="border-2 py-3 rounded-2xl font-black text-sm uppercase tracking-wider transition-all"
            >📋 Fiado</button>
          </div>

          <select
            v-if="condicionPago !== 'CONTADO'"
            v-model="clienteId"
            class="w-full bg-orange-50 border-2 border-orange-200 rounded-2xl px-4 py-3 font-bold text-slate-700 outline-none focus:border-orange-500"
          >
            <option :value="null" disabled>👤 ¿A quién se le fía?</option>
            <option v-for="c in clientes" :key="c.id" :value="c.id">{{ c.nombre }}</option>
          </select>

          <div class="bg-slate-900 text-white rounded-2xl px-5 py-4 flex items-end justify-between">
            <div>
              <p class="text-[10px] font-black uppercase tracking-widest text-slate-400">Total</p>
              <p class="text-4xl font-black tabular-nums leading-none mt-1">S/ {{ totalPagar.toFixed(2) }}</p>
            </div>
            <p class="text-sm font-bold text-slate-400">{{ totalUnidades }} und</p>
          </div>

          <button
            @click="cobrar"
            :disabled="!!bloqueoCobro || cobrando"
            class="w-full bg-emerald-500 hover:bg-emerald-600 disabled:bg-slate-200 disabled:text-slate-400 text-white py-5 rounded-2xl font-black text-xl uppercase tracking-wider shadow-lg transition-all active:scale-[0.98]"
          >
            {{ cobrando ? 'Cobrando...' : bloqueoCobro || '✅ Cobrar' }}
          </button>
        </div>
      </aside>
    </div>

    <!-- ── BARRA DE COBRO (móvil) ── -->
    <div class="lg:hidden fixed bottom-0 inset-x-0 bg-white border-t-2 border-slate-200 p-3 flex items-center gap-3 shadow-[0_-8px_30px_rgba(0,0,0,0.12)]">
      <button
        @click="carritoAbiertoMovil = true"
        class="relative bg-slate-900 text-white px-5 py-4 rounded-2xl font-black text-lg shrink-0"
      >
        🛒
        <span v-if="totalUnidades" class="absolute -top-2 -right-2 bg-rose-500 text-white text-xs font-black w-6 h-6 rounded-full flex items-center justify-center">
          {{ totalUnidades }}
        </span>
      </button>
      <div class="flex-1 min-w-0">
        <p class="text-[10px] font-black uppercase tracking-widest text-slate-400">Total</p>
        <p class="text-2xl font-black text-slate-900 tabular-nums leading-none">S/ {{ totalPagar.toFixed(2) }}</p>
      </div>
      <button
        @click="carritoAbiertoMovil = true"
        :disabled="carrito.length === 0"
        class="bg-emerald-500 disabled:bg-slate-200 disabled:text-slate-400 text-white px-6 py-4 rounded-2xl font-black text-base uppercase tracking-wider shrink-0 active:scale-95 transition-all"
      >Cobrar</button>
    </div>

    <!-- ╔══ OVERLAY: TALLAS ══╗ -->
    <div
      v-if="prendaAbierta"
      class="fixed inset-0 bg-slate-900/70 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-0 sm:p-6"
      @click.self="cerrarTallas"
    >
      <div class="bg-white w-full sm:max-w-2xl rounded-t-3xl sm:rounded-3xl max-h-[88vh] flex flex-col shadow-2xl">
        <div :class="colorDePrenda(prendaAbierta.id)" class="text-white px-6 py-5 rounded-t-3xl shrink-0">
          <p class="text-xs font-black uppercase tracking-widest opacity-75">Elige la talla</p>
          <h3 class="text-2xl font-black leading-tight mt-0.5">{{ prendaAbierta.nombre }}</h3>
          <p class="text-lg font-black mt-1 opacity-90">
            {{ prendaAbierta.precio > 0 ? `S/ ${prendaAbierta.precio.toFixed(2)}` : 'Sin precio — se escribe al cobrar' }}
          </p>
        </div>

        <div class="flex-1 overflow-y-auto p-5">
          <div class="grid grid-cols-3 sm:grid-cols-4 gap-3">
            <button
              v-for="t in tallasDePrenda"
              :key="t.talla"
              @click="tocarTalla(t)"
              :class="t.stock > 0
                ? 'bg-emerald-50 border-emerald-300 text-emerald-800 hover:bg-emerald-100 hover:border-emerald-500'
                : 'bg-slate-50 border-dashed border-slate-300 text-slate-400 hover:border-amber-400 hover:text-amber-600'"
              class="relative border-4 rounded-2xl py-5 flex flex-col items-center justify-center transition-all active:scale-90"
            >
              <span class="font-black text-3xl leading-none">{{ t.talla }}</span>
              <span class="text-xs font-black uppercase tracking-wider mt-1.5 opacity-70">
                {{ t.stock }} und
              </span>
              <span
                v-if="enCarrito(t.productoId, t.talla)"
                class="absolute -top-3 -right-3 bg-sky-500 text-white text-sm font-black w-8 h-8 rounded-full flex items-center justify-center shadow-lg border-2 border-white"
              >{{ enCarrito(t.productoId, t.talla) }}</span>
            </button>
          </div>

          <p class="text-xs font-bold text-slate-400 mt-5 text-center">
            Toca varias veces para agregar más unidades. Las tallas punteadas están en cero
            según el sistema: si la tienes, véndela igual.
          </p>
        </div>

        <div class="p-4 border-t-2 border-slate-100 shrink-0">
          <button
            @click="cerrarTallas"
            class="w-full bg-slate-900 hover:bg-slate-800 text-white py-4 rounded-2xl font-black text-lg uppercase tracking-wider active:scale-[0.98] transition-all"
          >Listo</button>
        </div>
      </div>
    </div>

    <!-- ╔══ CARRITO MÓVIL ══╗ -->
    <div
      v-if="carritoAbiertoMovil"
      class="lg:hidden fixed inset-0 bg-slate-900/70 backdrop-blur-sm z-50 flex items-end"
      @click.self="carritoAbiertoMovil = false"
    >
      <div class="bg-white w-full rounded-t-3xl max-h-[92vh] flex flex-col shadow-2xl">
        <div class="px-5 py-4 border-b-2 border-slate-100 flex items-center justify-between shrink-0">
          <h2 class="text-xl font-black text-slate-800">🛒 Venta</h2>
          <button @click="carritoAbiertoMovil = false" class="text-slate-400 text-3xl leading-none font-black px-2">×</button>
        </div>

        <div class="flex-1 overflow-y-auto p-4 space-y-2.5">
          <div v-if="carrito.length === 0" class="py-12 text-center">
            <p class="text-5xl mb-3">🛒</p>
            <p class="font-black text-slate-300 text-lg">Todavía no agregas nada</p>
          </div>

          <div
            v-for="(item, i) in carrito"
            :key="item.clave || item.sku"
            class="bg-slate-50 border-2 border-slate-100 rounded-2xl p-3"
          >
            <div class="flex items-start justify-between gap-2 mb-2">
              <div class="min-w-0">
                <p class="font-black text-slate-800 leading-tight">{{ item.nombre }}</p>
                <span class="inline-block bg-slate-800 text-white text-xs font-black px-2 py-0.5 rounded-md mt-1">
                  T. {{ item.talla }}
                </span>
              </div>
              <button @click="quitarDelCarrito(i)" class="text-slate-300 hover:text-red-500 text-2xl leading-none font-black shrink-0 px-1">×</button>
            </div>
            <div class="flex items-center justify-between gap-2">
              <div class="flex items-center gap-2">
                <button
                  @click="cambiarCantidad(item, item.cantidad - 1)"
                  :disabled="item.cantidad <= 1"
                  class="w-12 h-12 rounded-xl bg-white border-2 border-slate-200 font-black text-2xl leading-none flex items-center justify-center active:scale-90 disabled:opacity-30"
                >−</button>
                <span class="w-10 text-center font-black text-2xl tabular-nums">{{ item.cantidad }}</span>
                <button
                  @click="cambiarCantidad(item, item.cantidad + 1)"
                  class="w-12 h-12 rounded-xl bg-white border-2 border-slate-200 font-black text-2xl leading-none flex items-center justify-center active:scale-90"
                >+</button>
              </div>
              <span class="font-black text-lg tabular-nums">
                S/ {{ ((Number(item.precioUnitario) || 0) * item.cantidad).toFixed(2) }}
              </span>
            </div>
          </div>
        </div>

        <div class="border-t-2 border-slate-100 p-4 space-y-3 shrink-0">
          <div class="grid grid-cols-2 gap-2">
            <button
              @click="tipoVenta = 'MINORISTA'"
              :class="tipoVenta === 'MINORISTA' ? 'bg-sky-500 text-white border-sky-500' : 'bg-white text-slate-400 border-slate-200'"
              class="border-2 py-2.5 rounded-xl font-black text-xs uppercase tracking-wider"
            >Normal</button>
            <button
              @click="tipoVenta = 'MAYORISTA'"
              :class="tipoVenta === 'MAYORISTA' ? 'bg-violet-500 text-white border-violet-500' : 'bg-white text-slate-400 border-slate-200'"
              class="border-2 py-2.5 rounded-xl font-black text-xs uppercase tracking-wider"
            >Por mayor</button>
          </div>

          <div class="grid grid-cols-2 gap-2">
            <button
              @click="condicionPago = 'CONTADO'"
              :class="condicionPago === 'CONTADO' ? 'bg-emerald-500 text-white border-emerald-500' : 'bg-white text-slate-400 border-slate-200'"
              class="border-2 py-3 rounded-2xl font-black text-sm uppercase tracking-wider"
            >💵 Contado</button>
            <button
              @click="condicionPago = 'CREDITO_FLEXIBLE'"
              :class="condicionPago !== 'CONTADO' ? 'bg-orange-500 text-white border-orange-500' : 'bg-white text-slate-400 border-slate-200'"
              class="border-2 py-3 rounded-2xl font-black text-sm uppercase tracking-wider"
            >📋 Fiado</button>
          </div>

          <select
            v-if="condicionPago !== 'CONTADO'"
            v-model="clienteId"
            class="w-full bg-orange-50 border-2 border-orange-200 rounded-2xl px-4 py-3 font-bold text-slate-700 outline-none"
          >
            <option :value="null" disabled>👤 ¿A quién se le fía?</option>
            <option v-for="c in clientes" :key="c.id" :value="c.id">{{ c.nombre }}</option>
          </select>

          <div class="bg-slate-900 text-white rounded-2xl px-5 py-4 flex items-end justify-between">
            <div>
              <p class="text-[10px] font-black uppercase tracking-widest text-slate-400">Total</p>
              <p class="text-4xl font-black tabular-nums leading-none mt-1">S/ {{ totalPagar.toFixed(2) }}</p>
            </div>
            <p class="text-sm font-bold text-slate-400">{{ totalUnidades }} und</p>
          </div>

          <button
            @click="cobrar"
            :disabled="!!bloqueoCobro || cobrando"
            class="w-full bg-emerald-500 disabled:bg-slate-200 disabled:text-slate-400 text-white py-5 rounded-2xl font-black text-xl uppercase tracking-wider shadow-lg active:scale-[0.98] transition-all"
          >
            {{ cobrando ? 'Cobrando...' : bloqueoCobro || '✅ Cobrar' }}
          </button>
        </div>
      </div>
    </div>

    <!-- 🔔 Avisos (no bloquean la venta) -->
    <div class="fixed bottom-24 lg:bottom-4 right-4 z-[90] flex flex-col gap-2 max-w-[340px] pointer-events-none">
      <div
        v-for="a in avisos"
        :key="a.id"
        class="bg-amber-50 border-2 border-amber-300 rounded-2xl shadow-xl px-4 py-3 flex items-start gap-3 pointer-events-auto"
      >
        <span class="text-lg leading-none shrink-0">⚠️</span>
        <p class="text-xs font-bold text-amber-900 flex-1 leading-snug">{{ a.texto }}</p>
        <button @click="descartarAviso(a.id)" class="text-amber-400 hover:text-amber-700 font-black shrink-0">✕</button>
      </div>
    </div>

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
  </div>
</template>
