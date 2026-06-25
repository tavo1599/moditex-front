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

// ¿Esta combinación color+talla ya alcanzó su máximo disponible? (para pintarla de verde)
const estaCompleto = (color: string, talla: string) => {
  const max = matrizStock.value[`${color}|${talla}`] || 0;
  const cant = matrizCantidades.value[`${form.value.productoPadreId}|${color}|${talla}`] || 0;
  return max > 0 && cant >= max;
};

// --- ESTADOS DEL ESCÁNER (FÍSICO) ---
const bufferEscaner = ref('');
let timeoutEscaner: ReturnType<typeof setTimeout> | null = null;
const ultimoEscaneado = ref('');
const errorEscaneo = ref(''); // aviso de error NO bloqueante (no se cierra solo con el Enter del escáner)
let timeoutError: ReturnType<typeof setTimeout> | null = null;

// --- SONIDO (beep generado, sin archivos) ---
// Suena distinto si el escaneo PASA (agudo corto) o NO PASA (grave doble = error),
// para que se note cuando una prenda no se registró sin mirar la pantalla.
let audioCtx: AudioContext | null = null;
// Desbloquea el audio en el primer gesto del usuario (los navegadores no dejan
// sonar sin interacción). Así el PRIMER pitido ya suena, no recién el segundo.
const asegurarAudio = () => {
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
  } catch { /* sin audio disponible */ }
};
const tono = (freq: number, dur: number, tipo: OscillatorType = 'square', vol = 0.18) => {
  try {
    asegurarAudio();
    if (!audioCtx) return;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = tipo;
    osc.frequency.value = freq;
    gain.gain.value = vol;
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + dur);
  } catch { /* sin audio disponible */ }
};
const sonidoOk = () => tono(900, 0.07, 'square', 0.12);
const sonidoError = () => {
  tono(190, 0.22, 'sawtooth', 0.3);
  setTimeout(() => tono(140, 0.28, 'sawtooth', 0.3), 150);
};

// Muestra el error en pantalla (rojo) + suena, sin bloquear el escaneo
const fallarEscaneo = (mensaje: string) => {
  sonidoError();
  errorEscaneo.value = mensaje;
  if (timeoutError) clearTimeout(timeoutError);
  timeoutError = setTimeout(() => (errorEscaneo.value = ''), 5000);
};

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

// Normaliza para comparar sin tropiezos por mayúsculas, espacios o acentos
const norm = (s: any) => String(s ?? '').trim().toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

