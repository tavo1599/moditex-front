<script setup lang="ts">
import { ref, computed, onMounted, nextTick } from 'vue';
import api from '../api/axios';
import JsBarcode from 'jsbarcode';

// Estados Principales
const vistaActiva = ref('kardex'); 
const inventario = ref<any[]>([]);
const bodegas = ref<any[]>([]);
const productos = ref<any[]>([]);
const colores = ref<any[]>([]); 
const cargando = ref(true);

// Estados para Filtros y Acordeón
const filtroStock = ref('con_stock'); // 'con_stock', 'critico', 'agotados'
const filasExpandidas = ref<Record<string, boolean>>({});

// Modales
const modalBodega = ref(false);
const modoEdicionBodega = ref(false);
const idEdicionBodega = ref<number | null>(null);
const modalIngreso = ref(false);

// Estados Códigos de Barras
const modalEtiquetas = ref(false);
const itemEtiqueta = ref<any>(null);
const cantidadEtiquetas = ref(1);
const codigoGenerado = ref('');

// Formularios
const formBodega = ref({ nombre: '', tipo: 'Venta', direccion: '', estado: true });
const formIngreso = ref({ bodegaId: '' as number | '', productoId: '' as number | '', color: '', talla: '', cantidad: 0 });

// ==========================================
// ESTADOS PARA AUTOCOMPLETADO
// ==========================================
const searchBodega = ref('');
const showBodegas = ref(false);

const searchProducto = ref('');
const showProductos = ref(false);

const searchColor = ref('');
const showColores = ref(false);

const cerrarBuscadorBodegas = () => setTimeout(() => showBodegas.value = false, 200);
const cerrarBuscadorProductos = () => setTimeout(() => showProductos.value = false, 200);
const cerrarBuscadorColores = () => setTimeout(() => showColores.value = false, 200);

// Filtros en tiempo real para los buscadores
const bodegasFiltradas = computed(() => {
  const activas = bodegas.value.filter(b => b.estado);
  if (!searchBodega.value) return activas;
  const q = searchBodega.value.toLowerCase();
  return activas.filter(b => b.nombre.toLowerCase().includes(q) || b.tipo.toLowerCase().includes(q));
});

const productosFiltrados = computed(() => {
  if (!searchProducto.value) return productos.value;
  const q = searchProducto.value.toLowerCase();
  return productos.value.filter(p => p.nombre.toLowerCase().includes(q) || p.skuBase.toLowerCase().includes(q));
});

const coloresFiltrados = computed(() => {
  if (!searchColor.value) return colores.value;
  const q = searchColor.value.toLowerCase();
  return colores.value.filter(c => c.nombre.toLowerCase().includes(q) || c.codigo.toLowerCase().includes(q));
});

// Funciones para seleccionar un ítem de la lista
const selectBodega = (bodega: any) => {
  formIngreso.value.bodegaId = bodega.id;
  searchBodega.value = bodega.nombre;
  showBodegas.value = false;
};

const selectProducto = (producto: any) => {
  formIngreso.value.productoId = producto.id;
  searchProducto.value = `${producto.skuBase} - ${producto.nombre}`;
  showProductos.value = false;
};

const selectColor = (color: any) => {
  // MAGIA APLICADA: Guardamos el CÓDIGO oficial (Ej: NGR) para que haga match perfecto con las Órdenes de Producción
  formIngreso.value.color = color.codigo; 
  searchColor.value = `${color.nombre} (${color.codigo})`;
  showColores.value = false;
};

// HELPER: Convertir el código de la BD en nombre legible para la tabla Kardex
const getNombreColor = (codigoColor: string) => {
  const colorObj = colores.value.find(c => c.codigo === codigoColor || c.nombre === codigoColor);
  return colorObj ? `${colorObj.nombre}` : codigoColor;
};

// ==========================================
// AGRUPACIÓN DE TALLAS SINCRONIZADA CON OP
// ==========================================
const tallasAgrupadas = {
  'Letras (Polos, Casacas, etc.)': ['XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL', '4XL'],
  'Números (Pantalones, Jeans)': ['28', '30', '32', '34', '36', '38', '40', '42', '44', '46'],
  'Especiales': ['Estándar / Única']
};

