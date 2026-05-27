<script setup lang="ts">
import { ref, onMounted, computed, onUnmounted } from 'vue';
import api from '../api/axios';

// --- ESTADOS PRINCIPALES ---
const tabActual = ref<'INSUMO' | 'PRENDA'>('INSUMO');
const proveedores = ref<any[]>([]);
const insumos = ref<any[]>([]);
const productos = ref<any[]>([]);
const colores = ref<any[]>([]);
const cargando = ref(true);
const guardando = ref(false);
const bodegas = ref<any[]>([]);

// --- CONTROL DE REGISTRO RÁPIDO DE PROVEEDOR ---
const modalProveedorAbierto = ref(false);
const guardandoProveedor = ref(false);
const nuevoProveedorForm = ref({
  razonSocial: '',
  ruc: '',
  telefono: '',
  tipo: 'GENERAL'
});

const guardarProveedorRapido = async () => {
  if (!nuevoProveedorForm.value.razonSocial.trim()) {
    return alert("La Razón Social o Nombre del proveedor es obligatorio.");
  }

  guardandoProveedor.value = true;
  try {
    const res = await api.post('/compras/proveedores', nuevoProveedorForm.value);
    const proveedorCreado = res.data;

    alert(`✅ Proveedor "${proveedorCreado.razonSocial}" registrado.`);
    
    // 1. Recargamos el selector de proveedores
    const resProv = await api.get('/compras/proveedores');
    proveedores.value = resProv.data;
    
    // 2. Lo autoseleccionamos de inmediato
    formCabecera.value.proveedorId = proveedorCreado.id;
    
    // 3. Limpiamos y cerramos
    nuevoProveedorForm.value = { razonSocial: '', ruc: '', telefono: '', tipo: 'GENERAL' };
    modalProveedorAbierto.value = false;

  } catch (error: any) {
    alert("Error al crear proveedor: " + (error.response?.data?.message || error.message));
  } finally {
    guardandoProveedor.value = false;
  }
};

// --- CARRITO Y CABECERA DE COMPRA ---
const formCabecera = ref({
  proveedorId: '',
  correlativo: '',
  bodegaDestinoId: '' // <--- NUEVO CAMPO
});

const carritoDetalles = ref<any[]>([]);

// --- FORMULARIOS INDIVIDUALES ---
const formInsumo = ref({
  insumoId: '',
  cantidad: 1,
  costoUnitario: 0
});

const formPrenda = ref({
  productoId: '',
  color: '',
  talla: '',
  cantidad: 1,
  costoUnitario: 0,
  skuProveedor: '' // Aquí va el código de barras/QR de fábrica
});

// --- LÓGICA DEL ESCÁNER INVISIBLE ---
const bufferEscaner = ref('');
let timeoutEscaner: ReturnType<typeof setTimeout> | null = null;

const manejarEscaneo = (e: KeyboardEvent) => {
  // Si está escribiendo en un campo de texto normal, no interferimos
  if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) {
    return;
  }

  if (e.key === 'Enter') {
    if (bufferEscaner.value.length > 3) {
      // Limpiamos el código y lo mandamos directo al campo del SKU del proveedor
      formPrenda.value.skuProveedor = bufferEscaner.value.trim().toUpperCase().replace(/'/g, '-');
      // Cambiamos a la pestaña de prendas automáticamente por si estaba en insumos
      tabActual.value = 'PRENDA'; 
    }
    bufferEscaner.value = '';
    return;
  }

  if (e.key.length > 1) return; // Ignora teclas Shift, Ctrl, etc.
  bufferEscaner.value += e.key;
  
  if (timeoutEscaner) clearTimeout(timeoutEscaner);
  timeoutEscaner = setTimeout(() => { bufferEscaner.value = ''; }, 100);
};

