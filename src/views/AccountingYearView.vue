<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { NButton, NCard, NIcon, NSpin } from "naive-ui";
import { ChevronBack, ChevronForward } from "@vicons/ionicons5";
import { useRouter } from "vue-router";
import { useAccountingStore } from "../stores/accounting.store";
import { useInvoicesStore } from "../stores/invoices.store";
import { useSettingsStore } from "../stores/settings.store";
import { formatCurrency } from "../domain/invoice/calculations";

const router = useRouter();
const store = useAccountingStore();
const invoicesStore = useInvoicesStore();
const settingsStore = useSettingsStore();
const loading = ref(true);
const year = ref(new Date().getFullYear());

onMounted(async () => {
  const dirHandle = await settingsStore.verifyOutputDir();
  await Promise.all([store.initialize(), invoicesStore.initialize(dirHandle)]);
  loading.value = false;
});

const MONTH_LABELS = [
  "Janvier",
  "Février",
  "Mars",
  "Avril",
  "Mai",
  "Juin",
  "Juillet",
  "Août",
  "Septembre",
  "Octobre",
  "Novembre",
  "Décembre",
];

const monthCards = computed(() =>
  MONTH_LABELS.map((label, i) => {
    const mm = String(i + 1).padStart(2, "0");
    const yearMonth = `${year.value}${mm}`;
    const month = store.months.get(yearMonth);
    const total = month?.expenses.length ?? 0;
    const justified = month?.expenses.filter((e) => e.justified).length ?? 0;
    const expenses = month?.expenses.reduce((sum, e) => sum + e.amount, 0) ?? 0;
    const revenue = invoicesStore.revenueByYearMonth.get(yearMonth) ?? 0;
    const result = revenue - expenses;
    return { label, yearMonth, total, justified, expenses, revenue, result };
  })
);

const yearTotals = computed(() => {
  let revenue = 0;
  let expenses = 0;
  for (const card of monthCards.value) {
    revenue += card.revenue;
    expenses += card.expenses;
  }
  return { revenue, expenses, result: revenue - expenses };
});

const goMonth = (yearMonth: string) => {
  router.push(`/invoices/accounting/${yearMonth}`);
};
</script>

<template>
  <div class="panel">
    <div class="year-header">
      <n-button quaternary circle aria-label="Année précédente" @click="year--">
        <template #icon><n-icon><ChevronBack /></n-icon></template>
      </n-button>
      <h2>{{ year }}</h2>
      <n-button quaternary circle aria-label="Année suivante" @click="year++">
        <template #icon><n-icon><ChevronForward /></n-icon></template>
      </n-button>
    </div>

    <n-spin v-if="loading" class="center-spin" />

    <template v-else>
      <!-- Year P&L summary -->
      <div class="year-pl-summary">
        <div class="year-pl-item">
          <span class="year-pl-label">CA HT annuel</span>
          <span class="year-pl-value revenue">{{ formatCurrency(yearTotals.revenue) }}</span>
        </div>
        <div class="year-pl-item">
          <span class="year-pl-label">Dépenses annuelles</span>
          <span class="year-pl-value expenses">{{ formatCurrency(yearTotals.expenses) }}</span>
        </div>
        <div class="year-pl-item">
          <span class="year-pl-label">Résultat annuel</span>
          <span class="year-pl-value" :class="yearTotals.result >= 0 ? 'positive' : 'negative'">
            {{ formatCurrency(yearTotals.result) }}
          </span>
        </div>
      </div>

      <div class="month-grid" role="list">
        <n-card
          v-for="m in monthCards"
          :key="m.yearMonth"
          hoverable
          class="month-card"
          role="listitem"
          tabindex="0"
          :aria-label="`${m.label} — ${m.total > 0 ? m.justified + '/' + m.total + ' justifiées' : 'Aucune dépense'}`"
          @click="goMonth(m.yearMonth)"
        >
          <div class="month-name">{{ m.label }}</div>
          <div class="month-revenue" v-if="m.revenue > 0">
            CA : {{ formatCurrency(m.revenue) }}
          </div>
          <div class="month-stat" v-if="m.total > 0">
            {{ m.justified }}/{{ m.total }} justifiées
            <span class="month-expense-total">— {{ formatCurrency(m.expenses) }}</span>
          </div>
          <div class="month-stat empty" v-else>Aucune dépense</div>
          <div class="month-result" v-if="m.revenue > 0 || m.expenses > 0" :class="{ negative: m.result < 0 }">
            {{ formatCurrency(m.result) }}
          </div>
        </n-card>
      </div>
    </template>
  </div>
</template>

<style scoped>
.year-header {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 1rem;
  margin-bottom: 1.5rem;
}
.year-header h2 {
  margin: 0;
  min-width: 5ch;
  text-align: center;
}
.center-spin {
  display: flex;
  justify-content: center;
  padding: 3rem 0;
}

/* Year P&L Summary */
.year-pl-summary {
  display: flex;
  gap: 1rem;
  margin-bottom: 1.5rem;
  flex-wrap: wrap;
}
.year-pl-item {
  flex: 1;
  min-width: 140px;
  padding: 0.8rem 1rem;
  border-radius: 8px;
  background: #f5f7fa;
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  text-align: center;
}
.year-pl-label {
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: #888;
  font-weight: 600;
}
.year-pl-value {
  font-size: 1.15rem;
  font-weight: 700;
}
.year-pl-value.revenue {
  color: #2a7d5f;
}
.year-pl-value.expenses {
  color: #c0392b;
}
.year-pl-value.positive {
  color: #2a7d5f;
}
.year-pl-value.negative {
  color: #c0392b;
}

.month-grid {
  display: grid;
  gap: 1rem;
  grid-template-columns: repeat(4, 1fr);
}
.month-card {
  cursor: pointer;
  text-align: center;
}
.month-name {
  font-weight: 600;
  margin-bottom: 0.3rem;
}
.month-revenue {
  font-size: 0.82rem;
  color: #2a7d5f;
  font-weight: 600;
}
.month-stat {
  font-size: 0.85rem;
  color: #364b63;
}
.month-stat.empty {
  color: #aaa;
}
.month-expense-total {
  color: #888;
}
.month-result {
  font-size: 0.85rem;
  font-weight: 700;
  color: #2a7d5f;
  margin-top: 0.2rem;
}
.month-result.negative {
  color: #c0392b;
}
@media (max-width: 720px) {
  .month-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}
</style>
