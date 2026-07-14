<script setup lang="ts">
import { ref, computed, onMounted, nextTick } from 'vue';
import api from '../../api/axios'; // Ajusta la ruta si es necesario

const props = defineProps<{
  bodegas: any[];
  productos: any[];
  colores: any[];
  bodegaPredefinida: number | '';
}>();

const emit = defineEmits(['cerrar', 'recargar-datos']);

// Estados propios del formulario de ingreso
const formIngreso = ref({ bodegaId: '' as number | '', productoId: '' as number | '', color: '', talla: '', cantidad: '' as any });
const historialSesion = ref<any[]>([]);
const mostrarExito = ref(false);

// Tallas Estáticas
const tallasAgrupadas = {
  'Letras (Polos, Casacas, etc.)': ['XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL', '4XL'],
  'Números (Pantalones, Jeans)': ['28', '30', '32', '34', '36', '38', '40', '42', '44', '46'],
  'Especiales': ['Estándar / Única']
};

// Autocompletado Bodegas
const searchBodega = ref('');
const showBodegas = ref(false);
const cerrarBuscadorBodegas = () => setTimeout(() => showBodegas.value = false, 200);
const bodegasFiltradas = computed(() => {
  const activas = props.bodegas.filter(b => b.estado);
  if (!searchBodega.value) return activas;
  const q = searchBodega.value.toLowerCase();
  return activas.filter(b => b.nombre.toLowerCase().includes(q) || b.tipo.toLowerCase().includes(q));
});
const selectBodega = (bodega: any) => {
  formIngreso.value.bodegaId = bodega.id; searchBodega.value = bodega.nombre; showBodegas.value = false;
};

// Autocompletado Productos
const searchProducto = ref('');
const showProductos = ref(false);
const cerrarBuscadorProductos = () => setTimeout(() => showProductos.value = false, 200);
const productosFiltrados = computed(() => {
  if (!searchProducto.value) return props.productos;
  const q = searchProducto.value.toLowerCase();
  return props.productos.filter(p => p.nombre.toLowerCase().includes(q) || p.skuBase.toLowerCase().includes(q));
});
const selectProducto = (producto: any) => {
  formIngreso.value.productoId = producto.id; searchProducto.value = `${producto.skuBase} - ${producto.nombre}`; showProductos.value = false;
};

// Autocompletado Colores
const searchColor = ref('');
const showColores = ref(false);
const colorCodigoSeleccionado = ref(''); 
const colorFondoSeleccionado = ref('');  
const cerrarBuscadorColores = () => setTimeout(() => showColores.value = false, 200);
const coloresFiltrados = computed(() => {
  if (!searchColor.value) return props.colores;
  const q = searchColor.value.toLowerCase();
  return props.colores.filter(c => c.nombre.toLowerCase().includes(q) || c.codigo.toLowerCase().includes(q));
});
const selectColor = (color: any) => {
  formIngreso.value.color = color.codigo; searchColor.value = color.nombre; 
  colorCodigoSeleccionado.value = color.codigo; colorFondoSeleccionado.value = color.hex || color.codigoHex || '#E5E7EB'; 
  showColores.value = false;
};

// --- ESCANEO CON PISTOLA (código de barras = SKU PRD{id}-{color}-{talla}) ---
const codigoBarra = ref('');
const escaneoAuto = ref(true); // sumar +1 automático por cada escaneo
const scanError = ref('');
const scanOk = ref('');
const norm = (s: any) => String(s ?? '').trim().toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