// --- FUNCIONES DE CARRITO ---
const agregarAlCarrito = () => {
  if (tabActual.value === 'INSUMO') {
    if (!formInsumo.value.insumoId || formInsumo.value.cantidad <= 0 || formInsumo.value.costoUnitario < 0) {
      return alert("Complete los datos del insumo correctamente.");
    }
    const insumoRef = insumos.value.find(i => i.id === formInsumo.value.insumoId);
    carritoDetalles.value.push({
      tipoItem: 'INSUMO',
      insumoId: formInsumo.value.insumoId,
      nombre: insumoRef?.nombre,
      cantidad: formInsumo.value.cantidad,
      costoUnitario: formInsumo.value.costoUnitario,
      subtotal: formInsumo.value.cantidad * formInsumo.value.costoUnitario
    });
    formInsumo.value = { insumoId: '', cantidad: 1, costoUnitario: 0 };
  } else {
    if (!formPrenda.value.productoId || !formPrenda.value.color || !formPrenda.value.talla || formPrenda.value.cantidad <= 0) {
      return alert("Complete los datos de la prenda y variante.");
    }
    const prodRef = productos.value.find(p => p.id === formPrenda.value.productoId);
    carritoDetalles.value.push({
      tipoItem: 'PRENDA',
      productoId: formPrenda.value.productoId,
      nombre: prodRef?.nombre,
      color: formPrenda.value.color,
      talla: formPrenda.value.talla,
      skuProveedor: formPrenda.value.skuProveedor.trim(),
      cantidad: formPrenda.value.cantidad,
      costoUnitario: formPrenda.value.costoUnitario,
      subtotal: formPrenda.value.cantidad * formPrenda.value.costoUnitario
    });
    formPrenda.value = { productoId: '', color: '', talla: '', cantidad: 1, costoUnitario: 0, skuProveedor: '' };
  }
};

const quitarDelCarrito = (index: number) => {
  carritoDetalles.value.splice(index, 1);
};

const totalCompraGlobal = computed(() => {
  return carritoDetalles.value.reduce((sum, item) => sum + item.subtotal, 0);
});

// --- GUARDAR COMPRA EN BACKEND ---
const procesarCompra = async () => {
  if (!formCabecera.value.proveedorId || !formCabecera.value.correlativo || !formCabecera.value.bodegaDestinoId) {
    return alert("⚠️ Seleccione un proveedor, el número de factura y la bodega de destino.");
  }
  if (carritoDetalles.value.length === 0) {
    return alert("⚠️ El carrito de compras está vacío.");
  }

  guardando.value = true;
  try {
    const payload = {
      proveedorId: formCabecera.value.proveedorId,
      correlativo: formCabecera.value.correlativo,
      bodegaDestinoId: formCabecera.value.bodegaDestinoId,
      totalCompra: totalCompraGlobal.value,
      detalles: carritoDetalles.value
    };

    await api.post('/compras', payload);
    
    alert("✅ Compra registrada con éxito. El inventario ha sido actualizado.");
    
    // Limpieza total
    carritoDetalles.value = [];
    formCabecera.value.correlativo = '';
    
  } catch (error: any) {
    alert("❌ Error al registrar compra: " + (error.response?.data?.message || error.message));
  } finally {
    guardando.value = false;
  }
};

// --- CARGA DE DATOS INICIALES ---
onMounted(async () => {
  window.addEventListener('keydown', manejarEscaneo);
  try {
    // Asegúrese de que estas 3 rutas existan en su backend para llenar los combos
    const [resProv, resIns, resProd, resBodegas, resColores] = await Promise.all([
      api.get('/compras/proveedores'),
      api.get('/insumos'), 
      api.get('/productos'),
      api.get('/almacen-terminados/bodegas'),
      api.get('/colores')
    ]);
    proveedores.value = resProv.data;
    insumos.value = resIns.data;
    productos.value = resProd.data;
    bodegas.value = resBodegas.data.filter((b: any) => b.estado);
    colores.value = resColores.data;
  } catch (error) {
    console.error("Error cargando catálogos:", error);
  } finally {
    cargando.value = false;
  }
});

onUnmounted(() => {
  window.removeEventListener('keydown', manejarEscaneo);
});
</script>

