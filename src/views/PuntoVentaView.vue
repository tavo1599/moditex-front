<script setup lang="ts">
import { ref, onMounted, computed, nextTick } from 'vue';
import api from '../api/axios'; 

// --- ESTADOS BASE ---
const bodegas = ref<any[]>([]);
const inventarioTotal = ref<any[]>([]);
const colores = ref<any[]>([]); // NUEVO: Estado para los colores reales de la BD
const cargando = ref(true);

// --- ESTADOS DEL PUNTO DE VENTA ---
const bodegaSeleccionada = ref<number | ''>('');
const codigoEscaneado = ref('');
const carrito = ref<any[]>([]);
const inputEscaner = ref<HTMLInputElement | null>(null);

// --- ESTADOS PARA DATOS DEL CLIENTE Y LOGÍSTICA ---
const clienteNombre = ref('');
const tipoVenta = ref('MINORISTA');
const requiereEnvio = ref(false);
const destinoEnvio = ref('');

// --- CÁLCULO TOTAL A PAGAR AUTÓMATICO ---
const totalPagar = computed(() => {
  return carrito.value.reduce((sum, item) => sum + (item.cantidad * item.precioUnitario), 0);
});

// --- CARGAR DATOS DESDE EL BACKEND ---
const cargarDatos = async () => {
  cargando.value = true;
  try {
    // NUEVO: Ahora jalamos bodegas, inventario Y colores
    const [resBodegas, resInv, resColores] = await Promise.all([
      api.get('/almacen-terminados/bodegas'),
      api.get('/almacen-terminados/inventario'),
      api.get('/colores') 
    ]);
    bodegas.value = resBodegas.data.filter((b: any) => b.estado);
    inventarioTotal.value = resInv.data;
    colores.value = resColores.data;
  } catch (error) {
    console.error("Error al cargar datos:", error);
  } finally {
    cargando.value = false;
  }
};

// --- ARMAR LOS SKUs PARA EL ESCÁNER (USANDO LA BD REAL) ---
const inventarioConSKU = computed(() => {
  return inventarioTotal.value.map(item => {
    // Buscamos el color en la BD para sacar su código exacto (Ej: NGR)
    const colorObj = colores.value.find(c => c.codigo === item.color || c.nombre === item.color);
    const codigoColor = colorObj ? colorObj.codigo : String(item.color).substring(0, 3).toUpperCase();
    
    // Aseguramos que jale el ID del producto correctamente
    const idProd = item.productoId || item.producto?.id;
    
    return {
      ...item,
      skuCalculado: `PRD${idProd}-${codigoColor}-${item.talla}`
    };
  });
});

// --- LÓGICA DEL ESCÁNER PISTOLA ---
const procesarEscaneo = () => {
  if (!bodegaSeleccionada.value) {
    alert("Selecciona una bodega primero.");
    codigoEscaneado.value = '';
    return;
  }

  const sku = codigoEscaneado.value.trim().toUpperCase();
  if (!sku) return;

  // Buscamos coincidencia estricta convirtiendo la bodega a Number por seguridad
  const prenda = inventarioConSKU.value.find(
    i => i.skuCalculado === sku && Number(i.bodegaId) === Number(bodegaSeleccionada.value)
  );

  if (!prenda || prenda.stock <= 0) {
    alert("Producto no encontrado o sin stock en esta bodega.");
    codigoEscaneado.value = '';
    return;
  }

  const itemEnCarrito = carrito.value.find(c => c.sku === sku);

  if (itemEnCarrito) {
    if (itemEnCarrito.cantidad + 1 > prenda.stock) {
      alert("No hay más stock disponible en almacén para esta variante.");
    } else {
      itemEnCarrito.cantidad++;
    }
  } else {
    // Producto nuevo al carrito
    carrito.value.push({
      sku: sku,
      productoId: prenda.productoId || prenda.producto?.id,
      nombre: prenda.producto?.nombre || 'Producto Genérico',
      color: prenda.color,
      talla: prenda.talla,
      cantidad: 1,
      stockMaximo: prenda.stock,
      precioUnitario: prenda.producto?.precioVenta || 0 
    });
  }
  
  codigoEscaneado.value = '';
  nextTick(() => inputEscaner.value?.focus());
};

const quitarDelCarrito = (index: number) => {
  carrito.value.splice(index, 1);
  nextTick(() => inputEscaner.value?.focus());
};

