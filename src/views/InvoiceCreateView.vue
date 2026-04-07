<script setup lang="ts">
import { computed, h, onMounted, reactive, ref } from "vue";
import { toRaw } from "vue";
import {
  NAlert,
  NButton,
  NCard,
  NEmpty,
  NIcon,
  NInputNumber,
  NSelect,
  NSpin,
  NTag,
  NDrawer,
  NDrawerContent,
  useNotification,
} from "naive-ui";
import {
  Add,
  ChevronBack,
  ChevronDown,
  ChevronForward,
  Remove,
} from "@vicons/ionicons5";
import {
  MoreVertical20Regular,
  ReceiptAdd20Regular,
  ArrowDownload20Regular,
} from "@vicons/fluent";
import { buildInvoiceNumber } from "../domain/invoice/numbering";
import type { InvoiceInput } from "../domain/invoice/types";
import { formatCurrency } from "../domain/invoice/calculations";
import type { InvoiceMeta } from "../services/facturx/facturx-reader.service";
import { scanInvoiceDirectory } from "../services/invoice/invoice-scanner.service";
import { generateInvoiceArtifacts } from "../services/invoice/invoice-generator.service";
import { useClientsStore } from "../stores/clients.store";
import { useSettingsStore } from "../stores/settings.store";
import { useIsMobile } from "../composables/useIsMobile";

const settingsStore = useSettingsStore();
const clientsStore = useClientsStore();
const notification = useNotification();
const isMobile = useIsMobile();
const activeClient = computed(() => clientsStore.selectedClient);

const clientOptions = computed(() =>
  clientsStore.clients.map((c) => ({
    label: c.dailyRate
      ? `${c.legalName} — ${formatCurrency(c.dailyRate)}/j`
      : c.legalName,
    value: c.id,
    logo: c.logo ?? null,
  })),
);

const renderClientLabel = (option: {
  label?: string;
  logo?: string | null;
}) => {
  const children: ReturnType<typeof h>[] = [];
  if (option.logo) {
    children.push(
      h("img", {
        src: option.logo,
        style:
          "width:20px;height:20px;object-fit:contain;border-radius:3px;margin-right:8px;vertical-align:middle",
      }),
    );
  }
  children.push(h("span", null, option.label));
  return h("div", { style: "display:flex;align-items:center" }, children);
};

const onClientChange = (id: string | null) => {
  clientsStore.selectClient(id);
};

// --- Invoice history (directory scan) ---
const historyInvoices = ref<InvoiceMeta[]>([]);
const historyLoading = ref(false);

type MonthRow = {
  key: string;
  latest: InvoiceMeta;
  olderVersions: InvoiceMeta[];
};

const visibleCount = ref(6);

const allRows = computed<MonthRow[]>(() => {
  const map = new Map<string, InvoiceMeta[]>();
  for (const inv of historyInvoices.value) {
    const key = inv.issueDate.slice(0, 7);
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(inv);
  }
  const rows: MonthRow[] = [];
  for (const [key, items] of map) {
    const sorted = [...items].sort((a, b) => b.number.localeCompare(a.number));
    rows.push({ key, latest: sorted[0]!, olderVersions: sorted.slice(1) });
  }
  rows.sort((a, b) => a.key.localeCompare(b.key));
  return rows;
});

const historyRows = computed(() => allRows.value.slice(-visibleCount.value));
const hasMore = computed(() => allRows.value.length > visibleCount.value);
const loadMore = () => {
  visibleCount.value += 5;
};

const expandedMonths = ref<Set<string>>(new Set());
const toggleExpand = (key: string) => {
  const s = new Set(expandedMonths.value);
  s.has(key) ? s.delete(key) : s.add(key);
  expandedMonths.value = s;
};

const versionFromNumber = (invoiceNumber: string): string => {
  const parts = invoiceNumber.split("-");
  return parts.length > 0 ? parts[parts.length - 1]! : invoiceNumber;
};

