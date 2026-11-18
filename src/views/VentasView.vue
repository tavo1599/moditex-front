<script setup lang="ts">
/**
 * 🧾 VENTAS
 * ===========================================================================
 * La lista de todas las ventas en un solo lugar. Desde aquí, sin ir a otra
 * pantalla, se puede:
 *
 *   · 👁  ver el detalle de una venta
 *   · 🧩 CUADRAR TALLAS cuando la venta salió surtida (sin elegir talla/color):
 *        una matriz reparte lo vendido en las variantes reales y ajusta el
 *        stock. No cambia el dinero de la venta.
 *   · ↩️  DEVOLVER / CAMBIAR: la misma herramienta de devoluciones, embebida y
 *        precargada con esa venta (ya no hay una pantalla aparte).
 *
 * Pensada para el mostrador: pocos botones, lo importante a la mano.
 */
import { ref, computed, onMounted } from 'vue'
import api from '../api/axios'
import DevolucionesView from './DevolucionesView.vue'

// ---------------------------------------------------------------------------
// ESTADO
// ---------------------------------------------------------------------------
const ventas = ref<any[]>([])
const kpis = ref<any>(null)
const inventario = ref<any[]>([])
const cargando = ref(true)

const fecha = ref('') // vacío = últimas ventas; con fecha = ese día
const busqueda = ref('')
// Almacenes del usuario (el backend ya devuelve solo los suyos). '' = todos.
const bodegas = ref<any[]>([])
const bodegaFiltro = ref<number | ''>('')

const aviso = ref<{ texto: string; tipo: 'ok' | 'error' } | null>(null)
let timerAviso: ReturnType<typeof setTimeout> | null = null
const avisar = (texto: string, tipo: 'ok' | 'error' = 'ok') => {
  aviso.value = { texto, tipo }
  if (timerAviso) clearTimeout(timerAviso)
  timerAviso = setTimeout(() => (aviso.value = null), 6000)
}

// ---------------------------------------------------------------------------
// CARGA
// ---------------------------------------------------------------------------
const cargar = async () => {
  cargando.value = true
  try {
    const params: any = {}
    if (fecha.value) params.fecha = fecha.value
    if (bodegaFiltro.value) params.bodegaId = bodegaFiltro.value
    const [resV, resInv, resB] = await Promise.all([
      api.get('/ventas/reporte-general', { params }),
      api.get('/almacen-terminados/inventario', {
        params: bodegaFiltro.value ? { bodegaId: bodegaFiltro.value } : {},
      }).catch(() => ({ data: [] })),
      bodegas.value.length ? Promise.resolve({ data: bodegas.value })
                           : api.get('/almacen-terminados/bodegas').catch(() => ({ data: [] })),
    ])
    ventas.value = resV.data?.ultimasVentas || []
    kpis.value = resV.data?.kpis || null
    inventario.value = resInv.data || []
    bodegas.value = resB.data || []
  } catch (e: any) {
    avisar('No se pudieron cargar las ventas: ' + (e.response?.data?.message || e.message), 'error')
  } finally {
    cargando.value = false
  }
}
onMounted(cargar)

const ventasFiltradas = computed(() => {
  const q = busqueda.value.trim().toLowerCase()
  if (!q) return ventas.value
  return ventas.value.filter((v) =>
    `${v.correlativo} ${v.cliente || ''} ${v.almacen || ''}`.toLowerCase().includes(q),
  )
})

const fechaBonita = (f: string) =>
  new Date(f).toLocaleString('es-PE', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })

// ---------------------------------------------------------------------------
// VER DETALLE
// ---------------------------------------------------------------------------
const detalle = ref<any>(null)
const cargandoDetalle = ref(false)
const verDetalle = async (venta: any) => {
  cargandoDetalle.value = true
  detalle.value = { id: venta.id, correlativo: venta.correlativo } // encabezado inmediato
  try {
    const { data } = await api.get(`/ventas/detalle/${venta.id}`)
    detalle.value = data
  } catch (e: any) {
    avisar(e.response?.data?.message || 'No se pudo abrir el detalle.', 'error')
    detalle.value = null
  } finally {
    cargandoDetalle.value = false
  }
}

