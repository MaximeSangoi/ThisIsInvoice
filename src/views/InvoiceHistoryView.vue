<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { NButton, NCard, NEmpty, NSpin } from "naive-ui";
import { toRaw } from "vue";
import { useSettingsStore } from "../stores/settings.store";
import type { InvoiceMeta } from "../services/facturx/facturx-reader.service";
import { scanInvoiceDirectory } from "../services/invoice/invoice-scanner.service";
import { formatCurrency, formatDate } from "../domain/invoice/calculations";

const settingsStore = useSettingsStore();

const invoices = ref<InvoiceMeta[]>([]);
const loading = ref(false);
const errorMsg = ref("");

type MonthGroup = { label: string; items: InvoiceMeta[] };

const grouped = computed<MonthGroup[]>(() => {
  const map = new Map<string, InvoiceMeta[]>();
  for (const inv of invoices.value) {
    const key = inv.issueDate.slice(0, 7); // YYYY-MM
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(inv);
  }
  const result: MonthGroup[] = [];
  for (const [key, items] of map) {
    const [y, m] = key.split("-").map(Number);
    const label = new Intl.DateTimeFormat("fr-FR", {
      month: "long",
      year: "numeric",
    }).format(new Date(Date.UTC(y!, m! - 1, 1)));
    result.push({ label: label.charAt(0).toUpperCase() + label.slice(1), items });
  }
  return result;
});

const scan = async (): Promise<void> => {
  loading.value = true;
  errorMsg.value = "";
  invoices.value = [];

  try {
    const dirHandle = await settingsStore.verifyOutputDir();
    if (!dirHandle) {
      errorMsg.value =
        "Aucun dossier de factures configuré. Configure-le dans les Paramètres.";
      return;
    }
    invoices.value = await scanInvoiceDirectory(dirHandle);
  } catch (e) {
    errorMsg.value =
      e instanceof Error ? e.message : "Erreur lors de la lecture du dossier.";
  } finally {
    loading.value = false;
  }
};

const openPdf = async (fileName: string): Promise<void> => {
  const dirHandle = await settingsStore.verifyOutputDir();
  if (!dirHandle) return;

  const raw = toRaw(dirHandle);
  const fileHandle = await raw.getFileHandle(fileName);
  const file = await fileHandle.getFile();
  const url = URL.createObjectURL(file);
  window.open(url, "_blank");
};

onMounted(scan);
</script>

<template>
  <n-card class="panel" :bordered="false">
    <div class="history-header">
      <h2>Historique factures</h2>
      <n-button secondary size="small" :loading="loading" @click="scan">
        Rafraîchir
      </n-button>
    </div>

    <p v-if="settingsStore.outputDirName" class="meta">
      Dossier : <strong>{{ settingsStore.outputDirName }}</strong>
    </p>

    <n-spin v-if="loading" class="center-spin" />

    <p v-if="errorMsg" class="error-msg">{{ errorMsg }}</p>

    <n-empty
      v-if="!loading && !errorMsg && invoices.length === 0"
      description="Aucune facture trouvée dans le dossier."
    />

    <template v-for="group in grouped" :key="group.label">
      <h3 class="month-title">{{ group.label }}</h3>
      <div class="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Numéro</th>
              <th>Date</th>
              <th>Client</th>
              <th>Montant HT</th>
              <th>TVA</th>
              <th>Montant TTC</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="inv in group.items" :key="inv.fileName">
              <td>{{ inv.number }}</td>
              <td>{{ formatDate(inv.issueDate) }}</td>
              <td>{{ inv.buyerName }}</td>
              <td>{{ formatCurrency(inv.netAmount) }}</td>
              <td>{{ formatCurrency(inv.vatAmount) }}</td>
              <td>{{ formatCurrency(inv.grossAmount) }}</td>
              <td>
                <n-button
                  secondary
                  size="small"
                  @click="openPdf(inv.fileName)"
                >
                  Ouvrir
                </n-button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>
  </n-card>
</template>

<style scoped>
.history-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
}

.history-header h2 {
  margin: 0;
}

.meta {
  color: var(--theme-text-muted);
  font-size: 0.88rem;
  margin: 0.25rem 0 1rem;
}

.month-title {
  margin: 1.5rem 0 0.5rem;
  font-size: 1.05rem;
  color: var(--theme-text);
}

.error-msg {
  color: #bb3e30;
}

.center-spin {
  display: flex;
  justify-content: center;
  padding: 2rem 0;
}

.table-scroll {
  width: 100%;
  overflow-x: auto;
}

.table-scroll table {
  min-width: 780px;
  width: 100%;
  border-collapse: collapse;
}

.table-scroll th,
.table-scroll td {
  text-align: left;
  padding: 0.5rem 0.75rem;
  font-size: 0.9rem;
}

.table-scroll thead th {
  border-bottom: 2px solid var(--theme-border-soft);
  color: var(--theme-text-muted);
  font-weight: 600;
}

.table-scroll tbody tr:hover {
  background: var(--theme-surface-soft);
}
</style>