// ==========================================
// LÓGICA DE FILTROS Y AGRUPACIÓN
// ==========================================
const inventarioFiltrado = computed(() => {
  if (filtroStock.value === 'con_stock') return inventario.value.filter(item => item.stock > 0);
  if (filtroStock.value === 'critico') return inventario.value.filter(item => item.stock > 0 && item.stock <= 5);
  if (filtroStock.value === 'agotados') return inventario.value.filter(item => item.stock === 0);
  return inventario.value;
});

const inventarioAgrupado = computed(() => {
  const grupos: Record<string, any> = {};
  inventarioFiltrado.value.forEach(item => {
    const nombreProd = item.producto.nombre;
    if (!grupos[nombreProd]) {
      grupos[nombreProd] = { nombre: nombreProd, skuBase: item.producto.skuBase, totalStock: 0, tieneCritico: false, variantes: [] };
    }
    grupos[nombreProd].totalStock += item.stock;
    if (item.stock > 0 && item.stock <= 5) grupos[nombreProd].tieneCritico = true;
    grupos[nombreProd].variantes.push(item);
  });
  return grupos;
});

const toggleFila = (nombre: string) => {
  filasExpandidas.value[nombre] = !filasExpandidas.value[nombre];
};

// ==========================================
// CARGA Y CRUD DE DATOS
// ==========================================
const cargarDatos = async () => {
  cargando.value = true;
  try {
    const [resInv, resBodegas, resProd, resColores] = await Promise.all([
      api.get('/almacen-terminados/inventario'),
      api.get('/almacen-terminados/bodegas'),
      api.get('/productos'),
      api.get('/colores')
    ]);
    inventario.value = resInv.data;
    bodegas.value = resBodegas.data;
    productos.value = resProd.data;
    colores.value = resColores.data;
  } catch (error) {
    console.error("Error cargando datos del almacén:", error);
  } finally {
    cargando.value = false;
  }
};

const abrirNuevaBodega = () => {
  modoEdicionBodega.value = false;
  idEdicionBodega.value = null;
  formBodega.value = { nombre: '', tipo: 'Venta', direccion: '', estado: true };
  modalBodega.value = true;
};

const abrirEditarBodega = (bodega: any) => {
  modoEdicionBodega.value = true;
  idEdicionBodega.value = bodega.id;
  formBodega.value = { nombre: bodega.nombre, tipo: bodega.tipo, direccion: bodega.direccion || '', estado: bodega.estado };
  modalBodega.value = true;
};

const guardarBodega = async () => {
  if (!formBodega.value.nombre) return alert('Ponle un nombre a la bodega');
  try {
    if (modoEdicionBodega.value && idEdicionBodega.value) {
      await api.put(`/almacen-terminados/bodegas/${idEdicionBodega.value}`, formBodega.value);
    } else {
      await api.post('/almacen-terminados/bodegas', formBodega.value);
    }
    modalBodega.value = false;
    cargarDatos();
  } catch (error) { alert('Error al guardar bodega'); }
};

const abrirIngreso = (bodegaIdPredefinida: number | '' = '') => {
  formIngreso.value = { bodegaId: bodegaIdPredefinida, productoId: '', color: '', talla: '', cantidad: 0 };
  
  searchProducto.value = '';
  searchColor.value = '';
  showBodegas.value = false;
  showProductos.value = false;
  showColores.value = false;

  if (bodegaIdPredefinida !== '') {
    const bod = bodegas.value.find(b => b.id === bodegaIdPredefinida);
    searchBodega.value = bod ? bod.nombre : '';
  } else {
    searchBodega.value = '';
  }

  modalIngreso.value = true;
};