const procesarEscaneo = async () => {
  const code = norm(codigoBarra.value).replace(/'/g, '-');
  codigoBarra.value = '';
  if (!code) return;

  if (!formIngreso.value.bodegaId) { scanError.value = 'Selecciona primero la bodega.'; return; }

  const m = code.match(/^PRD(\d+)-(.+)-([^-]+)$/);
  if (!m) { scanError.value = `Código no reconocido: ${code}`; scanOk.value = ''; return; }

  const idProd = Number(m[1]);
  const colorTok = m[2] || '';
  const tallaTok = m[3] || '';

  const prod = props.productos.find((p) => Number(p.id) === idProd);
  if (!prod) { scanError.value = `Producto ${idProd} no existe en el sistema.`; scanOk.value = ''; return; }

  const col = props.colores.find((c) => norm(c.codigo) === colorTok || norm(c.nombre) === colorTok);

  // Rellenamos el formulario con lo escaneado
  formIngreso.value.productoId = prod.id;
  searchProducto.value = `${prod.skuBase} - ${prod.nombre}`;
  formIngreso.value.color = col ? col.codigo : colorTok;
  searchColor.value = col ? col.nombre : colorTok;
  colorCodigoSeleccionado.value = col ? col.codigo : colorTok;
  colorFondoSeleccionado.value = col ? (col.hex || col.codigoHex || '#E5E7EB') : '#E5E7EB';
  formIngreso.value.talla = tallaTok;
  scanError.value = '';

  if (escaneoAuto.value) {
    // Cada escaneo suma 1 unidad y lo guarda directo
    formIngreso.value.cantidad = 1;
    await guardarIngreso();
    scanOk.value = `+1 ${prod.nombre} · ${col ? col.nombre : colorTok} · ${tallaTok}`;
    setTimeout(() => (scanOk.value = ''), 2500);
    await nextTick();
    document.getElementById('scan-ingreso')?.focus();
  } else {
    // Modo manual: llena el form y enfoca la cantidad para que pongas el número
    scanOk.value = 'Listo: pon la cantidad y presiona Ingresar.';
    await nextTick();
    (document.querySelector('input[placeholder="Cant."]') as HTMLInputElement)?.focus();
  }
};

// Lógica Principal
const guardarIngreso = async () => {
  if (!formIngreso.value.bodegaId || !formIngreso.value.productoId || !formIngreso.value.cantidad || !formIngreso.value.color || !formIngreso.value.talla) {
    return alert("⚠️ Completa todos los campos (Bodega, Producto, Color, Talla y Cantidad).");
  }

  try {
    await api.post('/almacen-terminados/inventario', formIngreso.value);

    historialSesion.value.unshift({
      id: Date.now(),
      bodegaId: formIngreso.value.bodegaId,
      productoId: formIngreso.value.productoId,
      productoNombre: searchProducto.value,
      color: formIngreso.value.color, 
      colorFondo: colorFondoSeleccionado.value, 
      talla: formIngreso.value.talla,
      cantidad: formIngreso.value.cantidad,
      hora: new Date().toLocaleTimeString()
    });

    mostrarExito.value = true;
    setTimeout(() => mostrarExito.value = false, 2000);

    formIngreso.value.color = ''; searchColor.value = ''; 
    colorCodigoSeleccionado.value = ''; colorFondoSeleccionado.value = '';
    formIngreso.value.talla = ''; formIngreso.value.cantidad = '' as any;
    
    emit('recargar-datos');

  } catch (error: any) {
    alert("❌ Error al guardar.");
  }
};

const deshacerIngresoInmediato = async (item: any, index: number) => {
  if (!confirm(`¿Deshacer el ingreso de ${item.cantidad} unidades de ${item.color} Talla ${item.talla}?`)) return;
  try {
    await api.post('/almacen-terminados/revertir-ingreso', {
      bodegaId: item.bodegaId, productoId: item.productoId, color: item.color, talla: item.talla, cantidad: item.cantidad
    });
    historialSesion.value.splice(index, 1);
    alert("🔄 Ingreso revertido correctamente.");
    emit('recargar-datos'); 
  } catch (error) {
    alert("Error al intentar deshacer el ingreso. Asegúrate de tener stock suficiente.");
  }
};

// Inicializar estado al abrir el modal
onMounted(() => {
  formIngreso.value.bodegaId = props.bodegaPredefinida;
  if (props.bodegaPredefinida !== '') {
    searchBodega.value = props.bodegas.find(b => b.id === props.bodegaPredefinida)?.nombre || '';
  }
});
</script>

<template>
  <div class="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center z-[100] p-4">
    <div class="bg-white rounded-[2rem] w-full max-w-5xl min-h-[75vh] max-h-[90vh] shadow-2xl animate-in zoom-in-95 duration-300 flex flex-col md:flex-row overflow-hidden relative">
      <div v-if="mostrarExito" class="absolute top-4 left-1/2 transform -translate-x-1/2 z-50 bg-green-500 text-white px-6 py-3 rounded-full shadow-2xl flex items-center gap-2 animate-fade-in font-bold">
        <span>✅</span> ¡Ingreso guardado!
      </div>

      <div class="w-full md:w-[55%] flex flex-col">
        <div class="bg-gradient-to-br from-emerald-500 to-green-600 p-8 rounded-tl-[2rem] text-white flex justify-between items-start relative overflow-hidden shrink-0">
          <div class="absolute -top-10 -right-10 opacity-20 text-9xl">📦</div>
          <div class="relative z-10">
            <h3 class="text-3xl font-black flex items-center gap-3">Ingreso Continuo</h3>
          </div>
          <button @click="emit('cerrar')" class="md:hidden relative z-10 text-white/70 hover:text-white bg-black/10 hover:bg-black/20 rounded-full p-2">✕</button>
        </div>

        <div class="p-8 space-y-6 bg-white flex-1 overflow-y-auto">
          
          <div class="relative">
            <label class="block text-[11px] font-bold text-gray-500 uppercase mb-1.5 ml-1">Ubicación</label>
            <div class="relative flex items-center">
              <input type="text" v-model="searchBodega" @focus="showBodegas = true" @blur="cerrarBuscadorBodegas" @input="formIngreso.bodegaId = ''" placeholder="🔍 Buscar bodega..." class="w-full bg-gray-50 border border-gray-200 text-gray-800 rounded-xl pl-4 pr-10 py-4 outline-none focus:ring-2 focus:ring-emerald-500 font-bold text-lg" />
              <button v-if="searchBodega" @click="searchBodega = ''; formIngreso.bodegaId = ''" class="absolute right-3 text-gray-400 hover:text-red-500 bg-gray-200 hover:bg-red-100 p-1.5 rounded-full transition">✕</button>
            </div>
            <div v-if="showBodegas" class="absolute z-20 w-full mt-1 bg-white border border-gray-200 rounded-xl shadow-xl max-h-48 overflow-y-auto">
              <div v-for="b in bodegasFiltradas" :key="b.id" @click="selectBodega(b)" class="px-4 py-3 hover:bg-emerald-50 cursor-pointer text-sm font-bold border-b border-gray-50">{{ b.nombre }}</div>
            </div>
          </div>

          <!-- ESCANEO CON PISTOLA -->
          <div class="bg-blue-50 border border-blue-200 rounded-2xl p-4">
            <div class="flex items-center justify-between mb-2">
              <label class="block text-[11px] font-black text-blue-700 uppercase ml-1">🔫 Escanear código de barras</label>
              <label class="flex items-center gap-1.5 text-[11px] font-bold text-blue-700 cursor-pointer select-none">
                <input type="checkbox" v-model="escaneoAuto" class="accent-blue-600"> Sumar 1 automático
              </label>
            </div>
            <input
              id="scan-ingreso"
              type="text"
              v-model="codigoBarra"
              @keyup.enter="procesarEscaneo"
              placeholder="Apunta con la pistola y dispara..."
              class="w-full bg-white border-2 border-blue-300 rounded-xl px-4 py-4 outline-none focus:ring-2 focus:ring-blue-500 font-mono font-bold text-lg"
            />
            <p v-if="scanError" class="mt-2 text-xs font-bold text-red-600 flex items-center gap-1">⚠️ {{ scanError }}</p>
            <p v-else-if="scanOk" class="mt-2 text-xs font-bold text-emerald-600 flex items-center gap-1">✅ {{ scanOk }}</p>
            <p v-else class="mt-2 text-[10px] text-blue-500">Selecciona la bodega arriba y escanea. Con "Sumar 1 automático" cada disparo agrega una unidad.</p>
          </div>

          <div class="relative">
            <label class="block text-[11px] font-bold text-gray-500 uppercase mb-1.5 ml-1">Modelo de Prenda</label>
            <div class="relative flex items-center">
              <input type="text" v-model="searchProducto" @focus="showProductos = true" @blur="cerrarBuscadorProductos" @input="formIngreso.productoId = ''" placeholder="🔍 Busca SKU o nombre..." class="w-full bg-gray-50 border border-gray-200 text-gray-800 rounded-xl pl-4 pr-10 py-4 outline-none focus:ring-2 focus:ring-emerald-500 font-bold text-lg" />
              <button v-if="searchProducto" @click="searchProducto = ''; formIngreso.productoId = ''" class="absolute right-3 text-gray-400 hover:text-red-500 bg-gray-200 hover:bg-red-100 p-1.5 rounded-full transition">✕</button>
            </div>
            <div v-if="showProductos" class="absolute z-20 w-full mt-1 bg-white border border-gray-200 rounded-xl shadow-xl max-h-48 overflow-y-auto">
              <div v-for="p in productosFiltrados" :key="p.id" @click="selectProducto(p)" class="px-4 py-3 hover:bg-emerald-50 cursor-pointer text-sm font-bold flex flex-col">
                <span>👕 {{ p.nombre }}</span><span class="text-[10px] text-gray-400 ml-6">{{ p.skuBase }}</span>
              </div>
            </div>
          </div>

          <div class="grid grid-cols-2 gap-4">
            <div class="relative">
              <label class="block text-[11px] font-bold text-gray-500 uppercase mb-1.5 ml-1">Color (Se resetea)</label>
              <div class="relative flex items-center">
                <div v-if="colorCodigoSeleccionado" class="absolute left-3 flex items-center gap-1.5 bg-white border border-gray-200 px-2 py-1 rounded z-10 shadow-sm">
                  <span class="w-4 h-4 rounded-full border border-gray-300" :style="{ backgroundColor: colorFondoSeleccionado }"></span>
                  <span class="text-xs font-mono font-black text-gray-700">{{ colorCodigoSeleccionado }}</span>
                </div>
                <input type="text" v-model="searchColor" @focus="showColores = true" @blur="cerrarBuscadorColores" @input="formIngreso.color = ''; colorCodigoSeleccionado = ''; colorFondoSeleccionado = ''" placeholder="🎨 Buscar..." :class="['w-full bg-emerald-50/50 border border-emerald-100 rounded-xl py-4 outline-none focus:ring-2 focus:ring-emerald-500 font-bold text-lg', colorCodigoSeleccionado ? 'pl-24 pr-4' : 'px-4']" />
              </div>
              <div v-if="showColores" class="absolute z-30 w-full mt-1 bg-white border border-gray-200 rounded-xl shadow-xl max-h-40 overflow-y-auto">
                <div v-for="c in coloresFiltrados" :key="c.id" @click="selectColor(c)" class="px-4 py-3 hover:bg-emerald-50 cursor-pointer text-sm font-bold flex justify-between items-center">
                  <div class="flex items-center gap-3"><span class="w-4 h-4 rounded-full border border-gray-300" :style="{ backgroundColor: c.hex || c.codigoHex || '#E5E7EB' }"></span><span>{{ c.nombre }}</span></div>
                  <span class="text-[10px] bg-gray-100 px-2 py-1 rounded font-mono font-black border">{{ c.codigo }}</span>
                </div>
              </div>
            </div>
            
            <div>
              <label class="block text-[11px] font-bold text-gray-500 uppercase mb-1.5 ml-1">Talla (Se resetea)</label>
              <select v-model="formIngreso.talla" class="w-full bg-emerald-50/50 border border-emerald-100 rounded-xl px-4 py-4 outline-none focus:ring-2 focus:ring-emerald-500 font-bold text-center text-lg appearance-none cursor-pointer">
                <option value="" disabled>Talla...</option>
                <optgroup v-for="(listaTallas, categoria) in tallasAgrupadas" :key="categoria" :label="categoria"><option v-for="t in listaTallas" :key="t" :value="t">{{ t }}</option></optgroup>
              </select>
            </div>
          </div>

          <div class="pt-4 pb-2">
            <input type="number" v-model.number="formIngreso.cantidad" min="1" placeholder="Cant." class="w-full border border-emerald-200 bg-gradient-to-b from-emerald-50 to-white py-6 px-6 rounded-2xl text-5xl text-center font-black text-emerald-800 outline-none focus:ring-4 focus:ring-emerald-500/20 shadow-inner">
          </div>

          <button @click="guardarIngreso" class="w-full bg-emerald-600 text-white py-5 rounded-2xl font-black text-xl shadow-lg shadow-emerald-500/30 hover:bg-emerald-700 transition flex items-center justify-center gap-2 mt-4">
            Ingresar y Seguir ⚡
          </button>
        </div>
      </div>

      <div class="hidden md:flex w-[45%] bg-gray-50 border-l border-gray-100 flex-col">
        <div class="p-8 border-b border-gray-200 flex justify-between items-center bg-gray-100/50">
          <h4 class="font-black text-xl text-gray-700 flex items-center gap-2">📋 Historial de Sesión</h4>
          <button @click="emit('cerrar')" class="text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-full p-2 transition-colors">
            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M6 18L18 6M6 6l12 12"></path></svg>
          </button>
        </div>

        <div class="flex-1 p-8 overflow-y-auto">
          <div v-if="historialSesion.length === 0" class="h-full flex flex-col items-center justify-center text-gray-400">
            <span class="text-7xl opacity-20">🛒</span><p class="font-bold text-base mt-6">Aún no has ingresado prendas.</p>
          </div>
          
          <div v-else class="space-y-4">
            <div v-for="(item, index) in historialSesion" :key="item.id" class="bg-white p-5 rounded-2xl shadow-sm border border-gray-200 animate-in slide-in-from-right-4">
              <div class="flex justify-between items-start">
                <div>
                  <p class="font-bold text-gray-800 text-base truncate w-60">{{ item.productoNombre }}</p>
                  <div class="flex gap-2 mt-2">
                    <span class="bg-gray-100 text-gray-600 text-[11px] font-bold px-2.5 py-1 rounded flex items-center gap-1.5"><span class="w-3 h-3 rounded-full border border-gray-300" :style="{ backgroundColor: item.colorFondo }"></span>{{ item.color }}</span>
                    <span class="bg-gray-100 text-gray-600 text-[11px] font-bold px-2.5 py-1 rounded">Talla {{ item.talla }}</span>
                  </div>
                </div>
                <div class="text-right flex flex-col items-end">
                  <p class="text-emerald-600 font-black text-2xl">+{{ item.cantidad }}</p>
                  <p class="text-[10px] text-gray-400 mb-2 font-bold">{{ item.hora }}</p>
                  <button @click="deshacerIngresoInmediato(item, index)" class="text-[11px] font-bold text-red-500 hover:text-white border border-red-200 hover:bg-red-500 px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1 shadow-sm">
                    ↩️ Deshacer
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div class="p-8 border-t border-gray-200 bg-white">
          <button @click="emit('cerrar')" class="w-full bg-gray-900 text-white py-4 rounded-xl font-bold text-lg hover:bg-black transition-all shadow-md">Cerrar Ingresos</button>
        </div>
      </div>
    </div>
  </div>
</template>