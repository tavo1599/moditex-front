<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import api from '../api/axios';

const bodegas = ref<any[]>([]);
const inventarioTotal = ref<any[]>([]);
const cargando = ref(true);

const form = ref({
  origenId: '',
  destinoId: '',
  inventarioIdSeleccionado: '', // El ID exacto del Kardex que vamos a mover
  cantidad: 0
});

const cargarDatos = async () => {
  cargando.value = true;
  try {
    const [resBodegas, resInv] = await Promise.all([
      api.get('/almacen-terminados/bodegas'),
      api.get('/almacen-terminados/inventario') // Traemos todo el Kardex
    ]);
    bodegas.value = resBodegas.data.filter((b: any) => b.estado); // Solo bodegas activas
    inventarioTotal.value = resInv.data;
  } catch (error) {
    console.error("Error al cargar datos:", error);
  } finally {
    cargando.value = false;
  }
};

// Magia: Filtramos las prendas para que solo muestre las que están en la bodega de Origen seleccionada y que tengan stock mayor a 0
const inventarioDisponibleEnOrigen = computed(() => {
  if (!form.value.origenId) return [];
  return inventarioTotal.value.filter(inv => inv.bodegaId === Number(form.value.origenId) && inv.stock > 0);
});

// Para mostrar cuál es el máximo que puede mover
const stockMaximoPermitido = computed(() => {
  if (!form.value.inventarioIdSeleccionado) return 0;
  const item = inventarioTotal.value.find(i => i.id === Number(form.value.inventarioIdSeleccionado));
  return item ? item.stock : 0;
});

const procesarTraslado = async () => {
  if (!form.value.origenId || !form.value.destinoId || !form.value.inventarioIdSeleccionado || form.value.cantidad <= 0) {
    return alert('Por favor, completa todos los campos correctamente.');
  }
  if (form.value.origenId === form.value.destinoId) {
    return alert('El origen y el destino no pueden ser la misma bodega.');
  }
  if (form.value.cantidad > stockMaximoPermitido.value) {
    return alert(`Solo tienes ${stockMaximoPermitido.value} unidades disponibles para mover.`);
  }

  // Extraemos los datos exactos del item seleccionado (producto, color, talla)
  const itemSeleccionado = inventarioTotal.value.find(i => i.id === Number(form.value.inventarioIdSeleccionado));

  try {
    await api.post('/almacen-terminados/traslado', {
      origenId: Number(form.value.origenId),
      destinoId: Number(form.value.destinoId),
      productoId: itemSeleccionado.productoId,
      color: itemSeleccionado.color,
      talla: itemSeleccionado.talla,
      cantidad: form.value.cantidad
    });
    
    alert('✅ Traslado realizado con éxito');
    
    // Reseteamos el formulario y recargamos para actualizar los stocks
    form.value.inventarioIdSeleccionado = '';
    form.value.cantidad = 0;
    cargarDatos();
  } catch (error: any) {
    alert('❌ Error: ' + (error.response?.data?.message || 'Error en el traslado'));
  }
};

onMounted(cargarDatos);
</script>

<template>
  <div class="space-y-6">
    <div class="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
      <h2 class="text-3xl font-bold text-gray-800">Traslado de Mercadería</h2>
      <p class="text-gray-500 mt-1">Mueve inventario entre tiendas, almacenes principales o zonas en tránsito.</p>
    </div>

    <div v-if="cargando" class="text-center py-12 text-gray-500 font-medium">
      <div class="animate-spin inline-block w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full mb-4"></div>
      <p>Cargando información logística...</p>
    </div>

    <div v-else class="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <!-- PANEL ORIGEN -->
      <div class="bg-white p-6 rounded-xl shadow-sm border-2 border-dashed border-red-200">
        <h3 class="text-xl font-black text-red-600 mb-4 flex items-center gap-2"><span>📤</span> Origen (Sale de)</h3>
        <select v-model="form.origenId" @change="form.inventarioIdSeleccionado = ''; form.cantidad = 0" class="w-full border-2 border-gray-200 p-3 rounded-xl font-bold text-gray-700 outline-none focus:border-red-500">
          <option value="" disabled>Selecciona la bodega...</option>
          <option v-for="b in bodegas" :key="b.id" :value="b.id">{{ b.nombre }}</option>
        </select>
        <p class="text-xs text-gray-400 mt-2">La mercadería se descontará de este local.</p>
      </div>

      <!-- PANEL DESTINO -->
      <div class="bg-white p-6 rounded-xl shadow-sm border-2 border-dashed border-blue-200">
        <h3 class="text-xl font-black text-blue-600 mb-4 flex items-center gap-2"><span>📥</span> Destino (Entra a)</h3>
        <select v-model="form.destinoId" class="w-full border-2 border-gray-200 p-3 rounded-xl font-bold text-gray-700 outline-none focus:border-blue-500">
          <option value="" disabled>Selecciona la bodega...</option>
          <option v-for="b in bodegas" :key="b.id" :value="b.id">{{ b.nombre }}</option>
        </select>
        <p class="text-xs text-gray-400 mt-2">La mercadería sumará stock a este local.</p>
      </div>

      <!-- PANEL MERCADERÍA -->
      <div class="bg-gray-900 p-6 rounded-xl shadow-lg border border-gray-800 text-white lg:row-span-2 lg:col-start-2">
        <h3 class="text-xl font-black text-blue-400 mb-6 flex items-center gap-2"><span>📦</span> ¿Qué vamos a mover?</h3>
        
        <div v-if="!form.origenId" class="text-center py-8 text-gray-500 border border-dashed border-gray-700 rounded-xl">
          Selecciona un Origen primero para ver qué ropa hay disponible.
        </div>
        
        <div v-else class="space-y-6">
          <div>
            <label class="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Selecciona la Prenda</label>
            <select v-model="form.inventarioIdSeleccionado" @change="form.cantidad = 0" class="w-full bg-gray-800 border-2 border-gray-700 p-3 rounded-xl font-bold text-white outline-none focus:border-blue-500">
              <option value="" disabled>Elige qué trasladar...</option>
              <option v-for="item in inventarioDisponibleEnOrigen" :key="item.id" :value="item.id">
                {{ item.producto.nombre }} - {{ item.color }} (Talla {{ item.talla }})
              </option>
            </select>
          </div>

          <div v-if="form.inventarioIdSeleccionado">
            <div class="flex justify-between items-end mb-2">
              <label class="block text-[10px] font-black text-gray-400 uppercase tracking-widest">Cantidad a Mover</label>
              <span class="text-xs font-bold text-blue-400">Stock máx: {{ stockMaximoPermitido }} und</span>
            </div>
            <input type="number" v-model.number="form.cantidad" min="1" :max="stockMaximoPermitido" class="w-full bg-black border-2 border-gray-700 p-4 rounded-xl text-3xl text-center font-black text-white outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/20 transition-all">
          </div>

          <button @click="procesarTraslado" class="w-full bg-blue-600 hover:bg-blue-700 text-white py-4 rounded-xl font-black text-lg shadow-lg shadow-blue-500/30 transition-all mt-4 uppercase tracking-widest">
            Ejecutar Traslado
          </button>
        </div>
      </div>

    </div>
  </div>
</template>