const guardarIngreso = async () => {
  // Validación extra por si escriben en el input pero no eligen de la lista
  const colorExiste = colores.value.some(c => c.codigo === formIngreso.value.color);

  if (!formIngreso.value.bodegaId || !formIngreso.value.productoId || !formIngreso.value.color || !formIngreso.value.talla || formIngreso.value.cantidad <= 0) {
    return alert('⚠️ Asegúrate de seleccionar una opción válida en todos los campos.');
  }

  if (!colorExiste) {
    return alert('⚠️ Debes elegir un Color haciendo clic en la lista desplegable.');
  }

  try {
    await api.post('/almacen-terminados/inventario', {
      bodegaId: Number(formIngreso.value.bodegaId),
      productoId: Number(formIngreso.value.productoId),
      color: formIngreso.value.color, // Aquí enviará el código limpio (Ej: NGR)
      talla: formIngreso.value.talla,
      cantidad: formIngreso.value.cantidad
    });
    modalIngreso.value = false;
    cargarDatos();
    vistaActiva.value = 'kardex'; 
  } catch (error) { alert('Error al ingresar mercadería'); }
};

// ==========================================
// CÓDIGOS DE BARRAS 
// ==========================================
const abrirEtiquetas = async (item: any) => {
  itemEtiqueta.value = item;
  cantidadEtiquetas.value = item.stock > 0 ? item.stock : 1; 
  
  // Buscar el color de forma robusta por si la BD guarda el nombre o el código
  const colorEncontrado = colores.value.find(c => c.codigo === item.color || c.nombre === item.color);
  const codigoColor = colorEncontrado ? colorEncontrado.codigo : item.color.substring(0, 3).toUpperCase();

  codigoGenerado.value = `PRD${item.producto.id}-${codigoColor}-${item.talla}`;
  modalEtiquetas.value = true;

  await nextTick();
  JsBarcode("#barcode-svg", codigoGenerado.value, {
    format: "CODE128", 
    lineColor: "#000",
    width: 2,
    height: 60,
    displayValue: true,
    fontSize: 14,
    margin: 0
  });
};

const imprimirEtiquetas = () => {
  const svgContenedor = document.getElementById('contenedor-barcode')?.innerHTML || '';
  const nombrePrenda = itemEtiqueta.value.producto.nombre;
  // Usamos el traductor de colores aquí también por si acaso
  const nombreColor = getNombreColor(itemEtiqueta.value.color); 
  const ventana = window.open('', 'PRINT', 'height=600,width=800');
  
  ventana!.document.write(`
    <html><head><title>Impresión</title>
    <style>
      body{margin:0;padding:0;font-family:Arial,sans-serif;}
      .etiqueta{width:50mm;height:30mm;display:flex;flex-direction:column;align-items:center;justify-content:center;page-break-after:always;text-align:center;overflow:hidden;}
      .titulo{font-size:10px;font-weight:bold;margin-bottom:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:90%;}
      .svg-container{max-width:90%;}
      .svg-container svg{width:100%;height:40px;}
      .detalle{font-size:9px;margin-top:2px;color:#333;font-weight:bold;}
    </style></head><body>
  `);

  for (let i = 0; i < cantidadEtiquetas.value; i++) {
    ventana!.document.write(`
      <div class="etiqueta">
        <div class="titulo">${nombrePrenda}</div>
        <div class="svg-container">${svgContenedor}</div>
        <div class="detalle">Talla: ${itemEtiqueta.value.talla} | Col: ${nombreColor}</div>
      </div>
    `);
  }
  ventana!.document.write('</body></html>');
  ventana!.document.close();
  ventana!.focus();
  setTimeout(() => { ventana!.print(); ventana!.close(); }, 500);
};

onMounted(cargarDatos);
</script>

