<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import api from '../api/axios';
import { ordenarTallas } from '../utils/tallas';

const bodegas = ref<any[]>([]);
const inventario = ref<any[]>([]);
const productos = ref<any[]>([]);
const colores = ref<any[]>([]);
const cargando = ref(true);
const guardando = ref(false);

const bodegaSel = ref('');
const busqueda = ref('');

// Conteo físico por id de inventario
const conteos = ref<Record<number, number | string>>({});

// Variantes nuevas a crear (no existen en el sistema)
const nuevos = ref<any[]>([]);
const formNuevo = ref({ productoId: '', color: '', talla: '', cantidad: 1 });

const cargarTodo = async () => {
  cargando.value = true;
  try {
    const [resB, resI, resP, resC] = await Promise.all([
      api.get('/almacen-terminados/bodegas'),
      api.get('/almacen-terminados/inventario'),
      api.get('/productos'),
      api.get('/colores'),
    ]);
    bodegas.value = resB.data.filter((b: any) => b.estado);
    inventario.value = resI.data;
    productos.value = resP.data;
    colores.value = resC.data || [];
  } catch (e) { console.error(e); }
  finally { cargando.value = false; }
};

const nombreColor = (val: string) => {
  const c = colores.value.find((x) => x.codigo === val || x.nombre === val);
  return c ? c.nombre : val;
};
const nombreProducto = (id: any) => productos.value.find((p) => p.id === Number(id))?.nombre || '';

// Inventario de la bodega elegida (con filtro de búsqueda)
const itemsBodega = computed(() => {
  if (!bodegaSel.value) return [];
  const q = busqueda.value.trim().toLowerCase();
  return inventario.value
    .filter((it) => it.bodegaId === Number(bodegaSel.value))
    .filter((it) => {
      if (!q) return true;
      const txt = `${it.producto?.nombre || ''} ${nombreColor(it.color)} ${it.talla}`.toLowerCase();
      return txt.includes(q);
    });
});

// ===========================================================================
// EL CONTEO COMO MATRIZ · tallas arriba, colores a la izquierda
// ---------------------------------------------------------------------------
// Es como está la ropa en el almacén y es el mismo formato que usan
// Transformación (al cortar y al recibir) y los reportes, así que el que
// cuenta no tiene que aprender dos formas de mirar lo mismo.
//
// Se puede contar TODA la bodega (una matriz por prenda) o una prenda
// específica (una sola matriz).
// ===========================================================================
const productoSel = ref<any>('');

/** Las prendas que de verdad hay en la bodega elegida, para el desplegable. */
const productosEnBodega = computed(() => {
  const mapa = new Map<number, string>();
  for (const it of itemsBodega.value) {
    mapa.set(Number(it.productoId), it.producto?.nombre || nombreProducto(it.productoId));
  }
  return [...mapa.entries()]
    .map(([id, nombre]) => ({ id, nombre }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre));
});

/**
 * Una matriz por prenda: sus tallas (en orden natural), sus colores y la
 * casilla de cada cruce. Si el cruce no existe en el sistema, la casilla
 * viene vacía y se puede dar de alta con el botón +.
 */
const matrices = computed(() => {
  const porProducto = new Map<number, any[]>();
  for (const it of itemsBodega.value) {
    if (productoSel.value && Number(it.productoId) !== Number(productoSel.value)) continue;
    const id = Number(it.productoId);
    if (!porProducto.has(id)) porProducto.set(id, []);
    porProducto.get(id)!.push(it);
  }

  return [...porProducto.entries()]
    .map(([productoId, items]) => {
      const tallas = ordenarTallas([...new Set(items.map((i) => String(i.talla)))]);
      const colores = [...new Set(items.map((i) => nombreColor(i.color)))].sort();
      const casillas = new Map<string, any>();
      for (const it of items) casillas.set(`${nombreColor(it.color)}|${it.talla}`, it);
      return {
        productoId,
        nombre: items[0]?.producto?.nombre || nombreProducto(productoId),
        tallas,
        colores,
        casillas,
        items,
      };
    })
    .sort((a, b) => a.nombre.localeCompare(b.nombre));
});

const casillaDe = (m: any, color: string, talla: string) => m.casillas.get(`${color}|${talla}`) || null;

/** Lo contado en una casilla (vacío = todavía sin contar). */
const contadoDe = (m: any, color: string, talla: string) => {
  const it = casillaDe(m, color, talla);
  if (!it) return 0;
  const v = conteos.value[it.id];
  return v === '' || v == null ? 0 : Number(v) || 0;
};

const sistemaDe = (m: any, color: string, talla: string) => Number(casillaDe(m, color, talla)?.stock) || 0;

