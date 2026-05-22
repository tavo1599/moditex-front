<script setup lang="ts">
import { ref, onMounted, computed, watch } from 'vue';
import api from '../api/axios';
import QRCode from 'qrcode';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

// --- DEFINICIÓN DE TIPOS ---
// 🔥 TRUCO MAESTRO: Ahora es de un solo nivel. Llave = "Color|Talla", Valor = Cantidad
type MatrizPlana = Record<string, number>;

interface Producto {
  id: number;
  nombre: string;
  skuBase?: string;
}

interface ItemInventario {
  id: number;
  bodegaId: number;
  productoId: number;
  color: string;
  talla: string;
  stock: number;
  producto: Producto;
}

// --- ESTADOS REACTIVOS ---
const bodegas = ref<any[]>([]);
const inventarioTotal = ref<ItemInventario[]>([]);
const cargando = ref(true);
const procesando = ref(false);

const form = ref({
  origenId: '',
  destinoId: '',
  productoPadreId: ''
});

const tallasDisponibles = ref<string[]>([]);
const coloresDisponibles = ref<string[]>([]);

// Matrices Planas (TypeScript no se quejará nunca de esto)
const matrizStock = ref<MatrizPlana>({});
const matrizCantidades = ref<MatrizPlana>({});

// --- CARGA DE DATOS ---
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
    console.error("Error al cargar datos logísticos:", error);
  } finally {
    cargando.value = false;
  }
};

const productosEnOrigen = computed(() => {
  if (!form.value.origenId) return [];
  const stockEnBodega = inventarioTotal.value.filter(
    inv => inv.bodegaId === Number(form.value.origenId) && inv.stock > 0
  );
  
  const productosMap = new Map<number, Producto>();
  stockEnBodega.forEach(item => {
    if (!productosMap.has(item.productoId) && item.producto) {
      productosMap.set(item.productoId, item.producto);
    }
  });
  return Array.from(productosMap.values());
});

// --- GENERADOR DE MATRIZ PLANA ---
watch([() => form.value.origenId, () => form.value.productoPadreId], ([origenId, prodId]) => {
  if (!origenId || !prodId) {
    tallasDisponibles.value = [];
    coloresDisponibles.value = [];
    matrizStock.value = {};
    matrizCantidades.value = {};
    return;
  }

  const variaciones = inventarioTotal.value.filter(
    i => i.bodegaId === Number(origenId) && i.productoId === Number(prodId) && i.stock > 0
  );

  const tSet = new Set<string>();
  const cSet = new Set<string>();
  variaciones.forEach(v => { 
    tSet.add(v.talla); 
    cSet.add(v.color); 
  });

  tallasDisponibles.value = Array.from(tSet).sort();
  coloresDisponibles.value = Array.from(cSet).sort();

  const tempStock: MatrizPlana = {};
  const tempCantidades: MatrizPlana = {};

  // Llenamos las matrices con una llave combinada: "Color|Talla"
  coloresDisponibles.value.forEach(color => {
    tallasDisponibles.value.forEach(talla => {
      const llave = `${color}|${talla}`;
      const item = variaciones.find(v => v.color === color && v.talla === talla);
      
      tempStock[llave] = item ? item.stock : 0;
      tempCantidades[llave] = 0; 
    });
  });

  matrizStock.value = tempStock;
  matrizCantidades.value = tempCantidades;
});

// Calcular total de prendas
const totalPrendasAMover = computed(() => {
  let total = 0;
  for (const llave in matrizCantidades.value) {
    total += matrizCantidades.value[llave] || 0;
  }
  return total;
});

// --- GENERAR PDF ---
const generarGuiaTraslado = async (origen: any, destino: any, productoNombre: string, skuBase: string, detalles: any[], correlativo: string) => {
  const doc = new jsPDF();
  const qrDataUrl = await QRCode.toDataURL(correlativo);

  doc.setFillColor(15, 23, 42); 
  doc.rect(0, 0, 210, 40, 'F');
  
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(20);
  doc.setFont("helvetica", "bold");
  doc.text("GUÍA DE TRASLADO INTERNO", 15, 25);
  
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text(`Fecha: ${new Date().toLocaleDateString()}`, 145, 25);

  doc.setTextColor(0, 0, 0);
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.text("ALMACÉN ORIGEN:", 15, 55); 
  doc.setFont("helvetica", "normal"); 
  doc.text(`${origen.nombre}`, 15, 62);
  
  doc.setFont("helvetica", "bold");
  doc.text("ALMACÉN DESTINO:", 110, 55); 
  doc.setFont("helvetica", "normal"); 
  doc.text(`${destino.nombre}`, 110, 62);
  
  doc.setFont("helvetica", "bold");
  doc.text(`Código de Control: ${correlativo}`, 15, 75);
  doc.addImage(qrDataUrl, 'PNG', 160, 45, 32, 32);

  autoTable(doc, {
    startY: 85,
    head: [['Código Base', 'Descripción Producto', 'Variante Color', 'Talla', 'Volumen']],
    body: detalles.map(d => [skuBase || 'N/A', productoNombre, d.color, d.talla, `${d.cantidad} uds`]),
    theme: 'grid',
    headStyles: { fillColor: [15, 23, 42] }
  });

  const finalY = (doc as any).lastAutoTable.finalY + 35;
  doc.setFontSize(9);
  doc.text("___________________________", 30, finalY);
  doc.text("Despachado por (Origen)", 35, finalY + 5);
  doc.text("___________________________", 130, finalY);
  doc.text("Recibido y Verificado (Destino)", 132, finalY + 5);

  doc.save(`Guia_Traslado_${correlativo}.pdf`);
};

