<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { useRouter } from 'vue-router';
import api from '../api/axios';

const router = useRouter();

// MOLDES TYPESCRIPT
interface Tarea { tipo: string; costoPactado: number; }
interface Paquete { tallerId: number | ''; tareas: Tarea[]; }

// ESTADOS
const productos = ref<any[]>([]);
const talleres = ref<any[]>([]);
const productoId = ref('');
const numeroOP = ref(`OP-${new Date().getFullYear()}-${Math.floor(Math.random() * 1000).toString().padStart(3, '0')}`);
const matriz = ref<Record<string, number>>({});
const tallas = ['28', '30', '32', '34', '36'];
const colores = ['Azul Clásico', 'Negro', 'Celeste'];
const rutasBase = ref<string[]>([]);
const paquetes = ref<Paquete[]>([]);
const gastosCif = ref([{ concepto: 'Ploteo de Tizado', costoTotal: 0 }]);

const cargar = async () => {
  const [resP, resT] = await Promise.all([api.get('/productos'), api.get('/talleres')]);
  productos.value = resP.data;
  talleres.value = resT.data;
};

watch(productoId, async (id) => {
  if (!id) return;
  const res = await api.get(`/productos/${id}`);
  rutasBase.value = res.data.rutasBase?.map((r: any) => r.tipoServicio) || [];
  paquetes.value = [];
});

const tareasAsignadas = computed(() => {
  const lista: string[] = [];
  paquetes.value.forEach(p => p.tareas.forEach(t => { if (t.tipo) lista.push(t.tipo) }));
  return lista;
});

const pendientes = computed(() => rutasBase.value.filter(t => !tareasAsignadas.value.includes(t)));

// CALCULOS FINANCIEROS
const totalPrendas = computed(() => Object.values(matriz.value).reduce((a, b) => a + (Number(b) || 0), 0));
const totalCif = computed(() => gastosCif.value.reduce((suma, g) => suma + Number(g.costoTotal), 0));
const totalManoObra = computed(() => {
  let totalUnit = 0;
  paquetes.value.forEach(p => p.tareas.forEach(t => totalUnit += Number(t.costoPactado || 0)));
  return totalUnit * totalPrendas.value;
});

// MODAL COMERCIAL (NUEVO: Incluye el molde para el IGV)
const mostrarModalExito = ref(false);
const resumenOrden = ref({ 
  codigo: '', 
  costoUnitario: 0, 
  totalInversion: 0,
  comercial: { mayoristaNeto: 0, mayoristaConIgv: 0, igvMontoMayorista: 0 } 
});

const lanzar = async () => {
  if(totalPrendas.value === 0) return alert('⚠️ Ingresa cantidades en la matriz');
  if(!productoId.value) return alert('⚠️ Selecciona un producto');

  const serviciosListos: { tallerId: number; tipo: string; costoPactado: number }[] = [];
  paquetes.value.forEach(p => {
    if (!p.tallerId) return;
    p.tareas.forEach(t => {
      if (t.tipo) {
        serviciosListos.push({ tallerId: Number(p.tallerId), tipo: t.tipo, costoPactado: Number(t.costoPactado) });
      }
    });
  });

  try {
const response = await api.post('/ordenes', {
      codigoOp: numeroOP.value,
      productoId: Number(productoId.value),
      matriz: matriz.value,
      servicios: serviciosListos,
      cif: gastosCif.value.filter(c => c.concepto && c.costoTotal > 0)
    });
    
    // NUEVO: Capturamos la data comercial devuelta por el backend
    resumenOrden.value = {
      codigo: response.data.codigo,
      costoUnitario: response.data.costoUnitario || 0,
      totalInversion: (response.data.costoUnitario || 0) * totalPrendas.value,
      comercial: response.data.comercial || { mayoristaNeto: 0, mayoristaConIgv: 0, igvMontoMayorista: 0 }
    };
    mostrarModalExito.value = true;
  } catch (e: any) { 
    alert("❌ Error: " + (e.response?.data?.message || "Revisa el stock en Almacén.")); 
  }
};

onMounted(cargar);
</script>

