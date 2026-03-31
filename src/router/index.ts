import { createRouter, createWebHistory } from 'vue-router'
import InvoiceCreateView from '../views/InvoiceCreateView.vue'
import InvoiceHistoryView from '../views/InvoiceHistoryView.vue'
import QuoteCreateView from '../views/QuoteCreateView.vue'
import SettingsView from '../views/SettingsView.vue'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', redirect: '/invoices/new' },
    { path: '/settings', component: SettingsView },
    { path: '/invoices/new', component: InvoiceCreateView },
    { path: '/invoices/history', component: InvoiceHistoryView },
    { path: '/quotes/new', component: QuoteCreateView },
  ],
})

export default router