const totalFilaContado = (m: any, color: string) =>
  m.tallas.reduce((s: number, t: string) => s + contadoDe(m, color, t), 0);
const totalColumnaContado = (m: any, talla: string) =>
  m.colores.reduce((s: number, c: string) => s + contadoDe(m, c, talla), 0);
const totalContadoMatriz = (m: any) =>
  m.colores.reduce((s: number, c: string) => s + totalFilaContado(m, c), 0);
const totalSistemaMatriz = (m: any) =>
  m.items.reduce((s: number, it: any) => s + Number(it.stock || 0), 0);

const avisoVariante = ref('');

/** Prepara el alta de una variante que existe físicamente pero no en el sistema. */
const prepararVariante = (m: any, color: string, talla: string) => {
  formNuevo.value = { productoId: String(m.productoId), color, talla, cantidad: 1 };
  avisoVariante.value = `${m.nombre} · ${color} · ${talla}: escribe cuántas hay y pulsa Agregar.`;
  setTimeout(() => (avisoVariante.value = ''), 8000);
  document.getElementById('panel-variante')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
};

// Al cambiar de bodega o recargar, inicializamos el conteo = stock actual del sistema
watch([itemsBodega], () => {
  for (const it of itemsBodega.value) {
    if (conteos.value[it.id] === undefined) conteos.value[it.id] = it.stock;
  }
});
watch(bodegaSel, () => { conteos.value = {}; nuevos.value = []; busqueda.value = ''; });

const diferencia = (it: any) => {
  const fisico = Number(conteos.value[it.id]);
  if (Number.isNaN(fisico)) return 0;
  return fisico - it.stock;
};

// Cuántos cambios hay pendientes (ajustes + variantes nuevas)
const pendientes = computed(() => {
  let n = nuevos.value.length;
  for (const it of itemsBodega.value) {
    const f = conteos.value[it.id];
    if (f !== '' && f != null && Number(f) !== it.stock) n++;
  }
  return n;
});

// 🔫 CONTEO POR ESCANEO: cada disparo suma 1 al conteo físico de esa prenda
const codigoBarra = ref('');
const scanError = ref('');
const scanOk = ref('');
const norm = (s: any) => String(s ?? '').trim().toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

