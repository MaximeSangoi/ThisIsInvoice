<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { NButton, NCard, NIcon, NSpin } from "naive-ui";
import { ChevronBack, ChevronForward } from "@vicons/ionicons5";
import { useRouter } from "vue-router";
import { useAccountingStore } from "../stores/accounting.store";

const router = useRouter();
const store = useAccountingStore();
const loading = ref(true);
const year = ref(new Date().getFullYear());

onMounted(async () => {
  await store.initialize();
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
    return { label, yearMonth, total, justified };
  })
);

const goMonth = (yearMonth: string) => {
  router.push(`/invoices/accounting/${yearMonth}`);
};
</script>

<template>
  <div class="panel">
    <div class="year-header">
      <n-button quaternary circle @click="year--">
        <template #icon><n-icon><ChevronBack /></n-icon></template>
      </n-button>
      <h2>{{ year }}</h2>
      <n-button quaternary circle @click="year++">
        <template #icon><n-icon><ChevronForward /></n-icon></template>
      </n-button>
    </div>

    <n-spin v-if="loading" class="center-spin" />

    <div v-else class="month-grid">
      <n-card
        v-for="m in monthCards"
        :key="m.yearMonth"
        hoverable
        class="month-card"
        @click="goMonth(m.yearMonth)"
      >
        <div class="month-name">{{ m.label }}</div>
        <div class="month-stat" v-if="m.total > 0">
          {{ m.justified }}/{{ m.total }} justifiées
        </div>
        <div class="month-stat empty" v-else>Aucune dépense</div>
      </n-card>
    </div>
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
.month-stat {
  font-size: 0.85rem;
  color: #364b63;
}
.month-stat.empty {
  color: #aaa;
}
@media (max-width: 720px) {
  .month-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}
</style>