// --- ENVIAR LA VENTA AL BACKEND ---
const procesarSalida = async () => {
  if (carrito.value.length === 0) {
    alert("El carrito está vacío.");
    return;
  }

  if (requiereEnvio.value && !destinoEnvio.value.trim()) {
    alert("Por favor, ingresa la dirección o agencia de destino para el envío.");
    return;
  }

  try {
    // FORMATEO ESTRICTO: Obligamos a que todo sea Number para que la BD no falle
    const itemsParaBackend = carrito.value.map(c => ({
      productoId: Number(c.productoId),
      color: String(c.color),
      talla: String(c.talla),
      cantidad: Number(c.cantidad),
      precioUnitario: Number(c.precioUnitario) 
    }));

    const payload = {
      almacenId: Number(bodegaSeleccionada.value), // <-- ¡Aquí estaba el posible error de String!
      cliente: clienteNombre.value || 'Cliente de Mostrador', // Algunos backends usan "cliente" en vez de "clienteNombre"
      clienteNombre: clienteNombre.value || 'Cliente de Mostrador', // Mandamos ambos por si acaso
      tipoVenta: tipoVenta.value,
      requiereEnvio: requiereEnvio.value,
      destinoEnvio: requiereEnvio.value ? destinoEnvio.value : undefined,
      detalles: itemsParaBackend
    };

    // Disparamos la venta al backend
    await api.post('/ventas', payload);

    alert(requiereEnvio.value ? "Venta registrada. Notificando a Logística/Despachos 🚚" : "Venta registrada con éxito ✅");
    
    // Limpiamos la pantalla
    carrito.value = [];
    clienteNombre.value = '';
    requiereEnvio.value = false;
    destinoEnvio.value = '';
    cargarDatos(); // Refrescamos el stock
    
  } catch (error: any) {
    alert("Error al procesar: " + (error.response?.data?.message || "Error desconocido en el servidor"));
    console.error("Detalle del error:", error.response?.data);
  }
};

onMounted(cargarDatos);
</script>

