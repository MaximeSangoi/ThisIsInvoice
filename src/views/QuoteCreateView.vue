<script setup lang="ts">
import { computed, ref, watch } from "vue";
import {
  NAlert,
  NButton,
  NCard,
  NDatePicker,
  NIcon,
  NModal,
  NStatistic,
  NTooltip,
  useNotification,
} from "naive-ui";
import { EyeOutline } from "@vicons/ionicons5";
import { countBusinessDays } from "../domain/quote/calculations";
import { formatCurrency } from "../domain/invoice/calculations";
import { computeQuoteTotals } from "../domain/quote/calculations";
import type { QuoteInput } from "../domain/quote/types";
import { generateQuoteArtifacts } from "../services/quote/quote-generator.service";
import { useClientsStore } from "../stores/clients.store";
import { useSettingsStore } from "../stores/settings.store";

const settingsStore = useSettingsStore();
const clientsStore = useClientsStore();
const notification = useNotification();
const activeClient = computed(() => clientsStore.selectedClient);

const toIsoDate = (ts: number): string => {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const toDisplayDate = (ts: number): string => {
  const d = new Date(ts);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
};

// Default: start = 1st of current month, end = last of current month
const now = new Date();
const defaultStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
const defaultEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0).getTime();

const startTimestamp = ref<number>(defaultStart);
const endTimestamp = ref<number>(defaultEnd);

const firstOfMonth = (ts: number, monthOffset: number): number => {
  const d = new Date(ts);
  return new Date(d.getFullYear(), d.getMonth() + monthOffset, 1).getTime();
};

const lastOfMonth = (ts: number, monthOffset: number): number => {
  const d = new Date(ts);
  return new Date(d.getFullYear(), d.getMonth() + monthOffset + 1, 0).getTime();
};

const onStartNextMonth = () => {
  const next = firstOfMonth(startTimestamp.value, 1);
  if (next <= endTimestamp.value) startTimestamp.value = next;
};
const onStartPrevMonth = () => {
  startTimestamp.value = firstOfMonth(startTimestamp.value, -1);
};
const onStartNextYear = () => {
  const next = firstOfMonth(startTimestamp.value, 12);
  if (next <= endTimestamp.value) startTimestamp.value = next;
};
const onStartPrevYear = () => {
  startTimestamp.value = firstOfMonth(startTimestamp.value, -12);
};

const onEndNextMonth = () => {
  endTimestamp.value = lastOfMonth(endTimestamp.value, 1);
};
const onEndPrevMonth = () => {
  const prev = lastOfMonth(endTimestamp.value, -1);
  if (prev >= startTimestamp.value) endTimestamp.value = prev;
};
const onEndNextYear = () => {
  endTimestamp.value = lastOfMonth(endTimestamp.value, 12);
};
const onEndPrevYear = () => {
  const prev = lastOfMonth(endTimestamp.value, -12);
  if (prev >= startTimestamp.value) endTimestamp.value = prev;
};

const startDateDisabled = (ts: number): boolean => ts > endTimestamp.value;
const endDateDisabled = (ts: number): boolean => ts < startTimestamp.value;

const startDisplay = computed(() => toDisplayDate(startTimestamp.value));
const endDisplay = computed(() => toDisplayDate(endTimestamp.value));

const workedDays = ref(0);

watch(
  [startTimestamp, endTimestamp],
  async ([s, e]) => {
    if (!s || !e) {
      workedDays.value = 0;
      return;
    }
    workedDays.value = await countBusinessDays(toIsoDate(s), toIsoDate(e));
  },
  { immediate: true },
);

const dailyRate = 475;
const vatRate = 20;

const previewTotals = computed(() => {
  if (workedDays.value <= 0) return null;
  return computeQuoteTotals({
    workedDays: workedDays.value,
    dailyRate,
    vatRate,
  } as QuoteInput);
});

const errorMessage = ref("");
const generating = ref(false);
const showClientInfo = ref(false);

const canGenerate = computed(
  () => workedDays.value > 0 && activeClient.value !== null,
);

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

