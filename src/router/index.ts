import { createRouter, createWebHistory } from 'vue-router'
import InvoiceCreateView from '../views/InvoiceCreateView.vue'
import AccountingYearView from '../views/AccountingYearView.vue'
import AccountingMonthView from '../views/AccountingMonthView.vue'
import QuoteCreateView from '../views/QuoteCreateView.vue'
import SettingsView from '../views/SettingsView.vue'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', redirect: '/invoices/new' },
    { path: '/settings', component: SettingsView },
    { path: '/invoices/new', component: InvoiceCreateView },
    { path: '/invoices/accounting', component: AccountingYearView },
    { path: '/invoices/accounting/:yearMonth', component: AccountingMonthView, props: true },
    { path: '/invoices/history', redirect: '/invoices/accounting' },
    { path: '/quotes/new', component: QuoteCreateView },
  ],
})

export default router
