<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed, watch } from 'vue';
import api from '../api/axios';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import QrcodeVue from 'qrcode.vue'; 
import QRCode from 'qrcode'; 
import { useScanner } from '../composables/useScanner'; 

// --- DEFINICIÓN DE TIPOS ---
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
  skuBarras?: string; 
  producto: Producto;
}

// --- ESTADOS REACTIVOS ---
const bodegas = ref<any[]>([]);
const inventarioTotal = ref<ItemInventario[]>([]);
const colores = ref<any[]>([]); 
const cargando = ref(true);
const procesando = ref(false); 

const form = ref({
  origenId: '',
  destinoId: '',
  productoPadreId: ''
});

const tallasDisponibles = ref<string[]>([]);
const coloresDisponibles = ref<string[]>([]);

const matrizStock = ref<MatrizPlana>({});
const matrizCantidades = ref<MatrizPlana>({}); // AHORA ES GLOBAL: "productoId|color|talla"

// --- ESTADOS DEL ESCÁNER (FÍSICO) ---
const bufferEscaner = ref('');
let timeoutEscaner: ReturnType<typeof setTimeout> | null = null;
const ultimoEscaneado = ref('');

// --- INTEGRACIÓN DEL COMPOSABLE DEL ESCÁNER MÓVIL ---
const codigoEscaneadoRef = ref('');
const { 
  pinConexion, 
  movilVinculado, 
  mostrarVinculacion, 
  urlVinculacion, 
  emitirSincronizacion 
} = useScanner(() => procesarCodigo(codigoEscaneadoRef.value), codigoEscaneadoRef);

// Sincroniza TODO el carrito acumulado hacia el celular
const sincronizarMatrizAlCelular = () => {
  const itemsParaCelular = [];
  
  for (const llaveGlobal in matrizCantidades.value) {
    const cantidad = matrizCantidades.value[llaveGlobal] || 0;
    if (cantidad > 0) {
      const [prodIdStr, color, talla] = llaveGlobal.split('|');
      const pBase = productosEnOrigen.value.find(p => p.id === Number(prodIdStr));
      
      itemsParaCelular.push({
        nombre: pBase ? pBase.nombre : 'Producto',
        sku: pBase ? pBase.skuBase : '',
        talla: talla,
        color: color,
        cantidad: cantidad
      });
    }
  }
  emitirSincronizacion(itemsParaCelular);
};

// --- LÓGICA DE PROCESAMIENTO DE CÓDIGOS ---
const manejarEscaneo = (e: KeyboardEvent) => {
  // 1. Ignorar si el usuario está escribiendo manualmente en algún input de la pantalla
  if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) {
    return;
  }

  // 2. Si el escáner manda el "Enter" final, procesamos todo
  if (e.key === 'Enter') {
    if (bufferEscaner.value.length > 3) {
      procesarCodigo(bufferEscaner.value.trim());
    }
    bufferEscaner.value = '';
    return;
  }

  // 🔥 3. EL FILTRO MÁGICO: Ignorar teclas de sistema (Shift, Control, Alt, CapsLock)
  // Las teclas normales (letras, números, guiones) tienen longitud 1.
  if (e.key.length > 1) {
    return; 
  }

  // 4. Guardar la letra/número limpio en la memoria invisible
  bufferEscaner.value += e.key;

  // 5. Reiniciar el temporizador (Subimos a 100ms para darle un respiro a pistolas más lentas)
  if (timeoutEscaner) clearTimeout(timeoutEscaner);
  timeoutEscaner = setTimeout(() => {
    bufferEscaner.value = '';
  }, 100); 
};

