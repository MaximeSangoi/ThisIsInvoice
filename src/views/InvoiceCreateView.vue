<script setup lang="ts">
import { computed, reactive, ref } from "vue";
import { toRaw } from "vue";
import {
  NAlert,
  NButton,
  NCard,
  NIcon,
  NInputNumber,
  NModal,
  NTooltip,
  useNotification,
} from "naive-ui";
import { ChevronBack, ChevronForward, EyeOutline } from "@vicons/ionicons5";
import { buildInvoiceNumber } from "../domain/invoice/numbering";
import type { InvoiceInput } from "../domain/invoice/types";
import { generateInvoiceArtifacts } from "../services/invoice/invoice-generator.service";
import { useClientsStore } from "../stores/clients.store";
import { useSettingsStore } from "../stores/settings.store";

const settingsStore = useSettingsStore();
const clientsStore = useClientsStore();
const notification = useNotification();
const activeClient = computed(() => clientsStore.selectedClient);

const toIsoDate = (date: Date): string => date.toISOString().slice(0, 10);
const today = new Date();
const defaultMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
const currentMonth = defaultMonth;
const selectedYear = ref(today.getFullYear());
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

const billing = reactive({
  periodMonth: defaultMonth,
  workedDays: 20,
});

const errorMessage = ref("");
const successMessage = ref("");
const generating = ref(false);
const showClientInfo = ref(false);

const canGenerate = computed(
  () => billing.workedDays > 0 && activeClient.value !== null,
);

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
  return new Intl.DateTimeFormat("fr-FR", {
    month: "long",
    year: "numeric",
  }).format(date);
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
  const blob = typeof content === "string"
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
      dailyRate: 475,
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
      <n-card class="invoice-quick-card" :bordered="false">
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
            {{ item.label }}
          </n-button>
        </div>
      </n-card>

      <n-card class="invoice-quick-card" :bordered="false">
        <div class="field invoice-quick-field">
          <label for="workedDays">Nombre de jours</label>
          <n-input-number
            id="workedDays"
            v-model:value="billing.workedDays"
            min="0"
            :step="0.5"
            class="invoice-quick-days"
          />
        </div>
      </n-card>
      <div class="submit-group">
        <n-tooltip trigger="hover" :show-arrow="false" placement="bottom">
          <template #trigger>
            <n-button
              type="primary"
              class="client-info-button"
              aria-label="Voir les informations client"
              @click="showClientInfo = true"
            >
              <template #icon>
                <n-icon><EyeOutline /></n-icon>
              </template>
            </n-button>
          </template>
          Client facturé
          {{ activeClient?.legalName ?? "Aucun client sélectionné" }}
        </n-tooltip>

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

      <n-modal
        v-model:show="showClientInfo"
        preset="card"
        title="Informations client"
        :style="{ width: 'min(520px, 92vw)' }"
      >
        <template v-if="activeClient">
          <div class="client-info-grid">
            <p><strong>Nom legal:</strong> {{ activeClient.legalName }}</p>
            <p><strong>Adresse:</strong> {{ activeClient.address.line1 }}</p>
            <p>
              <strong>Ville:</strong>
              {{ activeClient.address.postalCode }}
              {{ activeClient.address.city }}
            </p>
            <p><strong>Pays:</strong> {{ activeClient.address.country }}</p>
            <p><strong>SIRET:</strong> {{ activeClient.siret }}</p>
          </div>
        </template>
        <p v-else>
          Aucun client sélectionné. Va dans les Paramètres pour en ajouter un.
        </p>
      </n-modal>

      <n-alert v-if="successMessage" type="success" :show-icon="false">{{
        successMessage
      }}</n-alert>
      <n-alert v-if="errorMessage" type="error" :show-icon="false">{{
        errorMessage
      }}</n-alert>
    </div>
  </section>
</template>

<style scoped>
.invoice-quick-page {
  min-height: calc(100vh - 9rem);
  display: grid;
  place-items: center;
}

.invoice-quick-card {
  width: min(720px, 100%);
}

.invoice-quick-form {
  display: grid;
  gap: 1rem;
}

.submit-group {
  width: 100%;
  display: flex;
  align-items: stretch;
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
  border-top-left-radius: 0;
  border-bottom-left-radius: 0;
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
  grid-template-columns: repeat(4, minmax(0, 1fr));
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
  margin-top: 0.4rem;
}

.invoice-quick-days {
  width: 100%;
}

.invoice-quick-days :deep(.n-input-number) {
  width: 100%;
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

@media (max-width: 720px) {
  .invoice-quick-page {
    min-height: calc(100vh - 11rem);
    place-items: start;
  }

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
</style>
