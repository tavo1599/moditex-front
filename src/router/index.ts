import { createRouter, createWebHistory } from 'vue-router'
import HomeView from '../views/HomeView.vue'
import { useAuthStore } from '../stores/auth';

// Rutas marcadas con meta.roles solo las pueden abrir esos roles.
// Las que no tienen meta.roles quedan abiertas a cualquier usuario autenticado.
const SOLO_ADMIN = { roles: ['ADMIN'] };

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'home',
      component: HomeView
    },
    {
      path: '/almacen',
      name: 'almacen',
      component: () => import('../views/AlmacenView.vue'),
      meta: SOLO_ADMIN
    },
    {
      path: '/reportes',
      name: 'reportes',
      component: () => import('../views/ReportesView.vue'),
      meta: SOLO_ADMIN
    },
    {
      path: '/ingenieria',
      name: 'ingenieria',
      component: () => import('../views/IngenieriaView.vue'),
      meta: SOLO_ADMIN
    },
    {
      path: '/produccion',
      name: 'produccion',
      component: () => import('../views/ProduccionView.vue'),
      meta: SOLO_ADMIN
    },
    {
      path: '/despachos',
      name: 'despachos',
      component: () => import('../views/DespachosView.vue'),
      meta: SOLO_ADMIN
    },
    {
      path: '/talleres',
      name: 'talleres',
      component: () => import('../views/TalleresView.vue'),
      meta: SOLO_ADMIN
    },
    {
      path: '/productos',
      name: 'productos',
      component: () => import('../views/ProductosView.vue'),
      meta: SOLO_ADMIN
    },
    {
      path: '/control-ordenes',
      name: 'control-ordenes',
      component: () => import('../views/ControlOrdenesView.vue'),
      meta: SOLO_ADMIN
    },
    {
      path: '/almacen-terminados',
      name: 'almacen-terminados',
      component: () => import('../views/AlmacenTerminadosView.vue')
    },
    {
      path: '/traslados',
      name: 'traslados',
      component: () => import('../views/TrasladosView.vue'),
      meta: SOLO_ADMIN
    },
    {
      path: '/punto-venta',
      name: 'punto-venta',
      component: () => import('../views/PuntoVentaView.vue')
    },
    // 🔥 NUEVA RUTA PARA EL ESCÁNER MÓVIL 🔥
    {
      path: '/escaner',
      name: 'escaner-movil',
      component: () => import('../views/EscanerMovil.vue'),
      meta: {
        hideLayout: true // Propiedad para ocultar el menú de navegación en el celular
      }
    },
    {
      path: '/config-colores',
      name: 'config-colores',
      component: () => import('../views/ColoresView.vue'),
      meta: SOLO_ADMIN
    },
    {
      path: '/liquidaciones',
      name: 'Liquidaciones',
      component: () => import('../views/LiquidacionesView.vue'),
      meta: { title: 'Liquidación de Costos', roles: ['ADMIN'] }
    },
    {
      path: '/produccion/nueva-orden',
      name: 'NuevaOrdenCorte',
      component: () => import('../views/OrdenCorteView.vue'),
      meta: SOLO_ADMIN
    },
    {
      path: '/cobranzas',
      name: 'cobranzas',
      component: () => import('../views/CobranzasView.vue')
    },
    {
      path: '/compras',
      name: 'Compras',
      component: () => import('../views/ComprasView.vue'),
      meta: SOLO_ADMIN
    },
    {
      path: '/usuarios',
      name: 'usuarios',
      component: () => import('../views/UsuariosView.vue'),
      meta: SOLO_ADMIN
    },
    {
      path: '/recepcion',
      name: 'recepcion',
      component: () => import('../views/RecepcionView.vue'),
      meta: SOLO_ADMIN
    },
    {
      path: '/etiquetas',
      name: 'etiquetas',
      component: () => import('../views/EtiquetasView.vue'),
      meta: SOLO_ADMIN
    },
    {
      path: '/conteo-inventario',
      name: 'conteo-inventario',
      component: () => import('../views/ConteoInventarioView.vue'),
      meta: SOLO_ADMIN
    },
    {
      path: '/web/productos',
      name: 'web-productos',
      component: () => import('../views/web/WebProductosView.vue'),
      meta: SOLO_ADMIN
    },
    {
      path: '/web/portada',
      name: 'web-portada',
      component: () => import('../views/web/WebPortadaView.vue'),
      meta: SOLO_ADMIN
    },
    {
      path: '/web/pedidos',
      name: 'web-pedidos',
      component: () => import('../views/web/WebPedidosView.vue'),
      meta: SOLO_ADMIN
    },
    {
      path: '/web/publicaciones',
      name: 'web-publicaciones',
      component: () => import('../views/web/WebPublicacionesView.vue'),
      meta: SOLO_ADMIN
    },
    {
      path: '/web/resenas',
      name: 'web-resenas',
      component: () => import('../views/web/WebResenasView.vue'),
      meta: SOLO_ADMIN
    },
    {
      path: '/web/ajustes',
      name: 'web-ajustes',
      component: () => import('../views/web/WebAjustesView.vue'),
      meta: SOLO_ADMIN
    },
    {
      path: '/web/reclamaciones',
      name: 'web-reclamaciones',
      component: () => import('../views/web/WebReclamacionesView.vue'),
      meta: SOLO_ADMIN
    },
    {
      path: '/web/cupones',
      name: 'web-cupones',
      component: () => import('../views/web/WebCuponesView.vue'),
      meta: SOLO_ADMIN
    }

  ],
})

router.addRoute({ path: '/login', name: 'login', component: () => import('../views/LoginView.vue') });

router.beforeEach((to, from, next) => {
  const authStore = useAuthStore();

  // 1. Si la ruta no es login y no está autenticado, lo mandamos al login
  if (to.name !== 'login' && !authStore.estaAutenticado) {
    return next({ name: 'login' });
  }

  // 2. Si la ruta exige roles y el usuario no lo tiene, lo mandamos al inicio
  const rolesPermitidos = to.meta.roles as string[] | undefined;
  if (rolesPermitidos && !rolesPermitidos.includes(authStore.rol)) {
    return next({ name: 'home' });
  }

  next();
});

export default router
