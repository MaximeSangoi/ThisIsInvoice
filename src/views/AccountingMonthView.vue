<script setup lang="ts">
import { computed, onMounted, ref, h } from "vue";
import {
  NButton,
  NCard,
  NCheckbox,
  NDataTable,
  NIcon,
  NInput,
  NInputNumber,
  NSelect,
  NSpin,
  useNotification,
} from "naive-ui";
import type { DataTableColumns, SelectOption } from "naive-ui";
import { ChevronBack, Add, TrashOutline, SearchOutline } from "@vicons/ionicons5";
import { useRouter } from "vue-router";
import { useAccountingStore } from "../stores/accounting.store";
import { useInvoicesStore } from "../stores/invoices.store";
import { useSettingsStore } from "../stores/settings.store";
import type { AccountingMonth, Expense, ExpenseCategory } from "../domain/accounting/types";
import { EXPENSE_CATEGORIES } from "../domain/accounting/types";
import { formatCurrency, formatDate } from "../domain/invoice/calculations";
import { parseBankStatementPdf, filterDuplicateExpenses } from "../services/accounting/bank-statement-parser.service";

const props = defineProps<{ yearMonth: string }>();
const router = useRouter();
const store = useAccountingStore();
const invoicesStore = useInvoicesStore();
const settingsStore = useSettingsStore();
const notification = useNotification();

const loading = ref(true);
const importing = ref(false);
const dragging = ref(false);
const month = ref<AccountingMonth>({
  yearMonth: props.yearMonth,
  expenses: [],
});

// Manual expense form
const newLabel = ref("");
const newAmount = ref<number | null>(null);
const newDate = ref("");
const newCategory = ref<ExpenseCategory | null>(null);

// Filters & search
const searchQuery = ref("");
const filterJustified = ref<boolean | null>(null); // null = all, true = justified, false = unjustified
const filterCategory = ref<ExpenseCategory | null>(null);
const sortKey = ref<'date' | 'amount' | 'label'>('date');
const sortOrder = ref<'ascend' | 'descend'>('ascend');

onMounted(async () => {
  const dirHandle = await settingsStore.verifyOutputDir();
  await Promise.all([store.initialize(), invoicesStore.initialize(dirHandle)]);
  month.value = await store.getMonth(props.yearMonth);
  loading.value = false;
});

const monthLabel = computed(() => {
  const y = parseInt(props.yearMonth.slice(0, 4));
  const m = parseInt(props.yearMonth.slice(4, 6));
  const label = new Intl.DateTimeFormat("fr-FR", {
    month: "long",
    year: "numeric",
  }).format(new Date(Date.UTC(y, m - 1, 1)));
  return label.charAt(0).toUpperCase() + label.slice(1);
});

// Revenue from tracked invoices for this month
const periodMonth = computed(() => {
  const y = props.yearMonth.slice(0, 4);
  const m = props.yearMonth.slice(4, 6);
  return `${y}-${m}`;
});

const monthInvoices = computed(() => {
  const all = invoicesStore.getByMonth(periodMonth.value);
  // Group by version key (e.g. "202601-ACME"), keep only the paid representative
  const groups = new Map<string, typeof all>();
  for (const r of all) {
    const key = r.number.slice(0, r.number.lastIndexOf('-')) || r.number;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(r);
  }
  const result: typeof all = [];
  for (const members of groups.values()) {
    const paid = members.find(m => m.paidAt);
    if (paid) result.push(paid);
  }
  return result;
});
const totalRevenue = computed(() => monthInvoices.value.reduce((sum, r) => sum + r.netAmount, 0));

// Filtered & sorted expenses
const filteredExpenses = computed(() => {
  let result = month.value.expenses;

  // Search
  if (searchQuery.value.trim()) {
    const q = searchQuery.value.toLowerCase().trim();
    result = result.filter(
      (e) =>
        e.label.toLowerCase().includes(q) ||
        e.date.includes(q) ||
        String(e.amount).includes(q) ||
        (e.category && e.category.toLowerCase().includes(q))
    );
  }

  // Filter justified
  if (filterJustified.value !== null) {
    result = result.filter((e) => e.justified === filterJustified.value);
  }

  // Filter category
  if (filterCategory.value) {
    result = result.filter((e) => e.category === filterCategory.value);
  }

  // Sort
  const sorted = [...result];
  sorted.sort((a, b) => {
    let cmp = 0;
    if (sortKey.value === 'date') cmp = a.date.localeCompare(b.date);
    else if (sortKey.value === 'amount') cmp = a.amount - b.amount;
    else if (sortKey.value === 'label') cmp = a.label.localeCompare(b.label, 'fr');
    return sortOrder.value === 'descend' ? -cmp : cmp;
  });

  return sorted;
});