const procesarEscaneoConteo = async () => {
  const code = norm(codigoBarra.value).replace(/'/g, '-');
  codigoBarra.value = '';
  if (!code) return;
  if (!bodegaSel.value) { scanError.value = 'Selecciona primero el almacén.'; return; }

  // Código de color de un item, igual que lo arma la etiqueta (codigoColor)
  const codColor = (val: string) => {
    const c = colores.value.find((x) => norm(x.codigo) === norm(val) || norm(x.nombre) === norm(val));
    return norm(c ? c.codigo : String(val).substring(0, 3));
  };

  // Reconocemos AMBOS formatos del código de barras, sin parsear tokens frágiles:
  //   • completo  → 'PRD4-MLC-S'  (etiquetas viejas)
  //   • compacto  → '4MLCS'       (etiquetas nuevas)
  // Para cada fila del inventario armamos su código y lo comparamos.
  const item = itemsBodega.value.find((it: any) => {
    const idProd = Number(it.productoId);
    const cc = codColor(it.color);
    const talla = norm(it.talla);
    const full = `PRD${idProd}-${cc}-${talla}`;
    const compacto = `${idProd}${cc}${talla}`;
    return code === full || code === compacto;
  });

  if (!item) {
    scanError.value = `Esa prenda no está registrada en este almacén (${code}). Agrégala como variante nueva.`;
    scanOk.value = '';
    return;
  }

  // Suma 1 al conteo físico (si es el primer escaneo de esa fila, arranca en 0)
  const actual = Number(conteos.value[item.id]);
  conteos.value[item.id] = (Number.isNaN(actual) ? 0 : actual) + 1;
  scanError.value = '';
  scanOk.value = `${item.producto?.nombre || ''} · ${nombreColor(item.color)} · ${item.talla} → ${conteos.value[item.id]}`;
  setTimeout(() => (scanOk.value = ''), 2000);
};

// Al escanear queremos partir de 0 (no del stock del sistema) para contar de verdad
const ponerTodoEnCero = () => {
  for (const it of itemsBodega.value) conteos.value[it.id] = 0;
};

const agregarVariante = () => {
  const f = formNuevo.value;
  if (!f.productoId) return alert('Selecciona el producto.');
  if (!f.color) return alert('Selecciona el color.');
  if (!f.talla) return alert('Ingresa la talla.');
  if (!f.cantidad || Number(f.cantidad) < 1) return alert('Cantidad inválida.');
  nuevos.value.push({
    productoId: Number(f.productoId),
    nombreProducto: nombreProducto(f.productoId),
    color: f.color,
    talla: String(f.talla).toUpperCase(),
    cantidad: Number(f.cantidad),
  });
  formNuevo.value = { productoId: '', color: '', talla: '', cantidad: 1 };
};
const quitarNuevo = (i: number) => nuevos.value.splice(i, 1);

const guardar = async () => {
  if (!bodegaSel.value) return;
  const ajustes = itemsBodega.value.filter((it) => {
    const f = conteos.value[it.id];
    return f !== '' && f != null && Number(f) !== it.stock;
  });
  if (!ajustes.length && !nuevos.value.length) return alert('No hay cambios para guardar.');

  guardando.value = true;
  try {
    for (const it of ajustes) {
      await api.post('/almacen-terminados/ajustar-stock', {
        inventarioId: it.id,
        nuevoStock: Number(conteos.value[it.id]),
        motivo: 'Conteo físico',
      });
    }
    for (const n of nuevos.value) {
      await api.post('/almacen-terminados/inventario', {
        productoId: n.productoId,
        bodegaId: Number(bodegaSel.value),
        color: n.color,
        talla: n.talla,
        cantidad: n.cantidad,
        motivo: 'Conteo físico (variante nueva)',
      });
    }
    nuevos.value = [];
    conteos.value = {};
    await cargarTodo();
    alert(`✅ Inventario actualizado (${ajustes.length + (nuevos.value.length)} cambio(s)).`);
  } catch (e: any) {
    alert('❌ ' + (e.response?.data?.message || 'Error al guardar los ajustes.'));
  } finally {
    guardando.value = false;
  }
};

// ===========================================================================
// REPORTE DEL CONTEO · la misma matriz, para imprimir o bajar a Excel
// ---------------------------------------------------------------------------
// Dos usos distintos:
//   • HOJA PARA CONTAR  → se imprime con las casillas vacías y se cuenta a
//     mano, caminando por el almacén con la hoja y un lápiz.
//   • RESULTADO         → lo que dice el sistema, lo que se contó y la
//     diferencia de cada casilla.
// ===========================================================================
const mostrarReporteConteo = ref(false);
const repModo = ref<'hoja' | 'resultado'>('hoja');
// En la hoja para contar, mostrar el stock del sistema es opcional: a veces
// conviene contar "a ciegas" para que el número del sistema no influya.
const repMostrarSistema = ref(false);

const nombreBodega = computed(
  () => bodegas.value.find((b: any) => b.id === Number(bodegaSel.value))?.nombre || '',
);

const hoyTexto = () => new Date().toLocaleString('es-PE');

const exportarConteo = () => {
  const filas: any[][] = [
    ['REPORTE DE CONTEO DE PRENDAS'],
    ['Almacén', nombreBodega.value],
    ['Generado', hoyTexto()],
    ['Prenda', productoSel.value ? nombreProducto(productoSel.value) : 'Todas'],
  ];

  for (const m of matrices.value) {
    filas.push([], [`PRENDA: ${m.nombre}`]);

    for (const [titulo, valor] of [
      ['STOCK DEL SISTEMA', (c: string, t: string) => sistemaDe(m, c, t)],
      ['CONTADO FÍSICO', (c: string, t: string) => contadoDe(m, c, t)],
      ['DIFERENCIA', (c: string, t: string) => contadoDe(m, c, t) - sistemaDe(m, c, t)],
    ] as [string, (c: string, t: string) => number][]) {
      filas.push([titulo]);
      filas.push(['COLOR', ...m.tallas, 'TOTAL']);
      for (const c of m.colores) {
        const celdas = m.tallas.map((t: string) => (casillaDe(m, c, t) ? valor(c, t) : ''));
        const total = m.tallas.reduce((s: number, t: string) => s + (casillaDe(m, c, t) ? valor(c, t) : 0), 0);
        filas.push([c, ...celdas, total]);
      }
      filas.push([
        'TOTAL',
        ...m.tallas.map((t: string) =>
          m.colores.reduce((s: number, c: string) => s + (casillaDe(m, c, t) ? valor(c, t) : 0), 0),
        ),
        m.colores.reduce(
          (s: number, c: string) =>
            s + m.tallas.reduce((x: number, t: string) => x + (casillaDe(m, c, t) ? valor(c, t) : 0), 0),
          0,
        ),
      ]);
      filas.push([]);
    }
  }

  // BOM + punto y coma: así Excel en español abre las columnas bien.
  const csv = '\ufeff' + filas.map((f) => f.join(';')).join('\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `conteo_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
};

const imprimirConteo = () => {
  const esc = (v: any) =>
    String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const esHoja = repModo.value === 'hoja';

  const bloques = matrices.value
    .map((m: any) => {
      const encabezado = m.tallas.map((t: string) => `<th>${esc(t)}</th>`).join('');

      const cuerpo = m.colores
        .map((c: string) => {
          const celdas = m.tallas
            .map((t: string) => {
              if (!casillaDe(m, c, t)) return '<td class="nada">—</td>';
              const sis = sistemaDe(m, c, t);
              if (esHoja) {
                return `<td class="caja">${repMostrarSistema.value ? `<span class="sis">${sis}</span>` : ''}</td>`;
              }
              const con = contadoDe(m, c, t);
              const dif = con - sis;
              const signo = dif > 0 ? `+${dif}` : String(dif);
              return `<td class="res">
                <span class="sis">${sis}</span>
                <b>${con}</b>
                <span class="${dif === 0 ? 'ok' : dif > 0 ? 'mas' : 'menos'}">${dif === 0 ? '=' : signo}</span>
              </td>`;
            })
            .join('');
          const total = esHoja
            ? '<td class="caja"></td>'
            : `<td class="tot">${m.tallas.reduce((s: number, t: string) => s + contadoDe(m, c, t), 0)}</td>`;
          return `<tr><th class="color">${esc(c)}</th>${celdas}${total}</tr>`;
        })
        .join('');

      const pie = esHoja
        ? `<tr><th class="color">TOTAL</th>${m.tallas.map(() => '<td class="caja"></td>').join('')}<td class="caja"></td></tr>`
        : `<tr><th class="color">TOTAL</th>${m.tallas
            .map((t: string) => `<td class="tot">${totalColumnaContado(m, t)}</td>`)
            .join('')}<td class="tot">${totalContadoMatriz(m)}</td></tr>`;

      return `<h2>${esc(m.nombre)}</h2>
        <table>
          <thead><tr><th class="color">Color \\ Talla</th>${encabezado}<th class="color">Total</th></tr></thead>
          <tbody>${cuerpo}${pie}</tbody>
        </table>`;
    })
    .join('');

  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8">
    <title>Conteo de prendas</title>
    <style>
      *{font-family:Arial,Helvetica,sans-serif;box-sizing:border-box}
      body{margin:22px;color:#111}
      h1{font-size:18px;margin:0 0 4px}
      .sub{font-size:11px;color:#555;margin-bottom:14px}
      h2{font-size:13px;margin:16px 0 6px;padding:4px 8px;background:#eee;border-radius:4px}
      table{width:100%;border-collapse:collapse;font-size:11px;margin-bottom:10px}
      th,td{border:1px solid #bbb;padding:6px 4px;text-align:center}
      th{background:#222;color:#fff;font-size:10px;text-transform:uppercase}
      th.color{background:#444;text-align:left;white-space:nowrap}
      td.caja{height:34px}
      td.nada{color:#ccc;background:#fafafa}
      td.res b{display:block;font-size:14px}
      .sis{font-size:9px;color:#777}
      .ok{font-size:9px;color:#888}
      .mas{font-size:10px;color:#0a7}
      .menos{font-size:10px;color:#c33}
      td.tot{background:#f3f3f3;font-weight:bold}
      .pie{margin-top:14px;font-size:9px;color:#777;border-top:1px solid #ddd;padding-top:6px}
      .firma{margin-top:26px;font-size:10px}
      .firma span{display:inline-block;border-top:1px solid #777;width:220px;margin-right:30px;padding-top:4px}
    </style></head><body>
    <h1>${esHoja ? 'HOJA PARA CONTAR PRENDAS' : 'RESULTADO DEL CONTEO'}</h1>
    <div class="sub">
      Almacén: <b>${esc(nombreBodega.value)}</b> ·
      ${esc(productoSel.value ? nombreProducto(productoSel.value) : 'todas las prendas')} ·
      ${esc(hoyTexto())}
    </div>
    ${bloques || '<p>No hay prendas para contar.</p>'}
    <div class="pie">
      ${esHoja
        ? 'Escribe en cada casilla cuántas prendas contaste. Las casillas con — no existen en el sistema: si encuentras prendas ahí, anótalas al margen y dalas de alta como variante nueva.'
        : 'En cada casilla: arriba el stock del sistema, en grande lo contado y al lado la diferencia.'}
    </div>
    <div class="firma"><span>Contó</span><span>Revisó</span></div>
    </body></html>`;

  const v = window.open('', '_blank', 'width=1000,height=700');
  if (!v) { alert('El navegador bloqueó la ventana de impresión.'); return; }
  v.document.write(html);
  v.document.close();
  v.focus();
  setTimeout(() => v.print(), 300);
};

onMounted(cargarTodo);
</script>

<template>
  <div class="space-y-6">
    <div class="bg-white p-4 sm:p-6 rounded-xl shadow-sm border border-gray-100">
      <h2 class="text-2xl sm:text-3xl font-bold text-gray-800">📋 Conteo de Inventario</h2>
      <p class="text-gray-500 mt-1">Cuenta físicamente las prendas de cada almacén y corrige el stock del sistema. Cada cambio queda registrado en el kardex. (Solo administrador.)</p>
    </div>

    <!-- Selector de bodega -->
    <div class="bg-white rounded-xl shadow-sm border border-gray-100 p-4 flex flex-wrap items-center gap-4">
      <div class="flex-1 min-w-[220px]">
        <label class="block text-[10px] font-bold text-gray-500 uppercase mb-1">Almacén a contar</label>
        <select v-model="bodegaSel" class="w-full border border-gray-300 rounded-lg p-2.5 text-sm bg-white outline-none focus:border-blue-500">
          <option value="">Selecciona un almacén...</option>
          <option v-for="b in bodegas" :key="b.id" :value="b.id">{{ b.nombre }} ({{ b.tipo }})</option>
        </select>
      </div>
      <div v-if="bodegaSel" class="flex-1 min-w-[220px]">
        <label class="block text-[10px] font-bold text-gray-500 uppercase mb-1">Prenda a contar</label>
        <select v-model="productoSel" class="w-full border border-gray-300 rounded-lg p-2.5 text-sm bg-white outline-none focus:border-blue-500">
          <option value="">Todas las prendas del almacén</option>
          <option v-for="p in productosEnBodega" :key="p.id" :value="p.id">{{ p.nombre }}</option>
        </select>
      </div>
      <div v-if="bodegaSel" class="flex-1 min-w-[180px]">
        <label class="block text-[10px] font-bold text-gray-500 uppercase mb-1">Buscar</label>
        <input v-model="busqueda" placeholder="Producto, color o talla..." class="w-full border border-gray-300 rounded-lg p-2.5 text-sm outline-none focus:border-blue-500">
      </div>
      <div v-if="bodegaSel">
        <button @click="mostrarReporteConteo = true" class="bg-slate-800 hover:bg-black text-white px-5 py-2.5 rounded-xl font-black text-sm shadow whitespace-nowrap">
          📄 Hoja / Reporte
        </button>
      </div>
    </div>

    <template v-if="bodegaSel">
      <!-- 🔫 CONTEO POR ESCANEO -->
      <div class="bg-blue-50 border border-blue-200 rounded-xl p-4">
        <div class="flex flex-wrap items-center justify-between gap-2 mb-2">
          <p class="text-[11px] font-black text-blue-700 uppercase">🔫 Contar escaneando</p>
          <button @click="ponerTodoEnCero" class="text-[11px] font-bold text-blue-600 border border-blue-200 hover:bg-blue-100 px-3 py-1.5 rounded-lg">
            Poner todo en 0 para contar
          </button>
        </div>
        <input
          v-model="codigoBarra"
          @keyup.enter="procesarEscaneoConteo"
          type="text"
          placeholder="Dispara con la pistola a cada prenda..."
          class="w-full bg-white border-2 border-blue-300 rounded-xl px-4 py-3.5 outline-none focus:ring-2 focus:ring-blue-500 font-mono font-bold"
        />
        <p v-if="scanError" class="mt-2 text-xs font-bold text-red-600">⚠️ {{ scanError }}</p>
        <p v-else-if="scanOk" class="mt-2 text-xs font-bold text-emerald-600">✅ +1 · {{ scanOk }}</p>
        <p v-else class="mt-2 text-[10px] text-blue-500">Cada disparo suma 1 al conteo físico de esa prenda. Tip: pulsa "Poner todo en 0" antes de empezar a contar.</p>
      </div>

      <!-- Agregar variante nueva -->
      <div id="panel-variante" class="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
        <p class="text-sm font-bold text-gray-700 mb-1">➕ Agregar variante que NO está en el sistema</p>
        <p v-if="avisoVariante" class="mb-2 text-xs font-black text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          👉 {{ avisoVariante }}
        </p>
        <p class="text-[11px] text-gray-400 mb-3">Úsalo solo si la prenda existe físicamente pero no aparece en la tabla de abajo.</p>
        <div class="grid grid-cols-2 md:grid-cols-5 gap-2">
          <select v-model="formNuevo.productoId" class="border border-gray-300 rounded-lg p-2 text-sm bg-white col-span-2 md:col-span-2">
            <option value="">Producto...</option>
            <option v-for="p in productos" :key="p.id" :value="p.id">{{ p.nombre }}</option>
          </select>
          <select v-model="formNuevo.color" class="border border-gray-300 rounded-lg p-2 text-sm bg-white">
            <option value="">Color...</option>
            <option v-for="c in colores" :key="c.id" :value="c.nombre">{{ c.nombre }}</option>
          </select>
          <input v-model="formNuevo.talla" placeholder="Talla" class="border border-gray-300 rounded-lg p-2 text-sm uppercase">
          <div class="flex gap-2">
            <input v-model.number="formNuevo.cantidad" type="number" inputmode="numeric" min="1" class="w-16 border border-gray-300 rounded-lg p-2 text-sm text-center font-bold">
            <button @click="agregarVariante" class="flex-1 bg-gray-900 text-white rounded-lg text-sm font-bold hover:bg-black px-3">Agregar</button>
          </div>
        </div>

        <!-- Variantes nuevas en cola -->
        <div v-if="nuevos.length" class="mt-3 flex flex-wrap gap-2">
          <span v-for="(n, i) in nuevos" :key="i" class="inline-flex items-center gap-2 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-lg px-3 py-1.5 text-xs font-bold">
            {{ n.nombreProducto }} · {{ nombreColor(n.color) }} · {{ n.talla }} → +{{ n.cantidad }}
            <button @click="quitarNuevo(i)" class="text-emerald-400 hover:text-red-500">&times;</button>
          </span>
        </div>
      </div>

      <!-- ==================================================================
           CONTEO EN MATRIZ · tallas arriba, colores a la izquierda
           El mismo formato del corte, de la recepción y de los reportes.
           ================================================================== -->
      <div class="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div v-if="cargando" class="py-16 text-center text-gray-400 text-sm">Cargando inventario...</div>
        <div v-else-if="!itemsBodega.length" class="py-16 text-center text-gray-400 text-sm">Este almacén no tiene prendas registradas.</div>
        <div v-else-if="!matrices.length" class="py-16 text-center text-gray-400 text-sm">Ninguna prenda coincide con el filtro.</div>

        <div v-else class="p-4 space-y-6">
          <div v-for="m in matrices" :key="m.productoId">
            <!-- Cabecera de la prenda -->
            <div class="flex flex-wrap items-center justify-between gap-2 mb-2">
              <p class="font-black text-gray-800 text-lg">👕 {{ m.nombre }}</p>
              <div class="flex flex-wrap gap-2 text-[11px] font-black">
                <span class="px-3 py-1.5 rounded-lg bg-gray-100 text-gray-600">
                  Sistema: {{ totalSistemaMatriz(m) }}
                </span>
                <span class="px-3 py-1.5 rounded-lg bg-blue-100 text-blue-700">
                  Contado: {{ totalContadoMatriz(m) }}
                </span>
                <span
                  class="px-3 py-1.5 rounded-lg"
                  :class="totalContadoMatriz(m) - totalSistemaMatriz(m) === 0
                    ? 'bg-gray-100 text-gray-400'
                    : totalContadoMatriz(m) > totalSistemaMatriz(m)
                      ? 'bg-emerald-100 text-emerald-700'
                      : 'bg-rose-100 text-rose-700'"
                >
                  Diferencia:
                  {{ totalContadoMatriz(m) - totalSistemaMatriz(m) > 0 ? '+' : '' }}{{ totalContadoMatriz(m) - totalSistemaMatriz(m) }}
                </span>
              </div>
            </div>

            <p class="sm:hidden text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1.5">👉 Desliza la tabla para ver todas las tallas</p>
            <div class="overflow-x-auto rounded-xl border-2 border-gray-200">
              <table class="w-full text-sm border-collapse">
                <thead>
                  <tr class="bg-gray-100">
                    <th class="text-left px-3 py-2.5 text-[10px] uppercase tracking-wider text-gray-600 font-black sticky left-0 bg-gray-100 z-10">
                      Color \ Talla
                    </th>
                    <th v-for="t in m.tallas" :key="t" class="px-2 py-2.5 text-center min-w-[88px]">
                      <span class="inline-block bg-blue-600 text-white font-black text-sm px-3 py-1 rounded-lg">{{ t }}</span>
                    </th>
                    <th class="px-3 py-2.5 text-center text-[10px] uppercase tracking-wider text-gray-600 font-black bg-gray-200">Total</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="c in m.colores" :key="c" class="border-t-2 border-gray-100">
                    <td class="px-3 py-2 sticky left-0 bg-white z-10 border-r-2 border-gray-100">
                      <span class="flex items-center gap-2 font-black text-gray-800 whitespace-nowrap">
                        <span class="w-4 h-4 rounded border border-gray-300 shrink-0" :style="{ backgroundColor: colores.find((x) => x.nombre === c)?.codigoHex || '#94a3b8' }"></span>
                        {{ c }}
                      </span>
                    </td>

                    <td v-for="t in m.tallas" :key="t" class="px-2 py-2 align-top text-center">
                      <!-- La prenda existe en el sistema: se cuenta aquí -->
                      <template v-if="casillaDe(m, c, t)">
                        <input
                          v-model.number="conteos[casillaDe(m, c, t).id]"
                          type="number" inputmode="numeric" min="0"
                          class="w-full border-2 rounded-xl h-11 text-center text-lg font-black outline-none"
                          :class="contadoDe(m, c, t) === sistemaDe(m, c, t)
                            ? 'border-gray-200 text-gray-700 focus:border-blue-500'
                            : contadoDe(m, c, t) > sistemaDe(m, c, t)
                              ? 'border-emerald-400 bg-emerald-50 text-emerald-700'
                              : 'border-rose-400 bg-rose-50 text-rose-700'"
                        >
                        <p class="text-[10px] font-bold mt-1 text-gray-400">
                          sistema: {{ sistemaDe(m, c, t) }}
                          <span
                            v-if="contadoDe(m, c, t) !== sistemaDe(m, c, t)"
                            :class="contadoDe(m, c, t) > sistemaDe(m, c, t) ? 'text-emerald-600' : 'text-rose-600'"
                            class="font-black"
                          >
                            ({{ contadoDe(m, c, t) > sistemaDe(m, c, t) ? '+' : '' }}{{ contadoDe(m, c, t) - sistemaDe(m, c, t) }})
                          </span>
                        </p>
                      </template>

                      <!-- Ese cruce no existe en el sistema. Si aparecieron
                           prendas, se dan de alta con un toque. -->
                      <template v-else>
                        <button
                          @click="prepararVariante(m, c, t)"
                          title="No existe en el sistema. Pulsa si encontraste prendas de este color y talla."
                          class="w-full h-11 rounded-xl border-2 border-dashed border-gray-200 text-gray-300 hover:border-amber-400 hover:text-amber-500 hover:bg-amber-50 font-black text-lg"
                        >+</button>
                        <p class="text-[10px] font-bold mt-1 text-gray-300">no existe</p>
                      </template>
                    </td>

                    <td class="px-3 py-2 text-center bg-gray-50 border-l-2 border-gray-100">
                      <span class="text-xl font-black" :class="totalFilaContado(m, c) > 0 ? 'text-gray-800' : 'text-gray-300'">
                        {{ totalFilaContado(m, c) }}
                      </span>
                    </td>
                  </tr>
                </tbody>
                <tfoot>
                  <tr class="bg-gray-100 border-t-2 border-gray-200">
                    <td class="px-3 py-2.5 font-black text-gray-700 uppercase text-[10px] tracking-wider sticky left-0 bg-gray-100 z-10">Total</td>
                    <td v-for="t in m.tallas" :key="t" class="px-2 py-2.5 text-center text-lg font-black text-blue-700">
                      {{ totalColumnaContado(m, t) }}
                    </td>
                    <td class="px-3 py-2.5 text-center bg-gray-200">
                      <span class="text-2xl font-black text-gray-800">{{ totalContadoMatriz(m) }}</span>
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          <p class="text-[11px] text-gray-500 font-bold">
            Debajo de cada casilla está el stock del sistema. Si lo que cuentas no coincide, la casilla
            se pinta: 🟢 sobra, 🔴 falta. Las casillas con <b>+</b> no existen en el sistema todavía.
          </p>
        </div>

        <!-- Footer -->
        <div
          class="p-4 pb-seguro sm:pb-4 border-t border-gray-100 flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-3
                 sticky bottom-0 z-20 bg-white/95 backdrop-blur sm:static sm:bg-white sm:backdrop-blur-none"
        >
          <span class="text-sm font-bold text-gray-600 sm:mr-auto">
            {{ pendientes }} cambio(s) pendiente(s)
          </span>
          <button
            @click="guardar"
            :disabled="!pendientes || guardando"
            class="w-full sm:w-auto bg-blue-600 text-white px-5 sm:px-8 py-4 sm:py-3 rounded-xl font-black shadow-lg shadow-blue-500/20 hover:bg-blue-700 disabled:opacity-40 flex items-center justify-center gap-2"
          >
            {{ guardando ? 'Guardando...' : `💾 Guardar ajustes (${pendientes})` }}
          </button>
        </div>
      </div>
    </template>

    <div v-else class="bg-white rounded-xl shadow-sm border border-gray-100 py-16 text-center text-gray-400 text-sm">
      Selecciona un almacén para empezar el conteo.
    </div>
    <!-- ====================================================================
         REPORTE DEL CONTEO · la misma matriz, para imprimir o bajar a Excel
         ==================================================================== -->
    <div v-if="mostrarReporteConteo" class="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-start justify-center z-[100] p-0 sm:p-4 overflow-y-auto">
      <div class="bg-white rounded-none sm:rounded-2xl shadow-2xl w-full max-w-5xl my-0 sm:my-4 min-h-full sm:min-h-0 overflow-hidden">

        <div class="bg-gradient-to-r from-slate-800 to-gray-900 p-5 flex justify-between items-center text-white">
          <div>
            <h3 class="text-xl font-black">📄 Conteo de prendas · matriz color × talla</h3>
            <p class="text-xs text-gray-300 font-medium">
              {{ nombreBodega }} · {{ productoSel ? nombreProducto(productoSel) : 'todas las prendas' }}
            </p>
          </div>
          <button @click="mostrarReporteConteo = false" class="text-white/70 hover:text-white text-2xl sm:text-3xl leading-none">&times;</button>
        </div>

        <div class="p-5 space-y-4">
          <!-- Para qué es la hoja -->
          <div class="grid md:grid-cols-2 gap-3">
            <button
              @click="repModo = 'hoja'"
              class="text-left p-4 rounded-2xl border-2 transition-all"
              :class="repModo === 'hoja' ? 'border-blue-500 bg-blue-50 shadow' : 'border-gray-200 hover:border-gray-300'"
            >
              <p class="font-black text-gray-800">✍️ Hoja para contar a mano</p>
              <p class="text-xs text-gray-500 mt-1">
                Se imprime con las casillas <b>vacías</b>: caminas por el almacén y vas escribiendo
                cuántas prendas hay de cada color y talla.
              </p>
            </button>
            <button
              @click="repModo = 'resultado'"
              class="text-left p-4 rounded-2xl border-2 transition-all"
              :class="repModo === 'resultado' ? 'border-emerald-500 bg-emerald-50 shadow' : 'border-gray-200 hover:border-gray-300'"
            >
              <p class="font-black text-gray-800">✅ Resultado del conteo</p>
              <p class="text-xs text-gray-500 mt-1">
                Cada casilla con el stock del sistema, lo que contaste y la <b>diferencia</b>.
                Sirve para revisar y archivar.
              </p>
            </button>
          </div>

          <label v-if="repModo === 'hoja'" class="flex items-center gap-2 bg-white border-2 border-gray-200 rounded-xl px-4 py-3 cursor-pointer">
            <input type="checkbox" v-model="repMostrarSistema" class="w-4 h-4 accent-blue-600">
            <span class="text-xs font-bold text-gray-700">Mostrar el stock del sistema en la hoja</span>
            <span class="text-[11px] text-gray-400">(sin marcar se cuenta “a ciegas”, sin que el número influya)</span>
          </label>

          <!-- Qué va a salir -->
          <div class="bg-gray-50 border-2 border-gray-200 rounded-2xl p-4">
            <p class="text-[11px] font-black text-gray-600 uppercase tracking-wider mb-2">Va a salir</p>
            <p v-if="!matrices.length" class="text-sm text-gray-400 font-bold">No hay prendas con el filtro actual.</p>
            <ul v-else class="text-sm text-gray-700 font-bold space-y-1">
              <li v-for="m in matrices" :key="m.productoId">
                👕 {{ m.nombre }} — {{ m.colores.length }} color(es) × {{ m.tallas.length }} talla(s)
                <span class="text-gray-400 font-medium">· sistema {{ totalSistemaMatriz(m) }}</span>
              </li>
            </ul>
            <p class="text-[11px] text-gray-500 mt-2">
              La hoja impresa lleva una línea para la firma de quien contó y de quien revisó.
            </p>
          </div>
        </div>

        <div class="bg-gray-50 p-4 border-t-2 border-gray-200 flex flex-col md:flex-row justify-between items-center gap-3">
          <p class="text-[11px] text-gray-500 font-bold">La misma matriz que ves en pantalla</p>
          <div class="flex gap-2 w-full md:w-auto">
            <button @click="imprimirConteo" :disabled="!matrices.length" class="flex-1 md:flex-none bg-slate-700 hover:bg-slate-800 disabled:bg-gray-300 text-white px-5 py-3 rounded-xl font-black text-sm shadow">
              🖨️ Imprimir
            </button>
            <button @click="exportarConteo" :disabled="!matrices.length" class="flex-1 md:flex-none bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-300 text-white px-5 py-3 rounded-xl font-black text-sm shadow">
              ⬇️ Excel (CSV)
            </button>
            <button @click="mostrarReporteConteo = false" class="px-5 py-3 rounded-xl font-bold text-gray-600 hover:bg-gray-200">
              Cerrar
            </button>
          </div>
        </div>
      </div>
    </div>

  </div>
</template>