<template>
  <div class="min-h-screen bg-slate-50 p-4 md:p-8 font-urbanist">
    <div class="max-w-[1400px] mx-auto space-y-6">
      
      <header class="bg-white p-6 md:p-8 rounded-3xl shadow-sm border border-slate-100">
        <h1 class="text-3xl font-black text-slate-800 tracking-tight">Ingreso de Mercadería y Avíos 📦</h1>
        <p class="text-slate-500 font-medium mt-1">Registra las facturas de tus proveedores y alimenta tu inventario al instante.</p>
      </header>

      <div v-if="cargando" class="flex justify-center py-20">
        <div class="w-12 h-12 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin"></div>
      </div>

      <div v-else class="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        <div class="lg:col-span-4 space-y-6">
          
          <div class="bg-white p-6 rounded-3xl shadow-sm border border-slate-200">
            <h2 class="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">1. Cabecera de Factura</h2>
            <div class="space-y-4">
              <div>
                <div class="flex justify-between items-center mb-1">
                  <label class="block text-xs font-bold text-slate-600">Proveedor</label>
                  <button @click="modalProveedorAbierto = true" type="button" class="text-[10px] font-black text-blue-600 hover:text-blue-500 uppercase tracking-wide focus:outline-none">
                    ➕ ¿Nuevo Proveedor?
                  </button>
                </div>
                <select v-model="formCabecera.proveedorId" class="w-full bg-slate-50 border border-slate-200 p-3 rounded-xl font-bold text-slate-700 outline-none">
                  <option value="" disabled>Seleccione proveedor...</option>
                  <option v-for="p in proveedores" :key="p.id" :value="p.id">{{ p.razonSocial }}</option>
                </select>
              </div>
              
              <div class="grid grid-cols-2 gap-4">
                <div>
                  <label class="block text-xs font-bold text-slate-600 mb-1">N° de Factura / Guía</label>
                  <input v-model="formCabecera.correlativo" type="text" placeholder="Ej: F001-000456" class="w-full bg-slate-50 border border-slate-200 p-3 rounded-xl font-bold text-slate-700 outline-none uppercase" />
                </div>
                <div>
                  <label class="block text-xs font-bold text-slate-600 mb-1">Bodega de Ingreso</label>
                  <select v-model="formCabecera.bodegaDestinoId" class="w-full bg-slate-50 border border-slate-200 p-3 rounded-xl font-bold text-slate-700 outline-none">
                    <option value="" disabled>¿A dónde ingresa?</option>
                    <option v-for="b in bodegas" :key="b.id" :value="b.id">{{ b.nombre }}</option>
                  </select>
                </div>
              </div>
            </div>
          </div>

          <div class="bg-slate-900 rounded-3xl shadow-xl border border-slate-800 overflow-hidden flex flex-col">
            
            <div class="flex p-2 bg-slate-800/50">
              <button @click="tabActual = 'INSUMO'" :class="tabActual === 'INSUMO' ? 'bg-blue-500 text-white' : 'text-slate-400 hover:text-white'" class="flex-1 py-3 rounded-xl font-black text-xs transition-colors">
                🧵 MATERIA PRIMA
              </button>
              <button @click="tabActual = 'PRENDA'" :class="tabActual === 'PRENDA' ? 'bg-emerald-500 text-white' : 'text-slate-400 hover:text-white'" class="flex-1 py-3 rounded-xl font-black text-xs transition-colors">
                👕 PRENDAS LISTAS
              </button>
            </div>

            <div class="p-6 space-y-4">
              <template v-if="tabActual === 'INSUMO'">
                <div>
                  <label class="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Insumo / Avío</label>
                  <select v-model="formInsumo.insumoId" class="w-full bg-slate-800 border border-slate-700 p-3 rounded-xl font-bold text-white outline-none text-sm">
                    <option value="" disabled>Seleccione insumo...</option>
                    <option v-for="i in insumos" :key="i.id" :value="i.id">{{ i.nombre }} ({{ i.unidadMedida }})</option>
                  </select>
                </div>
                <div class="grid grid-cols-2 gap-4">
                  <div>
                    <label class="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Cantidad</label>
                    <input v-model.number="formInsumo.cantidad" type="number" class="w-full bg-slate-800 border border-slate-700 p-3 rounded-xl font-bold text-white outline-none text-center" />
                  </div>
                  <div>
                    <label class="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Costo Unit (S/)</label>
                    <input v-model.number="formInsumo.costoUnitario" type="number" step="0.01" class="w-full bg-slate-800 border border-slate-700 p-3 rounded-xl font-bold text-white outline-none text-center" />
                  </div>
                </div>
              </template>

              <template v-if="tabActual === 'PRENDA'">
                <div>
                  <label class="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 flex justify-between">
                    <span>Cód. Proveedor (Opcional)</span>
                    <span class="text-emerald-400">⚡ Escaneo Activo</span>
                  </label>
                  <input v-model="formPrenda.skuProveedor" type="text" placeholder="Escanee la etiqueta aquí..." class="w-full bg-slate-800 border border-emerald-500/30 focus:border-emerald-500 p-3 rounded-xl font-black text-emerald-400 outline-none text-sm placeholder:text-slate-600 uppercase" />
                </div>
                <div>
                  <label class="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Producto Base</label>
                  <select v-model="formPrenda.productoId" class="w-full bg-slate-800 border border-slate-700 p-3 rounded-xl font-bold text-white outline-none text-sm">
                    <option value="" disabled>Seleccione producto...</option>
                    <option v-for="p in productos" :key="p.id" :value="p.id">{{ p.nombre }}</option>
                  </select>
                </div>
                <div class="grid grid-cols-2 gap-4">
                  <div>
  <label class="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Color</label>
  <select v-model="formPrenda.color" class="w-full bg-slate-800 border border-slate-700 p-3 rounded-xl font-bold text-white outline-none text-sm cursor-pointer">
    <option value="" disabled>Seleccione color...</option>
    <option v-for="c in colores" :key="c.id" :value="c.nombre">
      {{ c.nombre }}
    </option>
  </select>
