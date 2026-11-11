<script setup lang="ts">
/**
 * ALMACÉN DE TELA EN ROLLOS
 * ===========================================================================
 * Primer paso del recorrido de la tela:
 *
 *    [ 1. ROLLOS ] → 2. Transformación → 3. Terminados → 4. Venta
 *
 * Aquí se registra la tela tal como llega: en rollos, pesados en kilos y con
 * su color. Cada rollo físico es una tarjeta. Si llegan 20 rollos, hay 20
 * tarjetas, porque después el cortador tiene que poder elegir EXACTAMENTE
 * los rollos que se lleva viendo el peso y el color de cada uno.
 */
import { ref, onMounted, computed } from 'vue'
import api from '../api/axios'

// ---------------------------------------------------------------------------
// ESTADO
// ---------------------------------------------------------------------------
const rollos = ref<any[]>([])
const resumen = ref<any>(null)
const colores = ref<any[]>([])
const proveedores = ref<any[]>([])
const cargando = ref(true)
const guardando = ref(false)

// Avisos no bloqueantes (nunca un alert que corte el trabajo)
const aviso = ref<{ texto: string; tipo: 'ok' | 'error' } | null>(null)
let timerAviso: ReturnType<typeof setTimeout> | null = null
const avisar = (texto: string, tipo: 'ok' | 'error' = 'ok') => {
  aviso.value = { texto, tipo }
  if (timerAviso) clearTimeout(timerAviso)
  timerAviso = setTimeout(() => (aviso.value = null), 6000)
}

// ---------------------------------------------------------------------------
// FILTROS
// ---------------------------------------------------------------------------
const filtroTexto = ref('')
const filtroColor = ref('')
const filtroEstado = ref('')

const rollosFiltrados = computed(() => {
  const txt = filtroTexto.value.trim().toLowerCase()
  return rollos.value.filter((r) => {
    if (filtroColor.value && r.color !== filtroColor.value) return false
    if (filtroEstado.value && r.estado !== filtroEstado.value) return false
    if (!txt) return true
    return `${r.codigo} ${r.color} ${r.descripcion || ''} ${r.proveedor?.razonSocial || ''}`
      .toLowerCase()
      .includes(txt)
  })
})

const coloresEnStock = computed(() => {
  const set = new Set(rollos.value.map((r) => r.color))
  return [...set].sort()
})

const kilosFiltrados = computed(() =>
  rollosFiltrados.value.reduce((s, r) => s + Number(r.pesoActual), 0),
)

// ---------------------------------------------------------------------------
// CARGA
// ---------------------------------------------------------------------------
const cargar = async () => {
  cargando.value = true
  try {
    const [resR, resS, resC, resP] = await Promise.all([
      api.get('/rollos'),
      api.get('/rollos/resumen'),
      api.get('/colores'),
      api.get('/compras/proveedores'),
    ])
    rollos.value = resR.data
    resumen.value = resS.data
    colores.value = resC.data
    proveedores.value = resP.data
  } catch (e: any) {
    avisar('No se pudo cargar el almacén de rollos: ' + (e.response?.data?.message || e.message), 'error')
  } finally {
    cargando.value = false
  }
}
onMounted(cargar)

// ---------------------------------------------------------------------------
// REGISTRO DE ROLLOS
// ---------------------------------------------------------------------------
// El caso real: llega una compra de varios rollos del mismo color. En vez de
// llenar un formulario por rollo, se escribe un peso y Enter, otro peso y
// Enter... y al final se guardan todos de golpe.
const panelAbierto = ref(false)
const form = ref({
  color: '',
  colorCodigo: '',
  descripcion: '',
  costoPorKilo: 0,
  proveedorId: '' as any,
  observacion: '',
})
const pesos = ref<number[]>([])
const pesoNuevo = ref<number | null>(null)
const inputPeso = ref<HTMLInputElement | null>(null)

const agregarPeso = () => {
  const p = Number(pesoNuevo.value)
  if (!p || p <= 0) {
    avisar('Escribe el peso del rollo en kilos (ej. 24.5).', 'error')
    return
  }
  pesos.value.push(Number(p.toFixed(3)))
  pesoNuevo.value = null
  inputPeso.value?.focus()
}
const quitarPeso = (i: number) => pesos.value.splice(i, 1)

