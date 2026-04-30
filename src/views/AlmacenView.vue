<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'; // ¡Agregamos watch aquí!
import api from '../api/axios';

// ESTADOS PRINCIPALES
const insumos = ref<any[]>([]);
const cargando = ref(true);

// ESTADOS DEL MODAL (CREAR / EDITAR)
const mostrarModal = ref(false);
const modoEdicion = ref(false);
const idEdicion = ref<number | null>(null);

// MODELO DEL FORMULARIO CON CALCULADORA AUTOMÁTICA
const form = ref({
  codigo: '',
  nombre: '',
  tipo: 'Tela',
  unidadMedida: 'Kilos',
  stockActual: 0,
  costoTotalFactura: 0, // Lo que pagas en total al proveedor
  costoUnitario: 0      // Lo que calcula el sistema
});

// VIGILANTE: Calcula el costo unitario al instante
watch([() => form.value.stockActual, () => form.value.costoTotalFactura], ([stock, total]) => {
  if (stock > 0 && total > 0) {
    form.value.costoUnitario = Number((total / stock).toFixed(4));
  } else {
    form.value.costoUnitario = 0;
  }
});

// 1. CARGAR DATOS
const cargarInsumos = async () => {
  cargando.value = true;
  try {
    const res = await api.get('/insumos');
    insumos.value = res.data;
  } catch (error) {
    console.error("Error al cargar insumos:", error);
  } finally {
    cargando.value = false;
  }
};

// 2. PREPARAR MODAL PARA NUEVO INSUMO
const abrirModalNuevo = () => {
  modoEdicion.value = false;
  idEdicion.value = null;
  form.value = { 
    codigo: '', 
    nombre: '', 
    tipo: 'Tela', 
    unidadMedida: 'Kilos', 
    stockActual: 0,
    costoTotalFactura: 0,
    costoUnitario: 0 
  };
  mostrarModal.value = true;
};

// 3. PREPARAR MODAL PARA EDITAR
const abrirModalEditar = (insumo: any) => {
  modoEdicion.value = true;
  idEdicion.value = insumo.id;
  
  // Calculamos cuánto fue la factura original multiplicando stock * costo
  const totalFacturaCalculado = Number(insumo.stockActual) * Number(insumo.costoUnitario);

  form.value = {
    codigo: insumo.codigo,
    nombre: insumo.nombre,
    tipo: insumo.tipo,
    unidadMedida: insumo.unidadMedida,
    stockActual: Number(insumo.stockActual),
    costoTotalFactura: totalFacturaCalculado,
    costoUnitario: Number(insumo.costoUnitario)
  };
  mostrarModal.value = true;
};

// 4. GUARDAR (CREAR O ACTUALIZAR)
const guardarInsumo = async () => {
  if (!form.value.codigo || !form.value.nombre) return alert("Código y Nombre son obligatorios");

  try {
    if (modoEdicion.value && idEdicion.value) {
      // ACTUALIZAR
      await api.put(`/insumos/${idEdicion.value}`, form.value);
    } else {
      // CREAR
      await api.post('/insumos', form.value);
    }
    
    mostrarModal.value = false;
    cargarInsumos(); // Refrescar tabla
  } catch (error: any) {
    console.error(error);
    const msj = error.response?.data?.message || "Error al guardar el insumo.";
    alert("❌ Error: " + msj);
  }
};

// 5. ELIMINAR
const eliminarInsumo = async (id: number, nombre: string) => {
  const confirmar = confirm(`⚠️ ¿Estás seguro de eliminar el insumo "${nombre}"?\n\nSi este material ya se usó en una receta o producción, el sistema bloqueará el borrado por seguridad.`);
  
  if (!confirmar) return;

  try {
    await api.delete(`/insumos/${id}`);
    cargarInsumos(); // Refrescar tabla
  } catch (error: any) {
    console.error(error);
    alert("❌ No se puede eliminar. Es probable que este insumo ya esté asociado a una Ficha Técnica o Producción.");
  }
};

const formatearStock = (cantidad: number, unidad: string) => {
  const num = Number(cantidad);
  if (unidad === 'Metros' || unidad === 'Kilos') {
    return num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 3 });
  }
  return Math.round(num).toString();
};

onMounted(() => {
  cargarInsumos();
});
</script>