const justifiedCount = computed(
  () => month.value.expenses.filter((e) => e.justified).length,
);
const totalCount = computed(() => month.value.expenses.length);
const totalAmount = computed(() =>
  month.value.expenses.reduce((sum, e) => sum + e.amount, 0),
);
const result = computed(() => totalRevenue.value - totalAmount.value);

// Category options for selects
const categoryOptions: SelectOption[] = EXPENSE_CATEGORIES.map((c) => ({
  label: c,
  value: c,
}));

const filterCategoryOptions: SelectOption[] = [
  { label: "Toutes les catégories", value: "" },
  ...categoryOptions,
];

const filterJustifiedOptions: SelectOption[] = [
  { label: "Toutes", value: "" },
  { label: "Justifiées", value: "true" },
  { label: "Non justifiées", value: "false" },
];

const sortOptions: SelectOption[] = [
  { label: "Date", value: "date" },
  { label: "Montant", value: "amount" },
  { label: "Libellé", value: "label" },
];

// --- Table ---
const columns: DataTableColumns<Expense> = [
  {
    title: "",
    key: "justified",
    width: 50,
    render(row) {
      return h(NCheckbox, {
        checked: row.justified,
        onUpdateChecked: () => toggleJustified(row.id),
      });
    },
  },
  {
    title: "Date",
    key: "date",
    width: 110,
    render(row) {
      return formatDate(row.date);
    },
  },
  { title: "Libellé", key: "label" },
  {
    title: "Catégorie",
    key: "category",
    width: 140,
    render(row) {
      return h(NSelect, {
        value: row.category ?? null,
        options: categoryOptions,
        placeholder: "—",
        size: "small",
        clearable: true,
        onUpdateValue: (val: ExpenseCategory | null) => updateCategory(row.id, val),
      });
    },
  },
  {
    title: "Montant",
    key: "amount",
    width: 130,
    render(row) {
      return formatCurrency(row.amount);
    },
  },
  {
    title: "",
    key: "actions",
    width: 50,
    render(row) {
      return h(
        NButton,
        {
          quaternary: true,
          circle: true,
          type: "error",
          size: "small",
          onClick: () => removeExpense(row.id),
        },
        { icon: () => h(NIcon, null, { default: () => h(TrashOutline) }) },
      );
    },
  },
];

// --- Actions ---
const toggleJustified = async (expenseId: string) => {
  await store.toggleJustified(props.yearMonth, expenseId);
  month.value = await store.getMonth(props.yearMonth);
};

const updateCategory = async (expenseId: string, category: ExpenseCategory | null) => {
  await store.updateExpenseCategory(props.yearMonth, expenseId, category ?? undefined);
  month.value = await store.getMonth(props.yearMonth);
};

const removeExpense = async (expenseId: string) => {
  await store.removeExpense(props.yearMonth, expenseId);
  month.value = await store.getMonth(props.yearMonth);
};

const addExpense = async () => {
  if (!newLabel.value.trim() || newAmount.value == null) return;
  const mm = props.yearMonth.slice(4, 6);
  const yyyy = props.yearMonth.slice(0, 4);
  const expense: Expense = {
    id: crypto.randomUUID(),
    date: newDate.value || `${yyyy}-${mm}-01`,
    label: newLabel.value.trim(),
    amount: newAmount.value,
    justified: false,
    category: newCategory.value ?? undefined,
  };
  await store.addExpense(props.yearMonth, expense);
  month.value = await store.getMonth(props.yearMonth);
  newLabel.value = "";
  newAmount.value = null;
  newDate.value = "";
  newCategory.value = null;
};

// --- PDF import with duplicate detection ---
const onDrop = async (e: DragEvent) => {
  dragging.value = false;
  const file = e.dataTransfer?.files[0];
  if (file) await importPdf(file);
};

const onFileSelect = async (e: Event) => {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  if (file) await importPdf(file);
  input.value = "";
};

