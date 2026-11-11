<script setup lang="ts">
/**
 * TRANSFORMACIÓN — DE ROLLOS DE TELA A PRENDAS
 * ===========================================================================
 * Segundo paso del recorrido:
 *
 *    1. Rollos → [ 2. TRANSFORMACIÓN ] → 3. Terminados → 4. Venta
 *
 * CÓMO FUNCIONA, EN PALABRAS SIMPLES:
 *
 *   A) NUEVO CORTE
 *      El cortador se lleva rollos del almacén. Aquí se marcan EXACTAMENTE
 *      cuáles se llevó y cuántos kilos de cada uno. Después se dice en qué
 *      prenda los convirtió: el tipo de prenda y la tabla de colores × tallas
 *      con las cantidades. Al guardar, los kilos se descuentan de los rollos.
 *      Las prendas todavía NO están en el almacén: están en el taller.
 *
 *   B) RECIBIR
 *      Cuando el taller devuelve la producción terminada, se cuenta lo que
 *      llegó de verdad (puede ser menos de lo cortado) y se elige la bodega.
 *      En ese momento las prendas entran a Almacén de Terminados y ya se
 *      pueden VENDER o TRASLADAR.
 *
 *   C) REPORTE
 *      Cuántos kilos se usaron, cuántas prendas salieron y el rendimiento
 *      (prendas por kilo). Todo queda guardado para consultarlo meses después.
 */
import { ref, onMounted, computed, watch } from 'vue'
import api from '../api/axios'
import { ordenarTallas } from '../utils/tallas'

type Pestania = 'nuevo' | 'historial' | 'reporte'
const pestania = ref<Pestania>('nuevo')

// ---------------------------------------------------------------------------
// DATOS BASE
// ---------------------------------------------------------------------------
const rollosDisponibles = ref<any[]>([])
const productos = ref<any[]>([])
const colores = ref<any[]>([])
const talleres = ref<any[]>([])
const bodegas = ref<any[]>([])
const cargando = ref(true)
const guardando = ref(false)

// Avisos no bloqueantes
const aviso = ref<{ texto: string; tipo: 'ok' | 'error' } | null>(null)
let timerAviso: ReturnType<typeof setTimeout> | null = null
const avisar = (texto: string, tipo: 'ok' | 'error' = 'ok') => {
  aviso.value = { texto, tipo }
  if (timerAviso) clearTimeout(timerAviso)
  timerAviso = setTimeout(() => (aviso.value = null), 8000)
}

const cargarBase = async () => {
  cargando.value = true
  try {
    const [resR, resP, resC, resT, resB] = await Promise.all([
      api.get('/rollos/disponibles'),
      api.get('/productos'),
      api.get('/colores'),
      api.get('/talleres'),
      api.get('/almacen-terminados/bodegas'),
    ])
    rollosDisponibles.value = resR.data
    // La mercadería comprada no se corta: no tiene sentido ofrecerla aquí.
    productos.value = (resP.data || []).filter((p: any) => !p.esMercaderia)
    colores.value = resC.data
    talleres.value = resT.data
    bodegas.value = (resB.data || []).filter((b: any) => b.estado !== false)
  } catch (e: any) {
    avisar('No se pudo cargar la información: ' + (e.response?.data?.message || e.message), 'error')
  } finally {
    cargando.value = false
  }
}

// ===========================================================================
// ============== A) NUEVO CORTE =============================================
// ===========================================================================

// ---- PASO 1: los rollos que se llevó el cortador ----
// seleccion = { [rolloId]: kilosQueSeUsaron }
const seleccion = ref<Record<number, number>>({})
const filtroColorRollo = ref('')

const coloresDeRollos = computed(() => [...new Set(rollosDisponibles.value.map((r) => r.color))].sort())

const rollosVisibles = computed(() =>
  filtroColorRollo.value
    ? rollosDisponibles.value.filter((r) => r.color === filtroColorRollo.value)
    : rollosDisponibles.value,
)

const estaSeleccionado = (id: number) => seleccion.value[id] !== undefined

const alternarRollo = (rollo: any) => {
  if (estaSeleccionado(rollo.id)) {
    delete seleccion.value[rollo.id]
  } else {
    // Por defecto se asume que usó el rollo completo: es el caso más común.
    seleccion.value[rollo.id] = Number(Number(rollo.pesoActual).toFixed(3))
  }
}

const rollosElegidos = computed(() =>
  rollosDisponibles.value
    .filter((r) => estaSeleccionado(r.id))
    .map((r) => ({ ...r, pesoUsado: seleccion.value[r.id] })),
)

const kilosUsados = computed(() => rollosElegidos.value.reduce((s, r) => s + Number(r.pesoUsado || 0), 0))
const costoTela = computed(() =>
  rollosElegidos.value.reduce((s, r) => s + Number(r.pesoUsado || 0) * Number(r.costoPorKilo || 0), 0),
)

// Si escriben más kilos de los que tiene el rollo, lo avisamos al instante.
const rollosExcedidos = computed(() =>
  rollosElegidos.value.filter((r) => Number(r.pesoUsado) > Number(r.pesoActual) + 0.0001),
)

const usarTodosDelColor = () => {
  for (const r of rollosVisibles.value) {
    if (!estaSeleccionado(r.id)) seleccion.value[r.id] = Number(Number(r.pesoActual).toFixed(3))
  }
}
const limpiarSeleccion = () => { seleccion.value = {} }

// ---- PASO 2: en qué prenda se transformó (matriz color × talla) ----
const productoId = ref<any>('')
const tallas = ref<string[]>(['S', 'M', 'L', 'XL'])
const nuevaTalla = ref('')
// filas = [{ color: 'Negro', cant: { S: 10, M: 20 } }]
const filas = ref<any[]>([])
const colorNuevo = ref('')

const agregarTalla = () => {
  const t = nuevaTalla.value.trim().toUpperCase()
  if (!t) return
  if (!tallas.value.includes(t)) tallas.value = ordenarTallas([...tallas.value, t])
  nuevaTalla.value = ''
}
const quitarTalla = (t: string) => {
  tallas.value = tallas.value.filter((x) => x !== t)
  for (const f of filas.value) delete f.cant[t]
}

const agregarColor = () => {
  const c = colorNuevo.value.trim()
  if (!c) return
  if (filas.value.some((f) => f.color === c)) { colorNuevo.value = ''; return }
  filas.value.push({ color: c, cant: {} })
  colorNuevo.value = ''
}
const quitarColor = (i: number) => filas.value.splice(i, 1)

// Atajo muy pedido: los colores de los rollos elegidos suelen ser los colores
// de las prendas que salen. Con un botón se cargan solos.
const copiarColoresDeRollos = () => {
  const coloresRollo = [...new Set(rollosElegidos.value.map((r) => r.color))]
  if (coloresRollo.length === 0) {
    avisar('Primero elige los rollos en el paso 1.', 'error')
    return
  }
  for (const c of coloresRollo) {
    if (!filas.value.some((f) => f.color === c)) filas.value.push({ color: c, cant: {} })
  }
  avisar(`Se cargaron ${coloresRollo.length} color(es) de los rollos elegidos.`)
}

const totalFila = (f: any) => tallas.value.reduce((s, t) => s + (Number(f.cant[t]) || 0), 0)
const totalColumna = (t: string) => filas.value.reduce((s, f) => s + (Number(f.cant[t]) || 0), 0)
const totalPrendas = computed(() => filas.value.reduce((s, f) => s + totalFila(f), 0))

// Los dos números que le dicen al dueño si el corte salió bien
const rendimiento = computed(() => (kilosUsados.value > 0 ? totalPrendas.value / kilosUsados.value : 0))
const costoPorPrenda = computed(() => (totalPrendas.value > 0 ? costoTela.value / totalPrendas.value : 0))

// ---- PASO 3: datos del corte ----
const cortador = ref('')
const tallerId = ref<any>('')
const numeroGuia = ref('')
const observacion = ref('')

const puedeGuardar = computed(
  () =>
    rollosElegidos.value.length > 0 &&
    rollosExcedidos.value.length === 0 &&
    !!productoId.value &&
    totalPrendas.value > 0,
)