// Atajo para cuando todos los rollos pesan parecido
const pesoRepetido = ref<number | null>(null)
const cantidadRepetida = ref<number>(1)
const agregarVarios = () => {
  const p = Number(pesoRepetido.value)
  const n = Math.trunc(Number(cantidadRepetida.value) || 0)
  if (!p || p <= 0 || n <= 0) {
    avisar('Indica el peso y cuántos rollos de ese peso llegaron.', 'error')
    return
  }
  for (let k = 0; k < n; k++) pesos.value.push(Number(p.toFixed(3)))
  pesoRepetido.value = null
  cantidadRepetida.value = 1
}

const kilosARegistrar = computed(() => pesos.value.reduce((s, p) => s + p, 0))
const costoARegistrar = computed(() => kilosARegistrar.value * Number(form.value.costoPorKilo || 0))

const alElegirColor = () => {
  const c = colores.value.find((x) => x.nombre === form.value.color)
  form.value.colorCodigo = c?.codigo || ''
}

const limpiarForm = () => {
  form.value = { color: '', colorCodigo: '', descripcion: '', costoPorKilo: 0, proveedorId: '', observacion: '' }
  pesos.value = []
  pesoNuevo.value = null
}

const guardar = async () => {
  if (!form.value.color.trim()) return avisar('Elige el color de la tela.', 'error')
  if (pesos.value.length === 0) return avisar('Agrega el peso de al menos un rollo.', 'error')

  guardando.value = true
  try {
    const { data } = await api.post('/rollos', {
      color: form.value.color.trim(),
      colorCodigo: form.value.colorCodigo || null,
      descripcion: form.value.descripcion.trim() || null,
      costoPorKilo: Number(form.value.costoPorKilo) || 0,
      proveedorId: form.value.proveedorId ? Number(form.value.proveedorId) : null,
      observacion: form.value.observacion.trim() || null,
      pesos: pesos.value,
    })
    avisar(`✅ ${data.cantidad} rollo(s) registrados — ${kilosARegistrar.value.toFixed(2)} kg de ${form.value.color}.`)
    limpiarForm()
    panelAbierto.value = false
    await cargar()
  } catch (e: any) {
    avisar(e.response?.data?.message || 'No se pudo registrar.', 'error')
  } finally {
    guardando.value = false
  }
}

// ---------------------------------------------------------------------------
// AJUSTE DE PESO (reconteo en balanza o tela devuelta)
// ---------------------------------------------------------------------------
const modalAjuste = ref<any>(null)
const pesoReal = ref<number | null>(null)
const motivoAjuste = ref('')

const abrirAjuste = (rollo: any) => {
  modalAjuste.value = rollo
  pesoReal.value = Number(rollo.pesoActual)
  motivoAjuste.value = ''
}
const confirmarAjuste = async () => {
  if (pesoReal.value === null || Number(pesoReal.value) < 0) {
    return avisar('El peso real no puede ser negativo.', 'error')
  }
  guardando.value = true
  try {
    await api.patch(`/rollos/${modalAjuste.value.id}/peso`, {
      pesoReal: Number(pesoReal.value),
      motivo: motivoAjuste.value.trim() || undefined,
    })
    avisar(`✅ ${modalAjuste.value.codigo} quedó en ${Number(pesoReal.value).toFixed(3)} kg.`)
    modalAjuste.value = null
    await cargar()
  } catch (e: any) {
    avisar(e.response?.data?.message || 'No se pudo ajustar.', 'error')
  } finally {
    guardando.value = false
  }
}

// ---------------------------------------------------------------------------
// ANULAR (solo rollos que nunca se usaron)
// ---------------------------------------------------------------------------
const anular = async (rollo: any) => {
  if (!confirm(`¿Anular el rollo ${rollo.codigo}? Se usa cuando se registró por error.`)) return
  try {
    await api.patch(`/rollos/${rollo.id}/anular`, { motivo: 'Registrado por error' })
    avisar(`${rollo.codigo} anulado.`)
    await cargar()
  } catch (e: any) {
    avisar(e.response?.data?.message || 'No se pudo anular.', 'error')
  }
}

// ---------------------------------------------------------------------------
// HISTORIAL DE UN ROLLO
// ---------------------------------------------------------------------------
const modalHistorial = ref<any>(null)
const verHistorial = async (rollo: any) => {
  try {
    const { data } = await api.get(`/rollos/${rollo.id}/historial`)
    modalHistorial.value = data
  } catch (e: any) {
    avisar(e.response?.data?.message || 'No se pudo abrir el historial.', 'error')
  }
}