<template>
  <div class="space-y-6">
    <div class="flex justify-between items-center bg-white p-6 rounded-xl shadow-sm border border-gray-100">
      <div>
        <h2 class="text-3xl font-bold text-gray-800">Almacén de Insumos</h2>
        <p class="text-gray-500 mt-1">Gestiona telas, avíos, etiquetas y su costo base.</p>
      </div>
      <button @click="abrirModalNuevo" class="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-xl font-bold shadow-md transition-all flex items-center gap-2">
        <span>+</span> Registrar Nuevo Material
      </button>
    </div>

    <div v-if="cargando" class="text-center py-12 text-gray-500 font-medium">
      <div class="animate-spin inline-block w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full mb-4"></div>
      <p>Cargando inventario...</p>
    </div>

    <div v-else class="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
      <table class="w-full text-left text-sm">
        <thead class="bg-gray-50 text-gray-500 font-bold uppercase text-[10px] tracking-wider border-b border-gray-100">
          <tr>
            <th class="p-4">Código</th>
            <th class="p-4">Nombre / Descripción</th>
            <th class="p-4">Categoría</th>
            <th class="p-4 text-center">Stock Actual</th>
            <th class="p-4 text-right">Costo Unit.</th>
            <th class="p-4 text-center">Acciones</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-gray-50">
          <tr v-if="insumos.length === 0">
            <td colspan="6" class="p-8 text-center text-gray-400 italic">No hay insumos registrados en el almacén.</td>
          </tr>
          <tr v-for="insumo in insumos" :key="insumo.id" class="hover:bg-blue-50/30 transition-colors">
            <td class="p-4 font-mono font-bold text-gray-600">{{ insumo.codigo }}</td>
            <td class="p-4 font-medium text-gray-800">{{ insumo.nombre }}</td>
            <td class="p-4">
              <span class="px-2 py-1 rounded bg-gray-100 text-gray-600 text-xs font-bold">{{ insumo.tipo }}</span>
            </td>
            <td class="p-4 text-center">
              <span class="font-bold" :class="Number(insumo.stockActual) <= 0 ? 'text-red-500' : 'text-green-600'">
                {{ Number(insumo.stockActual).toFixed(2) }}
              </span>
              <span class="text-[10px] text-gray-400 ml-1 uppercase">{{ insumo.unidadMedida }}</span>
            </td>
            <td class="p-4 text-right font-bold text-gray-700">
              S/ {{ Number(insumo.costoUnitario).toFixed(4) }}
            </td>
            <td class="p-4 text-center space-x-3">
              <button @click="abrirModalEditar(insumo)" class="text-blue-500 hover:text-blue-700 font-bold transition">Editar</button>
              <button @click="eliminarInsumo(insumo.id, insumo.nombre)" class="text-red-400 hover:text-red-600 font-bold transition">Borrar</button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div v-if="mostrarModal" class="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
      <div class="bg-white rounded-2xl shadow-2xl w-full max-w-xl overflow-hidden animate-in fade-in zoom-in duration-200">
        
        <div class="bg-gray-50 p-6 border-b border-gray-100 flex justify-between items-center">
          <h3 class="text-xl font-bold text-gray-800">{{ modoEdicion ? 'Editar Material' : 'Nuevo Material' }}</h3>
          <button @click="mostrarModal = false" class="text-gray-400 hover:text-gray-600 text-2xl">&times;</button>
        </div>

        <div class="p-6 space-y-4">
          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="block text-xs font-bold text-gray-500 uppercase mb-1">Código Único</label>
              <input type="text" v-model="form.codigo" placeholder="Ej. TELA-DENIM-01" class="w-full border border-gray-300 rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-blue-500 font-mono">
            </div>
            <div>
              <label class="block text-xs font-bold text-gray-500 uppercase mb-1">Categoría</label>
              <select v-model="form.tipo" class="w-full border border-gray-300 rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-blue-500">
                <option value="Tela">Tela</option>
                <option value="Avio">Avío (Botones, Cierres)</option>
                <option value="Empaque">Empaque (Bolsas, Cajas)</option>
                <option value="Etiqueta">Etiqueta</option>
              </select>
            </div>
          </div>

          <div>
            <label class="block text-xs font-bold text-gray-500 uppercase mb-1">Nombre / Descripción</label>
            <input type="text" v-model="form.nombre" placeholder="Ej. Tela Denim 14oz Rígido" class="w-full border border-gray-300 rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-blue-500">
          </div>

          <!-- LA NUEVA CALCULADORA MÁGICA -->
          <div class="grid grid-cols-3 gap-4">
            <div>
              <label class="block text-xs font-bold text-gray-500 uppercase mb-1">Unidad</label>
              <select v-model="form.unidadMedida" class="w-full border border-gray-300 rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-blue-500 font-bold text-blue-700">
                <option value="Kilos">Kilos (kg) - TELAS</option>
                <option value="Unidad">Unidad (und) - AVÍOS</option>
                <option value="Conos">Conos - HILOS</option>
                <option value="Paquetes">Paquetes / Cajas</option>
              </select>
            </div>
            <div>
              <label class="block text-xs font-bold text-gray-500 uppercase mb-1">Stock (Cant.)</label>
              <input 
                type="number" 
                :step="form.unidadMedida === 'Unidad' || form.unidadMedida === 'Conos' ? '1' : '0.01'" 
                v-model.number="form.stockActual" 
                class="w-full border border-gray-300 rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-blue-500 text-right font-bold"
                placeholder="Ej: 100"
              >
            </div>
            <div>
              <label class="block text-xs font-bold text-gray-500 uppercase mb-1">Factura (Total S/)</label>
              <input 
                type="number" 
                step="0.01" 
                v-model.number="form.costoTotalFactura" 
                class="w-full border border-gray-300 rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-blue-500 text-right font-bold text-blue-700"
                placeholder="Ej: 20.00"
              >
            </div>
          </div>

          <!-- CUADRO DE RESULTADO AUTOMÁTICO -->
          <div class="mt-4 bg-gray-50 p-4 rounded-lg border border-dashed border-gray-300 flex justify-between items-center">
            <div>
              <label class="block text-xs font-bold text-gray-500 uppercase mb-1">Costo Unitario Calculado</label>
              <p class="text-[10px] text-gray-400">Este es el costo real por unidad (o Kilo) para tu Ficha Técnica.</p>
            </div>
            <p class="text-2xl font-black text-gray-800">S/ {{ form.costoUnitario.toFixed(4) }}</p>
          </div>
        </div>

        <div class="bg-gray-50 p-6 border-t border-gray-100 flex justify-end gap-3">
          <button @click="mostrarModal = false" class="px-6 py-2.5 rounded-lg font-bold text-gray-600 hover:bg-gray-200 transition">
            Cancelar
          </button>
          <button @click="guardarInsumo" class="bg-blue-600 hover:bg-blue-700 text-white px-8 py-2.5 rounded-lg font-bold shadow-md transition">
            {{ modoEdicion ? 'Actualizar Insumo' : 'Guardar Insumo' }}
          </button>
        </div>

      </div>
    </div>

  </div>
</template>