// ---------------------------------------------------------------------------
// CUADRAR TALLAS  (ventas surtidas)
// ---------------------------------------------------------------------------
const esSurtida = (d: any) =>
  d.colorCodigo === 'GENERAL' || d.color === 'GENERAL' || d.talla === 'UNICA' || !String(d.talla ?? '').trim()

const modalCuadrar = ref<any>(null) // la venta con su detalle cargado
const guardandoCuadre = ref(false)

/** Variantes reales que el almacén conoce de esa prenda (para sugerir en la matriz). */
const variantesDe = (productoId: number, bodegaId: number) =>
  inventario.value.filter(
    (i: any) =>
      Number(i.productoId || i.producto?.id) === Number(productoId) &&
      Number(i.bodegaId) === Number(bodegaId),
  )
const coloresDe = (productoId: number, bodegaId: number) =>
  [...new Set(variantesDe(productoId, bodegaId).map((i: any) => String(i.color)))]
    .filter((c) => c && c !== 'GENERAL')
const tallasDe = (productoId: number, bodegaId: number) =>
  [...new Set(variantesDe(productoId, bodegaId).map((i: any) => String(i.talla)))]
    .filter((t) => t && t !== 'UNICA')

const abrirCuadrar = async (venta: any) => {
  guardandoCuadre.value = false
  modalCuadrar.value = { id: venta.id, correlativo: venta.correlativo, bodegaId: venta.bodegaId, lineas: [], cargando: true }
  try {
    const { data } = await api.get(`/ventas/detalle/${venta.id}`)
    const bodegaId = venta.bodegaId
    // Solo las líneas surtidas necesitan cuadre; cada una arranca con una fila
    // de reparto que ya trae toda la cantidad, para que sea un solo tecleo.
    const lineas = (data.detalles || [])
      .filter(esSurtida)
      .map((d: any) => ({
        detalleId: d.id,
        producto: d.producto,
        cantidad: d.cantidad,
        precioUnitario: d.precioUnitario,
        productoId: d.productoId ?? null,
        reparto: [{ color: '', talla: '', cantidad: d.cantidad }],
      }))
    modalCuadrar.value = {
      id: venta.id,
      correlativo: venta.correlativo,
      bodegaId,
      lineas,
      cargando: false,
    }
  } catch (e: any) {
    avisar(e.response?.data?.message || 'No se pudo abrir el cuadre.', 'error')
    modalCuadrar.value = null
  }
}

const agregarFila = (linea: any) =>
  linea.reparto.push({ color: '', talla: '', cantidad: 0 })
const quitarFila = (linea: any, i: number | string) => {
  if (linea.reparto.length > 1) linea.reparto.splice(Number(i), 1)
}
const sumaLinea = (linea: any) =>
  linea.reparto.reduce((s: number, r: any) => s + (Number(r.cantidad) || 0), 0)
const lineaOk = (linea: any) => sumaLinea(linea) === Number(linea.cantidad)
const todoOk = computed(() => (modalCuadrar.value?.lineas || []).every(lineaOk))

const guardarCuadre = async () => {
  if (!modalCuadrar.value || !todoOk.value) {
    return avisar('Cada prenda debe repartirse en la cantidad exacta vendida.', 'error')
  }
  guardandoCuadre.value = true
  try {
    const lineas = modalCuadrar.value.lineas.map((l: any) => ({
      detalleId: l.detalleId,
      reparto: l.reparto
        .filter((r: any) => Number(r.cantidad) > 0)
        .map((r: any) => ({ color: r.color?.trim() || undefined, talla: r.talla?.trim() || undefined, cantidad: Number(r.cantidad) })),
    }))
    await api.patch(`/ventas/${modalCuadrar.value.id}/cuadrar-variantes`, { lineas })
    avisar('✅ Tallas y colores cuadrados. El stock quedó ajustado.')
    modalCuadrar.value = null
    await cargar()
  } catch (e: any) {
    avisar(e.response?.data?.message || 'No se pudo cuadrar.', 'error')
  } finally {
    guardandoCuadre.value = false
  }
}

