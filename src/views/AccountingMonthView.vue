<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import {
  NButton,
  NCard,
  NCheckbox,
  NDataTable,
  NIcon,
  NInput,
  NInputNumber,
  NSpin,
  useNotification,
} from "naive-ui";
import type { DataTableColumns } from "naive-ui";
import { ChevronBack, Add, TrashOutline } from "@vicons/ionicons5";
import { useRouter } from "vue-router";
import { useAccountingStore } from "../stores/accounting.store";
import type { AccountingMonth, Expense } from "../domain/accounting/types";
import { formatCurrency, formatDate } from "../domain/invoice/calculations";
import { parseBankStatementPdf } from "../services/accounting/bank-statement-parser.service";

const props = defineProps<{ yearMonth: string }>();
const router = useRouter();
const store = useAccountingStore();
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

onMounted(async () => {
  await store.initialize();
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

const justifiedCount = computed(
  () => month.value.expenses.filter((e) => e.justified).length,
);
const totalCount = computed(() => month.value.expenses.length);

const totalAmount = computed(() =>
  month.value.expenses.reduce((sum, e) => sum + e.amount, 0),
);

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
  };
  await store.addExpense(props.yearMonth, expense);
  month.value = await store.getMonth(props.yearMonth);
  newLabel.value = "";
  newAmount.value = null;
  newDate.value = "";
};

// --- PDF import ---
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
    const expenses = await parseBankStatementPdf(file);
    if (expenses.length === 0) {
      notification.warning({
        title: "Aucune dépense",
        content: "Aucune ligne de dépense trouvée dans ce relevé.",
      });
      return;
    }
    await store.importExpenses(props.yearMonth, expenses);
    month.value = await store.getMonth(props.yearMonth);
    notification.success({
      title: "Import réussi",
      content: `${expenses.length} dépense(s) importée(s).`,
    });
  } catch (err) {
    notification.error({ title: "Erreur d'import", content: String(err) });
  } finally {
    importing.value = false;
  }
};
</script>

<script lang="ts">
import { h } from "vue";
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
        {{ justifiedCount }}/{{ totalCount }} justifiées — Total :
        {{ formatCurrency(totalAmount) }}
      </div>
    </div>

    <n-spin v-if="loading" class="center-spin" />

    <template v-else>
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

      <!-- Expenses Table -->
      <n-data-table
        v-if="month.expenses.length > 0"
        :columns="columns"
        :data="month.expenses"
        :row-key="(r: Expense) => r.id"
        :bordered="false"
        class="expenses-table"
      />
      <n-card v-else class="empty-msg"> Aucune dépense pour ce mois. </n-card>

      <!-- Add expense form -->
      <div class="add-expense">
        <n-input
          v-model:value="newDate"
          placeholder="Date (AAAA-MM-JJ)"
          class="add-date"
        />
        <n-input
          v-model:value="newLabel"
          placeholder="Libellé"
          class="add-label"
        />
        <n-input-number
          v-model:value="newAmount"
          placeholder="Montant"
          :show-button="false"
          class="add-amount"
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
</style>