const procesarCodigo = (codigoEscaneado: string) => {
  if (!form.value.origenId) {
    return alert('⚠️ Selecciona primero la Bodega de Origen para comenzar a escanear.');
  }

  const codigoLimpio = norm(codigoEscaneado).replace(/'/g, '-');
  const enOrigen = inventarioConSKU.value.filter((inv: any) => inv.bodegaId === Number(form.value.origenId));

  // 1) Coincidencia exacta por SKU calculado / código de barras / SKU base (normalizados)
  let itemEncontrado = enOrigen.find((inv: any) =>
    norm(inv.skuCalculado) === codigoLimpio ||
    norm(inv.skuBarras) === codigoLimpio ||
    norm(inv.producto?.skuBase) === codigoLimpio,
  );

  // 2) Fallback estructural PRD<id>-<color>-<talla>: tolera que el color esté guardado
  //    como código, nombre o solo sus 3 primeras letras (origen real del bug en negros, etc.)
  if (!itemEncontrado) {
    const m = codigoLimpio.match(/^PRD(\d+)-(.+)-([^-]+)$/);
    if (m) {
      const idProd = Number(m[1]);
      const colorTok = m[2];
      const tallaTok = m[3];
      itemEncontrado = enOrigen.find((inv: any) => {
        if (Number(inv.productoId ?? inv.producto?.id) !== idProd) return false;
        if (norm(inv.talla) !== tallaTok) return false;
        const cNom = norm(inv.color);
        const cCod = norm(inv.colorCodigo);
        return cCod === colorTok || cNom === colorTok || cNom.slice(0, 3) === colorTok || cCod.slice(0, 3) === colorTok;
      });
    }
  }

  if (!itemEncontrado) {
    return fallarEscaneo(`❌ ${codigoEscaneado}: no está en esta bodega.`);
  }

  // Llave global única para multiproducto
  const llaveGlobal = `${itemEncontrado.productoId}|${itemEncontrado.color}|${itemEncontrado.talla}`;
  const cantidadActual = matrizCantidades.value[llaveGlobal] || 0;

  if (cantidadActual + 1 > itemEncontrado.stock) {
    return fallarEscaneo(`⚠️ Sin stock suficiente: ${itemEncontrado.color} · Talla ${itemEncontrado.talla} (máx ${itemEncontrado.stock}).`);
  }

  matrizCantidades.value[llaveGlobal] = cantidadActual + 1;
  sonidoOk();
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
    const colorObj = colores.value.find(c => norm(c.codigo) === norm(item.color) || norm(c.nombre) === norm(item.color));
    const codigoColor = colorObj ? colorObj.codigo : String(item.color).substring(0, 3).toUpperCase();
    const idProd = item.productoId || item.producto?.id;
    return {
      ...item,
      colorCodigo: codigoColor,
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

// --- GENERAR PDF MULTIPRODUCTO (VERSIÓN ECO-FRIENDLY CON TOTALES) ---
const generarGuiaTraslado = async (origen: any, destino: any, detallesCompletos: any[], correlativo: string) => {
  const doc = new jsPDF();
  const qrDataUrl = await QRCode.toDataURL(correlativo);

  // 1. ENCABEZADO AHORRADOR DE TINTA
  doc.setTextColor(0, 0, 0);
  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  doc.text("GUÍA DE TRASLADO INTERNO", 15, 22);

  doc.setLineWidth(0.3);
  doc.line(15, 26, 195, 26);

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text(`Fecha: ${new Date().toLocaleDateString()}`, 150, 20);
  
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.text("ALMACÉN ORIGEN:", 15, 36); 
  doc.setFont("helvetica", "normal"); 
  doc.text(`${origen.nombre}`, 15, 43);
  
  doc.setFont("helvetica", "bold");
  doc.text("ALMACÉN DESTINO:", 110, 36); 
  doc.setFont("helvetica", "normal"); 
  doc.text(`${destino.nombre}`, 110, 43);
  
  doc.setFont("helvetica", "bold");
  doc.text(`Código de Control: ${correlativo}`, 15, 55);
  
  doc.addImage(qrDataUrl, 'PNG', 165, 30, 25, 25);
  doc.setFontSize(7);
  doc.text("ESCANEO DE RECEPCIÓN", 163, 58);

  // 2. MATEMÁTICA: TOTALES Y SUBTOTALES POR COLOR
  let totalGeneral = 0;
  const subtotalesPorColor: Record<string, number> = {};

  const bodyTabla = detallesCompletos.map(d => {
    const nombreColorCompleto = typeof d.color === 'object' ? d.color.nombre : d.color;
    const cant = Number(d.cantidad);

    totalGeneral += cant;
    if (!subtotalesPorColor[nombreColorCompleto]) subtotalesPorColor[nombreColorCompleto] = 0;
    subtotalesPorColor[nombreColorCompleto] += cant;

    return [
      d.sku || 'N/A', 
      d.nombre, 
      nombreColorCompleto.toUpperCase(), 
      d.talla.toUpperCase(), 
      `${cant} uds`
    ];
  });

  // 3. TABLA LIMPIA ECO-FRIENDLY
  autoTable(doc, {
    startY: 65,
    head: [['Código Base', 'Descripción Producto', 'Color', 'Talla', 'Cantidad']],
    body: bodyTabla,
    theme: 'grid',
    headStyles: { 
      fillColor: [240, 240, 240],
      textColor: [0, 0, 0],
      lineColor: [150, 150, 150], 
      lineWidth: 0.1 
    },
    styles: {
      lineColor: [150, 150, 150], 
      lineWidth: 0.1
    }
  });

  // 4. RESUMEN DE TOTALES AL FINAL DE LA TABLA
  let finalY = (doc as any).lastAutoTable.finalY + 10;
  
  doc.setDrawColor(200, 200, 200);
  doc.setFillColor(250, 250, 250);
  doc.rect(15, finalY - 5, 180, 10 + (Object.keys(subtotalesPorColor).length * 6) + 10, 'FD');

  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.text("RESUMEN DE TRASLADO:", 20, finalY);
  
  finalY += 7;
  doc.setFont("helvetica", "normal");
  
  Object.entries(subtotalesPorColor).forEach(([color, cant]) => {
    doc.text(`• Subtotal ${color.toUpperCase()}:`, 25, finalY);
    doc.text(`${cant} uds`, 85, finalY);
    finalY += 6;
  });

  finalY += 3;
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.text("TOTAL GENERAL:", 25, finalY);
  doc.text(`${totalGeneral} uds`, 85, finalY);

  // 5. ESPACIO DE FIRMAS
  finalY += 30;
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
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

// Al primer clic o tecla en la página, activamos el audio (una sola vez)
const desbloquearAudioUnaVez = () => {
  asegurarAudio();
  window.removeEventListener('pointerdown', desbloquearAudioUnaVez);
  window.removeEventListener('keydown', desbloquearAudioUnaVez);
};

onMounted(() => {
  cargarDatos();
  window.addEventListener('keydown', manejarEscaneo);
  window.addEventListener('pointerdown', desbloquearAudioUnaVez);
  window.addEventListener('keydown', desbloquearAudioUnaVez);
});

onUnmounted(() => {
  window.removeEventListener('keydown', manejarEscaneo);
  window.removeEventListener('pointerdown', desbloquearAudioUnaVez);
  window.removeEventListener('keydown', desbloquearAudioUnaVez);
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

        <!-- AVISO DE ERROR DE ESCANEO (no bloqueante: suena + se ve en rojo) -->
        <div v-if="errorEscaneo" class="mb-4 flex items-center gap-3 bg-red-500/15 border border-red-500/40 text-red-300 px-4 py-3 rounded-xl animate-pulse">
          <span class="text-xl">🔊</span>
          <span class="font-bold text-sm flex-1">{{ errorEscaneo }}</span>
          <button @click="errorEscaneo = ''" class="text-red-300/70 hover:text-red-200 text-lg leading-none">&times;</button>
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
                          class="w-16 text-center py-1.5 px-1 rounded-lg font-black text-sm outline-none transition-all hide-arrows border"
                          :class="estaCompleto(color, talla)
                            ? 'bg-emerald-600 border-emerald-400 text-white'
                            : 'bg-black border-gray-700 text-white focus:border-blue-500'"
                        />
                        <span class="text-[9px] font-bold" :class="estaCompleto(color, talla) ? 'text-emerald-300' : 'text-gray-400'">
                          {{ estaCompleto(color, talla) ? '✓ Completo' : 'Disp: ' + matrizStock[`${color}|${talla}`] }}
                        </span>
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