<template>
  <div class="p-6 space-y-6">
    <!-- HEADER Y SELECCIÓN DE BODEGA -->
    <div class="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex justify-between items-center">
      <div>
        <h1 class="text-2xl font-bold text-gray-800">Punto de Venta (Escáner)</h1>
        <p class="text-gray-500">Selecciona bodega y escanea prendas para facturar.</p>
      </div>
      <select v-model="bodegaSeleccionada" class="border p-3 rounded-lg font-bold bg-gray-50 outline-none focus:ring-2 focus:ring-blue-500">
        <option value="" disabled>Elegir Bodega...</option>
        <option v-for="b in bodegas" :key="b.id" :value="b.id">{{ b.nombre }}</option>
      </select>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
      
      <!-- COLUMNA IZQUIERDA: LECTOR DE BARRAS -->
      <div class="md:col-span-1 bg-gray-900 p-6 rounded-xl shadow-lg text-white flex flex-col justify-center">
        <label class="block text-center text-blue-400 font-bold uppercase text-xs mb-4 tracking-widest">Lector de Barras</label>
        <input 
          ref="inputEscaner"
          type="text" 
          v-model="codigoEscaneado"
          @keyup.enter="procesarEscaneo"
          placeholder="Escanee aquí..."
          class="w-full bg-black border-2 border-gray-700 p-4 rounded-lg text-2xl text-center outline-none focus:border-blue-500 transition-colors placeholder-gray-600"
        />
        <p class="text-center text-gray-500 text-xs mt-4">Mantenga este campo seleccionado al usar la pistola lectora.</p>
      </div>

      <!-- COLUMNA DERECHA: CARRITO Y COBRO -->
      <div class="md:col-span-2 bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex flex-col justify-between">
        
        <!-- Lista de Productos -->
        <div>
          <h3 class="font-bold text-lg text-gray-800 mb-4 border-b pb-2">Artículos en Carrito</h3>
          
          <div v-if="carrito.length === 0" class="text-center py-10 text-gray-400 italic">
            <span class="text-4xl block mb-2">🛒</span>
            No hay productos escaneados aún.
          </div>
          
          <div v-else class="space-y-3 max-h-60 overflow-y-auto pr-2">
            <div v-for="(item, index) in carrito" :key="item.sku" class="flex justify-between items-center bg-gray-50 p-3 rounded-lg border border-gray-200">
              <div class="flex-1">
                <p class="font-bold text-gray-900">{{ item.nombre }}</p>
                <p class="text-xs text-gray-500 font-mono mt-1">{{ item.sku }} | Talla {{ item.talla }}</p>
              </div>
              
              <!-- Controles de Precio y Cantidad -->
              <div class="flex items-center gap-4">
                <div class="flex flex-col items-center">
                  <span class="text-[10px] text-gray-400 font-bold uppercase mb-1">Precio Unit (S/)</span>
                  <input 
                    type="number" 
                    v-model.number="item.precioUnitario" 
                    class="w-24 border border-gray-300 p-1.5 text-center rounded-md font-bold text-blue-700 focus:border-blue-500 outline-none" 
                  />
                </div>
                
                <div class="flex flex-col items-center ml-2">
                  <span class="text-[10px] text-gray-400 font-bold uppercase mb-1">Cant.</span>
                  <span class="font-black text-xl text-gray-800 w-8 text-center">{{ item.cantidad }}</span>
                </div>
                
                <button @click="quitarDelCarrito(index)" class="text-red-500 hover:text-red-700 font-bold ml-2 p-2 rounded hover:bg-red-50 transition-colors">✕</button>
              </div>
            </div>
          </div>
        </div>

        <!-- TOTAL A PAGAR -->
        <div v-if="carrito.length > 0" class="mt-4 bg-gray-900 text-white p-5 rounded-xl flex justify-between items-center shadow-md border-l-4 border-green-400">
          <span class="text-sm text-gray-300 uppercase tracking-widest font-bold">Total Venta</span>
          <span class="text-4xl font-black text-green-400">S/ {{ totalPagar.toFixed(2) }}</span>
        </div>

        <!-- DATOS DEL CLIENTE Y ENVÍO -->
        <div v-if="carrito.length > 0" class="mt-6 pt-5 border-t border-gray-200">
          <div class="grid grid-cols-2 gap-4 mb-4">
            <div>
              <label class="block text-xs font-bold text-gray-500 uppercase mb-1">Cliente / Razón Social</label>
              <input v-model="clienteNombre" type="text" placeholder="Ej: Juan Pérez" class="border border-gray-300 p-2.5 rounded-lg w-full focus:ring-2 focus:ring-blue-200 outline-none" />
            </div>
            <div>
              <label class="block text-xs font-bold text-gray-500 uppercase mb-1">Tipo de Operación</label>
              <select v-model="tipoVenta" class="border border-gray-300 p-2.5 rounded-lg w-full bg-white outline-none focus:ring-2 focus:ring-blue-200">
                <option value="MINORISTA">Venta Minorista (Tienda)</option>
                <option value="MAYORISTA">Venta Mayorista (Volumen)</option>
                <option value="WEB">Venta E-Commerce</option>
              </select>
            </div>
          </div>

          <div class="bg-blue-50/50 p-4 rounded-xl border border-blue-100 mb-6">
            <label class="flex items-center gap-3 cursor-pointer select-none">
              <input type="checkbox" v-model="requiereEnvio" class="w-5 h-5 text-blue-600 rounded focus:ring-blue-500" />
              <span class="font-bold text-blue-900">El cliente requiere envío / Despacho logístico</span>
            </label>
            <div v-if="requiereEnvio" class="mt-4 animate-fade-in">
              <label class="block text-xs font-bold text-blue-700 uppercase mb-1">Dirección o Agencia de Destino</label>
              <input 
                v-model="destinoEnvio" 
                type="text" 
                placeholder="Ej: Agencia Shalom Sede Arequipa" 
                class="w-full border border-blue-300 p-2.5 rounded-lg focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200 shadow-sm" 
              />
            </div>
          </div>

          <button @click="procesarSalida" class="w-full bg-green-600 hover:bg-green-700 text-white py-4 rounded-xl font-extrabold text-lg transition-colors shadow-lg shadow-green-200 flex justify-center items-center gap-2 active:scale-95">
            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
            Confirmar Venta y Cobrar
          </button>
        </div>

      </div>
    </div>
  </div>
</template>

<style scoped>
.animate-fade-in {
  animation: fadeIn 0.3s ease-out;
}
@keyframes fadeIn {
  from { opacity: 0; transform: translateY(-5px); }
  to { opacity: 1; transform: translateY(0); }
}
input[type="number"]::-webkit-inner-spin-button,
input[type="number"]::-webkit-outer-spin-button {
  -webkit-appearance: none;
  margin: 0;
}
input[type="number"] {
  -moz-appearance: textfield;
}
</style>