const scanHistory = async (): Promise<void> => {
  historyLoading.value = true;
  try {
    const dirHandle = await settingsStore.verifyOutputDir();
    if (dirHandle) {
      historyInvoices.value = await scanInvoiceDirectory(dirHandle);
    }
  } catch {
    // silently ignore
  } finally {
    historyLoading.value = false;
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

onMounted(scanHistory);

const toIsoDate = (date: Date): string => date.toISOString().slice(0, 10);
const today = new Date();
const defaultMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
const currentMonth = defaultMonth;
const selectedYear = ref(today.getFullYear());
const active = ref(false);
const monthItems = computed(() =>
  Array.from({ length: 12 }, (_, monthIndex) => {
    const value = `${selectedYear.value}-${String(monthIndex + 1).padStart(2, "0")}`;
    const label = new Intl.DateTimeFormat("fr-FR", { month: "short" }).format(
      new Date(Date.UTC(selectedYear.value, monthIndex, 1)),
    );

    return {
      value,
      label: label.slice(0, 1).toUpperCase() + label.slice(1),
    };
  }),
);

const monthAmountMap = computed(() => {
  const map = new Map<string, { number: string; amount: number }>();
  for (const inv of historyInvoices.value) {
    const key = inv.issueDate.slice(0, 7);
    const existing = map.get(key);
    if (!existing || inv.number.localeCompare(existing.number) > 0) {
      map.set(key, { number: inv.number, amount: inv.grossAmount });
    }
  }
  const result = new Map<string, number>();
  for (const [key, val] of map) result.set(key, val.amount);
  return result;
});

const billing = reactive({
  periodMonth: defaultMonth,
  workedDays: 20,
});

const errorMessage = ref("");
const successMessage = ref("");
const generating = ref(false);

const canGenerate = computed(
  () => billing.workedDays > 0 && activeClient.value !== null,
);

const activate = () => {
  active.value = true;
};

const setSelectedYear = (year: number): void => {
  selectedYear.value = year;
  const currentSelectedMonth = Number(
    billing.periodMonth.split("-")[1] ?? today.getMonth() + 1,
  );
  const safeMonth = Math.max(1, Math.min(12, currentSelectedMonth));
  billing.periodMonth = `${year}-${String(safeMonth).padStart(2, "0")}`;
};

const goToPreviousYear = (): void => {
  setSelectedYear(selectedYear.value - 1);
};

const goToNextYear = (): void => {
  setSelectedYear(selectedYear.value + 1);
};

const selectMonth = (periodMonth: string): void => {
  billing.periodMonth = periodMonth;
};

const monthLabelFromInput = (periodMonth: string): string => {
  const [year, month] = periodMonth.split("-").map((value) => Number(value));
  if (!year || !month) {
    return "Periode invalide";
  }

  const date = new Date(Date.UTC(year, month - 1, 1));
  const label = new Intl.DateTimeFormat("fr-FR", {
    month: "long",
    year: "numeric",
  }).format(date);
  return label.charAt(0).toUpperCase() + label.slice(1);
};

const issueDateFromMonth = (periodMonth: string): string => {
  const [year, month] = periodMonth.split("-").map((value) => Number(value));
  if (!year || !month) {
    return toIsoDate(new Date());
  }

  return toIsoDate(new Date(Date.UTC(year, month, 0)));
};

const dueDateFromIssueDate = (issueDate: string): string => {
  const issue = new Date(`${issueDate}T00:00:00.000Z`);
  issue.setUTCDate(issue.getUTCDate() + 30);
  return toIsoDate(issue);
};

const asArrayBuffer = (bytes: Uint8Array): ArrayBuffer =>
  bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;

const downloadBlob = (
  content: Uint8Array | string,
  fileName: string,
  contentType: string,
): void => {
  const blobPart =
    typeof content === "string" ? content : asArrayBuffer(content);
  const blob = new Blob([blobPart], { type: contentType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
};

const saveToDir = async (
  dirHandle: FileSystemDirectoryHandle,
  content: Uint8Array | string,
  fileName: string,
): Promise<void> => {
  const fileHandle = await dirHandle.getFileHandle(fileName, { create: true });
  const writable = await fileHandle.createWritable();
  const blob =
    typeof content === "string"
      ? new Blob([content], { type: "text/plain" })
      : new Blob([content.buffer as ArrayBuffer]);
  await writable.write(blob);
  await writable.close();
};

const listDirFileNames = async (
  dirHandle: FileSystemDirectoryHandle | null,
): Promise<string[]> => {
  if (!dirHandle) return [];
  const raw = toRaw(dirHandle);
  const names: string[] = [];
  for await (const [name, handle] of (raw as any).entries()) {
    if (handle.kind === "file") names.push(name);
  }
  return names;
};

const generate = async (): Promise<void> => {
  errorMessage.value = "";
  successMessage.value = "";

  if (!canGenerate.value) {
    errorMessage.value = activeClient.value
      ? "Renseigne un nombre de jours valide."
      : "Sélectionne un client dans les Paramètres.";
    return;
  }

  generating.value = true;

  try {
    const dirHandle = await settingsStore.verifyOutputDir();
    const existingFiles = await listDirFileNames(dirHandle);
    const existingNumbers = existingFiles
      .filter((f) => f.endsWith(".pdf"))
      .map((f) => f.replace(/\.pdf$/i, ""));

    const invoiceId = crypto.randomUUID();
    const invoiceNumber = buildInvoiceNumber(
      issueDateFromMonth(billing.periodMonth),
      activeClient.value!.legalName,
      existingNumbers,
    );

    const issueDate = issueDateFromMonth(billing.periodMonth);
    const dueDate = dueDateFromIssueDate(issueDate);

    const payload: InvoiceInput = {
      id: invoiceId,
      number: invoiceNumber,
      issueDate,
      dueDate,
      periodLabel: monthLabelFromInput(billing.periodMonth),
      seller: settingsStore.companyProfile,
      buyer: {
        ...activeClient.value!,
        address: { ...activeClient.value!.address },
      },
      workedDays: Number(billing.workedDays),
      dailyRate: activeClient.value!.dailyRate,
      vatRate: 20,
      currency: "EUR",
    };

    const generated = await generateInvoiceArtifacts(payload);

    const pdfFileName = `${payload.number}.pdf`;

    if (dirHandle) {
      await saveToDir(dirHandle, generated.pdfBytes, pdfFileName);
      notification.success({
        content: `Facture ${payload.number} enregistrée dans « ${dirHandle.name} ».`,
        duration: 3000,
      });
    } else {
      downloadBlob(generated.pdfBytes, pdfFileName, "application/pdf");
      notification.success({
        content: `Facture ${payload.number} générée.`,
        duration: 3000,
      });
    }

    await scanHistory();
  } catch (error) {
    errorMessage.value =
      error instanceof Error ? error.message : "Erreur lors de la génération.";
  } finally {
    generating.value = false;
  }
};
</script>

<template>
  <section class="invoice-quick-page">
    <div class="invoice-quick-form">
      <n-alert v-if="successMessage" type="success" :show-icon="false">{{
        successMessage
      }}</n-alert>
      <n-alert v-if="errorMessage" type="error" :show-icon="false">{{
        errorMessage
      }}</n-alert>
    </div>

    <n-card class="invoice-history-card" :bordered="false">
      <div class="history-header">
        <h3>Factures émises</h3>
        <n-button
          secondary
          size="small"
          :loading="historyLoading"
          @click="scanHistory"
        >
          Rafraîchir
        </n-button>
      </div>

      <n-spin v-if="historyLoading" class="center-spin" />

      <n-empty
        v-if="!historyLoading && historyInvoices.length === 0"
        description="Aucune facture trouvée."
      />

      <div
        class="table-scroll"
        v-if="!historyLoading && historyInvoices.length > 0"
      >
        <table>
          <thead>
            <tr>
              <th class="col-expand"></th>
              <th>Période</th>
              <th v-if="!isMobile">Client</th>
              <th>TTC</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="hasMore" class="row-load-more" @click="loadMore">
              <td :colspan="5" class="load-more-cell">
                Charger plus de factures
              </td>
            </tr>
          </tbody>
          <tbody v-for="row in historyRows" :key="row.key">
            <tr
              class="row-main"
              @click="row.olderVersions.length > 0 && toggleExpand(row.key)"
            >
              <td class="col-expand">
                <n-icon
                  v-if="row.olderVersions.length > 0"
                  size="16"
                  class="expand-icon"
                  :class="{ 'is-expanded': expandedMonths.has(row.key) }"
                >
                  <ChevronDown />
                </n-icon>
              </td>
              <td>
                {{ monthLabelFromInput(row.key) }}
                <n-tag size="small" :bordered="false" round>{{
                  versionFromNumber(row.latest.number)
                }}</n-tag>
              </td>
              <td v-if="!isMobile">{{ row.latest.buyerName }}</td>
              <td>{{ formatCurrency(row.latest.grossAmount) }}</td>
              <td>
                <n-icon
                  size="16"
                  v-if="isMobile"
                  @click="openPdf(row.latest.fileName)"
                >
                  <ArrowDownload20Regular />
                </n-icon>
                <n-button
                  v-if="!isMobile"
                  secondary
                  size="small"
                  @click="openPdf(row.latest.fileName)"
                >
                  Ouvrir
                </n-button>
              </td>
            </tr>
            <template v-if="expandedMonths.has(row.key)">
              <tr
                v-for="old in row.olderVersions"
                :key="old.fileName"
                class="row-version"
              >
                <td class="col-expand"></td>
                <td>
                  {{ monthLabelFromInput(row.key) }}
                  <n-tag size="small" :bordered="false" round>{{
                    versionFromNumber(old.number)
                  }}</n-tag>
                </td>
                <td v-if="!isMobile">{{ old.buyerName }}</td>
                <td>{{ formatCurrency(old.grossAmount) }}</td>
                <td>
                  <n-icon
                    size="16"
                    v-if="isMobile"
                    @click="openPdf(old.fileName)"
                  >
                    <ArrowDownload20Regular />
                  </n-icon>
                  <n-button
                    v-if="!isMobile"
                    secondary
                    size="small"
                    @click="openPdf(old.fileName)"
                  >
                    Ouvrir
                  </n-button>
                </td>
              </tr>
            </template>
          </tbody>
        </table>
      </div>
    </n-card>

    <n-icon size="40" :depth="5">
      <MoreVertical20Regular />
    </n-icon>

    <n-button @click="activate" size="large" type="primary">
      <template #icon>
        <n-icon><ReceiptAdd20Regular /></n-icon>
      </template>
      Créer une facture
    </n-button>

    <n-drawer
      v-model:show="active"
      placement="bottom"
      :block-scroll="false"
      :trap-focus="true"
      default-height="75%"
      class="invoice-quick-drawer"
    >
      <n-drawer-content title="Imprimer une facture">
        <div class="month-card-header">
          <span>Mois</span>
          <div class="year-switcher" aria-label="Selection de l'annee">
            <n-button
              quaternary
              size="small"
              class="btn-icon"
              aria-label="Annee precedente"
              @click="goToPreviousYear"
            >
              <n-icon><ChevronBack /></n-icon>
            </n-button>
            <strong>{{ selectedYear }}</strong>
            <n-button
              quaternary
              size="small"
              class="btn-icon"
              aria-label="Annee suivante"
              @click="goToNextYear"
            >
              <n-icon><ChevronForward /></n-icon>
            </n-button>
          </div>
        </div>

        <div
          class="month-inline-grid"
          role="list"
          aria-label="Selection rapide du mois"
        >
          <n-button
            v-for="item in monthItems"
            :key="item.value"
            secondary
            size="small"
            :class="{
              'is-selected': billing.periodMonth === item.value,
              'is-current': currentMonth === item.value,
            }"
            @click="selectMonth(item.value)"
          >
            <div class="month-btn-content">
              <span>{{ item.label }}</span>
              <small v-if="monthAmountMap.get(item.value)" class="month-amount">
                {{ formatCurrency(monthAmountMap.get(item.value)!) }}
              </small>
            </div>
          </n-button>
        </div>

        <div class="field invoice-quick-field">
          <label>Client</label>
          <n-select
            :value="clientsStore.selectedClientId"
            :options="clientOptions"
            :render-label="renderClientLabel"
            placeholder="Sélectionner un client"
            clearable
            @update:value="onClientChange"
          />
        </div>

        <div class="field invoice-quick-field">
          <label for="workedDays">Nombre de jours</label>
          <div class="days-input-group">
            <n-input-number
              id="workedDays"
              v-model:value="billing.workedDays"
              min="0"
              :step="0.5"
              :show-button="false"
              inputmode="decimal"
              class="invoice-quick-days"
            />
            <div class="days-btn-group">
              <n-button
                secondary
                class="days-btn"
                @click="
                  billing.workedDays = Math.max(0, billing.workedDays - 0.5)
                "
              >
                <n-icon><Remove /></n-icon>
              </n-button>
              <n-button
                secondary
                class="days-btn"
                @click="billing.workedDays += 0.5"
              >
                <n-icon><Add /></n-icon>
              </n-button>
            </div>
          </div>
        </div>
        <div class="submit-group">
          <n-button
            type="primary"
            size="large"
            class="invoice-quick-submit"
            :disabled="!canGenerate || generating"
            @click="generate"
          >
            {{ generating ? "Generation..." : "Generer" }}
          </n-button>
        </div>
      </n-drawer-content>
    </n-drawer>
  </section>
</template>

<style scoped>
.invoice-quick-page {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 1rem;
  align-items: center;
  padding-bottom: 2rem;
}

.invoice-quick-card {
  width: min(720px, 100%);
}

.invoice-quick-form {
  display: grid;
  grid-template-columns: 3fr 1fr 1fr;
  gap: 1rem;
}

.submit-group {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  margin-top: 2rem;
}

.client-info-button {
  width: 3.25rem;
  min-width: 3.25rem;
  padding: 0;
  border-top-right-radius: 0;
  border-bottom-right-radius: 0;
  border-right: 1px solid var(--theme-border-soft);
  height: 100%;
}

.submit-group .invoice-quick-submit {
  flex: 1;
}

.client-info-grid {
  display: grid;
  gap: 0.55rem;
}

.client-info-grid p {
  margin: 0;
}

.btn-icon {
  width: 2.2rem;
  min-width: 2.2rem;
  height: 2.2rem;
}

.month-inline-grid {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 0.5rem;
}

.month-card-header {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.2rem 0 2rem;
  gap: 0.6rem;

  > span {
    font-size: 1.1rem;
    font-weight: 500;
  }
}

.year-switcher {
  display: inline-flex;
  align-items: center;
  gap: 0.2rem;
}

.year-switcher strong {
  min-width: 4.2rem;
  text-align: center;
}

.month-inline-grid :deep(.n-button) {
  width: 100%;
  min-height: 2.3rem;
  justify-content: center;
  padding: 1.5rem 0.5rem;
}

.month-btn-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  line-height: 1.2;
}

.month-amount {
  font-size: 0.7rem;
  opacity: 0.7;
}

.month-inline-grid :deep(.n-button.is-current) {
  box-shadow: inset 0 0 0 2px #0f617a;
}

.month-inline-grid :deep(.n-button.is-selected) {
  background-color: #0f617a;
  border-color: #0f617a;
  color: #ffffff;
}

.invoice-quick-field {
  margin-top: 2rem;
}

.invoice-quick-days {
  flex: 1;
}

.days-input-group {
  display: flex;
  gap: 0;
}

.days-btn-group {
  display: flex;
  gap: 0.1rem;
  justify-content: stretch;
  margin-left: 0.2rem;
}

.days-btn {
  flex: 1;
  min-width: 2.5rem;
  height: 100%;
  padding: 0;
  border-radius: 0 !important;
}

.days-btn:first-child {
  border-top-right-radius: var(--n-border-radius);
}

.days-btn:last-child {
  border-bottom-right-radius: var(--n-border-radius);
}

.days-input-group .invoice-quick-days :deep(.n-input) {
  border-top-right-radius: 0;
  border-bottom-right-radius: 0;
}

.invoice-quick-field :deep(input) {
  min-height: 3.25rem;
  font-size: 1.15rem;
}

.invoice-quick-submit {
  width: 100%;
  min-height: 3.25rem;
  font-size: 1.05rem;
}

.history-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 2rem;
}

.history-header h3 {
  margin: 0;
}

.col-expand {
  width: 2rem;
  min-width: 2rem;
  text-align: center;
}

.expand-icon {
  transition: transform 0.2s;
  cursor: pointer;
}

.expand-icon.is-expanded {
  transform: rotate(180deg);
}

.row-main {
  cursor: default;
}

.row-main:has(.expand-icon) {
  cursor: pointer;
}

.row-version td {
  opacity: 0.6;
  font-size: 0.82rem;
}

.row-load-more {
  cursor: pointer;
}

.load-more-cell {
  text-align: center !important;
  padding: 0.6rem;
  font-size: 0.85rem;
  color: var(--theme-text-muted);
}

.row-load-more:hover .load-more-cell {
  color: var(--theme-text);
  background: var(--theme-surface-soft);
}

.center-spin {
  display: flex;
  justify-content: center;
  padding: 2rem 0;
}

.table-scroll {
  width: 100%;
  overflow-x: auto;
  max-height: 45vh;
}

.table-scroll table {
  width: 100%;
  border-collapse: collapse;
}

.table-scroll th,
.table-scroll td {
  text-align: left;
  padding: 0.4rem 0.6rem;
  font-size: 0.88rem;
}

.table-scroll thead th {
  border-bottom: 2px solid var(--theme-border-soft);
  color: var(--theme-text-muted);
  font-weight: 600;
}

.table-scroll tbody tr:hover {
  background: var(--theme-surface-soft);
}

@media (max-width: 720px) {
  .invoice-quick-form {
    width: 100%;
  }

  .invoice-quick-card {
    width: 100%;
  }

  .month-inline-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
    row-gap: 1rem;
    column-gap: 1rem;
  }
}

@media (max-width: 1024px) {
  .month-inline-grid {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }
}
</style>

<style>
.invoice-quick-drawer {
  margin: auto !important;
  width: 40% !important;
}

@media (max-width: 1280px) {
  .invoice-quick-drawer {
    width: 50% !important;
  }
}

@media (max-width: 1024px) {
  .invoice-quick-drawer {
    width: 60% !important;
  }
}

@media (max-width: 720px) {
  .invoice-quick-drawer {
    width: 100% !important;
    margin: 0 !important;
  }
}
</style>