// --- PROCESAR OPERACIÓN ---
const registrarTrasladoLote = async () => {
  if (totalPrendasAMover.value <= 0) return alert('⚠️ Por favor, ingresa al menos una cantidad.');

  const detallesParaBackend = [];
  
  // Recorremos las llaves planas
  for (const llave in matrizCantidades.value) {
    const cantidad = matrizCantidades.value[llave] || 0;
    
    if (cantidad > 0) {
      const stockDisponible = matrizStock.value[llave] || 0;
      
      if (cantidad > stockDisponible) {
        return alert(`X Error: Hay una cantidad que excede el stock disponible actual.`);
      }
      
      // Separamos "Color|Talla" a variables individuales
      const [color, talla] = llave.split('|');

      detallesParaBackend.push({
        productoId: Number(form.value.productoPadreId),
        color: color,
        talla: talla,
        cantidad: cantidad
      });
    }
  }

  procesando.value = true;
  try {
    await api.post('/almacen-terminados/traslado', {
      origenId: Number(form.value.origenId),
      destinoId: Number(form.value.destinoId),
      detalles: detallesParaBackend
    });
    
    const correlativoInterno = `TR-${Date.now().toString().slice(-6)}`;
    const bodegaOrigen = bodegas.value.find(b => b.id === Number(form.value.origenId));
    const bodegaDestino = bodegas.value.find(b => b.id === Number(form.value.destinoId));
    
    const productoBase = productosEnOrigen.value.find(p => p.id === Number(form.value.productoPadreId));
    if (!productoBase) throw new Error("No se pudo identificar el producto.");
    
    await generarGuiaTraslado(
      bodegaOrigen, 
      bodegaDestino, 
      productoBase.nombre, 
      productoBase.skuBase || 'S/N', 
      detallesParaBackend, 
      correlativoInterno
    );
    
    alert(`✅ Operación Completada con éxito. Traslado de ${totalPrendasAMover.value} unidades procesado en lote.`);
    form.value.productoPadreId = ''; 
    await cargarDatos(); 
  } catch (error: any) {
    alert('❌ Error operativo: ' + (error.response?.data?.message || error.message || 'Fallo de comunicación'));
  } finally {
    procesando.value = false;
  }
};

onMounted(cargarDatos);
</script>

