<script setup lang="ts">
/**
 * 🧑‍🤝‍🧑 CLIENTES
 * ===========================================================================
 * La ventana propia del vendedor para ver y registrar clientes, sin tener que
 * estar en medio de una venta. Lista los clientes, busca por nombre o
 * documento, y con un botón abre el mismo modal de registro que usa la caja.
 *
 * Simple a propósito: ver quién hay y dar de alta a uno nuevo rápido.
 */
import { ref, computed, onMounted } from 'vue'
import api from '../api/axios'
import ModalNuevoCliente from '../components/ModalNuevoCliente.vue'

const clientes = ref<any[]>([])
const cargando = ref(true)
const busqueda = ref('')
const modalNuevo = ref(false)

const aviso = ref<string | null>(null)
let timer: ReturnType<typeof setTimeout> | null = null
const avisar = (t: string) => {
  aviso.value = t
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => (aviso.value = null), 5000)
}

const cargar = async () => {
  cargando.value = true
  try {
    const { data } = await api.get('/clientes')
    clientes.value = Array.isArray(data) ? data : []
  } catch (e: any) {
    avisar('No se pudieron cargar los clientes: ' + (e.response?.data?.message || e.message))
  } finally {
    cargando.value = false
  }
}
onMounted(cargar)

const filtrados = computed(() => {
  const q = busqueda.value.trim().toLowerCase()
  if (!q) return clientes.value
  return clientes.value.filter((c) =>
    `${c.nombre || ''} ${c.documento || ''} ${c.telefono || ''}`.toLowerCase().includes(q),
  )
})

const conDeuda = computed(() => clientes.value.filter((c) => Number(c.saldoPendiente) > 0).length)

const alRegistrar = (nuevo: any) => {
  if (nuevo) {
    clientes.value.unshift(nuevo)
    avisar(`✅ Cliente "${nuevo.nombre}" registrado.`)
  }
  modalNuevo.value = false
}

const soles = (v: any) => `S/ ${(Number(v) || 0).toFixed(2)}`
</script>

<template>
  <div class="space-y-5">
    <!-- Encabezado -->
    <div class="bg-gradient-to-r from-sky-700 to-sky-900 text-white rounded-3xl p-6 shadow-lg flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
      <div>
        <h1 class="text-3xl font-black flex items-center gap-2">🧑‍🤝‍🧑 Clientes</h1>
        <p class="text-sky-100 mt-1 text-sm">{{ clientes.length }} clientes · {{ conDeuda }} con deuda pendiente</p>
      </div>
      <button
        @click="modalNuevo = true"
        class="bg-white text-sky-700 hover:bg-sky-50 font-black px-6 py-3 rounded-2xl shadow transition-transform active:scale-95 w-full sm:w-auto"
      >
        + Nuevo cliente
      </button>
    </div>

    <transition name="fade">
      <div v-if="aviso" class="px-5 py-4 rounded-2xl font-bold border-2 bg-emerald-50 border-emerald-300 text-emerald-800 shadow-sm">
        {{ aviso }}
      </div>
    </transition>

    <!-- Buscador -->
    <div class="bg-white rounded-2xl p-4 shadow-sm">
      <input
        v-model="busqueda"
        type="text"
        placeholder="🔍 Buscar por nombre, documento o teléfono..."
        class="w-full border-2 border-slate-200 rounded-xl px-4 h-12 font-semibold text-slate-700 focus:border-sky-500 outline-none"
      />
    </div>

    <!-- Lista -->
    <div v-if="cargando" class="text-center py-16 text-slate-400 font-bold">Cargando clientes...</div>

    <div v-else-if="filtrados.length === 0" class="bg-white rounded-3xl p-14 text-center shadow-sm">
      <p class="text-5xl mb-3">🧑‍🤝‍🧑</p>
      <p class="text-xl font-black text-slate-700">
        {{ clientes.length === 0 ? 'Todavía no hay clientes' : 'Ningún cliente coincide' }}
      </p>
      <p class="text-slate-500 mt-1">
        {{ clientes.length === 0 ? 'Usa "+ Nuevo cliente" para registrar el primero.' : 'Prueba con otra búsqueda.' }}
      </p>
    </div>

    <div v-else class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <div
        v-for="c in filtrados"
        :key="c.id"
        class="bg-white rounded-2xl p-4 shadow-sm border-2 border-slate-100 flex items-start justify-between gap-3"
      >
        <div class="min-w-0">
          <p class="font-black text-slate-800 truncate">{{ c.nombre }}</p>
          <p v-if="c.documento" class="text-xs font-bold text-slate-500 mt-0.5">🪪 {{ c.documento }}</p>
          <p v-if="c.telefono" class="text-xs font-bold text-slate-500">📞 {{ c.telefono }}</p>
        </div>
        <div v-if="Number(c.saldoPendiente) > 0" class="shrink-0 text-right">
          <p class="text-[10px] font-black uppercase tracking-wider text-rose-400">Debe</p>
          <p class="font-black text-rose-600 whitespace-nowrap">{{ soles(c.saldoPendiente) }}</p>
        </div>
        <span v-else class="shrink-0 text-[10px] font-black bg-emerald-100 text-emerald-700 px-2 py-1 rounded-lg">al día</span>
      </div>
    </div>

    <ModalNuevoCliente
      :show="modalNuevo"
      @close="modalNuevo = false"
      @cliente-registrado="alRegistrar"
    />
  </div>
</template>

<style scoped>
.fade-enter-active, .fade-leave-active { transition: opacity .2s ease, transform .2s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; transform: translateY(-6px); }
</style>