const razonBloqueo = computed(() => {
  if (rollosElegidos.value.length === 0) return 'Paso 1: elige los rollos que se llevó el cortador.'
  if (rollosExcedidos.value.length > 0) return 'Paso 1: hay rollos con más kilos de los que tienen.'
  if (!productoId.value) return 'Paso 2: elige en qué prenda se transformó la tela.'
  if (totalPrendas.value === 0) return 'Paso 2: llena la tabla de colores y tallas.'
  return ''
})

const limpiarTodo = () => {
  seleccion.value = {}
  productoId.value = ''
  filas.value = []
  cortador.value = ''
  tallerId.value = ''
  numeroGuia.value = ''
  observacion.value = ''
}

const guardarCorte = async () => {
  if (!puedeGuardar.value) return avisar(razonBloqueo.value, 'error')

  const detalles: any[] = []
  for (const f of filas.value) {
    for (const t of tallas.value) {
      const cant = Number(f.cant[t]) || 0
      if (cant > 0) detalles.push({ color: f.color, talla: t, cantidad: cant })
    }
  }

  guardando.value = true
  try {
    const { data } = await api.post('/transformaciones', {
      productoId: Number(productoId.value),
      rollos: rollosElegidos.value.map((r) => ({ rolloId: r.id, pesoUsado: Number(r.pesoUsado) })),
      detalles,
      cortador: cortador.value.trim() || null,
      tallerId: tallerId.value ? Number(tallerId.value) : null,
      numeroGuia: numeroGuia.value.trim() || null,
      observacion: observacion.value.trim() || null,
    })
    avisar(
      `✅ Corte ${data.codigo} registrado: ${kilosUsados.value.toFixed(2)} kg → ${totalPrendas.value} prendas. ` +
        'Ahora está EN PROCESO en el taller. Cuando llegue terminado, recíbelo desde el Historial.',
    )
    limpiarTodo()
    await cargarBase()
    await cargarHistorial()
    pestania.value = 'historial'
  } catch (e: any) {
    avisar(e.response?.data?.message || 'No se pudo registrar el corte.', 'error')
  } finally {
    guardando.value = false
  }
}

// ===========================================================================
// ============== B) HISTORIAL Y RECEPCIÓN ===================================
// ===========================================================================
const historial = ref<any[]>([])
const filtroEstado = ref('')
const cargandoHistorial = ref(false)

const cargarHistorial = async () => {
  cargandoHistorial.value = true
  try {
    const { data } = await api.get('/transformaciones', {
      params: filtroEstado.value ? { estado: filtroEstado.value } : {},
    })
    historial.value = data
  } catch (e: any) {
    avisar('No se pudo cargar el historial: ' + (e.response?.data?.message || e.message), 'error')
  } finally {
    cargandoHistorial.value = false
  }
}
watch(filtroEstado, cargarHistorial)

// ---- Modal de recepción ----
const modalRecibir = ref<any>(null)
const bodegaDestinoId = ref<any>('')
// recibidos = { 'Negro|M': 20 }
const recibidos = ref<Record<string, number>>({})

const clave = (color: string, talla: string) => `${color}|${talla}`

const abrirRecepcion = async (corte: any) => {
  try {
    const { data } = await api.get(`/transformaciones/${corte.id}`)
    modalRecibir.value = data
    bodegaDestinoId.value = data.bodegaDestinoId || bodegas.value[0]?.id || ''
    // Prellenamos con lo que falta: lo normal es que llegue todo.
    recibidos.value = {}
    for (const d of data.detalles) {
      const pendiente = d.cantidad - d.cantidadRecibida
      if (pendiente > 0) recibidos.value[clave(d.color, d.talla)] = pendiente
    }
  } catch (e: any) {
    avisar(e.response?.data?.message || 'No se pudo abrir el corte.', 'error')
  }
}

const totalARecibir = computed(() =>
  Object.values(recibidos.value).reduce((s, n) => s + (Number(n) || 0), 0),
)

const confirmarRecepcion = async () => {
  if (!bodegaDestinoId.value) return avisar('Elige a qué bodega entra la producción.', 'error')
  if (totalARecibir.value <= 0) return avisar('Indica cuántas prendas llegaron del taller.', 'error')

  const lista = Object.entries(recibidos.value)
    .map(([k, cantidad]) => {
      const [color, talla] = k.split('|')
      return { color, talla, cantidad: Number(cantidad) || 0 }
    })
    .filter((r) => r.cantidad > 0)

  guardando.value = true
  try {
    const { data } = await api.patch(`/transformaciones/${modalRecibir.value.id}/recibir`, {
      bodegaDestinoId: Number(bodegaDestinoId.value),
      recibidos: lista,
    })
    const bodega = bodegas.value.find((b) => b.id === Number(bodegaDestinoId.value))
    avisar(
      `✅ ${totalARecibir.value} prendas de ${data.producto?.nombre} entraron a ${bodega?.nombre}. ` +
        'Ya se pueden vender o trasladar.',
    )
    modalRecibir.value = null
    await cargarHistorial()
  } catch (e: any) {
    avisar(e.response?.data?.message || 'No se pudo registrar la recepción.', 'error')
  } finally {
    guardando.value = false
  }
}

// ---- Detalle de solo lectura ----
const modalDetalle = ref<any>(null)
const verDetalle = async (corte: any) => {
  try {
    const { data } = await api.get(`/transformaciones/${corte.id}`)
    modalDetalle.value = data
  } catch (e: any) {
    avisar(e.response?.data?.message || 'No se pudo abrir el detalle.', 'error')
  }
}

const anularCorte = async (corte: any) => {
  if (!confirm(`¿Anular el corte ${corte.codigo}?\n\nLos kilos volverán a los rollos tal como estaban.`)) return
  try {
    await api.patch(`/transformaciones/${corte.id}/anular`, { motivo: 'Anulado desde Transformación' })
    avisar(`${corte.codigo} anulado. La tela volvió a los rollos.`)
    await cargarBase()
    await cargarHistorial()
  } catch (e: any) {
    avisar(e.response?.data?.message || 'No se pudo anular.', 'error')
  }
}

// ===========================================================================
// ============== C) REPORTE DE PRODUCCIÓN ===================================
// ===========================================================================
const reporte = ref<any>(null)
const repDesde = ref('')
const repHasta = ref('')
const cargandoReporte = ref(false)

const cargarReporte = async () => {
  cargandoReporte.value = true
  try {
    const { data } = await api.get('/transformaciones/reporte', {
      params: {
        ...(repDesde.value ? { desde: repDesde.value } : {}),
        ...(repHasta.value ? { hasta: repHasta.value } : {}),
      },
    })
    reporte.value = data
  } catch (e: any) {
    avisar('No se pudo cargar el reporte: ' + (e.response?.data?.message || e.message), 'error')
  } finally {
    cargandoReporte.value = false
  }
}