<template>
  <div class="space-y-8 p-4 md:p-6 font-urbanist animate-fade-in">
    
    <div class="bg-white p-6 md:p-8 rounded-2xl shadow-sm border border-gray-100 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
      <div>
        <h2 class="text-2xl md:text-3xl font-black text-gray-900 tracking-tight">Distribución Logística Interna 🔄</h2>
        <p class="text-sm text-gray-500 mt-1 font-medium">Mueve grandes volúmenes de inventario a través de matrices automatizadas por producto.</p>
      </div>
      <div class="text-xs font-black text-blue-600 bg-blue-50 px-4 py-2 rounded-xl border border-blue-100 uppercase tracking-widest shrink-0">
        Control Multibodega Activo
      </div>
    </div>

    <div v-if="cargando" class="text-center py-24 flex flex-col items-center justify-center gap-3">
      <div class="w-10 h-10 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin"></div>
      <p class="text-xs font-black text-gray-400 uppercase tracking-widest">Sincronizando Estado Global del Almacén...</p>
    </div>

    <div v-else class="grid grid-cols-1 lg:grid-cols-12 gap-6">
      
      <div class="lg:col-span-4 space-y-4">
        <div class="bg-white p-6 rounded-3xl shadow-sm border border-gray-200 relative overflow-hidden">
          <label class="block text-[10px] font-black text-red-500 uppercase tracking-widest mb-2">1. Punto de Partida (Origen)</label>
          <select v-model="form.origenId" @change="form.productoPadreId = ''" 
            class="w-full bg-gray-50 border border-gray-200 p-4 rounded-xl font-bold text-gray-800 outline-none focus:border-red-500 cursor-pointer text-sm transition-all">
            <option value="" disabled>Selecciona Almacén Emisor...</option>
            <option v-for="b in bodegas" :key="b.id" :value="b.id">{{ b.nombre }}</option>
          </select>
        </div>

        <div class="bg-white p-6 rounded-3xl shadow-sm border border-gray-200 relative overflow-hidden">
          <label class="block text-[10px] font-black text-emerald-500 uppercase tracking-widest mb-2">2. Punto de Recepción (Destino)</label>
          <select v-model="form.destinoId" 
            class="w-full bg-gray-50 border border-gray-200 p-4 rounded-xl font-bold text-gray-800 outline-none focus:border-emerald-500 cursor-pointer text-sm transition-all">
            <option value="" disabled>Selecciona Almacén Receptor...</option>
            <option v-for="b in bodegas" :key="b.id" :value="b.id" :disabled="b.id === Number(form.origenId)">
              {{ b.nombre }}
            </option>
          </select>
        </div>
      </div>

      <div class="lg:col-span-8 bg-gray-900 rounded-[2rem] shadow-xl border border-gray-800 p-6 md:p-8 text-white flex flex-col min-h-[450px]">
        <h3 class="text-lg font-black mb-4 flex items-center gap-2">
          <span class="text-blue-400 font-mono text-sm">03.</span> Configuración de Carga por Lotes
        </h3>
        
        <div v-if="!form.origenId" class="flex-1 border-2 border-dashed border-gray-700 rounded-2xl p-8 flex flex-col items-center justify-center text-center text-gray-500">
          <span class="text-3xl mb-2">🏭</span>
          <p class="text-sm font-bold max-w-xs">Establece la bodega de origen para poder escanear los modelos con existencias.</p>
        </div>
        
        <div v-else class="space-y-6 flex-1 flex flex-col">
          <select v-model="form.productoPadreId" class="w-full bg-gray-800 border border-gray-700 p-4 rounded-xl font-bold text-white outline-none focus:border-blue-500 text-sm cursor-pointer transition-all">
            <option value="" disabled>Elige el Modelo de Ropa...</option>
            <option v-for="p in productosEnOrigen" :key="p.id" :value="p.id">
              {{ p.nombre }} {{ p.skuBase ? `(${p.skuBase})` : '' }}
            </option>
          </select>

          <div v-if="form.productoPadreId && coloresDisponibles.length > 0" class="bg-gray-800/40 rounded-2xl border border-gray-700 p-4 overflow-hidden animate-[fadeIn_0.2s_ease-out]">
            <div class="overflow-x-auto">
              <table class="w-full text-center border-collapse">
                <thead>
                  <tr class="border-b border-gray-700/60">
                    <th class="p-3 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest">Variante \ Talla</th>
                    <th v-for="talla in tallasDisponibles" :key="talla" class="p-3 text-xs font-black bg-gray-800 text-gray-200 rounded-t-lg font-mono">
                      {{ talla }}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="color in coloresDisponibles" :key="color" class="border-b border-gray-800/40 last:border-none">
                    <td class="p-3 text-left text-xs font-black text-gray-300 bg-gray-800/20">
                      {{ color }}
                    </td>
                    <td v-for="talla in tallasDisponibles" :key="talla" class="p-2">
                      
                      <div v-if="(matrizStock[`${color}|${talla}`] || 0) > 0" class="flex flex-col items-center gap-1">
                        <input 
                          type="number" 
                          v-model.number="matrizCantidades[`${color}|${talla}`]" 
                          min="0" 
                          :max="matrizStock[`${color}|${talla}`]"
                          class="w-16 bg-black border border-gray-700 text-center py-1.5 px-1 rounded-lg font-black text-sm text-white outline-none focus:border-blue-500 transition-all hide-arrows" 
                        />
                        <span class="text-[9px] font-bold text-emerald-400">Disp: {{ matrizStock[`${color}|${talla}`] }}</span>
                      </div>
                      
                      <div v-else class="text-gray-600 text-[9px] font-black uppercase py-3 select-none">
                        -
                      </div>
                      
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <div class="mt-auto flex flex-col sm:flex-row gap-4 pt-4 border-t border-gray-800">
            <div class="bg-gray-800 rounded-xl p-3.5 border border-gray-700 text-center sm:w-44 shrink-0">
              <p class="text-[9px] text-gray-400 font-black uppercase tracking-widest mb-0.5">Volumen de Lote</p>
              <p class="text-2xl font-black text-blue-400 font-mono">{{ totalPrendasAMover }} <span class="text-xs text-gray-400">uds</span></p>
            </div>
            
            <button 
              @click="registrarTrasladoLote" 
              :disabled="procesando || totalPrendasAMover <= 0" 
              class="flex-1 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-800 text-white font-black rounded-xl text-base tracking-wide transition-all shadow-lg active:scale-[0.99] py-4 flex items-center justify-center gap-2">
              <span v-if="procesando" class="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
              <span v-else>🚀 CONFIRMAR TRASLADO GENERAL</span>
            </button>
          </div>
          
        </div>
      </div>

    </div>
  </div>
</template>

<style scoped>
@import url('https://fonts.googleapis.com/css2?family=Urbanist:wght@400;500;700;900&display=swap');
.font-urbanist { font-family: 'Urbanist', sans-serif; }

.animate-fade-in { animation: fadeIn 0.4s ease-out; }
@keyframes fadeIn {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}

.hide-arrows::-webkit-outer-spin-button,
.hide-arrows::-webkit-inner-spin-button {
  -webkit-appearance: none;
  margin: 0;
}
.hide-arrows[type=number] {
  -moz-appearance: textfield;
}
</style>