const generate = async (): Promise<void> => {
  errorMessage.value = "";

  if (!canGenerate.value) {
    errorMessage.value = activeClient.value
      ? "Les dates sélectionnées ne contiennent aucun jour ouvré."
      : "Sélectionne un client dans les Paramètres.";
    return;
  }

  generating.value = true;

  try {
    const issueDate = toIsoDate(Date.now());
    const validUntil = new Date();
    validUntil.setDate(validUntil.getDate() + 30);
    const validUntilDate = toIsoDate(validUntil.getTime());

    const periodStart = toIsoDate(startTimestamp.value);
    const periodEnd = toIsoDate(endTimestamp.value);

    const quoteNumber = `DEVIS-${periodStart.replace(/-/g, "")}-${periodEnd.replace(/-/g, "")}`;

    const payload: QuoteInput = {
      id: crypto.randomUUID(),
      number: quoteNumber,
      issueDate,
      validUntilDate,
      periodStartDate: periodStart,
      periodEndDate: periodEnd,
      seller: settingsStore.companyProfile,
      buyer: {
        ...activeClient.value!,
        address: { ...activeClient.value!.address },
      },
      workedDays: workedDays.value,
      dailyRate,
      vatRate,
      currency: "EUR",
    };

    const generated = await generateQuoteArtifacts(payload);

    const pdfFileName = `${payload.number}.pdf`;
    const dirHandle = await settingsStore.verifyQuoteDir();

    if (dirHandle) {
      await saveToDir(dirHandle, generated.pdfBytes, pdfFileName);
      notification.success({
        content: `Devis ${payload.number} enregistré dans « ${dirHandle.name} ».`,
        duration: 3000,
      });
    } else {
      downloadBlob(generated.pdfBytes, pdfFileName, "application/pdf");
      notification.success({
        content: `Devis ${payload.number} généré.`,
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
  <section class="quote-page">
    <div class="quote-form">
      <n-card class="quote-card" :bordered="false">
        <h3 class="card-title">Période du devis</h3>
        <div class="date-pickers">
          <div class="field">
            <label>Date de début</label>
            <p class="date-display">{{ startDisplay }}</p>
            <n-date-picker
              v-model:value="startTimestamp"
              panel
              :actions="null"
              type="date"
              format="dd/MM/yyyy"
              :is-date-disabled="startDateDisabled"
              class="date-input"
              @next-month="onStartNextMonth"
              @prev-month="onStartPrevMonth"
              @next-year="onStartNextYear"
              @prev-year="onStartPrevYear"
            />
          </div>
          <div class="field">
            <label>Date de fin</label>
            <p class="date-display">{{ endDisplay }}</p>
            <n-date-picker
              v-model:value="endTimestamp"
              panel
              :actions="null"
              type="date"
              format="dd/MM/yyyy"
              :is-date-disabled="endDateDisabled"
              class="date-input"
              @next-month="onEndNextMonth"
              @prev-month="onEndPrevMonth"
              @next-year="onEndNextYear"
              @prev-year="onEndPrevYear"
            />
          </div>
        </div>
      </n-card>

      <n-card class="quote-card" :bordered="false">
        <div class="stats-row">
          <n-statistic label="Jours ouvrés" :value="workedDays" />
          <n-statistic
            v-if="previewTotals"
            label="Montant HT"
            :value="formatCurrency(previewTotals.netAmount)"
          />
          <n-statistic
            v-if="previewTotals"
            label="Montant TTC"
            :value="formatCurrency(previewTotals.grossAmount)"
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
          Client devisé
          {{ activeClient?.legalName ?? "Aucun client sélectionné" }}
        </n-tooltip>

        <n-button
          type="primary"
          size="large"
          class="quote-submit"
          :disabled="!canGenerate || generating"
          @click="generate"
        >
          {{ generating ? "Génération..." : "Générer le devis" }}
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
            <p><strong>Nom légal :</strong> {{ activeClient.legalName }}</p>
            <p><strong>Adresse :</strong> {{ activeClient.address.line1 }}</p>
            <p>
              <strong>Ville :</strong>
              {{ activeClient.address.postalCode }}
              {{ activeClient.address.city }}
            </p>
            <p><strong>Pays :</strong> {{ activeClient.address.country }}</p>
            <p><strong>SIRET :</strong> {{ activeClient.siret }}</p>
          </div>
        </template>
        <p v-else>
          Aucun client sélectionné. Va dans les Paramètres pour en ajouter un.
        </p>
      </n-modal>

      <n-alert v-if="errorMessage" type="error" :show-icon="false">{{
        errorMessage
      }}</n-alert>
    </div>
  </section>
</template>

<style scoped>
.quote-page {
  min-height: calc(100vh - 9rem);
  display: grid;
  place-items: center;
}

.quote-card {
  width: min(720px, 100%);
}

.quote-form {
  display: grid;
  gap: 1rem;
}

.card-title {
  margin: 0 0 1rem;
  font-size: 1.1rem;
}

.date-pickers {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1rem;
}

.date-input {
  width: 100%;
  justify-content: center;
}

.date-display {
  margin: 0.3rem 0 0.5rem;
  font-size: 1.6rem;
  font-weight: 600;
  letter-spacing: 0.02em;
  color: #0f617a;
  text-align: center;
}

.stats-row {
  display: flex;
  justify-content: space-between;
  gap: 2rem;
  flex-wrap: wrap;
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

.submit-group .quote-submit {
  flex: 1;
  border-top-left-radius: 0;
  border-bottom-left-radius: 0;
  min-height: 3.25rem;
  font-size: 1.05rem;
}

.client-info-grid {
  display: grid;
  gap: 0.55rem;
}

.client-info-grid p {
  margin: 0;
}

@media (max-width: 720px) {
  .quote-page {
    min-height: calc(100vh - 11rem);
    place-items: start;
  }

  .quote-form {
    width: 100%;
  }

  .quote-card {
    width: 100%;
  }

  .date-pickers {
    grid-template-columns: 1fr;
  }
}
</style>