const importPdf = async (file: File) => {
  if (!file.name.toLowerCase().endsWith(".pdf")) {
    notification.warning({
      title: "Fichier invalide",
      content: "Sélectionnez un fichier PDF.",
    });
    return;
  }
  importing.value = true;
  try {
    const allParsed = await parseBankStatementPdf(file);
    if (allParsed.length === 0) {
      notification.warning({
        title: "Aucune dépense",
        content: "Aucune ligne de dépense trouvée dans ce relevé.",
      });
      return;
    }

    // Duplicate detection
    const { newExpenses, duplicateCount } = filterDuplicateExpenses(
      allParsed,
      month.value.expenses,
    );

    if (newExpenses.length === 0) {
      notification.warning({
        title: "Doublons détectés",
        content: `Les ${duplicateCount} dépense(s) trouvée(s) existent déjà.`,
      });
      return;
    }

    await store.importExpenses(props.yearMonth, newExpenses);
    month.value = await store.getMonth(props.yearMonth);

    const msg = duplicateCount > 0
      ? `${newExpenses.length} dépense(s) importée(s), ${duplicateCount} doublon(s) ignoré(s).`
      : `${newExpenses.length} dépense(s) importée(s).`;
    notification.success({ title: "Import réussi", content: msg });
  } catch (err) {
    notification.error({ title: "Erreur d'import", content: String(err) });
  } finally {
    importing.value = false;
  }
};
</script>

<template>
  <div class="panel">
    <div class="month-header">
      <n-button quaternary @click="router.push('/invoices/accounting')">
        <template #icon
          ><n-icon><ChevronBack /></n-icon
        ></template>
        Retour
      </n-button>
      <h2>{{ monthLabel }}</h2>
      <div class="badge" v-if="totalCount > 0">
        {{ justifiedCount }}/{{ totalCount }} justifiées
      </div>
    </div>

    <n-spin v-if="loading" class="center-spin" />

    <template v-else>
      <!-- P&L Summary -->
      <div class="pl-summary">
        <div class="pl-item pl-revenue">
          <span class="pl-label">CA HT</span>
          <span class="pl-value">{{ formatCurrency(totalRevenue) }}</span>
          <span class="pl-detail" v-if="monthInvoices.length > 0">
            {{ monthInvoices.length }} facture(s)
          </span>
          <span class="pl-detail empty" v-else>Aucune facture enregistrée</span>
        </div>
        <div class="pl-item pl-expenses">
          <span class="pl-label">Dépenses</span>
          <span class="pl-value">{{ formatCurrency(totalAmount) }}</span>
        </div>
        <div class="pl-item pl-result" :class="{ negative: result < 0 }">
          <span class="pl-label">Résultat</span>
          <span class="pl-value">{{ formatCurrency(result) }}</span>
        </div>
      </div>

      <!-- PDF Import Dropzone -->
      <label
        class="pdf-dropzone"
        :class="{
          'pdf-dropzone--active': dragging,
          'pdf-dropzone--importing': importing,
        }"
        @dragover.prevent="dragging = true"
        @dragenter.prevent="dragging = true"
        @dragleave.prevent="dragging = false"
        @drop.prevent="onDrop"
      >
        <input
          type="file"
          accept=".pdf"
          class="pdf-file-input"
          @change="onFileSelect"
          :disabled="importing"
        />
        <span v-if="importing">Import en cours…</span>
        <span v-else
          >Déposer ou cliquer pour importer un relevé bancaire PDF</span
        >
      </label>

      <!-- Search & Filters bar -->
      <div class="filters-bar" v-if="month.expenses.length > 0">
        <n-input
          v-model:value="searchQuery"
          placeholder="Rechercher…"
          clearable
          class="filter-search"
          aria-label="Rechercher dans les dépenses"
        >
          <template #prefix>
            <n-icon><SearchOutline /></n-icon>
          </template>
        </n-input>
        <n-select
          v-model:value="filterCategory"
          :options="filterCategoryOptions"
          placeholder="Catégorie"
          clearable
          class="filter-category"
          aria-label="Filtrer par catégorie"
          @update:value="(v: string) => filterCategory = (v || null) as ExpenseCategory | null"
        />
        <n-select
          :value="filterJustified === null ? '' : String(filterJustified)"
          :options="filterJustifiedOptions"
          placeholder="Statut"
          class="filter-justified"
          aria-label="Filtrer par justification"
          @update:value="(v: string) => filterJustified = v === '' ? null : v === 'true'"
        />
        <n-select
          v-model:value="sortKey"
          :options="sortOptions"
          placeholder="Trier par"
          class="filter-sort"
          aria-label="Trier par"
        />
        <n-button
          quaternary
          size="small"
          @click="sortOrder = sortOrder === 'ascend' ? 'descend' : 'ascend'"
          :aria-label="sortOrder === 'ascend' ? 'Tri croissant' : 'Tri décroissant'"
        >
          {{ sortOrder === 'ascend' ? '↑' : '↓' }}
        </n-button>
      </div>

      <!-- Expenses Table -->
      <n-data-table
        v-if="filteredExpenses.length > 0"
        :columns="columns"
        :data="filteredExpenses"
        :row-key="(r: Expense) => r.id"
        :bordered="false"
        class="expenses-table"
      />
      <n-card v-else-if="month.expenses.length > 0" class="empty-msg">
        Aucune dépense ne correspond aux filtres.
      </n-card>
      <n-card v-else class="empty-msg"> Aucune dépense pour ce mois. </n-card>

      <!-- Add expense form -->
      <div class="add-expense">
        <n-input
          v-model:value="newDate"
          placeholder="Date (AAAA-MM-JJ)"
          aria-label="Date de la dépense"
          class="add-date"
        />
        <n-input
          v-model:value="newLabel"
          placeholder="Libellé"
          aria-label="Libellé de la dépense"
          class="add-label"
        />
        <n-input-number
          v-model:value="newAmount"
          placeholder="Montant"
          aria-label="Montant de la dépense"
          :show-button="false"
          class="add-amount"
        />
        <n-select
          v-model:value="newCategory"
          :options="categoryOptions"
          placeholder="Catégorie"
          clearable
          class="add-category"
          aria-label="Catégorie de la dépense"
        />
        <n-button
          type="primary"
          @click="addExpense"
          :disabled="!newLabel.trim() || newAmount == null"
        >
          <template #icon
            ><n-icon><Add /></n-icon
          ></template>
          Ajouter
        </n-button>
      </div>
    </template>
  </div>