// ---------------------------------------------------------------------------
// AYUDAS DE PRESENTACIÓN
// ---------------------------------------------------------------------------
const hexDeColor = (nombre: string) =>
  colores.value.find((c) => c.nombre === nombre)?.codigoHex || '#94a3b8'

const porcentajeRestante = (r: any) => {
  const ini = Number(r.pesoInicial) || 1
  return Math.max(0, Math.min(100, (Number(r.pesoActual) / ini) * 100))
}

const estiloEstado = (estado: string) => {
  if (estado === 'DISPONIBLE') return 'bg-emerald-100 text-emerald-700 border-emerald-300'
  if (estado === 'EN_USO') return 'bg-amber-100 text-amber-700 border-amber-300'
  if (estado === 'CONSUMIDO') return 'bg-slate-200 text-slate-600 border-slate-300'
  return 'bg-rose-100 text-rose-700 border-rose-300'
}
const textoEstado = (estado: string) =>
  ({ DISPONIBLE: 'Disponible', EN_USO: 'Empezado', CONSUMIDO: 'Agotado', ANULADO: 'Anulado' } as any)[estado] || estado

const fecha = (f: string) => new Date(f).toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' })
const fechaHora = (f: string) => new Date(f).toLocaleString('es-PE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
</script>

<template>
  <div class="max-w-7xl mx-auto pb-24">

    <!-- ===================== ENCABEZADO ===================== -->
    <div class="bg-gradient-to-r from-cyan-600 via-sky-600 to-blue-700 rounded-3xl p-6 md:p-8 text-white shadow-xl mb-6">
      <div class="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p class="text-sky-200 font-bold uppercase tracking-widest text-xs mb-1">Paso 1 de 4</p>
          <h1 class="text-3xl md:text-4xl font-black tracking-tight flex items-center gap-3">
            🧵 Almacén de Rollos
          </h1>
          <p class="text-sky-100 mt-2 max-w-2xl">
            Registra la tela como llega: <strong>por rollo, pesada en kilos y con su color</strong>.
            Cada rollo es una tarjeta, para que el cortador luego elija exactamente los que se lleva.
          </p>
        </div>
        <button
          @click="panelAbierto = !panelAbierto"
          class="bg-white text-sky-700 hover:bg-sky-50 font-black text-lg px-7 py-4 rounded-2xl shadow-lg
                 transition-transform active:scale-95 flex items-center gap-2 shrink-0"
        >
          <span class="text-2xl">{{ panelAbierto ? '✕' : '➕' }}</span>
          {{ panelAbierto ? 'Cerrar' : 'Registrar Rollos' }}
        </button>
      </div>

      <!-- Mapa del recorrido: que cualquiera entienda dónde está parado -->
      <div class="mt-6 flex flex-wrap items-center gap-2 text-xs font-bold">
        <span class="bg-white/25 ring-2 ring-white px-3 py-1.5 rounded-full">1 · 🧵 Rollos</span>
        <span class="opacity-50">→</span>
        <span class="bg-white/10 px-3 py-1.5 rounded-full">2 · ✂️ Transformación</span>
        <span class="opacity-50">→</span>
        <span class="bg-white/10 px-3 py-1.5 rounded-full">3 · 🏬 Terminados</span>
        <span class="opacity-50">→</span>
        <span class="bg-white/10 px-3 py-1.5 rounded-full">4 · 🛒 Venta</span>
      </div>
    </div>

    <!-- ===================== AVISO ===================== -->
    <transition name="fade">
      <div
        v-if="aviso"
        class="mb-5 px-5 py-4 rounded-2xl font-bold border-2 shadow-sm"
        :class="aviso.tipo === 'ok'
          ? 'bg-emerald-50 border-emerald-300 text-emerald-800'
          : 'bg-rose-50 border-rose-300 text-rose-800'"
      >
        {{ aviso.texto }}
      </div>
    </transition>

    <!-- ===================== TARJETAS DE RESUMEN ===================== -->
    <div v-if="resumen" class="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      <div class="bg-white rounded-2xl p-5 border-l-8 border-emerald-500 shadow-sm">
        <p class="text-[11px] font-black uppercase tracking-wider text-slate-500">Kilos disponibles</p>
        <p class="text-3xl font-black text-emerald-600 mt-1">{{ resumen.kilosDisponibles.toFixed(1) }}<span class="text-lg"> kg</span></p>
        <p class="text-xs text-slate-500 mt-1">Tela lista para cortar</p>
      </div>
      <div class="bg-white rounded-2xl p-5 border-l-8 border-sky-500 shadow-sm">
        <p class="text-[11px] font-black uppercase tracking-wider text-slate-500">Rollos con tela</p>
        <p class="text-3xl font-black text-sky-600 mt-1">{{ resumen.rollosDisponibles }}</p>
        <p class="text-xs text-slate-500 mt-1">De {{ resumen.totalRollos }} registrados</p>
      </div>
      <div class="bg-white rounded-2xl p-5 border-l-8 border-violet-500 shadow-sm">
        <p class="text-[11px] font-black uppercase tracking-wider text-slate-500">Valor en tela</p>
        <p class="text-3xl font-black text-violet-600 mt-1">S/ {{ resumen.valorInventario.toFixed(2) }}</p>
        <p class="text-xs text-slate-500 mt-1">Capital parado en el almacén</p>
      </div>
      <div class="bg-white rounded-2xl p-5 border-l-8 border-amber-500 shadow-sm">
        <p class="text-[11px] font-black uppercase tracking-wider text-slate-500">Kilos ya cortados</p>
        <p class="text-3xl font-black text-amber-600 mt-1">{{ resumen.kilosConsumidos.toFixed(1) }}<span class="text-lg"> kg</span></p>
        <p class="text-xs text-slate-500 mt-1">Se fueron a producción</p>
      </div>
    </div>

    <!-- Kilos por color: de un vistazo, de qué color hay tela -->
    <div v-if="resumen?.porColor?.length" class="bg-white rounded-2xl p-5 shadow-sm mb-6">
      <p class="text-xs font-black uppercase tracking-wider text-slate-500 mb-3">Kilos disponibles por color</p>
      <div class="flex flex-wrap gap-2">
        <button
          v-for="c in resumen.porColor"
          :key="c.color"
          @click="filtroColor = filtroColor === c.color ? '' : c.color"
          class="flex items-center gap-2 pl-2 pr-4 py-2 rounded-xl border-2 font-bold text-sm transition-all"
          :class="filtroColor === c.color
            ? 'border-sky-500 bg-sky-50 text-sky-800 shadow'
            : 'border-slate-200 hover:border-slate-300 text-slate-700'"
        >
          <span class="w-5 h-5 rounded-md border border-slate-300 shrink-0" :style="{ backgroundColor: hexDeColor(c.color) }"></span>
          {{ c.color }}
          <span class="text-slate-500 font-semibold">{{ c.kilos.toFixed(1) }} kg · {{ c.rollos }} rollos</span>
        </button>
      </div>
    </div>

    <!-- ===================== PANEL DE REGISTRO ===================== -->
    <transition name="fade">
      <div v-if="panelAbierto" class="bg-white rounded-3xl shadow-xl border-2 border-sky-200 overflow-hidden mb-6">
        <div class="bg-sky-50 px-6 py-4 border-b-2 border-sky-100">
          <h2 class="text-xl font-black text-sky-900">➕ Registrar rollos que acaban de llegar</h2>
          <p class="text-sm text-sky-700 mt-1">
            Llena los datos de la tela una sola vez y luego agrega el peso de cada rollo.
            Si llegaron 20 rollos del mismo color, se registran los 20 de golpe.
          </p>
        </div>

        <div class="p-6 space-y-6">
          <!-- Datos comunes a todos los rollos del lote -->
          <div class="grid md:grid-cols-2 gap-5">
            <div>
              <label class="block text-xs font-black uppercase tracking-wider text-slate-600 mb-2">
                Color de la tela <span class="text-rose-500">*</span>
              </label>
              <div class="flex gap-2">
                <span class="w-12 h-12 rounded-xl border-2 border-slate-200 shrink-0" :style="{ backgroundColor: hexDeColor(form.color) }"></span>
                <select
                  v-model="form.color" @change="alElegirColor"
                  class="flex-1 border-2 border-slate-200 rounded-xl px-4 h-12 font-bold text-slate-700 focus:border-sky-500 outline-none"
                >
                  <option value="">— Elige el color —</option>
                  <option v-for="c in colores" :key="c.id" :value="c.nombre">{{ c.nombre }} ({{ c.codigo }})</option>
                </select>
              </div>
            </div>

            <div>
              <label class="block text-xs font-black uppercase tracking-wider text-slate-600 mb-2">Tipo de tela</label>
              <input
                v-model="form.descripcion" type="text" placeholder="Ej. Algodón 20/1 jersey"
                class="w-full border-2 border-slate-200 rounded-xl px-4 h-12 font-semibold text-slate-700 focus:border-sky-500 outline-none"
              />
            </div>

            <div>
              <label class="block text-xs font-black uppercase tracking-wider text-slate-600 mb-2">Proveedor</label>
              <select
                v-model="form.proveedorId"
                class="w-full border-2 border-slate-200 rounded-xl px-4 h-12 font-semibold text-slate-700 focus:border-sky-500 outline-none"
              >
                <option value="">— Sin especificar —</option>
                <option v-for="p in proveedores" :key="p.id" :value="p.id">{{ p.razonSocial }}</option>
              </select>
            </div>

            <div>
              <label class="block text-xs font-black uppercase tracking-wider text-slate-600 mb-2">
                Costo por kilo (S/)
              </label>
              <input
                v-model.number="form.costoPorKilo" type="number" step="0.01" min="0" placeholder="0.00"
                class="w-full border-2 border-slate-200 rounded-xl px-4 h-12 font-bold text-slate-700 focus:border-sky-500 outline-none"
              />
              <p class="text-xs text-slate-500 mt-1">
                Sirve para saber cuánto cuesta cada prenda cuando se corte la tela.
              </p>
            </div>
          </div>

          <!-- Los pesos: el núcleo del registro -->
          <div class="bg-slate-50 rounded-2xl p-5 border-2 border-slate-200">
            <p class="text-sm font-black uppercase tracking-wider text-slate-700 mb-1">
              ⚖️ Peso de cada rollo
            </p>
            <p class="text-xs text-slate-500 mb-4">
              Escribe el peso y presiona <strong>Enter</strong>. Repite por cada rollo de la balanza.
            </p>

            <div class="flex flex-wrap gap-3 items-end mb-4">
              <div>
                <label class="block text-[11px] font-bold text-slate-500 mb-1">Kilos del rollo</label>
                <div class="flex gap-2">
                  <input
                    ref="inputPeso" v-model.number="pesoNuevo" type="number" step="0.001" min="0"
                    placeholder="24.500" @keyup.enter="agregarPeso"
                    class="w-36 border-2 border-slate-300 rounded-xl px-4 h-12 text-lg font-black text-slate-800 focus:border-emerald-500 outline-none"
                  />
                  <button
                    @click="agregarPeso"
                    class="bg-emerald-500 hover:bg-emerald-600 text-white font-black px-5 h-12 rounded-xl shadow active:scale-95 transition-transform"
                  >+ Agregar</button>
                </div>
              </div>

              <div class="h-12 w-px bg-slate-300 hidden md:block"></div>

              <div>
                <label class="block text-[11px] font-bold text-slate-500 mb-1">O varios del mismo peso</label>
                <div class="flex gap-2 items-center">
                  <input
                    v-model.number="pesoRepetido" type="number" step="0.001" min="0" placeholder="kg"
                    class="w-24 border-2 border-slate-300 rounded-xl px-3 h-12 font-bold text-slate-800 focus:border-sky-500 outline-none"
                  />
                  <span class="font-black text-slate-400">×</span>
                  <input
                    v-model.number="cantidadRepetida" type="number" min="1" placeholder="20"
                    class="w-20 border-2 border-slate-300 rounded-xl px-3 h-12 font-bold text-slate-800 focus:border-sky-500 outline-none"
                  />
                  <button
                    @click="agregarVarios"
                    class="bg-sky-500 hover:bg-sky-600 text-white font-black px-4 h-12 rounded-xl shadow active:scale-95 transition-transform"
                  >Agregar</button>
                </div>
              </div>
            </div>

            <!-- Lista de pesos cargados -->
            <div v-if="pesos.length" class="flex flex-wrap gap-2">
              <span
                v-for="(p, i) in pesos" :key="i"
                class="group inline-flex items-center gap-2 bg-white border-2 border-emerald-300 text-emerald-800
                       font-black px-3 py-2 rounded-xl shadow-sm"
              >
                <span class="text-slate-400 text-xs font-bold">#{{ i + 1 }}</span>
                {{ p.toFixed(3) }} kg
                <button @click="quitarPeso(i)" class="text-rose-400 hover:text-rose-600 font-black px-1">✕</button>
              </span>
            </div>
            <p v-else class="text-sm text-slate-400 italic">Todavía no agregaste ningún rollo.</p>

            <!-- Totales del lote -->
            <div v-if="pesos.length" class="mt-5 grid grid-cols-3 gap-3">
              <div class="bg-white rounded-xl p-3 text-center border-2 border-slate-200">
                <p class="text-[11px] font-bold uppercase text-slate-500">Rollos</p>
                <p class="text-2xl font-black text-slate-800">{{ pesos.length }}</p>
              </div>
              <div class="bg-white rounded-xl p-3 text-center border-2 border-emerald-200">
                <p class="text-[11px] font-bold uppercase text-slate-500">Total kilos</p>
                <p class="text-2xl font-black text-emerald-600">{{ kilosARegistrar.toFixed(2) }}</p>
              </div>
              <div class="bg-white rounded-xl p-3 text-center border-2 border-violet-200">
                <p class="text-[11px] font-bold uppercase text-slate-500">Costo total</p>
                <p class="text-2xl font-black text-violet-600">S/ {{ costoARegistrar.toFixed(2) }}</p>
              </div>
            </div>
          </div>

          <div>
            <label class="block text-xs font-black uppercase tracking-wider text-slate-600 mb-2">Observación</label>
            <input
              v-model="form.observacion" type="text" placeholder="Opcional: nota para el almacén"
              class="w-full border-2 border-slate-200 rounded-xl px-4 h-12 font-semibold text-slate-700 focus:border-sky-500 outline-none"
            />
          </div>

          <!-- Botones grandes -->
          <div class="flex flex-wrap gap-3">
            <button
              @click="guardar" :disabled="guardando || pesos.length === 0"
              class="flex-1 min-w-[240px] bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700
                     disabled:from-slate-300 disabled:to-slate-400 disabled:cursor-not-allowed
                     text-white font-black text-lg py-5 rounded-2xl shadow-lg active:scale-95 transition-all"
            >
              {{ guardando ? 'Guardando...' : `💾 Guardar ${pesos.length} rollo(s) — ${kilosARegistrar.toFixed(2)} kg` }}
            </button>
            <button
              @click="limpiarForm"
              class="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold px-7 py-5 rounded-2xl transition-colors"
            >Limpiar</button>
          </div>
        </div>
      </div>
    </transition>

    <!-- ===================== FILTROS ===================== -->
    <div class="bg-white rounded-2xl p-4 shadow-sm mb-5 flex flex-wrap gap-3 items-center">
      <input
        v-model="filtroTexto" type="text" placeholder="🔍 Buscar por código, color, tela o proveedor..."
        class="flex-1 min-w-[220px] border-2 border-slate-200 rounded-xl px-4 h-12 font-semibold text-slate-700 focus:border-sky-500 outline-none"
      />
      <select v-model="filtroColor" class="border-2 border-slate-200 rounded-xl px-4 h-12 font-bold text-slate-700 focus:border-sky-500 outline-none">
        <option value="">Todos los colores</option>
        <option v-for="c in coloresEnStock" :key="c" :value="c">{{ c }}</option>
      </select>
      <select v-model="filtroEstado" class="border-2 border-slate-200 rounded-xl px-4 h-12 font-bold text-slate-700 focus:border-sky-500 outline-none">
        <option value="">Todos los estados</option>
        <option value="DISPONIBLE">Disponibles</option>
        <option value="EN_USO">Empezados</option>
        <option value="CONSUMIDO">Agotados</option>
      </select>
      <div class="bg-sky-50 border-2 border-sky-200 rounded-xl px-4 h-12 flex items-center font-black text-sky-800">
        {{ rollosFiltrados.length }} rollos · {{ kilosFiltrados.toFixed(1) }} kg
      </div>
    </div>

    <!-- ===================== TARJETAS DE ROLLOS ===================== -->
    <div v-if="cargando" class="text-center py-20 text-slate-400 font-bold text-lg">Cargando rollos...</div>

    <div v-else-if="rollosFiltrados.length === 0" class="bg-white rounded-3xl p-14 text-center shadow-sm">
      <p class="text-6xl mb-4">🧵</p>
      <p class="text-xl font-black text-slate-700">
        {{ rollos.length === 0 ? 'Todavía no hay tela registrada' : 'Ningún rollo coincide con el filtro' }}
      </p>
      <p class="text-slate-500 mt-2">
        {{ rollos.length === 0
          ? 'Usa el botón "Registrar Rollos" de arriba para ingresar la tela que llegó.'
          : 'Prueba limpiando la búsqueda o cambiando el estado.' }}
      </p>
    </div>

    <div v-else class="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      <div
        v-for="r in rollosFiltrados" :key="r.id"
        class="bg-white rounded-2xl shadow-sm hover:shadow-lg transition-shadow overflow-hidden border-2 border-slate-100"
      >
        <!-- Franja del color de la tela: se identifica de lejos -->
        <div class="h-3" :style="{ backgroundColor: hexDeColor(r.color) }"></div>

        <div class="p-5">
          <div class="flex items-start justify-between gap-2 mb-3">
            <div>
              <p class="font-black text-lg text-slate-800 tracking-tight">{{ r.codigo }}</p>
              <p class="text-sm font-bold text-slate-600">{{ r.color }}</p>
            </div>
            <span class="text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-full border-2 shrink-0" :class="estiloEstado(r.estado)">
              {{ textoEstado(r.estado) }}
            </span>
          </div>

          <p v-if="r.descripcion" class="text-xs text-slate-500 mb-3 truncate">{{ r.descripcion }}</p>

          <!-- Peso: el dato más importante de la tarjeta -->
          <div class="flex items-end gap-2 mb-2">
            <p class="text-4xl font-black text-slate-800 leading-none">{{ Number(r.pesoActual).toFixed(2) }}</p>
            <p class="text-lg font-bold text-slate-400 leading-none pb-0.5">kg</p>
            <p class="text-xs text-slate-400 ml-auto pb-1">entró con {{ Number(r.pesoInicial).toFixed(2) }}</p>
          </div>

          <!-- Barra: cuánto queda del rollo -->
          <div class="h-2.5 bg-slate-100 rounded-full overflow-hidden mb-4">
            <div
              class="h-full rounded-full transition-all"
              :class="porcentajeRestante(r) > 50 ? 'bg-emerald-500' : porcentajeRestante(r) > 15 ? 'bg-amber-500' : 'bg-rose-500'"
              :style="{ width: porcentajeRestante(r) + '%' }"
            ></div>
          </div>

          <div class="text-xs text-slate-500 space-y-1 mb-4">
            <p v-if="Number(r.costoPorKilo) > 0">
              💵 S/ {{ Number(r.costoPorKilo).toFixed(2) }}/kg
              <span class="text-slate-400">· valor S/ {{ (Number(r.pesoActual) * Number(r.costoPorKilo)).toFixed(2) }}</span>
            </p>
            <p v-if="r.proveedor">🏢 {{ r.proveedor.razonSocial }}</p>
            <p>📅 {{ fecha(r.fechaIngreso) }}</p>
          </div>

          <div class="flex gap-2">
            <button
              @click="abrirAjuste(r)" :disabled="r.estado === 'ANULADO'"
              class="flex-1 bg-amber-50 hover:bg-amber-100 disabled:opacity-40 text-amber-700 font-bold text-sm py-2.5 rounded-xl border-2 border-amber-200 transition-colors"
            >⚖️ Pesar</button>
            <button
              @click="verHistorial(r)"
              class="flex-1 bg-sky-50 hover:bg-sky-100 text-sky-700 font-bold text-sm py-2.5 rounded-xl border-2 border-sky-200 transition-colors"
            >📜 Historial</button>
            <button
              @click="anular(r)" :disabled="r.estado === 'ANULADO'"
              class="bg-rose-50 hover:bg-rose-100 disabled:opacity-40 text-rose-600 font-bold text-sm px-3 py-2.5 rounded-xl border-2 border-rose-200 transition-colors"
              title="Anular (registrado por error)"
            >🗑️</button>
          </div>
        </div>
      </div>
    </div>

    <!-- ===================== MODAL: AJUSTAR PESO ===================== -->
    <div v-if="modalAjuste" class="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" @click.self="modalAjuste = null">
      <div class="bg-white rounded-3xl w-full max-w-md shadow-2xl overflow-hidden">
        <div class="bg-amber-500 px-6 py-5 text-white">
          <h3 class="text-2xl font-black">⚖️ Pesar de nuevo</h3>
          <p class="text-amber-50 text-sm mt-1">{{ modalAjuste.codigo }} — {{ modalAjuste.color }}</p>
        </div>
        <div class="p-6 space-y-5">
          <p class="text-sm text-slate-600 bg-slate-50 rounded-xl p-4 border border-slate-200">
            El sistema dice que este rollo tiene
            <strong>{{ Number(modalAjuste.pesoActual).toFixed(3) }} kg</strong>.
            Si la balanza dice otra cosa, escribe el peso real: queda registrado como ajuste
            y se puede consultar después.
          </p>

          <div>
            <label class="block text-xs font-black uppercase tracking-wider text-slate-600 mb-2">Peso real en balanza (kg)</label>
            <input
              v-model.number="pesoReal" type="number" step="0.001" min="0"
              class="w-full border-2 border-amber-300 rounded-xl px-4 h-14 text-2xl font-black text-slate-800 focus:border-amber-500 outline-none"
            />
          </div>

          <div>
            <label class="block text-xs font-black uppercase tracking-wider text-slate-600 mb-2">Motivo (opcional)</label>
            <input
              v-model="motivoAjuste" type="text" placeholder="Ej. sobró tela del corte / error de balanza"
              class="w-full border-2 border-slate-200 rounded-xl px-4 h-12 font-semibold text-slate-700 focus:border-amber-500 outline-none"
            />
          </div>

          <div class="flex gap-3">
            <button
              @click="confirmarAjuste" :disabled="guardando"
              class="flex-1 bg-amber-500 hover:bg-amber-600 disabled:bg-slate-300 text-white font-black text-lg py-4 rounded-2xl shadow active:scale-95 transition-all"
            >{{ guardando ? 'Guardando...' : 'Confirmar peso' }}</button>
            <button @click="modalAjuste = null" class="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold px-6 rounded-2xl">Cancelar</button>
          </div>
        </div>
      </div>
    </div>

    <!-- ===================== MODAL: HISTORIAL ===================== -->
    <div v-if="modalHistorial" class="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" @click.self="modalHistorial = null">
      <div class="bg-white rounded-3xl w-full max-w-2xl shadow-2xl overflow-hidden max-h-[88vh] flex flex-col">
        <div class="bg-sky-600 px-6 py-5 text-white flex items-start justify-between">
          <div>
            <h3 class="text-2xl font-black">📜 {{ modalHistorial.codigo }}</h3>
            <p class="text-sky-100 text-sm mt-1">
              {{ modalHistorial.color }} · entró con {{ Number(modalHistorial.pesoInicial).toFixed(3) }} kg ·
              hoy tiene {{ Number(modalHistorial.pesoActual).toFixed(3) }} kg
            </p>
          </div>
          <button @click="modalHistorial = null" class="text-white/80 hover:text-white text-3xl leading-none">&times;</button>
        </div>

        <div class="p-6 overflow-y-auto space-y-6">
          <!-- Cada kilo que entró y salió -->
          <div>
            <p class="text-xs font-black uppercase tracking-wider text-slate-500 mb-3">Movimientos de kilos</p>
            <div class="space-y-2">
              <div
                v-for="m in modalHistorial.movimientos" :key="m.id"
                class="flex items-center gap-4 p-3 rounded-xl border-2"
                :class="Number(m.peso) >= 0 ? 'bg-emerald-50 border-emerald-200' : 'bg-rose-50 border-rose-200'"
              >
                <span class="text-2xl shrink-0">{{ Number(m.peso) >= 0 ? '📥' : '📤' }}</span>
                <div class="flex-1 min-w-0">
                  <p class="font-bold text-slate-800 text-sm truncate">{{ m.motivo }}</p>
                  <p class="text-xs text-slate-500">{{ fechaHora(m.fecha) }} · {{ m.tipo }}</p>
                </div>
                <div class="text-right shrink-0">
                  <p class="font-black text-lg" :class="Number(m.peso) >= 0 ? 'text-emerald-600' : 'text-rose-600'">
                    {{ Number(m.peso) >= 0 ? '+' : '' }}{{ Number(m.peso).toFixed(3) }} kg
                  </p>
                  <p class="text-xs text-slate-500">quedó en {{ Number(m.pesoResultante).toFixed(3) }}</p>
                </div>
              </div>
            </div>
          </div>

          <!-- En qué cortes se usó -->
          <div v-if="modalHistorial.consumos?.length">
            <p class="text-xs font-black uppercase tracking-wider text-slate-500 mb-3">Cortes donde se usó</p>
            <div class="space-y-2">
              <div v-for="c in modalHistorial.consumos" :key="c.id" class="flex items-center gap-3 p-3 bg-violet-50 border-2 border-violet-200 rounded-xl">
                <span class="text-xl">✂️</span>
                <div class="flex-1">
                  <p class="font-black text-violet-900">{{ c.transformacion.codigo }}</p>
                  <p class="text-xs text-violet-700">{{ c.transformacion.producto?.nombre }} · {{ fecha(c.transformacion.fecha) }}</p>
                </div>
                <p class="font-black text-violet-700">{{ Number(c.pesoUsado).toFixed(3) }} kg</p>
              </div>
            </div>
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