const procesarCodigo = (codigoEscaneado: string) => {
  if (!form.value.origenId) {
    return alert('⚠️ Selecciona primero la Bodega de Origen para comenzar a escanear.');
  }

  const codigoLimpio = codigoEscaneado.trim().toUpperCase().replace(/'/g, '-');

  const itemEncontrado = inventarioConSKU.value.find(
    (inv: any) => inv.bodegaId === Number(form.value.origenId) && 
    (inv.skuCalculado === codigoLimpio || inv.skuBarras === codigoLimpio || inv.producto.skuBase === codigoLimpio)
  );

  if (!itemEncontrado) {
    return alert(`❌ El código ${codigoEscaneado} no se encuentra en esta bodega o está agotado.`);
  }

  // Llave global única para multiproducto
  const llaveGlobal = `${itemEncontrado.productoId}|${itemEncontrado.color}|${itemEncontrado.talla}`;
  const cantidadActual = matrizCantidades.value[llaveGlobal] || 0;

  if (cantidadActual + 1 > itemEncontrado.stock) {
    return alert(`⚠️ Cuidado: No hay suficiente stock disponible para ${itemEncontrado.color} - Talla ${itemEncontrado.talla}.`);
  } 

  matrizCantidades.value[llaveGlobal] = cantidadActual + 1;
  ultimoEscaneado.value = `+1 ${itemEncontrado.producto.nombre} (${itemEncontrado.color} - ${itemEncontrado.talla})`;
  
  // Si escanea algo diferente, cambiamos la vista pero SIN borrar lo anterior
  if (form.value.productoPadreId !== itemEncontrado.productoId.toString()) {
    form.value.productoPadreId = itemEncontrado.productoId.toString();
  }

  sincronizarMatrizAlCelular();
  setTimeout(() => ultimoEscaneado.value = '', 3000);
};

// --- CARGA DE DATOS ---
const cargarDatos = async () => {
  cargando.value = true;
  try {
    const [resBodegas, resInv, resColores] = await Promise.all([
      api.get('/almacen-terminados/bodegas'),
      api.get('/almacen-terminados/inventario'),
      api.get('/colores')
    ]);
    bodegas.value = resBodegas.data.filter((b: any) => b.estado); 
    inventarioTotal.value = resInv.data;
    colores.value = resColores.data || [];
  } catch (error) {
    console.error("Error al cargar datos logísticos:", error);
  } finally {
    cargando.value = false;
  }
};

const inventarioConSKU = computed(() => {
  return inventarioTotal.value.map(item => {
    const colorObj = colores.value.find(c => c.codigo === item.color || c.nombre === item.color);
    const codigoColor = colorObj ? colorObj.codigo : String(item.color).substring(0, 3).toUpperCase();
    const idProd = item.productoId || item.producto?.id;
    return { 
      ...item, 
      skuCalculado: `PRD${idProd}-${codigoColor}-${item.talla}`.toUpperCase() 
    };
  });
});

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

// --- GENERADOR DE VISTA DE MATRIZ (No borra las cantidades globales) ---
watch([() => form.value.origenId, () => form.value.productoPadreId], ([origenId, prodId]) => {
  if (!origenId || !prodId) {
    tallasDisponibles.value = [];
    coloresDisponibles.value = [];
    matrizStock.value = {};
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

  coloresDisponibles.value.forEach(color => {
    tallasDisponibles.value.forEach(talla => {
      const llaveVista = `${color}|${talla}`;
      const llaveGlobal = `${prodId}|${color}|${talla}`;
      const item = variaciones.find(v => v.color === color && v.talla === talla);
      
      tempStock[llaveVista] = item ? item.stock : 0;
      
      // Solo inicializa en 0 si no existía antes en la memoria global
      if (matrizCantidades.value[llaveGlobal] === undefined) {
        matrizCantidades.value[llaveGlobal] = 0;
      }
    });
  });

  matrizStock.value = tempStock;
});

const totalPrendasAMover = computed(() => {
  let total = 0;
  for (const llaveGlobal in matrizCantidades.value) {
    total += matrizCantidades.value[llaveGlobal] || 0;
  }
  return total;
});

// --- GENERAR PDF MULTIPRODUCTO ---
const generarGuiaTraslado = async (origen: any, destino: any, detallesCompletos: any[], correlativo: string) => {
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
    body: detallesCompletos.map(d => [d.sku || 'N/A', d.nombre, d.color, d.talla, `${d.cantidad} uds`]),
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

// --- FUNCIÓN PARA MOVER TODO EL STOCK DE GOLPE ---
const seleccionarTodoElStock = () => {
  if (!form.value.productoPadreId) return;

  const prodId = form.value.productoPadreId;
  let prendasAgregadas = 0;

  // Recorremos los colores y tallas que están en la vista actual
  coloresDisponibles.value.forEach(color => {
    tallasDisponibles.value.forEach(talla => {
      const llaveVista = `${color}|${talla}`;
      const llaveGlobal = `${prodId}|${color}|${talla}`;

      const stockDisponible = matrizStock.value[llaveVista] || 0;

      // Si hay stock, lo pasamos completo a la caja de traslado
      if (stockDisponible > 0) {
        matrizCantidades.value[llaveGlobal] = stockDisponible;
        prendasAgregadas += stockDisponible;
      }
    });
  });

  if (prendasAgregadas > 0) {
    sincronizarMatrizAlCelular();
    ultimoEscaneado.value = `⚡ ¡Se seleccionaron ${prendasAgregadas} prendas al máximo!`;
    setTimeout(() => ultimoEscaneado.value = '', 3000);
  }
};

// --- PROCESAR OPERACIÓN AL BACKEND ---
const registrarTrasladoLote = async () => {
  if (totalPrendasAMover.value <= 0) return alert('⚠️ Por favor, ingresa al menos una cantidad.');

  const detallesParaBackend = [];
  const detallesParaPDF = [];
  
  for (const llaveGlobal in matrizCantidades.value) {
    const cantidad = matrizCantidades.value[llaveGlobal] || 0;
    
    if (cantidad > 0) {
      const [prodIdStr, color, talla] = llaveGlobal.split('|');

      // Doble validación de seguridad antes de enviar
      const itemOriginal = inventarioTotal.value.find(
        i => i.bodegaId === Number(form.value.origenId) && 
             i.productoId === Number(prodIdStr) && 
             i.color === color && 
             i.talla === talla
      );

      if (cantidad > (itemOriginal?.stock || 0)) {
        return alert(`❌ Error: La cantidad excede el stock disponible para ${color} - ${talla}.`);
      }
      
      detallesParaBackend.push({
        productoId: Number(prodIdStr),
        color: color,
        talla: talla,
        cantidad: cantidad
      });

      const pBase = productosEnOrigen.value.find(p => p.id === Number(prodIdStr));
      detallesParaPDF.push({
        nombre: pBase ? pBase.nombre : 'Producto',
        sku: pBase ? pBase.skuBase : 'S/N',
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
    
    await generarGuiaTraslado(bodegaOrigen, bodegaDestino, detallesParaPDF, correlativoInterno);
    
    alert(`✅ Operación Completada con éxito. Traslado de ${totalPrendasAMover.value} unidades procesado.`);
    
    // Limpieza total post-éxito
    form.value.productoPadreId = ''; 
    matrizCantidades.value = {}; 
    emitirSincronizacion([]); 
    await cargarDatos(); 
  } catch (error: any) {
    alert('❌ Error operativo: ' + (error.response?.data?.message || error.message || 'Fallo de comunicación'));
  } finally {
    procesando.value = false;
  }
};

onMounted(() => {
  cargarDatos();
  window.addEventListener('keydown', manejarEscaneo);
});

onUnmounted(() => {
  window.removeEventListener('keydown', manejarEscaneo);
});
</script>

<template>
  <div class="space-y-8 p-4 md:p-6 font-urbanist animate-fade-in">
    
    <div class="bg-white p-6 md:p-8 rounded-2xl shadow-sm border border-gray-100 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
      <div>
        <h2 class="text-2xl md:text-3xl font-black text-gray-900 tracking-tight">Distribución Logística Interna 🔄</h2>
        <p class="text-sm text-gray-500 mt-1 font-medium">Mueve grandes volúmenes de inventario a través de matrices y escáner láser/móvil.</p>
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
        
        <div class="flex justify-between items-start mb-4">
           <h3 class="text-lg font-black flex items-center gap-2">
             <span class="text-blue-400 font-mono text-sm">03.</span> Configuración de Carga por Lotes
           </h3>
           
           <div v-if="ultimoEscaneado" class="text-emerald-400 font-black text-sm animate-pulse tracking-wide bg-black/30 px-3 py-1 rounded-lg">
             {{ ultimoEscaneado }}
           </div>
        </div>

        <div v-if="form.origenId" class="mb-6 bg-gray-800 rounded-2xl border border-gray-700 flex flex-col overflow-hidden">
          <button @click="mostrarVinculacion = !mostrarVinculacion" class="w-full p-4 flex justify-between items-center bg-gray-800 hover:bg-gray-700 transition-colors focus:outline-none">
             <div class="flex items-center gap-3">
               <div class="w-8 h-8 bg-blue-500/20 text-blue-400 rounded-full flex items-center justify-center border border-blue-500/30">
                 <span class="text-sm">📱</span>
               </div>
               <div class="text-left">
                 <h3 class="font-black text-white text-[10px] uppercase tracking-widest">Escáner Remoto</h3>
                 <p class="text-[9px] font-bold mt-0.5" :class="movilVinculado ? 'text-green-400' : 'text-gray-400'">{{ movilVinculado ? 'Conectado y Listo' : 'Toca para vincular cámara' }}</p>
               </div>
             </div>
             <svg :class="{'rotate-180': mostrarVinculacion}" class="w-4 h-4 text-gray-400 transition-transform duration-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path></svg>
          </button>

          <div v-show="mostrarVinculacion" class="px-4 pb-4 border-t border-gray-700 animate-[fadeIn_0.2s_ease-out]">
            <div v-if="!movilVinculado" class="mt-4 bg-gray-900 border-2 border-dashed border-gray-700 rounded-2xl p-4 flex flex-col md:flex-row items-center justify-center gap-6">
              <div class="bg-white p-2 rounded-xl border border-gray-100">
                <qrcode-vue :value="urlVinculacion" :size="110" level="H" render-as="svg" />
              </div>
              <div class="text-center md:text-left">
                <p class="text-[9px] text-gray-500 uppercase tracking-widest font-bold">PIN de acceso</p>
                <div class="text-3xl font-mono font-black text-white tracking-[0.2em] mt-1">
                  {{ pinConexion }}
                </div>
              </div>
            </div>
          </div>
        </div>
        
        <div v-if="!form.origenId" class="flex-1 border-2 border-dashed border-gray-700 rounded-2xl p-8 flex flex-col items-center justify-center text-center text-gray-500">
          <span class="text-3xl mb-2">🏭</span>
          <p class="text-sm font-bold max-w-xs">Establece la bodega de origen para habilitar el lector de código de barras.</p>
        </div>
        
        <div v-else class="space-y-6 flex-1 flex flex-col">
          <select v-model="form.productoPadreId" class="w-full bg-gray-800 border border-gray-700 p-4 rounded-xl font-bold text-white outline-none focus:border-blue-500 text-sm cursor-pointer transition-all">
            <option value="" disabled>Elige el Modelo de Ropa (O escanea una prenda para seleccionarlo automáticamente)...</option>
            <option v-for="p in productosEnOrigen" :key="p.id" :value="p.id">
              {{ p.nombre }} {{ p.skuBase ? `(${p.skuBase})` : '' }}
            </option>
          </select>

          <div v-if="form.productoPadreId && coloresDisponibles.length > 0" class="bg-gray-800/40 rounded-2xl border border-gray-700 p-4 overflow-hidden animate-[fadeIn_0.2s_ease-out]">
            <div class="flex justify-between items-center mb-4 border-b border-gray-700/50 pb-3">
              <span class="text-[10px] text-gray-400 font-black uppercase tracking-widest">Matriz de Distribución</span>
              
              <button @click="seleccionarTodoElStock" 
                      class="bg-blue-500/10 text-blue-400 hover:bg-blue-500 hover:text-white px-3 py-1.5 rounded-lg text-[10px] font-black uppercase transition-all flex items-center gap-1.5 border border-blue-500/20 active:scale-95">
                <span>⚡</span> VACIAR STOCK COMPLETO
              </button>
            </div>
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
                          v-model.number="matrizCantidades[`${form.productoPadreId}|${color}|${talla}`]" 
                          @change="sincronizarMatrizAlCelular"
                          min="0" 
                          :max="matrizStock[`${color}|${talla}`]"
                          class="w-16 bg-black border border-gray-700 text-center py-1.5 px-1 rounded-lg font-black text-sm text-white outline-none focus:border-blue-500 transition-all hide-arrows" 
                        />
                        <span class="text-[9px] font-bold text-emerald-400">Disp: {{ matrizStock[`${color}|${talla}`] }}</span>
                      </div>
                      <div v-else class="text-gray-600 text-[9px] font-black uppercase py-3 select-none">-</div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <div class="mt-auto flex flex-col sm:flex-row gap-4 pt-4 border-t border-gray-800">
            <div class="bg-gray-800 rounded-xl p-3.5 border border-gray-700 text-center sm:w-44 shrink-0">
              <p class="text-[9px] text-gray-400 font-black uppercase tracking-widest mb-0.5">Volumen Acumulado</p>
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