<template>
  <div class="space-y-6 relative">
    <div class="flex justify-between items-center">
      <div>
        <h2 class="text-3xl font-bold text-gray-800">Lanzamiento de Producción</h2>
        <p class="text-gray-500 mt-1">Asigna paquetes de trabajo a talleres y costea el lote.</p>
      </div>
    </div>

    <div class="grid grid-cols-1 xl:grid-cols-3 gap-6">
      
      <div class="xl:col-span-2 space-y-6">
        
        <div class="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex gap-6">
          <div class="flex-1">
            <label class="block text-sm font-medium text-gray-700 mb-1">Modelo a Fabricar</label>
            <select v-model="productoId" class="w-full border border-gray-300 rounded-lg p-2.5 font-bold text-blue-800 outline-none focus:ring-2 focus:ring-blue-500">
              <option value="" disabled>Selecciona el modelo...</option>
              <option v-for="p in productos" :key="p.id" :value="p.id">{{ p.skuBase }} - {{ p.nombre }}</option>
            </select>
          </div>
          <div class="w-1/3">
            <label class="block text-sm font-medium text-gray-700 mb-1">Código OP</label>
            <input type="text" v-model="numeroOP" readonly class="w-full border border-gray-200 rounded-lg p-2.5 bg-gray-100 font-bold font-mono text-center text-gray-600">
          </div>
        </div>

        <div class="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
          <h3 class="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2"><span>✂️</span> Matriz de Corte</h3>
          <div class="overflow-x-auto border border-gray-200 rounded-lg">
            <table class="w-full text-center border-collapse">
              <thead class="bg-gray-800 text-white">
                <tr>
                  <th class="p-3 border-r border-gray-700 text-left pl-4 w-40">Color \ Talla</th>
                  <th v-for="talla in tallas" :key="talla" class="p-3 border-r border-gray-700">{{ talla }}</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="color in colores" :key="color" class="border-b border-gray-200 hover:bg-gray-50 transition">
                  <td class="p-3 border-r border-gray-200 font-medium text-left pl-4">{{ color }}</td>
                  <td v-for="talla in tallas" :key="talla" class="p-2 border-r border-gray-200">
                    <input type="number" min="0" v-model.number="matriz[`${color}-${talla}`]" placeholder="0" class="w-16 border border-gray-300 rounded p-1 text-center outline-none focus:ring-2 focus:ring-blue-500 font-bold text-blue-700">
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div class="bg-white p-6 rounded-xl shadow-sm border border-gray-100 border-t-4 border-t-blue-600">
          <div class="flex justify-between items-center mb-4">
            <h3 class="text-lg font-bold text-gray-800">Asignación de Talleres</h3>
            <button @click="paquetes.push({ tallerId: '', tareas: [] })" class="bg-blue-50 text-blue-700 px-4 py-1.5 rounded-lg font-bold text-sm hover:bg-blue-100 transition shadow-sm">+ Asignar Taller</button>
          </div>

          <div v-if="!productoId" class="p-4 bg-gray-50 text-center text-gray-400 italic rounded-lg border border-dashed border-gray-300">
            Selecciona un modelo arriba para ver su ruta requerida.
          </div>
          <div v-else-if="pendientes.length > 0" class="mb-5 p-4 bg-yellow-50 border border-yellow-200 rounded-lg shadow-sm">
            <p class="text-[10px] font-bold text-yellow-800 uppercase tracking-wider mb-2">Operaciones pendientes por asignar:</p>
            <div class="flex flex-wrap gap-2">
              <span v-for="p in pendientes" :key="p" class="bg-white border border-yellow-400 text-yellow-700 px-3 py-1 rounded-full text-xs font-bold shadow-sm animate-pulse">
                {{ p }}
              </span>
            </div>
          </div>
          <div v-else-if="rutasBase.length > 0" class="mb-5 p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm font-bold flex items-center gap-2">
            <span>✅</span> Todos los procesos han sido asignados a talleres.
          </div>

          <div class="space-y-4">
            <div v-for="(paq, pIdx) in paquetes" :key="pIdx" class="border border-gray-200 rounded-xl overflow-hidden shadow-sm hover:shadow-md transition">
              
              <div class="bg-gray-100 p-3 border-b border-gray-200 flex gap-4 items-center">
                <span class="text-xl">🏭</span>
                <select v-model="paq.tallerId" class="flex-1 border border-gray-300 rounded-lg p-2 text-sm font-bold bg-white outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="">Selecciona el Taller...</option>
                  <option v-for="t in talleres" :key="t.id" :value="t.id">{{ t.razonSocial }}</option>
                </select>
                <div class="text-right px-4 border-l border-gray-300">
                  <p class="text-[10px] font-bold text-gray-500 uppercase">Subtotal x Prenda</p>
                  <span class="font-black text-blue-700 text-lg">S/ {{ paq.tareas.reduce((sum, t) => sum + Number(t.costoPactado||0), 0).toFixed(2) }}</span>
                </div>
                <button @click="paquetes.splice(pIdx, 1)" class="text-gray-400 hover:text-red-500 bg-white p-2 rounded-lg border border-gray-200 transition">🗑️</button>
              </div>

              <div class="p-4 bg-white space-y-3">
                <div v-for="(t, tIdx) in paq.tareas" :key="tIdx" class="flex gap-4 items-center">
                  <select v-model="t.tipo" class="flex-1 border border-gray-300 rounded p-2 text-sm outline-none focus:ring-2 focus:ring-blue-500">
                    <option value="" disabled>Seleccionar Operación...</option>
                    <option v-if="t.tipo" :value="t.tipo" class="font-bold text-gray-800">{{ t.tipo }}</option>
                    <option v-for="pen in pendientes" :key="pen" :value="pen">{{ pen }}</option>
                  </select>
                  <div class="w-1/3 flex items-center gap-2">
                    <span class="text-xs font-bold text-gray-400">S/</span>
                    <input type="number" step="0.01" v-model="t.costoPactado" class="w-full border border-gray-300 rounded p-2 text-right text-sm outline-none focus:ring-2 focus:ring-blue-500 font-bold text-gray-700" placeholder="0.00">
                  </div>
                  <button @click="paq.tareas.splice(tIdx, 1)" class="text-red-400 hover:text-red-600 font-bold px-2">✖</button>
                </div>
                <button @click="paq.tareas.push({ tipo: pendientes[0] || '', costoPactado: 0 })" class="text-xs text-blue-600 hover:underline font-bold mt-2 inline-flex items-center gap-1">
                  <span>+</span> Agregar tarea a este taller
                </button>
              </div>
            </div>
          </div>
        </div>

        <div class="bg-white p-6 rounded-xl shadow-sm border-l-4 border-l-purple-500">
          <div class="flex justify-between items-center mb-4">
            <h3 class="text-lg font-bold text-gray-800 flex items-center gap-2"><span>🚕</span> Gastos Indirectos (CIF)</h3>
            <button @click="gastosCif.push({ concepto: '', costoTotal: 0 })" class="text-purple-600 text-sm font-bold hover:underline bg-purple-50 px-3 py-1 rounded-md transition">+ Agregar Gasto</button>
          </div>
          <div class="space-y-3">
            <div v-for="(gasto, idx) in gastosCif" :key="idx" class="flex gap-4">
              <input type="text" v-model="gasto.concepto" placeholder="Ej. Ploteo, Flete" class="flex-1 border border-gray-300 rounded p-2 outline-none focus:ring-2 focus:ring-purple-500 text-sm">
              <div class="w-1/3 flex items-center gap-2">
                <span class="font-bold text-gray-500 text-sm">S/</span>
                <input type="number" step="0.1" v-model="gasto.costoTotal" class="w-full border border-gray-300 rounded p-2 text-right outline-none focus:ring-2 focus:ring-purple-500 text-sm font-bold text-purple-700">
                <button @click="gastosCif.splice(idx, 1)" class="text-gray-400 hover:text-red-500 px-2 transition">🗑️</button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="bg-gray-900 text-white p-6 rounded-2xl shadow-2xl border border-gray-800 h-fit sticky top-6">
        <h3 class="text-xl font-bold mb-6 text-blue-400 border-b border-gray-700 pb-4 flex items-center gap-2">
          <span>📊</span> Proyección de Costos
        </h3>
        <div class="space-y-4 mb-8">
          <div class="flex justify-between items-center">
            <span class="text-gray-400 text-sm">Total a Fabricar:</span>
            <span class="font-bold text-3xl">{{ totalPrendas }} <span class="text-sm font-normal text-gray-500">und</span></span>
          </div>
          <div class="flex justify-between items-center pt-4 border-t border-gray-700">
            <span class="text-gray-400 text-sm">Mano de Obra (Lote):</span>
            <span class="font-medium text-gray-300">S/ {{ totalManoObra.toFixed(2) }}</span>
          </div>
          <div class="flex justify-between items-center">
            <span class="text-gray-400 text-sm">CIF Global:</span>
            <span class="font-medium text-purple-400">S/ {{ totalCif.toFixed(2) }}</span>
          </div>
          <div class="bg-gray-800 p-4 rounded-xl mt-4 border border-gray-700 text-center">
            <p class="text-xs text-gray-400 uppercase tracking-wider mb-1">Impacto extra x prenda</p>
            <p class="font-black text-white text-lg">S/ {{ totalPrendas ? ((totalManoObra + totalCif) / totalPrendas).toFixed(2) : '0.00' }}</p>
          </div>
        </div>
        <button @click="lanzar" class="w-full bg-blue-600 hover:bg-blue-500 text-white py-4 rounded-xl font-bold shadow-[0_0_20px_rgba(37,99,235,0.4)] active:scale-95 transition-all text-lg uppercase tracking-wider flex items-center justify-center gap-2">
          <span>🚀</span> Procesar Orden
        </button>
      </div>
    </div>

    <div v-if="mostrarModalExito" class="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center z-[100] p-4">
      <div class="bg-white rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden animate-in fade-in zoom-in duration-300">
        
        <div class="bg-gray-900 p-6 text-center border-b border-gray-800">
          <div class="inline-flex items-center justify-center w-12 h-12 bg-green-500 rounded-full mb-3 shadow-lg shadow-green-500/20">
            <span class="text-white text-2xl font-bold">✓</span>
          </div>
          <h3 class="text-xl font-black text-white uppercase tracking-widest">Liquidación de Orden: {{ resumenOrden.codigo }}</h3>
        </div>

        <div class="p-8 grid grid-cols-1 md:grid-cols-2 gap-8">
          <div class="space-y-4">
            <p class="text-[10px] font-black text-gray-400 uppercase tracking-widest">Análisis de Costos (Neto)</p>
            <div class="bg-gray-50 p-4 rounded-2xl border border-gray-100">
              <div class="flex justify-between items-center mb-2">
                <span class="text-sm text-gray-500">Costo Unitario Real:</span>
                <span class="font-bold text-gray-800">S/ {{ resumenOrden.costoUnitario.toFixed(2) }}</span>
              </div>
              <div class="flex justify-between items-center pt-2 border-t border-dashed border-gray-200">
                <span class="text-sm font-bold text-gray-700">Total Inversión Lote:</span>
                <span class="font-black text-blue-600 text-lg">S/ {{ resumenOrden.totalInversion.toFixed(2) }}</span>
              </div>
            </div>
          </div>

          <div class="space-y-4">
            <p class="text-[10px] font-black text-blue-500 uppercase tracking-widest">Precio de Venta Sugerido</p>
            <div class="bg-blue-50 p-4 rounded-2xl border border-blue-100">
              <p class="text-[10px] font-black text-blue-400 uppercase mb-1">Venta x Mayor (+ IGV)</p>
              <div class="flex justify-between items-end">
                <div>
                  <p class="text-[10px] text-blue-400">Neto: S/ {{ resumenOrden.comercial.mayoristaNeto.toFixed(2) }}</p>
                  <p class="text-[10px] text-blue-400">IGV: S/ {{ resumenOrden.comercial.igvMontoMayorista.toFixed(2) }}</p>
                </div>
                <p class="text-3xl font-black text-blue-700 tracking-tighter">
                  S/ {{ resumenOrden.comercial.mayoristaConIgv.toFixed(2) }}
                </p>
              </div>
            </div>
          </div>
        </div>

        <div class="bg-gray-50 p-8 border-t border-gray-100 flex flex-col gap-3">
          <button @click="router.push('/control-ordenes')" class="w-full bg-gray-900 text-white py-4 rounded-xl font-bold shadow-xl active:scale-95 transition flex items-center justify-center gap-3">
            📊 Ver Hoja de Seguimiento y Talleres
          </button>
          <div class="flex gap-4">
            <button class="flex-1 bg-white border border-gray-200 text-gray-600 py-3 rounded-xl font-bold text-sm hover:bg-gray-100 transition">
              🖨️ Imprimir Ficha Costos
            </button>
            <button @click="mostrarModalExito = false" class="flex-1 text-gray-400 py-3 font-medium text-sm hover:text-gray-600">
              Lanzar otra orden
            </button>
          </div>
        </div>

      </div>
    </div>

  </div>
</template>