const exportarReporte = () => {
  if (!reporte.value) return
  const filasCsv = [
    ['REPORTE DE TRANSFORMACIÓN / PRODUCCIÓN'],
    ['Desde', repDesde.value || 'inicio', 'Hasta', repHasta.value || 'hoy'],
    [],
    ['Cortes', reporte.value.totales.cortes],
    ['Kilos usados', reporte.value.totales.kilosUsados],
    ['Prendas cortadas', reporte.value.totales.prendasCortadas],
    ['Prendas recibidas', reporte.value.totales.prendasRecibidas],
    ['Prendas por kilo', reporte.value.totales.rendimientoPrendasPorKilo],
    ['Costo de tela', reporte.value.totales.costoTela],
    [],
    ['CÓDIGO', 'FECHA', 'PRENDA', 'KILOS', 'CORTADAS', 'RECIBIDAS', 'ESTADO', 'CORTADOR'],
    ...reporte.value.cortes.map((c: any) => [
      c.codigo,
      new Date(c.fecha).toLocaleDateString('es-PE'),
      c.producto,
      c.kilos,
      c.cortadas,
      c.recibidas,
      c.estado,
      c.cortador || '',
    ]),
  ]
  // BOM + punto y coma: así Excel en español abre las columnas bien.
  const csv = '﻿' + filasCsv.map((f) => f.join(';')).join('\n')
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }))
  const a = document.createElement('a')
  a.href = url
  a.download = `transformacion_${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

// ---------------------------------------------------------------------------
// AYUDAS DE PRESENTACIÓN
// ---------------------------------------------------------------------------
const hexDeColor = (nombre: string) => colores.value.find((c) => c.nombre === nombre)?.codigoHex || '#94a3b8'

const estiloCorte = (estado: string) =>
  ({
    EN_PROCESO: 'bg-amber-100 text-amber-800 border-amber-300',
    PARCIAL: 'bg-sky-100 text-sky-800 border-sky-300',
    RECIBIDO: 'bg-emerald-100 text-emerald-800 border-emerald-300',
    ANULADO: 'bg-rose-100 text-rose-800 border-rose-300',
  } as any)[estado] || 'bg-slate-100 text-slate-700 border-slate-300'

const textoCorte = (estado: string) =>
  ({
    EN_PROCESO: '✂️ En el taller',
    PARCIAL: '📦 Llegó una parte',
    RECIBIDO: '✅ Recibido completo',
    ANULADO: '🚫 Anulado',
  } as any)[estado] || estado

const fecha = (f: string) => new Date(f).toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' })

onMounted(async () => {
  await cargarBase()
  await cargarHistorial()
})
watch(pestania, (p) => {
  if (p === 'reporte' && !reporte.value) cargarReporte()
})
</script>

<template>
  <div class="max-w-7xl mx-auto pb-24">

    <!-- ===================== ENCABEZADO ===================== -->
    <div class="bg-gradient-to-r from-violet-600 via-purple-600 to-fuchsia-600 rounded-3xl p-6 md:p-8 text-white shadow-xl mb-6">
      <p class="text-violet-200 font-bold uppercase tracking-widest text-xs mb-1">Paso 2 de 4</p>
      <h1 class="text-3xl md:text-4xl font-black tracking-tight">✂️ Transformación</h1>
      <p class="text-violet-100 mt-2 max-w-3xl">
        Aquí la tela se vuelve prendas. Elige los <strong>rollos que se llevó el cortador</strong>,
        di <strong>en qué prenda los convirtió</strong> y, cuando el taller devuelva la producción,
        <strong>recíbela</strong> para que entre al almacén y se pueda vender.
      </p>

      <div class="mt-6 flex flex-wrap items-center gap-2 text-xs font-bold">
        <span class="bg-white/10 px-3 py-1.5 rounded-full">1 · 🧵 Rollos</span>
        <span class="opacity-50">→</span>
        <span class="bg-white/25 ring-2 ring-white px-3 py-1.5 rounded-full">2 · ✂️ Transformación</span>
        <span class="opacity-50">→</span>
        <span class="bg-white/10 px-3 py-1.5 rounded-full">3 · 🏬 Terminados</span>
        <span class="opacity-50">→</span>
        <span class="bg-white/10 px-3 py-1.5 rounded-full">4 · 🛒 Venta</span>
      </div>
    </div>

    <!-- ===================== AVISO ===================== -->
    <transition name="fade">
      <div
        v-if="aviso" class="mb-5 px-5 py-4 rounded-2xl font-bold border-2 shadow-sm"
        :class="aviso.tipo === 'ok' ? 'bg-emerald-50 border-emerald-300 text-emerald-800' : 'bg-rose-50 border-rose-300 text-rose-800'"
      >{{ aviso.texto }}</div>
    </transition>

    <!-- ===================== PESTAÑAS GRANDES ===================== -->
    <div class="grid grid-cols-3 gap-3 mb-6">
      <button
        @click="pestania = 'nuevo'"
        class="py-5 rounded-2xl font-black text-base md:text-lg shadow transition-all active:scale-95"
        :class="pestania === 'nuevo' ? 'bg-violet-600 text-white shadow-lg' : 'bg-white text-slate-600 hover:bg-slate-50'"
      >✂️ Nuevo Corte</button>
      <button
        @click="pestania = 'historial'"
        class="py-5 rounded-2xl font-black text-base md:text-lg shadow transition-all active:scale-95"
        :class="pestania === 'historial' ? 'bg-sky-600 text-white shadow-lg' : 'bg-white text-slate-600 hover:bg-slate-50'"
      >📋 Historial / Recibir</button>
      <button
        @click="pestania = 'reporte'"
        class="py-5 rounded-2xl font-black text-base md:text-lg shadow transition-all active:scale-95"
        :class="pestania === 'reporte' ? 'bg-emerald-600 text-white shadow-lg' : 'bg-white text-slate-600 hover:bg-slate-50'"
      >📈 Reporte</button>
    </div>

    <!-- ======================================================================
         A) NUEVO CORTE
         ================================================================== -->
    <div v-if="pestania === 'nuevo'" class="space-y-6">

      <!-- ---------- PASO 1: ELEGIR LOS ROLLOS ---------- -->
      <div class="bg-white rounded-3xl shadow-sm overflow-hidden">
        <div class="bg-gradient-to-r from-cyan-500 to-sky-600 px-6 py-5 text-white">
          <div class="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 class="text-2xl font-black flex items-center gap-2">
                <span class="bg-white/25 w-9 h-9 rounded-xl grid place-items-center text-lg">1</span>
                🧵 ¿Qué rollos se llevó el cortador?
              </h2>
              <p class="text-sky-100 text-sm mt-1">
                Toca los rollos. Por defecto se usa el rollo completo; si usó solo una parte, corrige los kilos.
              </p>
            </div>
            <div class="bg-white/20 rounded-2xl px-5 py-3 text-center">
              <p class="text-[11px] font-bold uppercase tracking-wider text-sky-100">Kilos elegidos</p>
              <p class="text-3xl font-black">{{ kilosUsados.toFixed(2) }}</p>
            </div>
          </div>
        </div>

        <div class="p-6">
          <!-- Filtro por color + atajos -->
          <div class="flex flex-wrap gap-2 mb-5 items-center">
            <button
              @click="filtroColorRollo = ''"
              class="px-4 py-2.5 rounded-xl font-bold text-sm border-2 transition-all"
              :class="!filtroColorRollo ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'"
            >Todos</button>
            <button
              v-for="c in coloresDeRollos" :key="c"
              @click="filtroColorRollo = c"
              class="flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-sm border-2 transition-all"
              :class="filtroColorRollo === c ? 'bg-sky-50 text-sky-800 border-sky-500' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'"
            >
              <span class="w-4 h-4 rounded border border-slate-300" :style="{ backgroundColor: hexDeColor(c) }"></span>
              {{ c }}
            </button>

            <div class="ml-auto flex gap-2">
              <button @click="usarTodosDelColor" class="bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-bold text-sm px-4 py-2.5 rounded-xl border-2 border-emerald-200">
                Marcar todos los visibles
              </button>
              <button v-if="rollosElegidos.length" @click="limpiarSeleccion" class="bg-slate-50 hover:bg-slate-100 text-slate-600 font-bold text-sm px-4 py-2.5 rounded-xl border-2 border-slate-200">
                Quitar todos
              </button>
            </div>
          </div>

          <p v-if="cargando" class="text-center py-10 text-slate-400 font-bold">Cargando rollos...</p>

          <div v-else-if="rollosVisibles.length === 0" class="bg-amber-50 border-2 border-amber-200 rounded-2xl p-8 text-center">
            <p class="text-4xl mb-2">🧵</p>
            <p class="font-black text-amber-900 text-lg">No hay tela disponible</p>
            <p class="text-amber-700 text-sm mt-1">
              Registra rollos primero en <strong>Almacén de Rollos</strong>.
            </p>
          </div>

          <!-- Tarjetas de rollo: grandes y táctiles -->
          <div v-else class="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            <div
              v-for="r in rollosVisibles" :key="r.id"
              @click="alternarRollo(r)"
              class="cursor-pointer rounded-2xl border-4 p-4 transition-all select-none"
              :class="estaSeleccionado(r.id)
                ? 'border-emerald-500 bg-emerald-50 shadow-lg scale-[1.02]'
                : 'border-slate-150 bg-white hover:border-slate-300 hover:shadow'"
            >
              <div class="flex items-start justify-between gap-2 mb-2">
                <div class="min-w-0">
                  <p class="font-black text-slate-800">{{ r.codigo }}</p>
                  <p class="text-xs font-bold text-slate-600 flex items-center gap-1.5">
                    <span class="w-3.5 h-3.5 rounded border border-slate-300 shrink-0" :style="{ backgroundColor: hexDeColor(r.color) }"></span>
                    {{ r.color }}
                  </p>
                </div>
                <span
                  class="w-7 h-7 rounded-lg grid place-items-center font-black text-sm shrink-0"
                  :class="estaSeleccionado(r.id) ? 'bg-emerald-500 text-white' : 'bg-slate-100 text-slate-300'"
                >✓</span>
              </div>

              <p class="text-2xl font-black text-slate-800">
                {{ Number(r.pesoActual).toFixed(2) }}<span class="text-sm text-slate-400"> kg libres</span>
              </p>
              <p v-if="Number(r.costoPorKilo) > 0" class="text-xs text-slate-500 mt-0.5">
                S/ {{ Number(r.costoPorKilo).toFixed(2) }}/kg
              </p>

              <!-- Cuántos kilos usó de este rollo (solo si está marcado) -->
              <div v-if="estaSeleccionado(r.id)" class="mt-3 pt-3 border-t-2 border-emerald-200" @click.stop>
                <label class="block text-[11px] font-black uppercase tracking-wider text-emerald-700 mb-1">Kilos usados</label>
                <input
                  v-model.number="seleccion[r.id]" type="number" step="0.001" min="0" :max="Number(r.pesoActual)"
                  class="w-full border-2 rounded-xl px-3 h-11 text-lg font-black text-slate-800 outline-none"
                  :class="Number(seleccion[r.id]) > Number(r.pesoActual) + 0.0001
                    ? 'border-rose-400 bg-rose-50 text-rose-700'
                    : 'border-emerald-300 focus:border-emerald-500'"
                />
                <p v-if="Number(seleccion[r.id]) > Number(r.pesoActual) + 0.0001" class="text-xs font-bold text-rose-600 mt-1">
                  Solo tiene {{ Number(r.pesoActual).toFixed(3) }} kg
                </p>
              </div>
            </div>
          </div>

          <!-- Resumen de lo elegido -->
          <div v-if="rollosElegidos.length" class="mt-5 bg-slate-50 border-2 border-slate-200 rounded-2xl p-4">
            <p class="text-xs font-black uppercase tracking-wider text-slate-500 mb-2">
              {{ rollosElegidos.length }} rollo(s) elegidos
            </p>
            <div class="flex flex-wrap gap-2">
              <span
                v-for="r in rollosElegidos" :key="r.id"
                class="inline-flex items-center gap-2 bg-white border-2 border-emerald-300 rounded-xl px-3 py-1.5 text-sm font-bold text-slate-700"
              >
                <span class="w-3 h-3 rounded-sm border border-slate-300" :style="{ backgroundColor: hexDeColor(r.color) }"></span>
                {{ r.codigo }} · {{ Number(r.pesoUsado).toFixed(2) }} kg
              </span>
            </div>
            <p v-if="costoTela > 0" class="text-sm font-bold text-violet-700 mt-3">
              💵 Costo de la tela usada: S/ {{ costoTela.toFixed(2) }}
            </p>
          </div>
        </div>
      </div>

      <!-- ---------- PASO 2: EN QUÉ PRENDA SE CONVIRTIÓ ---------- -->
      <div class="bg-white rounded-3xl shadow-sm overflow-hidden">
        <div class="bg-gradient-to-r from-violet-500 to-purple-600 px-6 py-5 text-white">
          <div class="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 class="text-2xl font-black flex items-center gap-2">
                <span class="bg-white/25 w-9 h-9 rounded-xl grid place-items-center text-lg">2</span>
                👕 ¿En qué prenda se transformó?
              </h2>
              <p class="text-violet-100 text-sm mt-1">
                Elige el tipo de prenda y llena la tabla: cuántas salieron de cada color y talla.
              </p>
            </div>
            <div class="bg-white/20 rounded-2xl px-5 py-3 text-center">
              <p class="text-[11px] font-bold uppercase tracking-wider text-violet-100">Prendas</p>
              <p class="text-3xl font-black">{{ totalPrendas }}</p>
            </div>
          </div>
        </div>

        <div class="p-6 space-y-5">
          <!-- Tipo de prenda -->
          <div>
            <label class="block text-xs font-black uppercase tracking-wider text-slate-600 mb-2">
              Tipo de prenda <span class="text-rose-500">*</span>
            </label>
            <select
              v-model="productoId"
              class="w-full border-2 border-slate-200 rounded-xl px-4 h-14 text-lg font-bold text-slate-700 focus:border-violet-500 outline-none"
            >
              <option value="">— Elige la prenda que se cortó —</option>
              <option v-for="p in productos" :key="p.id" :value="p.id">{{ p.nombre }} ({{ p.skuBase }})</option>
            </select>
          </div>

          <!-- Controles de la matriz -->
          <div class="grid md:grid-cols-2 gap-4">
            <div class="bg-slate-50 rounded-2xl p-4 border-2 border-slate-200">
              <label class="block text-xs font-black uppercase tracking-wider text-slate-600 mb-2">Agregar color (fila)</label>
              <div class="flex gap-2">
                <select v-model="colorNuevo" class="flex-1 border-2 border-slate-200 rounded-xl px-3 h-11 font-bold text-slate-700 focus:border-violet-500 outline-none">
                  <option value="">— Color —</option>
                  <option v-for="c in colores" :key="c.id" :value="c.nombre">{{ c.nombre }}</option>
                </select>
                <button @click="agregarColor" class="bg-violet-500 hover:bg-violet-600 text-white font-black px-5 h-11 rounded-xl shadow active:scale-95 transition-transform">+</button>
              </div>
              <button
                @click="copiarColoresDeRollos"
                class="mt-2 w-full bg-cyan-50 hover:bg-cyan-100 text-cyan-700 font-bold text-sm py-2.5 rounded-xl border-2 border-cyan-200"
              >⚡ Usar los colores de los rollos elegidos</button>
            </div>

            <div class="bg-slate-50 rounded-2xl p-4 border-2 border-slate-200">
              <label class="block text-xs font-black uppercase tracking-wider text-slate-600 mb-2">Agregar talla (columna)</label>
              <div class="flex gap-2">
                <input
                  v-model="nuevaTalla" type="text" placeholder="Ej. XXL" @keyup.enter="agregarTalla"
                  class="flex-1 border-2 border-slate-200 rounded-xl px-3 h-11 font-bold text-slate-700 uppercase focus:border-violet-500 outline-none"
                />
                <button @click="agregarTalla" class="bg-violet-500 hover:bg-violet-600 text-white font-black px-5 h-11 rounded-xl shadow active:scale-95 transition-transform">+</button>
              </div>
              <div class="flex flex-wrap gap-1.5 mt-2">
                <span v-for="t in tallas" :key="t" class="inline-flex items-center gap-1 bg-white border-2 border-slate-200 rounded-lg px-2 py-1 text-xs font-black text-slate-600">
                  {{ t }}
                  <button @click="quitarTalla(t)" class="text-rose-400 hover:text-rose-600">✕</button>
                </span>
              </div>
            </div>
          </div>

          <!-- LA MATRIZ -->
          <div v-if="filas.length === 0" class="bg-violet-50 border-2 border-dashed border-violet-300 rounded-2xl p-10 text-center">
            <p class="text-4xl mb-2">👕</p>
            <p class="font-black text-violet-900">Agrega al menos un color para empezar la tabla</p>
            <p class="text-violet-700 text-sm mt-1">Usa el botón ⚡ de arriba para cargar los colores de los rollos.</p>
          </div>

          <div v-else class="overflow-x-auto rounded-2xl border-2 border-slate-200">
            <table class="w-full text-sm">
              <thead class="bg-slate-100">
                <tr>
                  <th class="text-left px-4 py-3 font-black text-slate-700 uppercase text-xs tracking-wider sticky left-0 bg-slate-100">Color</th>
                  <th v-for="t in tallas" :key="t" class="px-2 py-3 font-black text-slate-700 text-center w-24">{{ t }}</th>
                  <th class="px-4 py-3 font-black text-violet-700 text-center uppercase text-xs tracking-wider">Total</th>
                  <th class="w-12"></th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(f, i) in filas" :key="f.color" class="border-t-2 border-slate-100 hover:bg-slate-50">
                  <td class="px-4 py-3 sticky left-0 bg-white">
                    <span class="flex items-center gap-2 font-black text-slate-800">
                      <span class="w-5 h-5 rounded-md border-2 border-slate-300 shrink-0" :style="{ backgroundColor: hexDeColor(f.color) }"></span>
                      {{ f.color }}
                    </span>
                  </td>
                  <td v-for="t in tallas" :key="t" class="px-2 py-2">
                    <input
                      v-model.number="f.cant[t]" type="number" min="0" placeholder="0"
                      class="w-full border-2 border-slate-200 rounded-xl h-12 text-center text-lg font-black text-slate-800 focus:border-violet-500 focus:bg-violet-50 outline-none"
                    />
                  </td>
                  <td class="px-4 py-3 text-center">
                    <span class="font-black text-xl text-violet-700">{{ totalFila(f) }}</span>
                  </td>
                  <td class="px-2">
                    <button @click="quitarColor(i)" class="text-rose-400 hover:text-rose-600 font-black text-lg">✕</button>
                  </td>
                </tr>
              </tbody>
              <tfoot class="bg-violet-50 border-t-4 border-violet-200">
                <tr>
                  <td class="px-4 py-3 font-black text-violet-900 uppercase text-xs tracking-wider sticky left-0 bg-violet-50">Total por talla</td>
                  <td v-for="t in tallas" :key="t" class="px-2 py-3 text-center font-black text-lg text-violet-800">{{ totalColumna(t) }}</td>
                  <td class="px-4 py-3 text-center font-black text-2xl text-violet-900">{{ totalPrendas }}</td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>

          <!-- Los números que importan: rendimiento y costo -->
          <div v-if="totalPrendas > 0 && kilosUsados > 0" class="grid sm:grid-cols-3 gap-3">
            <div class="bg-emerald-50 border-2 border-emerald-200 rounded-2xl p-4">
              <p class="text-[11px] font-black uppercase tracking-wider text-emerald-700">Rendimiento</p>
              <p class="text-3xl font-black text-emerald-700">{{ rendimiento.toFixed(2) }}</p>
              <p class="text-xs text-emerald-600 font-semibold">prendas por kilo de tela</p>
            </div>
            <div class="bg-violet-50 border-2 border-violet-200 rounded-2xl p-4">
              <p class="text-[11px] font-black uppercase tracking-wider text-violet-700">Costo de tela</p>
              <p class="text-3xl font-black text-violet-700">S/ {{ costoPorPrenda.toFixed(2) }}</p>
              <p class="text-xs text-violet-600 font-semibold">por cada prenda</p>
            </div>
            <div class="bg-sky-50 border-2 border-sky-200 rounded-2xl p-4">
              <p class="text-[11px] font-black uppercase tracking-wider text-sky-700">Tela usada</p>
              <p class="text-3xl font-black text-sky-700">{{ (kilosUsados / totalPrendas * 1000).toFixed(0) }}<span class="text-base"> g</span></p>
              <p class="text-xs text-sky-600 font-semibold">por cada prenda</p>
            </div>
          </div>
        </div>
      </div>

      <!-- ---------- PASO 3: DATOS Y GUARDAR ---------- -->
      <div class="bg-white rounded-3xl shadow-sm overflow-hidden">
        <div class="bg-gradient-to-r from-slate-700 to-slate-800 px-6 py-5 text-white">
          <h2 class="text-2xl font-black flex items-center gap-2">
            <span class="bg-white/20 w-9 h-9 rounded-xl grid place-items-center text-lg">3</span>
            📝 Datos del corte
          </h2>
          <p class="text-slate-300 text-sm mt-1">Opcional, pero ayuda mucho cuando hay que revisar algo después.</p>
        </div>

        <div class="p-6 space-y-5">
          <div class="grid md:grid-cols-3 gap-4">
            <div>
              <label class="block text-xs font-black uppercase tracking-wider text-slate-600 mb-2">Cortador</label>
              <input
                v-model="cortador" type="text" placeholder="Nombre de quien cortó"
                class="w-full border-2 border-slate-200 rounded-xl px-4 h-12 font-semibold text-slate-700 focus:border-slate-500 outline-none"
              />
            </div>
            <div>
              <label class="block text-xs font-black uppercase tracking-wider text-slate-600 mb-2">Taller que confecciona</label>
              <select v-model="tallerId" class="w-full border-2 border-slate-200 rounded-xl px-4 h-12 font-semibold text-slate-700 focus:border-slate-500 outline-none">
                <option value="">— Sin especificar —</option>
                <option v-for="t in talleres" :key="t.id" :value="t.id">{{ t.razonSocial }}</option>
              </select>
            </div>
            <div>
              <label class="block text-xs font-black uppercase tracking-wider text-slate-600 mb-2">N° de guía</label>
              <input
                v-model="numeroGuia" type="text" placeholder="Guía con la que salió"
                class="w-full border-2 border-slate-200 rounded-xl px-4 h-12 font-semibold text-slate-700 focus:border-slate-500 outline-none"
              />
            </div>
          </div>

          <div>
            <label class="block text-xs font-black uppercase tracking-wider text-slate-600 mb-2">Observación</label>
            <input
              v-model="observacion" type="text" placeholder="Cualquier nota sobre este corte"
              class="w-full border-2 border-slate-200 rounded-xl px-4 h-12 font-semibold text-slate-700 focus:border-slate-500 outline-none"
            />
          </div>

          <!-- Resumen final antes de guardar -->
          <div class="bg-gradient-to-r from-violet-50 to-fuchsia-50 border-2 border-violet-200 rounded-2xl p-5">
            <p class="text-xs font-black uppercase tracking-wider text-violet-700 mb-3">Resumen del corte</p>
            <div class="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
              <div>
                <p class="text-3xl font-black text-slate-800">{{ rollosElegidos.length }}</p>
                <p class="text-xs font-bold text-slate-500 uppercase">Rollos</p>
              </div>
              <div>
                <p class="text-3xl font-black text-sky-700">{{ kilosUsados.toFixed(2) }}</p>
                <p class="text-xs font-bold text-slate-500 uppercase">Kilos</p>
              </div>
              <div>
                <p class="text-3xl font-black text-violet-700">{{ totalPrendas }}</p>
                <p class="text-xs font-bold text-slate-500 uppercase">Prendas</p>
              </div>
              <div>
                <p class="text-3xl font-black text-emerald-700">S/ {{ costoTela.toFixed(2) }}</p>
                <p class="text-xs font-bold text-slate-500 uppercase">Costo tela</p>
              </div>
            </div>
          </div>

          <!-- Por qué no se puede guardar todavía -->
          <div v-if="razonBloqueo" class="bg-amber-50 border-2 border-amber-300 rounded-2xl px-5 py-4 font-bold text-amber-800">
            ⚠️ {{ razonBloqueo }}
          </div>

          <div class="flex flex-wrap gap-3">
            <button
              @click="guardarCorte" :disabled="guardando || !puedeGuardar"
              class="flex-1 min-w-[280px] bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-700 hover:to-fuchsia-700
                     disabled:from-slate-300 disabled:to-slate-400 disabled:cursor-not-allowed
                     text-white font-black text-xl py-6 rounded-2xl shadow-lg active:scale-95 transition-all"
            >
              {{ guardando ? 'Registrando...' : '✂️ Registrar Transformación' }}
            </button>
            <button @click="limpiarTodo" class="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold px-8 py-6 rounded-2xl transition-colors">
              Limpiar todo
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- ======================================================================
         B) HISTORIAL Y RECEPCIÓN
         ================================================================== -->
    <div v-if="pestania === 'historial'" class="space-y-5">
      <div class="bg-sky-50 border-2 border-sky-200 rounded-2xl p-5">
        <p class="font-black text-sky-900 mb-1">📋 Cortes registrados</p>
        <p class="text-sm text-sky-800">
          Los cortes <strong>en el taller</strong> todavía no están en el almacén. Cuando el taller
          devuelva la producción, pulsa <strong>«Recibir»</strong>: ahí las prendas entran a la bodega
          y recién se pueden vender o trasladar.
        </p>
      </div>

      <div class="flex flex-wrap gap-2">
        <button
          v-for="opcion in [
            { v: '', t: 'Todos', c: 'slate' },
            { v: 'EN_PROCESO', t: '✂️ En el taller', c: 'amber' },
            { v: 'PARCIAL', t: '📦 Llegó una parte', c: 'sky' },
            { v: 'RECIBIDO', t: '✅ Recibidos', c: 'emerald' },
            { v: 'ANULADO', t: '🚫 Anulados', c: 'rose' },
          ]"
          :key="opcion.v"
          @click="filtroEstado = opcion.v"
          class="px-5 py-3 rounded-xl font-bold text-sm border-2 transition-all"
          :class="filtroEstado === opcion.v ? 'bg-slate-800 text-white border-slate-800 shadow' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'"
        >{{ opcion.t }}</button>
      </div>

      <p v-if="cargandoHistorial" class="text-center py-16 text-slate-400 font-bold">Cargando...</p>

      <div v-else-if="historial.length === 0" class="bg-white rounded-3xl p-14 text-center shadow-sm">
        <p class="text-6xl mb-4">✂️</p>
        <p class="text-xl font-black text-slate-700">Todavía no hay cortes registrados</p>
        <p class="text-slate-500 mt-2">Usa la pestaña «Nuevo Corte» para registrar el primero.</p>
      </div>

      <div v-else class="space-y-3">
        <div
          v-for="c in historial" :key="c.id"
          class="bg-white rounded-2xl shadow-sm hover:shadow-md transition-shadow overflow-hidden border-2 border-slate-100"
        >
          <div class="p-5">
            <div class="flex flex-wrap items-start justify-between gap-4">
              <div class="min-w-0">
                <div class="flex items-center gap-3 flex-wrap">
                  <p class="text-xl font-black text-slate-800">{{ c.codigo }}</p>
                  <span class="text-[11px] font-black uppercase tracking-wider px-3 py-1 rounded-full border-2" :class="estiloCorte(c.estado)">
                    {{ textoCorte(c.estado) }}
                  </span>
                </div>
                <p class="font-bold text-slate-700 mt-1">👕 {{ c.producto?.nombre }}</p>
                <p class="text-xs text-slate-500 mt-1">
                  📅 {{ fecha(c.fecha) }}
                  <span v-if="c.cortador"> · ✂️ {{ c.cortador }}</span>
                  <span v-if="c.taller"> · 🧵 {{ c.taller.razonSocial }}</span>
                  <span v-if="c.numeroGuia"> · 📄 Guía {{ c.numeroGuia }}</span>
                </p>
              </div>

              <!-- Cifras del corte -->
              <div class="flex gap-5 text-center shrink-0">
                <div>
                  <p class="text-2xl font-black text-sky-700">{{ Number(c.pesoTotalUsado).toFixed(1) }}</p>
                  <p class="text-[10px] font-bold uppercase text-slate-500">kg usados</p>
                </div>
                <div>
                  <p class="text-2xl font-black text-violet-700">{{ c.prendasPlanificadas }}</p>
                  <p class="text-[10px] font-bold uppercase text-slate-500">cortadas</p>
                </div>
                <div>
                  <p class="text-2xl font-black" :class="c.prendasRecibidas >= c.prendasPlanificadas ? 'text-emerald-600' : 'text-amber-600'">
                    {{ c.prendasRecibidas }}
                  </p>
                  <p class="text-[10px] font-bold uppercase text-slate-500">recibidas</p>
                </div>
              </div>
            </div>

            <!-- Rollos que entraron -->
            <div v-if="c.rollos?.length" class="flex flex-wrap gap-1.5 mt-4">
              <span
                v-for="lr in c.rollos" :key="lr.id"
                class="inline-flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 text-xs font-bold text-slate-600"
              >
                <span class="w-3 h-3 rounded-sm border border-slate-300" :style="{ backgroundColor: hexDeColor(lr.rollo?.color) }"></span>
                {{ lr.rollo?.codigo }} · {{ Number(lr.pesoUsado).toFixed(2) }} kg
              </span>
            </div>

            <!-- Barra de avance: cuánto del corte ya volvió del taller -->
            <div v-if="c.estado !== 'ANULADO'" class="mt-4">
              <div class="flex justify-between text-xs font-bold text-slate-500 mb-1">
                <span>Avance de recepción</span>
                <span>{{ c.prendasRecibidas }} / {{ c.prendasPlanificadas }}</span>
              </div>
              <div class="h-2.5 bg-slate-100 rounded-full overflow-hidden">
                <div
                  class="h-full rounded-full transition-all"
                  :class="c.prendasRecibidas >= c.prendasPlanificadas ? 'bg-emerald-500' : 'bg-amber-500'"
                  :style="{ width: Math.min(100, (c.prendasRecibidas / (c.prendasPlanificadas || 1)) * 100) + '%' }"
                ></div>
              </div>
            </div>

            <!-- Acciones grandes -->
            <div class="flex flex-wrap gap-2 mt-4">
              <button
                v-if="c.estado === 'EN_PROCESO' || c.estado === 'PARCIAL'"
                @click="abrirRecepcion(c)"
                class="flex-1 min-w-[200px] bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700
                       text-white font-black py-4 rounded-xl shadow active:scale-95 transition-all"
              >📥 Recibir del taller → Almacén</button>

              <button
                @click="verDetalle(c)"
                class="bg-sky-50 hover:bg-sky-100 text-sky-700 font-bold px-6 py-4 rounded-xl border-2 border-sky-200"
              >👁️ Ver detalle</button>

              <button
                v-if="c.estado !== 'ANULADO' && c.prendasRecibidas === 0"
                @click="anularCorte(c)"
                class="bg-rose-50 hover:bg-rose-100 text-rose-600 font-bold px-6 py-4 rounded-xl border-2 border-rose-200"
              >🚫 Anular</button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- ======================================================================
         C) REPORTE
         ================================================================== -->
    <div v-if="pestania === 'reporte'" class="space-y-5">
      <div class="bg-white rounded-2xl p-5 shadow-sm flex flex-wrap gap-3 items-end">
        <div>
          <label class="block text-xs font-black uppercase tracking-wider text-slate-600 mb-1">Desde</label>
          <input v-model="repDesde" type="date" class="border-2 border-slate-200 rounded-xl px-4 h-12 font-bold text-slate-700 focus:border-emerald-500 outline-none" />
        </div>
        <div>
          <label class="block text-xs font-black uppercase tracking-wider text-slate-600 mb-1">Hasta</label>
          <input v-model="repHasta" type="date" class="border-2 border-slate-200 rounded-xl px-4 h-12 font-bold text-slate-700 focus:border-emerald-500 outline-none" />
        </div>
        <button @click="cargarReporte" class="bg-emerald-600 hover:bg-emerald-700 text-white font-black px-7 h-12 rounded-xl shadow active:scale-95 transition-transform">
          🔎 Ver reporte
        </button>
        <button v-if="reporte" @click="exportarReporte" class="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold px-6 h-12 rounded-xl">
          ⬇️ Exportar CSV
        </button>
      </div>

      <p v-if="cargandoReporte" class="text-center py-16 text-slate-400 font-bold">Calculando...</p>

      <template v-else-if="reporte">
        <!-- Totales -->
        <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div class="bg-white rounded-2xl p-5 border-l-8 border-sky-500 shadow-sm">
            <p class="text-[11px] font-black uppercase tracking-wider text-slate-500">Tela consumida</p>
            <p class="text-3xl font-black text-sky-600 mt-1">{{ reporte.totales.kilosUsados.toFixed(1) }}<span class="text-lg"> kg</span></p>
            <p class="text-xs text-slate-500 mt-1">{{ reporte.totales.cortes }} cortes</p>
          </div>
          <div class="bg-white rounded-2xl p-5 border-l-8 border-violet-500 shadow-sm">
            <p class="text-[11px] font-black uppercase tracking-wider text-slate-500">Prendas cortadas</p>
            <p class="text-3xl font-black text-violet-600 mt-1">{{ reporte.totales.prendasCortadas }}</p>
            <p class="text-xs text-slate-500 mt-1">Lo que salió al taller</p>
          </div>
          <div class="bg-white rounded-2xl p-5 border-l-8 border-emerald-500 shadow-sm">
            <p class="text-[11px] font-black uppercase tracking-wider text-slate-500">Prendas recibidas</p>
            <p class="text-3xl font-black text-emerald-600 mt-1">{{ reporte.totales.prendasRecibidas }}</p>
            <p class="text-xs text-slate-500 mt-1">
              <span v-if="reporte.totales.prendasPendientes > 0" class="text-amber-600 font-bold">
                {{ reporte.totales.prendasPendientes }} aún en el taller
              </span>
              <span v-else>Todo volvió</span>
            </p>
          </div>
          <div class="bg-white rounded-2xl p-5 border-l-8 border-amber-500 shadow-sm">
            <p class="text-[11px] font-black uppercase tracking-wider text-slate-500">Rendimiento</p>
            <p class="text-3xl font-black text-amber-600 mt-1">{{ reporte.totales.rendimientoPrendasPorKilo.toFixed(2) }}</p>
            <p class="text-xs text-slate-500 mt-1">prendas por kilo de tela</p>
          </div>
        </div>

        <div class="bg-violet-50 border-2 border-violet-200 rounded-2xl p-5 flex flex-wrap gap-8">
          <div>
            <p class="text-[11px] font-black uppercase tracking-wider text-violet-700">Costo total de tela</p>
            <p class="text-2xl font-black text-violet-800">S/ {{ reporte.totales.costoTela.toFixed(2) }}</p>
          </div>
          <div>
            <p class="text-[11px] font-black uppercase tracking-wider text-violet-700">Costo de tela por prenda</p>
            <p class="text-2xl font-black text-violet-800">S/ {{ reporte.totales.costoTelaPorPrenda.toFixed(2) }}</p>
          </div>
        </div>

        <!-- Por prenda -->
        <div v-if="reporte.porProducto.length" class="bg-white rounded-2xl shadow-sm overflow-hidden">
          <div class="bg-slate-100 px-5 py-3">
            <p class="font-black text-slate-700 uppercase text-xs tracking-wider">Por tipo de prenda</p>
          </div>
          <div class="overflow-x-auto">
            <table class="w-full text-sm">
              <thead class="bg-slate-50 text-xs uppercase tracking-wider text-slate-500 font-black">
                <tr>
                  <th class="text-left px-5 py-3">Prenda</th>
                  <th class="px-4 py-3 text-center">Cortes</th>
                  <th class="px-4 py-3 text-center">Kilos</th>
                  <th class="px-4 py-3 text-center">Cortadas</th>
                  <th class="px-4 py-3 text-center">Recibidas</th>
                  <th class="px-4 py-3 text-center">Prendas/kg</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="p in reporte.porProducto" :key="p.producto" class="border-t border-slate-100 hover:bg-slate-50">
                  <td class="px-5 py-3 font-bold text-slate-800">{{ p.producto }}</td>
                  <td class="px-4 py-3 text-center font-semibold text-slate-600">{{ p.cortes }}</td>
                  <td class="px-4 py-3 text-center font-black text-sky-700">{{ p.kilos.toFixed(2) }}</td>
                  <td class="px-4 py-3 text-center font-black text-violet-700">{{ p.cortadas }}</td>
                  <td class="px-4 py-3 text-center font-black text-emerald-700">{{ p.recibidas }}</td>
                  <td class="px-4 py-3 text-center font-black text-amber-700">{{ p.rendimiento.toFixed(2) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- Por talla y por color -->
        <div class="grid md:grid-cols-2 gap-4">
          <div class="bg-white rounded-2xl p-5 shadow-sm">
            <p class="font-black text-slate-700 uppercase text-xs tracking-wider mb-3">Prendas por talla</p>
            <div class="space-y-2">
              <div v-for="t in reporte.porTalla" :key="t.talla" class="flex items-center gap-3">
                <span class="w-14 font-black text-slate-700">{{ t.talla }}</span>
                <div class="flex-1 h-7 bg-slate-100 rounded-lg overflow-hidden">
                  <div
                    class="h-full bg-gradient-to-r from-violet-500 to-fuchsia-500 rounded-lg"
                    :style="{ width: Math.max(4, (t.cantidad / (reporte.porTalla[0]?.cantidad || 1)) * 100) + '%' }"
                  ></div>
                </div>
                <span class="w-16 text-right font-black text-slate-800">{{ t.cantidad }}</span>
              </div>
            </div>
          </div>

          <div class="bg-white rounded-2xl p-5 shadow-sm">
            <p class="font-black text-slate-700 uppercase text-xs tracking-wider mb-3">Prendas por color</p>
            <div class="space-y-2">
              <div v-for="c in reporte.porColor" :key="c.color" class="flex items-center gap-3">
                <span class="w-5 h-5 rounded-md border-2 border-slate-300 shrink-0" :style="{ backgroundColor: hexDeColor(c.color) }"></span>
                <span class="w-24 font-bold text-slate-700 truncate text-sm">{{ c.color }}</span>
                <div class="flex-1 h-7 bg-slate-100 rounded-lg overflow-hidden">
                  <div
                    class="h-full bg-gradient-to-r from-cyan-500 to-sky-500 rounded-lg"
                    :style="{ width: Math.max(4, (c.cantidad / (reporte.porColor[0]?.cantidad || 1)) * 100) + '%' }"
                  ></div>
                </div>
                <span class="w-16 text-right font-black text-slate-800">{{ c.cantidad }}</span>
              </div>
            </div>
          </div>
        </div>
      </template>
    </div>

    <!-- ===================== MODAL: RECIBIR ===================== -->
    <div v-if="modalRecibir" class="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" @click.self="modalRecibir = null">
      <div class="bg-white rounded-3xl w-full max-w-3xl shadow-2xl overflow-hidden max-h-[92vh] flex flex-col">
        <div class="bg-gradient-to-r from-emerald-500 to-teal-600 px-6 py-5 text-white flex items-start justify-between">
          <div>
            <h3 class="text-2xl font-black">📥 Recibir del taller</h3>
            <p class="text-emerald-50 text-sm mt-1">
              {{ modalRecibir.codigo }} · {{ modalRecibir.producto?.nombre }}
            </p>
          </div>
          <button @click="modalRecibir = null" class="text-white/80 hover:text-white text-3xl leading-none">&times;</button>
        </div>

        <div class="p-6 overflow-y-auto space-y-5">
          <div class="bg-emerald-50 border-2 border-emerald-200 rounded-2xl p-4 text-sm text-emerald-900">
            Cuenta las prendas que <strong>realmente llegaron</strong>. Puede ser menos de lo cortado
            (fallas, mermas): se registra lo que entró de verdad. Al confirmar, estas prendas
            <strong>entran a la bodega y ya se pueden vender</strong>.
          </div>

          <div>
            <label class="block text-xs font-black uppercase tracking-wider text-slate-600 mb-2">
              ¿A qué bodega entra? <span class="text-rose-500">*</span>
            </label>
            <select
              v-model="bodegaDestinoId"
              class="w-full border-2 border-slate-200 rounded-xl px-4 h-14 text-lg font-bold text-slate-700 focus:border-emerald-500 outline-none"
            >
              <option value="">— Elige la bodega —</option>
              <option v-for="b in bodegas" :key="b.id" :value="b.id">{{ b.nombre }} ({{ b.tipo }})</option>
            </select>
          </div>

          <div class="overflow-x-auto rounded-2xl border-2 border-slate-200">
            <table class="w-full text-sm">
              <thead class="bg-slate-100 text-xs uppercase tracking-wider text-slate-600 font-black">
                <tr>
                  <th class="text-left px-4 py-3">Color</th>
                  <th class="px-3 py-3 text-center">Talla</th>
                  <th class="px-3 py-3 text-center">Cortadas</th>
                  <th class="px-3 py-3 text-center">Ya recibidas</th>
                  <th class="px-3 py-3 text-center">Falta</th>
                  <th class="px-3 py-3 text-center w-32">Llegaron ahora</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="d in modalRecibir.detalles" :key="d.id" class="border-t border-slate-100">
                  <td class="px-4 py-3">
                    <span class="flex items-center gap-2 font-bold text-slate-800">
                      <span class="w-4 h-4 rounded border border-slate-300 shrink-0" :style="{ backgroundColor: hexDeColor(d.color) }"></span>
                      {{ d.color }}
                    </span>
                  </td>
                  <td class="px-3 py-3 text-center font-black text-slate-700">{{ d.talla }}</td>
                  <td class="px-3 py-3 text-center font-semibold text-slate-600">{{ d.cantidad }}</td>
                  <td class="px-3 py-3 text-center font-semibold text-emerald-600">{{ d.cantidadRecibida }}</td>
                  <td class="px-3 py-3 text-center font-black" :class="d.cantidad - d.cantidadRecibida > 0 ? 'text-amber-600' : 'text-slate-300'">
                    {{ d.cantidad - d.cantidadRecibida }}
                  </td>
                  <td class="px-3 py-2">
                    <input
                      v-model.number="recibidos[clave(d.color, d.talla)]"
                      type="number" min="0" :max="d.cantidad - d.cantidadRecibida" placeholder="0"
                      :disabled="d.cantidad - d.cantidadRecibida <= 0"
                      class="w-full border-2 border-slate-200 rounded-xl h-12 text-center text-lg font-black text-slate-800
                             focus:border-emerald-500 focus:bg-emerald-50 outline-none disabled:bg-slate-50 disabled:text-slate-300"
                    />
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <div class="bg-slate-50 border-2 border-slate-200 rounded-2xl p-5 text-center">
            <p class="text-xs font-black uppercase tracking-wider text-slate-500">Total que entra al almacén</p>
            <p class="text-5xl font-black text-emerald-600 mt-1">{{ totalARecibir }}</p>
            <p class="text-sm text-slate-500 font-semibold">prendas</p>
          </div>
        </div>

        <div class="p-6 border-t-2 border-slate-100 flex flex-wrap gap-3">
          <button
            @click="confirmarRecepcion" :disabled="guardando || totalARecibir <= 0 || !bodegaDestinoId"
            class="flex-1 min-w-[240px] bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700
                   disabled:from-slate-300 disabled:to-slate-400 disabled:cursor-not-allowed
                   text-white font-black text-lg py-5 rounded-2xl shadow-lg active:scale-95 transition-all"
          >{{ guardando ? 'Registrando...' : `✅ Confirmar ingreso de ${totalARecibir} prendas` }}</button>
          <button @click="modalRecibir = null" class="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold px-7 py-5 rounded-2xl">Cancelar</button>
        </div>
      </div>
    </div>

    <!-- ===================== MODAL: DETALLE ===================== -->
    <div v-if="modalDetalle" class="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" @click.self="modalDetalle = null">
      <div class="bg-white rounded-3xl w-full max-w-3xl shadow-2xl overflow-hidden max-h-[92vh] flex flex-col">
        <div class="bg-slate-800 px-6 py-5 text-white flex items-start justify-between">
          <div>
            <h3 class="text-2xl font-black">{{ modalDetalle.codigo }}</h3>
            <p class="text-slate-300 text-sm mt-1">
              {{ modalDetalle.producto?.nombre }} · {{ fecha(modalDetalle.fecha) }}
            </p>
          </div>
          <button @click="modalDetalle = null" class="text-white/80 hover:text-white text-3xl leading-none">&times;</button>
        </div>

        <div class="p-6 overflow-y-auto space-y-6">
          <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
            <div class="bg-sky-50 rounded-xl p-3 border-2 border-sky-200">
              <p class="text-2xl font-black text-sky-700">{{ Number(modalDetalle.pesoTotalUsado).toFixed(2) }}</p>
              <p class="text-[10px] font-bold uppercase text-slate-500">kg de tela</p>
            </div>
            <div class="bg-violet-50 rounded-xl p-3 border-2 border-violet-200">
              <p class="text-2xl font-black text-violet-700">{{ modalDetalle.prendasPlanificadas }}</p>
              <p class="text-[10px] font-bold uppercase text-slate-500">cortadas</p>
            </div>
            <div class="bg-emerald-50 rounded-xl p-3 border-2 border-emerald-200">
              <p class="text-2xl font-black text-emerald-700">{{ modalDetalle.prendasRecibidas }}</p>
              <p class="text-[10px] font-bold uppercase text-slate-500">recibidas</p>
            </div>
            <div class="bg-amber-50 rounded-xl p-3 border-2 border-amber-200">
              <p class="text-2xl font-black text-amber-700">S/ {{ Number(modalDetalle.costoTelaTotal).toFixed(2) }}</p>
              <p class="text-[10px] font-bold uppercase text-slate-500">costo tela</p>
            </div>
          </div>

          <div>
            <p class="text-xs font-black uppercase tracking-wider text-slate-500 mb-3">🧵 Rollos que entraron al corte</p>
            <div class="space-y-2">
              <div v-for="lr in modalDetalle.rollos" :key="lr.id" class="flex items-center gap-3 p-3 bg-slate-50 border-2 border-slate-200 rounded-xl">
                <span class="w-6 h-6 rounded-md border-2 border-slate-300 shrink-0" :style="{ backgroundColor: hexDeColor(lr.rollo?.color) }"></span>
                <div class="flex-1 min-w-0">
                  <p class="font-black text-slate-800">{{ lr.rollo?.codigo }}</p>
                  <p class="text-xs text-slate-500">{{ lr.rollo?.color }}<span v-if="lr.rollo?.descripcion"> · {{ lr.rollo.descripcion }}</span></p>
                </div>
                <div class="text-right shrink-0">
                  <p class="font-black text-slate-800">{{ Number(lr.pesoUsado).toFixed(3) }} kg</p>
                  <p v-if="Number(lr.costoPorKilo) > 0" class="text-xs text-slate-500">S/ {{ Number(lr.costoPorKilo).toFixed(2) }}/kg</p>
                </div>
              </div>
            </div>
          </div>

          <div>
            <p class="text-xs font-black uppercase tracking-wider text-slate-500 mb-3">👕 Prendas por color y talla</p>
            <div class="overflow-x-auto rounded-xl border-2 border-slate-200">
              <table class="w-full text-sm">
                <thead class="bg-slate-100 text-xs uppercase tracking-wider text-slate-600 font-black">
                  <tr>
                    <th class="text-left px-4 py-2.5">Color</th>
                    <th class="px-3 py-2.5 text-center">Talla</th>
                    <th class="px-3 py-2.5 text-center">Cortadas</th>
                    <th class="px-3 py-2.5 text-center">Recibidas</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="d in modalDetalle.detalles" :key="d.id" class="border-t border-slate-100">
                    <td class="px-4 py-2.5">
                      <span class="flex items-center gap-2 font-bold text-slate-700">
                        <span class="w-4 h-4 rounded border border-slate-300" :style="{ backgroundColor: hexDeColor(d.color) }"></span>
                        {{ d.color }}
                      </span>
                    </td>
                    <td class="px-3 py-2.5 text-center font-black text-slate-700">{{ d.talla }}</td>
                    <td class="px-3 py-2.5 text-center font-semibold text-violet-700">{{ d.cantidad }}</td>
                    <td class="px-3 py-2.5 text-center font-black" :class="d.cantidadRecibida >= d.cantidad ? 'text-emerald-600' : 'text-amber-600'">
                      {{ d.cantidadRecibida }}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <div v-if="modalDetalle.cortador || modalDetalle.taller || modalDetalle.numeroGuia || modalDetalle.observacion"
               class="bg-slate-50 rounded-xl p-4 text-sm text-slate-600 space-y-1 border-2 border-slate-200">
            <p v-if="modalDetalle.cortador">✂️ <strong>Cortador:</strong> {{ modalDetalle.cortador }}</p>
            <p v-if="modalDetalle.taller">🧵 <strong>Taller:</strong> {{ modalDetalle.taller.razonSocial }}</p>
            <p v-if="modalDetalle.numeroGuia">📄 <strong>Guía:</strong> {{ modalDetalle.numeroGuia }}</p>
            <p v-if="modalDetalle.observacion">📝 {{ modalDetalle.observacion }}</p>
          </div>
        </div>
      </div>
    </div>

  </div>
</template>

<style scoped>
.fade-enter-active, .fade-leave-active { transition: opacity .2s ease, transform .2s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; transform: translateY(-6px); }
</style>