// ---------------------------------------------------------------------------
// DEVOLVER / CAMBIAR  (Devoluciones embebida)
// ---------------------------------------------------------------------------
const modalDevolver = ref<string | null>(null) // el correlativo de la venta
const abrirDevolver = (venta: any) => (modalDevolver.value = venta.correlativo)
const cerrarDevolver = async () => {
  modalDevolver.value = null
  await cargar() // por si una devolución cambió totales
}
</script>

<template>
  <div class="space-y-5">
    <!-- Encabezado -->
    <div class="bg-gradient-to-r from-slate-800 to-slate-900 text-white rounded-3xl p-6 shadow-lg">
      <h1 class="text-3xl font-black flex items-center gap-2">🧾 Ventas</h1>
      <p class="text-slate-300 mt-1 text-sm">
        Todas las ventas. Cuadra las tallas de las que salieron surtidas y haz devoluciones desde aquí mismo.
      </p>
      <div v-if="kpis" class="mt-4 flex flex-wrap gap-3">
        <div class="bg-white/10 rounded-2xl px-4 py-2">
          <p class="text-[10px] font-black uppercase tracking-wider text-slate-400">Vendido hoy</p>
          <p class="text-2xl font-black">S/ {{ kpis.ventasHoy }}</p>
        </div>
        <div class="bg-white/10 rounded-2xl px-4 py-2">
          <p class="text-[10px] font-black uppercase tracking-wider text-slate-400">Prendas hoy</p>
          <p class="text-2xl font-black">{{ kpis.prendasVendidas }}</p>
        </div>
      </div>
    </div>

    <!-- Aviso -->
    <transition name="fade">
      <div
        v-if="aviso"
        class="px-5 py-4 rounded-2xl font-bold border-2 shadow-sm"
        :class="aviso.tipo === 'ok' ? 'bg-emerald-50 border-emerald-300 text-emerald-800' : 'bg-rose-50 border-rose-300 text-rose-800'"
      >
        {{ aviso.texto }}
      </div>
    </transition>

    <!-- Filtros -->
    <div class="bg-white rounded-2xl p-4 shadow-sm flex flex-wrap gap-3 items-center">
      <input
        v-model="busqueda"
        type="text"
        placeholder="🔍 Buscar por código, cliente o almacén..."
        class="flex-1 min-w-[220px] border-2 border-slate-200 rounded-xl px-4 h-12 font-semibold text-slate-700 focus:border-sky-500 outline-none"
      />
      <!-- Filtro por almacén: aparece solo si el usuario ve más de uno -->
      <select
        v-if="bodegas.length > 1"
        v-model="bodegaFiltro"
        class="w-full sm:w-auto border-2 border-slate-200 rounded-xl px-4 h-12 font-bold text-slate-700 focus:border-sky-500 outline-none"
        @change="cargar"
      >
        <option :value="''">🏬 Todos mis almacenes</option>
        <option v-for="b in bodegas" :key="b.id" :value="b.id">{{ b.nombre }}</option>
      </select>
      <input
        v-model="fecha"
        type="date"
        class="w-full sm:w-auto border-2 border-slate-200 rounded-xl px-4 h-12 font-bold text-slate-700 focus:border-sky-500 outline-none"
        @change="cargar"
      />
      <button
        v-if="fecha"
        @click="fecha = ''; cargar()"
        class="w-full sm:w-auto px-4 h-12 rounded-xl bg-slate-100 hover:bg-slate-200 font-bold text-slate-600 text-sm"
      >
        Ver recientes
      </button>
    </div>

    <!-- Lista -->
    <div v-if="cargando" class="text-center py-16 text-slate-400 font-bold">Cargando ventas...</div>

    <div v-else-if="ventasFiltradas.length === 0" class="bg-white rounded-3xl p-14 text-center shadow-sm">
      <p class="text-5xl mb-3">🧾</p>
      <p class="text-xl font-black text-slate-700">No hay ventas que mostrar</p>
      <p class="text-slate-500 mt-1">{{ fecha ? 'Prueba con otra fecha.' : 'Aún no se registran ventas.' }}</p>
    </div>

    <div v-else class="bg-white rounded-2xl shadow-sm overflow-hidden">
      <div class="overflow-x-auto">
        <table class="w-full text-left min-w-[640px]">
          <thead class="bg-slate-800 text-white uppercase text-[10px] tracking-wider">
            <tr>
              <th class="p-3">Código</th>
              <th class="p-3">Fecha</th>
              <th class="p-3">Cliente</th>
              <th class="p-3">Almacén</th>
              <th class="p-3 text-center">Prendas</th>
              <th class="p-3 text-right">Total</th>
              <th class="p-3 text-center">Estado</th>
              <th class="p-3 text-right">Acciones</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100">
            <tr v-for="v in ventasFiltradas" :key="v.id" class="hover:bg-sky-50/50">
              <td class="p-3 font-mono font-black text-slate-700 whitespace-nowrap">{{ v.correlativo }}</td>
              <td class="p-3 text-xs text-slate-500 font-bold whitespace-nowrap">{{ fechaBonita(v.createdAt) }}</td>
              <td class="p-3 text-sm font-bold text-slate-700">{{ v.cliente }}</td>
              <td class="p-3 text-xs font-bold text-slate-500">{{ v.almacen }}</td>
              <td class="p-3 text-center font-black text-slate-700">{{ v.prendas }}</td>
              <td class="p-3 text-right font-black text-slate-900 whitespace-nowrap">S/ {{ v.total.toFixed(2) }}</td>
              <td class="p-3 text-center">
                <span
                  class="text-[10px] font-black px-2 py-1 rounded-full border-2 whitespace-nowrap"
                  :class="v.estadoPago === 'PAGADO' ? 'bg-emerald-100 text-emerald-700 border-emerald-300' : 'bg-orange-100 text-orange-700 border-orange-300'"
                >
                  {{ v.estadoPago === 'PAGADO' ? 'Pagada' : 'Crédito' }}
                </span>
              </td>
              <td class="p-3">
                <div class="flex items-center justify-end gap-1.5">
                  <button
                    @click="verDetalle(v)"
                    class="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs px-3 py-2 rounded-lg whitespace-nowrap"
                    title="Ver el detalle de la venta"
                  >👁 Ver</button>
                  <button
                    v-if="v.tieneSurtido"
                    @click="abrirCuadrar(v)"
                    class="bg-amber-100 hover:bg-amber-200 text-amber-800 font-black text-xs px-3 py-2 rounded-lg whitespace-nowrap"
                    title="Se vendió surtido: asigna talla y color y ajusta el stock"
                  >🧩 Cuadrar</button>
                  <button
                    @click="abrirDevolver(v)"
                    class="bg-orange-100 hover:bg-orange-200 text-orange-700 font-bold text-xs px-3 py-2 rounded-lg whitespace-nowrap"
                    title="Devolver o cambiar prendas de esta venta"
                  >↩️ Devolver</button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- ================= MODAL: VER DETALLE ================= -->
    <div v-if="detalle" class="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" @click.self="detalle = null">
      <div class="bg-white rounded-t-3xl sm:rounded-3xl w-full max-w-lg shadow-2xl max-h-[92vh] overflow-y-auto">
        <div class="bg-slate-800 text-white px-5 py-4 flex items-center justify-between sticky top-0">
          <div>
            <h3 class="text-xl font-black">{{ detalle.correlativo }}</h3>
            <p v-if="detalle.cliente" class="text-slate-300 text-sm">{{ detalle.cliente }}</p>
          </div>
          <button @click="detalle = null" class="text-white/70 hover:text-white text-3xl leading-none">&times;</button>
        </div>
        <div v-if="cargandoDetalle" class="py-16 text-center text-slate-400 font-bold">Cargando...</div>
        <div v-else-if="detalle.detalles" class="p-5 space-y-4">
          <div class="flex flex-wrap gap-x-6 gap-y-1 text-sm">
            <p><span class="text-slate-400 font-bold">Almacén:</span> <b>{{ detalle.almacen }}</b></p>
            <p><span class="text-slate-400 font-bold">Pago:</span> <b>{{ detalle.condicionPago }}</b></p>
            <p v-if="detalle.vendedor"><span class="text-slate-400 font-bold">Vendedor:</span> <b>{{ detalle.vendedor }}</b></p>
          </div>
          <div class="overflow-x-auto">
            <table class="w-full text-sm min-w-[330px]">
              <thead class="text-[10px] uppercase text-slate-400 border-b">
                <tr><th class="py-1 text-left">Prenda</th><th>Color</th><th>Talla</th><th class="text-center">Cant</th><th class="text-right">Subtotal</th></tr>
              </thead>
              <tbody>
                <tr v-for="d in detalle.detalles" :key="d.id" class="border-b border-slate-50">
                  <td class="py-2 font-bold text-slate-700">{{ d.producto }}</td>
                  <td class="text-center text-slate-600">{{ d.color }}</td>
                  <td class="text-center text-slate-600">{{ d.talla }}</td>
                  <td class="text-center font-bold">{{ d.cantidad }}</td>
                  <td class="text-right font-black">S/ {{ d.subtotal.toFixed(2) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div class="flex justify-between items-center bg-slate-900 text-white rounded-2xl px-5 py-3">
            <span class="font-bold text-slate-300">Total</span>
            <span class="text-2xl font-black">S/ {{ detalle.totalVenta.toFixed(2) }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- ================= MODAL: CUADRAR TALLAS ================= -->
    <div v-if="modalCuadrar" class="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" @click.self="modalCuadrar = null">
      <div class="bg-white rounded-t-3xl sm:rounded-3xl w-full max-w-2xl shadow-2xl max-h-[92vh] overflow-y-auto">
        <div class="bg-amber-500 text-white px-5 py-4 flex items-center justify-between sticky top-0 z-10">
          <div>
            <h3 class="text-xl font-black">🧩 Cuadrar tallas · {{ modalCuadrar.correlativo }}</h3>
            <p class="text-amber-50 text-sm">Reparte lo vendido en las tallas y colores reales. El dinero no cambia.</p>
          </div>
          <button @click="modalCuadrar = null" class="text-white/80 hover:text-white text-3xl leading-none">&times;</button>
        </div>

        <div v-if="modalCuadrar.cargando" class="py-16 text-center text-slate-400 font-bold">Cargando...</div>
        <div v-else-if="modalCuadrar.lineas.length === 0" class="p-8 text-center">
          <p class="text-4xl mb-2">✅</p>
          <p class="font-black text-slate-700">Esta venta no tiene nada que cuadrar.</p>
          <p class="text-slate-500 text-sm">Todas sus líneas ya tienen talla y color.</p>
        </div>

        <div v-else class="p-5 space-y-5">
          <div
            v-for="(linea, li) in modalCuadrar.lineas"
            :key="linea.detalleId"
            class="border-2 rounded-2xl p-4"
            :class="lineaOk(linea) ? 'border-emerald-200 bg-emerald-50/40' : 'border-amber-200 bg-amber-50/40'"
          >
            <div class="flex items-center justify-between mb-3">
              <p class="font-black text-slate-800">{{ linea.producto }}</p>
              <span
                class="text-xs font-black px-2.5 py-1 rounded-lg"
                :class="lineaOk(linea) ? 'bg-emerald-200 text-emerald-800' : 'bg-amber-200 text-amber-800'"
              >
                {{ sumaLinea(linea) }} / {{ linea.cantidad }}
              </span>
            </div>

            <!-- Listas de sugerencias (lo que el almacén ya conoce de la prenda) -->
            <datalist :id="`col-${li}`">
              <option v-for="c in coloresDe(linea.productoId, modalCuadrar.bodegaId)" :key="c" :value="c" />
            </datalist>
            <datalist :id="`tal-${li}`">
              <option v-for="t in tallasDe(linea.productoId, modalCuadrar.bodegaId)" :key="t" :value="t" />
            </datalist>

            <div class="space-y-2">
              <div v-for="(r, ri) in linea.reparto" :key="ri" class="flex items-center gap-2">
                <input
                  v-model="r.color"
                  :list="`col-${li}`"
                  placeholder="Color (si tiene)"
                  class="flex-1 min-w-0 border-2 border-slate-200 rounded-xl px-3 h-11 text-sm font-semibold text-slate-700 focus:border-amber-500 outline-none"
                />
                <input
                  v-model="r.talla"
                  :list="`tal-${li}`"
                  placeholder="Talla"
                  class="w-24 border-2 border-slate-200 rounded-xl px-3 h-11 text-sm font-semibold text-slate-700 focus:border-amber-500 outline-none"
                />
                <input
                  v-model.number="r.cantidad"
                  type="number"
                  inputmode="numeric"
                  min="0"
                  class="w-20 border-2 border-slate-200 rounded-xl px-3 h-11 text-sm text-center font-black text-slate-800 focus:border-amber-500 outline-none"
                />
                <button
                  @click="quitarFila(linea, ri)"
                  :disabled="linea.reparto.length <= 1"
                  class="shrink-0 text-slate-300 hover:text-rose-500 disabled:opacity-20 text-xl font-black px-1"
                  title="Quitar fila"
                >×</button>
              </div>
            </div>

            <button
              @click="agregarFila(linea)"
              class="mt-2 text-sm font-black text-amber-700 hover:text-amber-800"
            >+ Otra talla / color</button>
          </div>

          <div class="flex flex-col sm:flex-row gap-3 pb-seguro sm:pb-0">
            <button
              @click="guardarCuadre"
              :disabled="!todoOk || guardandoCuadre"
              class="flex-1 bg-amber-500 hover:bg-amber-600 disabled:bg-slate-200 disabled:text-slate-400 text-white font-black py-4 rounded-2xl text-lg"
            >
              {{ guardandoCuadre ? 'Guardando...' : '✅ Cuadrar y ajustar stock' }}
            </button>
            <button @click="modalCuadrar = null" class="px-6 py-4 rounded-2xl font-bold text-slate-600 hover:bg-slate-100">
              Cancelar
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- ================= MODAL: DEVOLVER / CAMBIAR ================= -->
    <div v-if="modalDevolver" class="fixed inset-0 bg-black/60 z-50 flex items-start justify-center p-0 sm:p-4 overflow-y-auto" @click.self="cerrarDevolver">
      <div class="bg-white rounded-t-3xl sm:rounded-3xl w-full max-w-4xl shadow-2xl my-0 sm:my-4">
        <div class="bg-orange-600 text-white px-5 py-4 flex items-center justify-between sticky top-0 z-10 rounded-t-3xl">
          <h3 class="text-xl font-black">↩️ Devolución / Cambio · {{ modalDevolver }}</h3>
          <button @click="cerrarDevolver" class="text-white/80 hover:text-white text-3xl leading-none">&times;</button>
        </div>
        <div class="p-4">
          <DevolucionesView :correlativo-inicial="modalDevolver" :embebido="true" />
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.fade-enter-active, .fade-leave-active { transition: opacity .2s ease, transform .2s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; transform: translateY(-6px); }
</style>
