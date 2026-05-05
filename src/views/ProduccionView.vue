<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { useRouter } from 'vue-router';
import api from '../api/axios';

const router = useRouter();

// MOLDES TYPESCRIPT
interface Tarea { tipo: string; costoPactado: number; }
interface Paquete { tallerId: number | ''; tareas: Tarea[]; }
interface Color { id: number; nombre: string; codigo: string; }

// ESTADOS PRINCIPALES
const productos = ref<any[]>([]);
const talleres = ref<any[]>([]);
const coloresDB = ref<Color[]>([]);
const coloresActivos = ref<Color[]>([]);
const nuevoColorId = ref<number | ''>('');

const productoId = ref('');
const numeroOP = ref(`OP-${new Date().getFullYear()}-${Math.floor(Math.random() * 1000).toString().padStart(3, '0')}`);
const matriz = ref<Record<string, number>>({});
const rutasBase = ref<string[]>([]);
const paquetes = ref<Paquete[]>([]);
const gastosCif = ref([{ concepto: 'Ploteo de Tizado', costoTotal: 0 }]);

// ----------------------------------------------------
// LÓGICA DE TALLAS CON SWITCH (LETRAS VS NÚMEROS)
// ----------------------------------------------------
const tipoTalla = ref<'letras' | 'numeros'>('letras');

const tallasLetrasList = ['XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL', '4XL'];
const tallasNumerosList = ['28', '30', '32', '34', '36', '38', '40', '42', '44', '46'];

const tallasActivas = ref<string[]>(['S', 'M', 'L', 'XL']); // Por defecto inicia en letras
const nuevaTalla = ref<string>('');

// Cambiar de modo Letras a Números y viceversa
const cambiarTipoTalla = (tipo: 'letras' | 'numeros') => {
  if (tipoTalla.value === tipo) return;
  
  tipoTalla.value = tipo;
  // Cambiamos las tallas visibles por defecto
  tallasActivas.value = tipo === 'letras' ? ['S', 'M', 'L', 'XL'] : ['28', '30', '32', '34'];
  nuevaTalla.value = '';
  
  // Limpiamos TODA la matriz para evitar datos residuales al cambiar de modo
  matriz.value = {};
};

const tallasDisponibles = computed(() => {
  const listaBase = tipoTalla.value === 'letras' ? tallasLetrasList : tallasNumerosList;
  return listaBase.filter(t => !tallasActivas.value.includes(t));
});

const agregarTalla = () => {
  if (!nuevaTalla.value) return;
  if (!tallasActivas.value.includes(nuevaTalla.value)) {
    tallasActivas.value.push(nuevaTalla.value);
    
    // Auto-ordenamiento según la lista activa
    const listaBase = tipoTalla.value === 'letras' ? tallasLetrasList : tallasNumerosList;
    tallasActivas.value.sort((a, b) => listaBase.indexOf(a) - listaBase.indexOf(b));
  }
  nuevaTalla.value = '';
};

const quitarTalla = (talla: string) => {
  tallasActivas.value = tallasActivas.value.filter(t => t !== talla);
  Object.keys(matriz.value).forEach(key => {
    if (key.endsWith(`-${talla}`)) delete matriz.value[key];
  });
};
// ----------------------------------------------------

const cargar = async () => {
  try {
    const [resP, resT, resC] = await Promise.all([
      api.get('/productos'), 
      api.get('/talleres'),
      api.get('/colores')
    ]);
    
    productos.value = resP.data;
    talleres.value = resT.data;
    coloresDB.value = resC.data;

    const negro = coloresDB.value.find(c => c.nombre.toLowerCase() === 'negro' || c.codigo === 'NGR');
    if (negro) {
      coloresActivos.value.push(negro);
    } else if (coloresDB.value && coloresDB.value.length > 0) {
      const primerColor = coloresDB.value[0];
      if (primerColor) coloresActivos.value.push(primerColor);
    }
  } catch (error) {
    console.error('Error al cargar datos iniciales:', error);
  }
};