</template>

<style scoped>
.month-header {
  display: flex;
  align-items: center;
  gap: 1rem;
  flex-wrap: wrap;
  margin-bottom: 1.2rem;
}
.month-header h2 {
  margin: 0;
  flex: 1;
}
.badge {
  font-size: 0.88rem;
  color: #364b63;
}
.center-spin {
  display: flex;
  justify-content: center;
  padding: 3rem 0;
}

/* P&L Summary */
.pl-summary {
  display: flex;
  gap: 1rem;
  margin-bottom: 1.2rem;
  flex-wrap: wrap;
}
.pl-item {
  flex: 1;
  min-width: 140px;
  padding: 0.8rem 1rem;
  border-radius: 8px;
  background: #f5f7fa;
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
}
.pl-label {
  font-size: 0.78rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: #888;
  font-weight: 600;
}
.pl-value {
  font-size: 1.2rem;
  font-weight: 700;
}
.pl-detail {
  font-size: 0.78rem;
  color: #666;
}
.pl-detail.empty {
  color: #aaa;
  font-style: italic;
}
.pl-revenue .pl-value {
  color: #2a7d5f;
}
.pl-expenses .pl-value {
  color: #c0392b;
}
.pl-result .pl-value {
  color: #2a7d5f;
}
.pl-result.negative .pl-value {
  color: #c0392b;
}

/* Filters bar */
.filters-bar {
  display: flex;
  gap: 0.5rem;
  align-items: center;
  margin-bottom: 1rem;
  flex-wrap: wrap;
}
.filter-search {
  flex: 1;
  min-width: 160px;
}
.filter-category {
  width: 160px;
}
.filter-justified {
  width: 140px;
}
.filter-sort {
  width: 120px;
}

/* PDF Dropzone */
.pdf-dropzone {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 70px;
  border: 2px dashed var(--n-border-color, #ccc);
  border-radius: 8px;
  cursor: pointer;
  transition:
    border-color 0.2s,
    background 0.2s;
  font-size: 0.9rem;
  color: var(--n-text-color-disabled, #999);
  margin-bottom: 1.2rem;
}
.pdf-dropzone:hover,
.pdf-dropzone--active {
  border-color: #0f617a;
  background: rgba(15, 97, 122, 0.04);
}
.pdf-dropzone--importing {
  pointer-events: none;
  opacity: 0.6;
}
.pdf-file-input {
  display: none;
}

/* Table */
.expenses-table {
  margin-bottom: 1.2rem;
}
.empty-msg {
  text-align: center;
  color: #aaa;
  margin-bottom: 1.2rem;
}

/* Add expense form */
.add-expense {
  display: flex;
  gap: 0.6rem;
  align-items: center;
  flex-wrap: wrap;
}
.add-date {
  width: 150px;
}
.add-label {
  flex: 1;
  min-width: 150px;
}
.add-amount {
  width: 120px;
}
.add-category {
  width: 150px;
}
</style>
