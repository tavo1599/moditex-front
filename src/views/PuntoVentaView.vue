<script setup lang="ts">
import { ref, onMounted, computed, nextTick } from 'vue';
import api from '../api/axios'; // Ruta corregida

const bodegas = ref<any[]>([]);
const inventarioTotal = ref<any[]>([]);
const cargando = ref(true);

const bodegaSeleccionada = ref<number | ''>('');
const codigoEscaneado = ref('');
const carrito = ref<any[]>([]);
const inputEscaner = ref<HTMLInputElement | null>(null);

const coloresDefinidos = [
  { nombre: 'Azul Clásico', codigo: 'AZC' },
  { nombre: 'Azul Marino', codigo: 'AZM' }, 
  { nombre: 'Azul Hielo', codigo: 'AZH' },
  { nombre: 'Negro', codigo: 'NEG' },
  { nombre: 'Celeste', codigo: 'CEL' },
  { nombre: 'Verde Militar', codigo: 'VDM' },
  { nombre: 'Verde Olivo', codigo: 'VDO' },
  { nombre: 'Rojo Vino', codigo: 'VIN' }
];

const cargarDatos = async () => {
  cargando.value = true;
  try {
    const [resBodegas, resInv] = await Promise.all([
      api.get('/almacen-terminados/bodegas'),
      api.get('/almacen-terminados/inventario')
    ]);
    bodegas.value = resBodegas.data.filter((b: any) => b.estado);
    inventarioTotal.value = resInv.data;
  } catch (error) {
    console.error("Error al cargar datos:", error);
  } finally {
    cargando.value = false;
  }
};

const inventarioConSKU = computed(() => {
  return inventarioTotal.value.map(item => {
    const colorInfo = coloresDefinidos.find(c => c.nombre === item.color);
    const codigoColor = colorInfo ? colorInfo.codigo : item.color.substring(0, 3).toUpperCase();
    return {
      ...item,
      skuCalculado: `PRD${item.producto.id}-${codigoColor}-${item.talla}`
    };
  });
});

const procesarEscaneo = () => {
  if (!bodegaSeleccionada.value) {
    alert("Selecciona una bodega primero.");
    codigoEscaneado.value = '';
    return;
  }

  const sku = codigoEscaneado.value.trim().toUpperCase();
  if (!sku) return;

  const prenda = inventarioConSKU.value.find(
    i => i.skuCalculado === sku && i.bodegaId === bodegaSeleccionada.value
  );

  if (!prenda || prenda.stock <= 0) {
    alert("Producto no encontrado o sin stock en esta bodega.");
    codigoEscaneado.value = '';
    return;
  }

  const itemEnCarrito = carrito.value.find(c => c.sku === sku);

  if (itemEnCarrito) {
    if (itemEnCarrito.cantidad + 1 > prenda.stock) {
      alert("No hay más stock disponible.");
    } else {
      itemEnCarrito.cantidad++;
    }
  } else {
    carrito.value.push({
      sku: sku,
      productoId: prenda.productoId,
      nombre: prenda.producto.nombre,
      color: prenda.color,
      talla: prenda.talla,
      cantidad: 1,
      stockMaximo: prenda.stock
    });
  }
  codigoEscaneado.value = '';
  nextTick(() => inputEscaner.value?.focus());
};

const quitarDelCarrito = (index: number) => {
  carrito.value.splice(index, 1);
  nextTick(() => inputEscaner.value?.focus());
};

const procesarSalida = async () => {
  try {
    const itemsParaBackend = carrito.value.map(c => ({
      productoId: c.productoId,
      color: c.color,
      talla: c.talla,
      cantidad: c.cantidad
    }));

    await api.post('/almacen-terminados/salida', {
      bodegaId: bodegaSeleccionada.value,
      items: itemsParaBackend
    });

    alert("Venta registrada con éxito.");
    carrito.value = [];
    cargarDatos();
  } catch (error: any) {
    alert("Error al procesar: " + (error.response?.data?.message || "Error desconocido"));
  }
};

onMounted(cargarDatos);
</script>

<template>
  <div class="p-6 space-y-6">
    <div class="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex justify-between items-center">
      <div>
        <h1 class="text-2xl font-bold text-gray-800">Punto de Venta (Escáner)</h1>
        <p class="text-gray-500">Selecciona bodega y escanea prendas.</p>
      </div>
      <select v-model="bodegaSeleccionada" class="border p-2 rounded-lg font-bold">
        <option value="" disabled>Elegir Bodega...</option>
        <option v-for="b in bodegas" :key="b.id" :value="b.id">{{ b.nombre }}</option>
      </select>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
      <div class="md:col-span-1 bg-gray-900 p-6 rounded-xl shadow-lg text-white">
        <label class="block text-center text-blue-400 font-bold uppercase text-xs mb-4">Lector de Barras</label>
        <input 
          ref="inputEscaner"
          type="text" 
          v-model="codigoEscaneado"
          @keyup.enter="procesarEscaneo"
          placeholder="Escanee aquí..."
          class="w-full bg-black border-2 border-gray-700 p-4 rounded-lg text-2xl text-center outline-none focus:border-blue-500"
        />
      </div>

      <div class="md:col-span-2 bg-white p-6 rounded-xl shadow-sm border border-gray-100">
        <h3 class="font-bold mb-4 border-b pb-2">Artículos en Carrito</h3>
        <div v-if="carrito.length === 0" class="text-center py-10 text-gray-400 italic">Carrito vacío</div>
        <div v-else class="space-y-4">
          <div v-for="(item, index) in carrito" :key="item.sku" class="flex justify-between items-center bg-gray-50 p-3 rounded-lg">
            <div>
              <p class="font-bold text-gray-800">{{ item.nombre }}</p>
              <p class="text-xs text-gray-500">{{ item.sku }} - Talla {{ item.talla }}</p>
            </div>
            <div class="flex items-center gap-4">
              <span class="font-bold text-xl">{{ item.cantidad }}</span>
              <button @click="quitarDelCarrito(index)" class="text-red-500 font-bold">Quitar</button>
            </div>
          </div>
          <button @click="procesarSalida" class="w-full bg-blue-600 text-white py-4 rounded-xl font-bold mt-4">Confirmar Salida</button>
        </div>
      </div>
    </div>
  </div>
</template>