const coloresDisponibles = computed(() => {
  return coloresDB.value.filter(c => !coloresActivos.value.some(activo => activo.id === c.id));
});

const agregarColorMatriz = () => {
  if (!nuevoColorId.value) return;
  const colorObj = coloresDB.value.find(c => c.id === nuevoColorId.value);
  if (colorObj) coloresActivos.value.push(colorObj);
  nuevoColorId.value = '';
};

const quitarColorMatriz = (index: number, codigoColor: string) => {
  coloresActivos.value.splice(index, 1);
  tallasActivas.value.forEach(t => {
    delete matriz.value[`${codigoColor}-${t}`];
  });
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

// MODAL Y RENTABILIDAD
const mostrarModalExito = ref(false);
const resumenOrden = ref({ codigo: '', costoUnitario: 0, totalInversion: 0 });
const margenGanancia = ref(30); 
const tasaIgv = 0.18; 

const precioProyectadoNeto = computed(() => resumenOrden.value.costoUnitario * (1 + (margenGanancia.value / 100)));
const igvProyectado = computed(() => precioProyectadoNeto.value * tasaIgv);
const precioVentaFinal = computed(() => precioProyectadoNeto.value + igvProyectado.value);

const lanzar = async () => {
  if(totalPrendas.value === 0) return alert('⚠️ Ingresa cantidades en la matriz');
  if(!productoId.value) return alert('⚠️ Selecciona un producto');

  const serviciosListos: { tallerId: number; tipo: string; costoPactado: number }[] = [];
  paquetes.value.forEach(p => {
    if (!p.tallerId) return;
    p.tareas.forEach(t => {
      if (t.tipo) serviciosListos.push({ tallerId: Number(p.tallerId), tipo: t.tipo, costoPactado: Number(t.costoPactado) });
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
    
    resumenOrden.value = {
      codigo: response.data.codigo,
      costoUnitario: response.data.costoUnitario || 0,
      totalInversion: (response.data.costoUnitario || 0) * totalPrendas.value,
    };
    mostrarModalExito.value = true;
  } catch (e: any) { 
    alert("❌ Error: " + (e.response?.data?.message || "Revisa la conexión.")); 
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

        <!-- MATRIZ DE CORTE DINÁMICA -->
        <div class="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
          <div class="flex flex-wrap justify-between items-end mb-4 gap-4 border-b border-gray-100 pb-4">
            <div class="flex items-center gap-4">
              <h3 class="text-lg font-bold text-gray-800 flex items-center gap-2"><span>✂️</span> Matriz de Corte</h3>
              
              <!-- NUEVO: SWITCH LETRAS/NÚMEROS -->
              <div class="flex items-center bg-gray-100 p-1 rounded-lg border border-gray-200 shadow-inner">
                <button @click="cambiarTipoTalla('letras')" :class="tipoTalla === 'letras' ? 'bg-white shadow text-blue-700 font-bold' : 'text-gray-500 hover:text-gray-700'" class="px-3 py-1.5 rounded-md text-xs uppercase tracking-wider transition-all">
                  Letras
                </button>
                <button @click="cambiarTipoTalla('numeros')" :class="tipoTalla === 'numeros' ? 'bg-white shadow text-blue-700 font-bold' : 'text-gray-500 hover:text-gray-700'" class="px-3 py-1.5 rounded-md text-xs uppercase tracking-wider transition-all">
                  Números
                </button>
              </div>
            </div>
            
            <div class="flex gap-4">
              <div class="flex items-center gap-2 bg-gray-50 p-1.5 rounded-lg border border-gray-200">
                <select v-model="nuevoColorId" class="border-none bg-transparent text-sm font-medium outline-none focus:ring-0 text-gray-700 w-36 cursor-pointer">
                  <option value="" disabled>Añadir color...</option>
                  <option v-for="c in coloresDisponibles" :key="c.id" :value="c.id">{{ c.nombre }}</option>
                </select>
                <button @click="agregarColorMatriz" class="bg-blue-600 hover:bg-blue-500 text-white p-1.5 rounded-md transition shadow-sm" title="Agregar color">
                  <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clip-rule="evenodd" /></svg>
                </button>
              </div>

              <div class="flex items-center gap-2 bg-gray-50 p-1.5 rounded-lg border border-gray-200">
                <select v-model="nuevaTalla" class="border-none bg-transparent text-sm font-medium outline-none focus:ring-0 text-gray-700 w-28 cursor-pointer">
                  <option value="" disabled>Añadir talla...</option>
                  <option v-for="t in tallasDisponibles" :key="t" :value="t">{{ t }}</option>
                </select>
                <button @click="agregarTalla" class="bg-purple-600 hover:bg-purple-500 text-white p-1.5 rounded-md transition shadow-sm" title="Agregar talla">
                  <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clip-rule="evenodd" /></svg>
                </button>
              </div>
            </div>
          </div>

          <div class="overflow-x-auto border border-gray-200 rounded-lg">
            <table class="w-full text-center border-collapse">
              <thead class="bg-gray-800 text-white">
                <tr>
                  <th class="p-3 border-r border-gray-700 text-left pl-4 min-w-[150px]">Color \ Talla</th>
                  <th v-for="talla in tallasActivas" :key="talla" class="p-3 border-r border-gray-700 relative group min-w-[70px]">
                    {{ talla }}
                    <button @click="quitarTalla(talla)" class="absolute top-1 right-1 text-gray-400 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity text-[10px]" title="Quitar talla">✖</button>
                  </th>
                  <th class="p-3 w-10"></th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(color, idx) in coloresActivos" :key="color.id" class="border-b border-gray-200 hover:bg-gray-50 transition group">
                  <td class="p-3 border-r border-gray-200 text-left pl-4">
                    <div class="font-bold text-gray-800">{{ color.nombre }}</div>
                    <div class="text-[10px] text-gray-400 font-mono tracking-wider">Cód: {{ color.codigo }}</div>
                  </td>
                  <td v-for="talla in tallasActivas" :key="talla" class="p-2 border-r border-gray-200 bg-white">
                    <input type="number" min="0" v-model.number="matriz[`${color.codigo}-${talla}`]" placeholder="0" class="w-16 border border-gray-300 rounded p-1 text-center outline-none focus:ring-2 focus:ring-blue-500 font-bold text-blue-700">
                  </td>
                  <td class="p-2 align-middle">
                    <button @click="quitarColorMatriz(idx, color.codigo)" class="text-gray-300 hover:text-red-500 transition opacity-0 group-hover:opacity-100" title="Quitar color">🗑️</button>
                  </td>
                </tr>
                <tr v-if="coloresActivos.length === 0">
                  <td :colspan="tallasActivas.length + 2" class="p-6 text-center text-gray-400 italic">
                    No hay colores en la matriz. Añade uno para comenzar.
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- ASIGNACIÓN DE TALLERES (Se mantiene igual) -->
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
              <span v-for="p in pendientes" :key="p" class="bg-white border border-yellow-400 text-yellow-700 px-3 py-1 rounded-full text-xs font-bold shadow-sm animate-pulse">{{ p }}</span>
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

        <!-- GASTOS INDIRECTOS (Se mantiene igual) -->
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

      <!-- PANEL LATERAL PROYECCIONES (Se mantiene igual) -->
      <div class="bg-gray-900 text-white p-6 rounded-2xl shadow-2xl border border-gray-800 h-fit sticky top-6">
        <h3 class="text-xl font-bold mb-6 text-blue-400 border-b border-gray-700 pb-4 flex items-center gap-2"><span>📊</span> Proyección de Costos</h3>
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

    <!-- MODAL DE ÉXITO (Se mantiene igual) -->
    <div v-if="mostrarModalExito" class="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center z-[100] p-4">
      <div class="bg-white rounded-3xl shadow-2xl w-full max-w-3xl overflow-hidden animate-in fade-in zoom-in duration-300">
        <div class="bg-gray-900 p-6 text-center border-b border-gray-800">
          <div class="inline-flex items-center justify-center w-12 h-12 bg-green-500 rounded-full mb-3 shadow-lg shadow-green-500/20"><span class="text-white text-2xl font-bold">✓</span></div>
          <h3 class="text-xl font-black text-white uppercase tracking-widest">Liquidación de Orden: {{ resumenOrden.codigo }}</h3>
        </div>

        <div class="p-8 grid grid-cols-1 md:grid-cols-2 gap-8">
          <div class="space-y-4">
            <p class="text-[10px] font-black text-gray-400 uppercase tracking-widest">Costo de Fabricación (Real)</p>
            <div class="bg-gray-50 p-5 rounded-2xl border border-gray-200">
              <div class="flex justify-between items-center mb-3">
                <span class="text-sm font-bold text-gray-600">Costo Unitario Base:</span>
                <span class="font-black text-gray-900 text-xl">S/ {{ resumenOrden.costoUnitario.toFixed(2) }}</span>
              </div>
              <div class="flex justify-between items-center pt-3 border-t border-dashed border-gray-300">
                <span class="text-sm font-bold text-gray-700">Total Inversión Lote:</span>
                <span class="font-black text-blue-600 text-lg">S/ {{ resumenOrden.totalInversion.toFixed(2) }}</span>
              </div>
            </div>
            <p class="text-xs text-gray-500 italic mt-2 text-center">Incluye materiales, talleres y CIF.</p>
          </div>

          <div class="space-y-4">
            <p class="text-[10px] font-black text-blue-500 uppercase tracking-widest flex justify-between items-center"><span>Proyección de Precio</span></p>
            <div class="bg-blue-50 p-5 rounded-2xl border border-blue-200 relative overflow-hidden">
              <div class="mb-5 bg-white p-3 rounded-xl border border-blue-100 flex flex-col gap-2 relative z-10">
                <div class="flex justify-between items-center">
                  <label class="text-xs font-bold text-blue-800">Rentabilidad Deseada (%)</label>
                  <input type="number" v-model.number="margenGanancia" class="w-16 p-1 text-center bg-blue-50 border border-blue-200 rounded text-blue-900 font-black outline-none focus:ring-2 focus:ring-blue-500 text-sm">
                </div>
                <input type="range" v-model.number="margenGanancia" min="0" max="150" class="w-full h-2 bg-blue-200 rounded-lg appearance-none cursor-pointer accent-blue-600">
              </div>

              <div class="flex justify-between items-end relative z-10">
                <div class="space-y-1">
                  <p class="text-[11px] font-bold text-blue-500 bg-white/60 px-2 py-1 rounded">Neto: S/ {{ precioProyectadoNeto.toFixed(2) }}</p>
                  <p class="text-[11px] font-bold text-blue-500 bg-white/60 px-2 py-1 rounded">IGV (18%): S/ {{ igvProyectado.toFixed(2) }}</p>
                </div>
                <div class="text-right">
                  <p class="text-[10px] font-black text-blue-400 uppercase tracking-widest mb-1">Precio Final</p>
                  <p class="text-4xl font-black text-blue-800 tracking-tighter">S/ {{ precioVentaFinal.toFixed(2) }}</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="bg-gray-50 p-6 border-t border-gray-100 flex justify-end px-8">
          <button @click="router.push('/control-ordenes')" class="bg-gray-900 text-white py-3 px-8 rounded-xl font-bold shadow-lg active:scale-95 transition flex items-center gap-2">
            Ir al Control de Producción ➡️
          </button>
        </div>
      </div>
    </div>
  </div>
</template>