</div>
                  <div>
                    <label class="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Talla</label>
                    <input v-model="formPrenda.talla" type="text" placeholder="Ej: M" class="w-full bg-slate-800 border border-slate-700 p-3 rounded-xl font-bold text-white outline-none text-center uppercase" />
                  </div>
                </div>
                <div class="grid grid-cols-2 gap-4">
                  <div>
                    <label class="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Cantidad</label>
                    <input v-model.number="formPrenda.cantidad" type="number" class="w-full bg-slate-800 border border-slate-700 p-3 rounded-xl font-bold text-white outline-none text-center" />
                  </div>
                  <div>
                    <label class="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Costo Unit (S/)</label>
                    <input v-model.number="formPrenda.costoUnitario" type="number" step="0.01" class="w-full bg-slate-800 border border-slate-700 p-3 rounded-xl font-bold text-white outline-none text-center" />
                  </div>
                </div>
              </template>

              <button @click="agregarAlCarrito" class="w-full mt-4 bg-white/10 hover:bg-white/20 text-white font-black py-4 rounded-xl transition-colors border border-white/10 flex justify-center items-center gap-2">
                <span>➕</span> AGREGAR AL CARRITO
              </button>
            </div>
          </div>
        </div>

        <div class="lg:col-span-8 flex flex-col gap-6">
          <div class="bg-white rounded-3xl shadow-sm border border-slate-200 flex-1 flex flex-col overflow-hidden">
            
            <div class="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <h2 class="text-sm font-black text-slate-800 uppercase tracking-widest">Detalle de Recepción</h2>
              <span class="bg-blue-100 text-blue-700 text-[10px] font-black px-3 py-1 rounded-full uppercase">{{ carritoDetalles.length }} Ítems</span>
            </div>

            <div class="flex-1 p-6 overflow-y-auto">
              <div v-if="carritoDetalles.length === 0" class="h-full flex flex-col items-center justify-center text-slate-400 space-y-3 py-10">
                <span class="text-4xl">🛒</span>
                <p class="font-bold text-sm">El carrito está vacío. Agregue insumos o prendas.</p>
              </div>
              
              <div v-else class="space-y-3">
                <div v-for="(item, index) in carritoDetalles" :key="index" class="flex justify-between items-center p-4 rounded-2xl border border-slate-100 bg-slate-50 hover:border-blue-200 transition-colors">
                  <div class="flex items-center gap-4">
                    <button @click="quitarDelCarrito(index)" class="text-red-400 hover:text-red-600 font-bold text-xl px-2">✕</button>
                    <div>
                      <div class="flex items-center gap-2">
                        <span v-if="item.tipoItem === 'PRENDA'" class="bg-emerald-100 text-emerald-700 text-[9px] font-black px-2 py-0.5 rounded uppercase">Prenda</span>
                        <span v-else class="bg-blue-100 text-blue-700 text-[9px] font-black px-2 py-0.5 rounded uppercase">Insumo</span>
                        <p class="font-black text-slate-800 text-sm">{{ item.nombre }}</p>
                      </div>
                      <p v-if="item.tipoItem === 'PRENDA'" class="text-[10px] font-bold text-slate-500 uppercase mt-1">
                        {{ item.color }} - Talla {{ item.talla }} | <span class="text-emerald-500">QR: {{ item.skuProveedor || 'N/A' }}</span>
                      </p>
                    </div>
                  </div>
                  <div class="text-right">
                    <p class="font-black text-slate-800">S/ {{ item.subtotal.toFixed(2) }}</p>
                    <p class="text-[10px] font-bold text-slate-400 mt-0.5 uppercase">{{ item.cantidad }} uds × S/ {{ item.costoUnitario.toFixed(2) }}</p>
                  </div>
                </div>
              </div>
            </div>

            <div class="p-6 bg-slate-900 text-white flex flex-col sm:flex-row justify-between items-center gap-4">
              <div>
                <p class="text-[10px] text-slate-400 font-black uppercase tracking-widest mb-1">Total a Pagar al Proveedor</p>
                <p class="text-4xl font-black text-emerald-400 font-mono">S/ {{ totalCompraGlobal.toFixed(2) }}</p>
              </div>
              <button @click="procesarCompra" :disabled="guardando || carritoDetalles.length === 0" class="bg-emerald-500 hover:bg-emerald-400 disabled:bg-slate-700 text-white font-black px-8 py-4 rounded-2xl transition-all shadow-lg shadow-emerald-500/20 active:scale-95 w-full sm:w-auto flex items-center justify-center gap-2 text-sm uppercase tracking-wide">
                <span v-if="guardando" class="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                <span v-else>💾 Guardar e Ingresar Stock</span>
              </button>
            </div>
          </div>
        </div>

      </div>
    </div>
  </div>

  <div v-if="modalProveedorAbierto" class="fixed inset-0 z-[70] flex items-center justify-center p-4">
  <div class="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" @click="modalProveedorAbierto = false"></div>
  
  <div class="relative w-full max-w-sm bg-white rounded-[2rem] shadow-2xl overflow-hidden flex flex-col animate-[zoomIn_0.15s_ease-out] border border-slate-100">
    <div class="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50">
      <h4 class="text-base font-black text-slate-800 flex items-center gap-2"><span>🏢</span> Nuevo Proveedor</h4>
      <button @click="modalProveedorAbierto = false" class="text-slate-400 hover:text-red-500 font-bold text-sm bg-white w-6 h-6 rounded-full shadow-sm">✕</button>
    </div>

    <div class="p-5 space-y-4">
      <div>
        <label class="block text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Razón Social / Nombre Comercial</label>
        <input v-model="nuevoProveedorForm.razonSocial" type="text" placeholder="Ej: Corporación Textil S.A.C."
               class="w-full bg-slate-50 border border-slate-200 p-3 rounded-xl font-bold text-slate-800 text-sm outline-none focus:border-blue-500" />
      </div>

      <div>
        <label class="block text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1.5">RUC (Opcional)</label>
        <input v-model="nuevoProveedorForm.ruc" type="text" placeholder="Ej: 20601234567"
               class="w-full bg-slate-50 border border-slate-200 p-3 rounded-xl font-bold text-slate-800 text-sm outline-none focus:border-blue-500" />
      </div>

      <div>
        <label class="block text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Teléfono (Opcional)</label>
        <input v-model="nuevoProveedorForm.telefono" type="text" placeholder="Ej: 987654321"
               class="w-full bg-slate-50 border border-slate-200 p-3 rounded-xl font-bold text-slate-800 text-sm outline-none focus:border-blue-500" />
      </div>

      <div>
        <label class="block text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Especialidad</label>
        <select v-model="nuevoProveedorForm.tipo" class="w-full bg-slate-50 border border-slate-200 p-3 rounded-xl font-bold text-slate-700 outline-none text-sm">
          <option value="GENERAL">General / Ambos</option>
          <option value="INSUMOS">Solo Insumos (Avíos/Telas)</option>
          <option value="MERCADERIA">Solo Mercadería Terminada</option>
        </select>
      </div>
    </div>

    <div class="p-5 border-t border-slate-100 bg-white">
      <button @click="guardarProveedorRapido" :disabled="guardandoProveedor" 
              class="w-full bg-blue-600 disabled:bg-slate-300 text-white font-black py-3 rounded-xl hover:bg-blue-500 transition-colors flex justify-center items-center gap-2 text-sm">
        <span v-if="guardandoProveedor" class="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
        <span v-else>💾 GUARDAR PROVEEDOR</span>
      </button>
    </div>
  </div>
</div>
</template>

<style scoped>
@import url('https://fonts.googleapis.com/css2?family=Urbanist:wght@400;700;900&display=swap');
.font-urbanist { font-family: 'Urbanist', sans-serif; }
</style>