<template>
  <div class="space-y-6">
    <div class="flex justify-between items-center bg-white p-6 rounded-xl shadow-sm border border-gray-100">
      <div>
        <h2 class="text-3xl font-bold text-gray-800">Productos Terminados</h2>
        <p class="text-gray-500 mt-1">Controla tu stock real por bodega, talla y color.</p>
      </div>
      <div class="flex gap-3">
        <button @click="abrirNuevaBodega" class="bg-gray-100 hover:bg-gray-200 text-gray-700 px-5 py-2.5 rounded-lg font-bold shadow-sm transition-all flex items-center gap-2 text-sm border border-gray-200">
          <span>🏢</span> Nueva Bodega
        </button>
        <button @click="abrirIngreso()" class="bg-green-600 hover:bg-green-700 text-white px-5 py-2.5 rounded-lg font-bold shadow-md transition-all flex items-center gap-2 text-sm">
          <span>📦</span> Ingreso Libre
        </button>
      </div>
    </div>

    <div class="flex gap-6 border-b border-gray-200 px-2">
      <button @click="vistaActiva = 'kardex'" class="pb-3 text-sm font-bold tracking-wide transition-colors border-b-2" :class="vistaActiva === 'kardex' ? 'border-blue-600 text-blue-700' : 'border-transparent text-gray-400 hover:text-gray-600'">
        📑 KARDEX GENERAL
      </button>
      <button @click="vistaActiva = 'bodegas'" class="pb-3 text-sm font-bold tracking-wide transition-colors border-b-2" :class="vistaActiva === 'bodegas' ? 'border-blue-600 text-blue-700' : 'border-transparent text-gray-400 hover:text-gray-600'">
        🏢 GESTIÓN DE BODEGAS
      </button>
    </div>

    <div v-if="cargando" class="text-center py-12 text-gray-500 font-medium bg-white rounded-xl shadow-sm">
      <div class="animate-spin inline-block w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full mb-4"></div>
      <p>Cargando información...</p>
    </div>

    <template v-else>
      <div v-if="vistaActiva === 'kardex'" class="space-y-4 animate-in fade-in duration-300">
        
        <div class="flex gap-2 bg-white p-2 rounded-xl shadow-sm border border-gray-100 w-fit">
          <button @click="filtroStock = 'con_stock'" class="px-4 py-2 rounded-lg font-bold text-xs uppercase tracking-widest transition" :class="filtroStock === 'con_stock' ? 'bg-blue-100 text-blue-700' : 'text-gray-500 hover:bg-gray-50'">
            🟢 Disponibles
          </button>
          <button @click="filtroStock = 'critico'" class="px-4 py-2 rounded-lg font-bold text-xs uppercase tracking-widest transition" :class="filtroStock === 'critico' ? 'bg-red-100 text-red-700' : 'text-gray-500 hover:bg-gray-50'">
            🔴 Stock Crítico 🚨
          </button>
          <button @click="filtroStock = 'agotados'" class="px-4 py-2 rounded-lg font-bold text-xs uppercase tracking-widest transition" :class="filtroStock === 'agotados' ? 'bg-gray-800 text-white' : 'text-gray-500 hover:bg-gray-50'">
            ⚫ Agotados
          </button>
        </div>

        <div class="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <table class="w-full text-left text-sm">
            <thead class="bg-gray-50 text-gray-500 font-bold uppercase text-[10px] tracking-wider border-b border-gray-200">
              <tr>
                <th class="p-4 w-10"></th>
                <th class="p-4">Modelo de Prenda</th>
                <th class="p-4">Bodega / Ubicación</th>
                <th class="p-4">Color</th>
                <th class="p-4 text-center">Talla</th>
                <th class="p-4 text-right">Stock</th>
                <th class="p-4 text-center">Acciones</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-100">
              <tr v-if="Object.keys(inventarioAgrupado).length === 0">
                <td colspan="7" class="p-8 text-center text-gray-400 italic font-bold">
                  No hay productos en esta categoría.
                </td>
              </tr>
              
              <template v-for="(grupo, nombre) in inventarioAgrupado" :key="nombre">
                <tr @click="toggleFila(String(nombre))" class="cursor-pointer transition-colors" :class="filasExpandidas[String(nombre)] ? 'bg-blue-50/50' : 'hover:bg-gray-50'">
                  <td class="p-4 text-center text-gray-400 font-black">
                    {{ filasExpandidas[String(nombre)] ? '▼' : '▶' }}
                  </td>
                  <td class="p-4 font-black text-gray-800 text-base">
                    {{ nombre }} <span class="ml-2 text-xs font-mono text-gray-400 bg-gray-100 px-2 py-0.5 rounded">{{ grupo.skuBase }}</span>
                  </td>
                  <td colspan="3" class="p-4 text-xs font-bold text-gray-400 uppercase tracking-widest">
                    {{ grupo.variantes.length }} Variantes Encontradas
                  </td>
                  <td class="p-4 text-right font-black text-lg" :class="grupo.tieneCritico ? 'text-red-600' : 'text-blue-700'">
                    {{ grupo.totalStock }} <span v-if="grupo.tieneCritico" class="ml-1" title="Contiene stock crítico">🚨</span>
                  </td>
                  <td class="p-4 text-center"></td>
                </tr>

                <tr v-if="filasExpandidas[String(nombre)]" v-for="item in grupo.variantes" :key="item.id" class="bg-gray-50/30 hover:bg-white transition-colors">
                  <td class="p-3"></td> <td class="p-3 text-xs font-bold text-gray-500 pl-8">↳ Variante</td>
                  <td class="p-3">
                    <span class="font-bold text-gray-700">{{ item.bodega.nombre }}</span>
                  </td>
                  <td class="p-3 text-gray-700 font-bold flex items-center gap-2">
                    <!-- TRADUCCIÓN VISUAL DEL CÓDIGO AL NOMBRE DEL COLOR -->
                    {{ getNombreColor(item.color) }} 
                    <span class="text-[10px] text-gray-400 bg-gray-200 px-1.5 rounded">{{ item.color }}</span>
                  </td>
                  <td class="p-3 text-center font-black text-gray-900">{{ item.talla }}</td>
                  <td class="p-3 text-right">
                    <span class="font-black text-base" :class="item.stock <= 5 && item.stock > 0 ? 'text-red-500' : item.stock === 0 ? 'text-gray-300' : 'text-green-600'">
                      {{ item.stock }}
                    </span>
                    <span class="text-[10px] text-gray-400 ml-1">und</span>
                  </td>
                  <td class="p-3 text-center">
                    <button v-if="item.stock > 0" @click="abrirEtiquetas(item)" class="bg-gray-800 hover:bg-black text-white px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-widest transition shadow-sm">
                      🖨️ Imprimir SKU
                    </button>
                    <span v-else class="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Agotado</span>
                  </td>
                </tr>
              </template>
            </tbody>
          </table>
        </div>
      </div>

      <div v-if="vistaActiva === 'bodegas'" class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 animate-in fade-in duration-300">
        <div @click="abrirNuevaBodega" class="bg-gray-50 border-2 border-dashed border-gray-300 rounded-xl flex flex-col items-center justify-center p-8 text-gray-400 hover:bg-gray-100 hover:text-gray-600 hover:border-gray-400 cursor-pointer transition-all min-h-[200px]">
          <span class="text-4xl mb-2">+</span>
          <span class="font-bold">Crear Nueva Bodega</span>
        </div>
        <div v-for="bodega in bodegas" :key="bodega.id" class="bg-white border border-gray-200 rounded-xl p-6 shadow-sm hover:shadow-md transition-shadow relative overflow-hidden flex flex-col" :class="bodega.estado ? '' : 'opacity-60 bg-gray-50'">
          <div class="absolute top-0 right-0 p-3 flex items-center gap-2">
            <span v-if="!bodega.estado" class="text-[10px] font-black px-2 py-1 rounded-full uppercase tracking-widest bg-gray-200 text-gray-600">Inactivo</span>
            <span v-else class="text-[10px] font-black px-2 py-1 rounded-full uppercase tracking-widest bg-blue-100 text-blue-700">{{ bodega.tipo }}</span>
            <button @click.stop="abrirEditarBodega(bodega)" class="text-gray-400 hover:text-blue-600 bg-gray-100 hover:bg-blue-50 p-1.5 rounded-md transition" title="Editar Bodega">✏️</button>
          </div>
          <div class="mb-4 mt-2">
            <span class="text-3xl mb-2 block">🏬</span>
            <h3 class="text-xl font-black text-gray-800" :class="!bodega.estado && 'line-through'">{{ bodega.nombre }}</h3>
            <p class="text-xs text-gray-400 mt-1 uppercase">{{ bodega.direccion || 'Sin dirección registrada' }}</p>
          </div>
          <div class="pt-4 border-t border-gray-100 mt-auto">
             <button v-if="bodega.estado" @click="abrirIngreso(bodega.id)" class="w-full bg-gray-900 hover:bg-black text-white font-bold py-2.5 rounded-lg text-sm transition shadow-md flex items-center justify-center gap-2">
              <span>📥</span> Ingresar a esta Bodega
            </button>
            <p v-else class="text-center text-xs text-gray-400 font-bold uppercase mt-2">Bodega Clausurada</p>
          </div>
        </div>
      </div>
    </template>

    <div v-if="modalBodega" class="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
      <div class="bg-white rounded-3xl p-8 w-full max-w-md shadow-2xl animate-in zoom-in duration-200">
        <h3 class="text-2xl font-black text-gray-800 mb-6">{{ modoEdicionBodega ? 'Editar Bodega' : 'Nueva Bodega' }}</h3>
        <div class="space-y-4">
          <div>
            <label class="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Nombre Corto</label>
            <input type="text" v-model="formBodega.nombre" placeholder="Ej: Tienda Sur..." class="w-full border-2 border-gray-200 p-3 rounded-xl font-bold text-gray-700 outline-none focus:border-blue-500">
          </div>
          <div>
            <label class="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Tipo de Bodega</label>
            <select v-model="formBodega.tipo" class="w-full border-2 border-gray-200 p-3 rounded-xl font-bold text-gray-700 outline-none focus:border-blue-500">
              <option value="Venta">Bodega Comercial (Ventas)</option>
              <option value="Transito">Tránsito / En Camino</option>
              <option value="Merma">Zona de Fallados / Merma</option>
            </select>
          </div>
           <div>
            <label class="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Dirección (Opcional)</label>
            <input type="text" v-model="formBodega.direccion" placeholder="Ej: Av. Principal 123" class="w-full border-2 border-gray-200 p-3 rounded-xl font-bold text-gray-700 outline-none focus:border-blue-500">
          </div>
          <div>
            <label class="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Estado de Operación</label>
            <select v-model="formBodega.estado" class="w-full border-2 border-gray-200 p-3 rounded-xl font-bold text-gray-700 outline-none focus:border-blue-500">
              <option :value="true">🟢 Operativa (Activa)</option>
              <option :value="false">🔴 Clausurada (Inactiva)</option>
            </select>
          </div>
          <div class="flex gap-3 pt-6 border-t border-gray-100">
            <button @click="modalBodega = false" class="flex-1 py-3 text-gray-500 hover:bg-gray-100 rounded-xl font-bold transition">Cancelar</button>
            <button @click="guardarBodega" class="flex-1 bg-blue-600 text-white py-3 rounded-xl font-bold shadow-lg shadow-blue-500/30 hover:bg-blue-700 transition">
              {{ modoEdicionBodega ? 'Actualizar Bodega' : 'Guardar Bodega' }}
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- MODAL INGRESO LIBRE -->
    <div v-if="modalIngreso" class="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center z-[100] p-4">
      <div class="bg-white rounded-[2rem] w-full max-w-lg shadow-2xl animate-in zoom-in-95 duration-300">
        
        <div class="bg-gradient-to-br from-emerald-500 to-green-600 p-6 sm:p-8 rounded-t-[2rem] text-white flex justify-between items-start relative overflow-hidden">
          <div class="absolute -top-10 -right-10 opacity-20 text-9xl">📦</div>
          <div class="relative z-10">
            <h3 class="text-2xl sm:text-3xl font-black flex items-center gap-3">
              <span class="bg-white/20 p-2.5 rounded-2xl backdrop-blur-sm shadow-sm text-2xl">📦</span>
              Ingreso Libre
            </h3>
            <p class="text-emerald-50 text-sm mt-2 font-medium opacity-90">Suma nuevo inventario de forma rápida.</p>
          </div>
          <button @click="modalIngreso = false" class="relative z-10 text-white/70 hover:text-white bg-black/10 hover:bg-black/20 rounded-full p-2 transition-colors">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M6 18L18 6M6 6l12 12"></path></svg>
          </button>
        </div>

        <div class="p-6 sm:p-8 space-y-5 bg-white rounded-b-[2rem]">
          <!-- Bodega con Autocompletado -->
          <div class="relative">
            <label class="block text-[11px] font-bold text-gray-500 uppercase tracking-widest mb-1.5 ml-1">Ubicación / Destino</label>
            <input 
              type="text" 
              v-model="searchBodega"
              @focus="showBodegas = true"
              @blur="cerrarBuscadorBodegas"
              @input="formIngreso.bodegaId = ''"
              placeholder="🔍 Escribe para buscar la bodega..."
              class="w-full bg-gray-50 border border-gray-200 text-gray-800 rounded-xl px-4 py-3.5 outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white focus:border-transparent transition-all font-bold placeholder-gray-400 shadow-sm"
            />
            <div v-if="showBodegas" class="absolute z-20 w-full mt-1 bg-white border border-gray-200 rounded-xl shadow-xl max-h-48 overflow-y-auto">
              <div v-for="b in bodegasFiltradas" :key="b.id" @click="selectBodega(b)" class="px-4 py-3 hover:bg-emerald-50 cursor-pointer text-sm font-bold text-gray-800 border-b border-gray-50 last:border-0">
                🏢 {{ b.nombre }} <span class="text-xs text-gray-400 font-normal ml-1">({{ b.tipo }})</span>
              </div>
              <div v-if="bodegasFiltradas.length === 0" class="px-4 py-3 text-sm text-gray-400 italic">No se encontró la bodega...</div>
            </div>
          </div>

          <!-- Producto con Autocompletado -->
          <div class="relative">
            <label class="block text-[11px] font-bold text-gray-500 uppercase tracking-widest mb-1.5 ml-1">Modelo de Prenda</label>
            <input 
              type="text" 
              v-model="searchProducto"
              @focus="showProductos = true"
              @blur="cerrarBuscadorProductos"
              @input="formIngreso.productoId = ''"
              placeholder="🔍 Busca por código SKU o nombre..."
              class="w-full bg-gray-50 border border-gray-200 text-gray-800 rounded-xl px-4 py-3.5 outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white focus:border-transparent transition-all font-bold placeholder-gray-400 shadow-sm"
            />
            <div v-if="showProductos" class="absolute z-20 w-full mt-1 bg-white border border-gray-200 rounded-xl shadow-xl max-h-48 overflow-y-auto">
              <div v-for="p in productosFiltrados" :key="p.id" @click="selectProducto(p)" class="px-4 py-3 hover:bg-emerald-50 cursor-pointer text-sm font-bold text-gray-800 border-b border-gray-50 last:border-0 flex flex-col">
                <span>👕 {{ p.nombre }}</span>
                <span class="text-[10px] text-gray-400 uppercase tracking-widest mt-0.5 ml-6">{{ p.skuBase }}</span>
              </div>
              <div v-if="productosFiltrados.length === 0" class="px-4 py-3 text-sm text-gray-400 italic">No se encontró el producto...</div>
            </div>
          </div>

          <!-- Color y Talla -->
          <div class="grid grid-cols-2 gap-4">
            <!-- Color con Autocompletado -->
            <div class="relative">
              <label class="block text-[11px] font-bold text-gray-500 uppercase tracking-widest mb-1.5 ml-1">Color</label>
              <input 
                type="text" 
                v-model="searchColor"
                @focus="showColores = true"
                @blur="cerrarBuscadorColores"
                @input="formIngreso.color = ''"
                placeholder="🎨 Buscar..."
                class="w-full bg-gray-50 border border-gray-200 text-gray-800 rounded-xl px-4 py-3.5 outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white focus:border-transparent transition-all font-bold placeholder-gray-400 shadow-sm"
              />
              <div v-if="showColores" class="absolute z-30 w-full mt-1 bg-white border border-gray-200 rounded-xl shadow-xl max-h-40 overflow-y-auto">
                <div v-for="c in coloresFiltrados" :key="c.id" @click="selectColor(c)" class="px-3 py-2.5 hover:bg-emerald-50 cursor-pointer text-sm font-bold text-gray-800 border-b border-gray-50 last:border-0 flex justify-between items-center">
                  <span>{{ c.nombre }}</span>
                  <span class="text-[9px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">{{ c.codigo }}</span>
                </div>
                <div v-if="coloresFiltrados.length === 0" class="px-4 py-3 text-sm text-gray-400 italic">Color no existe...</div>
              </div>
            </div>
            
            <!-- Talla sincronizada -->
            <div>
              <label class="block text-[11px] font-bold text-gray-500 uppercase tracking-widest mb-1.5 ml-1">Talla</label>
              <select v-model="formIngreso.talla" class="w-full appearance-none bg-gray-50 border border-gray-200 text-gray-800 rounded-xl px-4 py-3.5 outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white focus:border-transparent transition-all font-bold cursor-pointer shadow-sm text-center text-base">
                <option value="" disabled>Talla...</option>
                <optgroup v-for="(listaTallas, categoria) in tallasAgrupadas" :key="categoria" :label="categoria">
                  <option v-for="t in listaTallas" :key="t" :value="t">{{ t }}</option>
                </optgroup>
              </select>
            </div>
          </div>

          <!-- Cantidad Premium -->
          <div class="pt-4 pb-2">
            <label class="block text-xs font-black text-emerald-600 uppercase tracking-widest mb-3 text-center">Cantidad a Ingresar</label>
            <div class="flex items-center justify-center">
              <input type="number" v-model.number="formIngreso.cantidad" min="1" placeholder="0" class="w-2/3 border border-emerald-200 bg-gradient-to-b from-emerald-50 to-white py-4 px-6 rounded-2xl text-4xl text-center font-black text-emerald-800 outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/20 transition-all shadow-inner placeholder-emerald-200">
            </div>
          </div>

          <!-- Botones -->
          <div class="flex gap-4 pt-6 border-t border-gray-100">
            <button @click="modalIngreso = false" class="w-1/3 py-4 text-gray-500 bg-gray-50 hover:bg-gray-100 hover:text-gray-700 rounded-xl font-bold transition-all">Cancelar</button>
            <button @click="guardarIngreso" class="w-2/3 bg-emerald-600 text-white py-4 rounded-xl font-black text-lg shadow-lg shadow-emerald-500/30 hover:bg-emerald-700 hover:-translate-y-1 transition-all flex items-center justify-center gap-2">
              Confirmar Ingreso <span class="text-xl">✓</span>
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Modal Impresión Código de Barras -->
    <div v-if="modalEtiquetas" class="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
      <div class="bg-white rounded-3xl w-full max-w-sm shadow-2xl animate-in zoom-in duration-200 overflow-hidden">
        <div class="bg-gray-900 p-6 text-center">
          <h3 class="text-xl font-black text-white mb-1">Centro de Impresión</h3>
          <p class="text-xs text-gray-400">{{ itemEtiqueta?.producto.nombre }}</p>
        </div>
        <div class="p-8 flex flex-col items-center">
          <div class="bg-white p-4 border-2 border-dashed border-gray-300 rounded-xl mb-6 flex flex-col items-center w-full shadow-sm">
            <p class="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Vista Previa</p>
            <div id="contenedor-barcode" class="flex justify-center w-full">
              <svg id="barcode-svg" class="w-full max-w-[200px]"></svg>
            </div>
            <p class="text-xs font-bold text-gray-800 mt-2">Talla: {{ itemEtiqueta?.talla }} | Col: {{ getNombreColor(itemEtiqueta?.color) }}</p>
          </div>
          <div class="w-full space-y-4">
            <div>
              <label class="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1 text-center">¿Cuántas etiquetas necesitas?</label>
              <input type="number" v-model.number="cantidadEtiquetas" min="1" class="w-full border-2 border-gray-200 p-3 rounded-xl text-2xl text-center font-black text-gray-800 outline-none focus:border-blue-500">
            </div>
          </div>
        </div>
        <div class="bg-gray-50 p-6 border-t border-gray-100 flex gap-3">
          <button @click="modalEtiquetas = false" class="flex-1 py-3 text-gray-500 hover:bg-gray-200 rounded-xl font-bold transition">Cancelar</button>
          <button @click="imprimirEtiquetas" class="flex-1 bg-blue-600 text-white py-3 rounded-xl font-black shadow-lg shadow-blue-500/30 hover:bg-blue-700 transition flex items-center justify-center gap-2">
            <span>🖨️</span> Imprimir
          </button>
        </div>
      </div>
    </div>
  </div>
</template>