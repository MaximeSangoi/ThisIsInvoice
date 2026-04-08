<script setup lang="ts">
import { ref, computed } from "vue";
import {
  NButton,
  NCheckbox,
  NModal,
  NTabs,
  NTabPane,
  NAlert,
  NIcon,
  useNotification,
} from "naive-ui";
import {
  CloudUploadOutline,
  CloudDownloadOutline,
} from "@vicons/ionicons5";
import {
  exportData,
  importData,
  parseExportFile,
  downloadExportFile,
  type ExportPayload,
} from "../services/storage/export-import.service";

const props = defineProps<{
  show: boolean;
}>();

const emit = defineEmits<{
  (e: "update:show", value: boolean): void;
  (e: "imported"): void;
}>();

const notification = useNotification();

// --- Export ---
const exportSettings = ref(true);
const exportClients = ref(true);
const exportAccounting = ref(true);
const exporting = ref(false);

const canExport = computed(
  () => exportSettings.value || exportClients.value || exportAccounting.value
);

const onExport = async (): Promise<void> => {
  exporting.value = true;
  try {
    const payload = await exportData({
      settings: exportSettings.value,
      clients: exportClients.value,
      accounting: exportAccounting.value,
    });
    downloadExportFile(payload);
    notification.success({
      content: "Export téléchargé avec succès.",
      duration: 3000,
    });
  } catch {
    notification.error({
      content: "Erreur lors de l'export.",
      duration: 4000,
    });
  } finally {
    exporting.value = false;
  }
};

// --- Import ---
const importSettings = ref(true);
const importClients = ref(true);
const importAccounting = ref(true);
const importing = ref(false);
const importFile = ref<ExportPayload | null>(null);
const importFileName = ref<string | null>(null);
const importError = ref<string | null>(null);

const hasSettings = computed(() => !!importFile.value?.companyProfile);
const hasClients = computed(
  () => (importFile.value?.clients?.length ?? 0) > 0
);
const hasAccounting = computed(
  () => (importFile.value?.accountingMonths?.length ?? 0) > 0
);

const canImport = computed(() => {
  if (!importFile.value) return false;
  return (
    (importSettings.value && hasSettings.value) ||
    (importClients.value && hasClients.value) ||
    (importAccounting.value && hasAccounting.value)
  );
});

const onFileSelect = (event: Event): void => {
  const file = (event.target as HTMLInputElement).files?.[0];
  if (!file) return;

  importError.value = null;
  importFile.value = null;
  importFileName.value = file.name;

  const reader = new FileReader();
  reader.onload = () => {
    try {
      const payload = parseExportFile(reader.result as string);
      importFile.value = payload;
      importSettings.value = !!payload.companyProfile;
      importClients.value = (payload.clients?.length ?? 0) > 0;
      importAccounting.value = (payload.accountingMonths?.length ?? 0) > 0;
    } catch (err) {
      importError.value =
        err instanceof Error ? err.message : "Fichier invalide.";
    }
  };
  reader.readAsText(file);
};

const onImport = async (): Promise<void> => {
  if (!importFile.value) return;
  importing.value = true;
  try {
    const summary = await importData(importFile.value, {
      settings: importSettings.value,
      clients: importClients.value,
      accounting: importAccounting.value,
    });
    const parts: string[] = [];
    if (summary.settings) parts.push("paramètres");
    if (summary.clients > 0) parts.push(`${summary.clients} client(s)`);
    if (summary.accountingMonths > 0)
      parts.push(`${summary.accountingMonths} mois de comptabilité`);

    notification.success({
      content: `Import réussi : ${parts.join(", ")}.`,
      duration: 4000,
    });
    emit("imported");
    emit("update:show", false);
  } catch {
    notification.error({
      content: "Erreur lors de l'import.",
      duration: 4000,
    });
  } finally {
    importing.value = false;
  }
};

const dragging = ref(false);

const onDrop = (event: DragEvent): void => {
  dragging.value = false;
  const file = event.dataTransfer?.files[0];
  if (!file) return;
  const fakeEvent = { target: { files: [file] } } as unknown as Event;
  onFileSelect(fakeEvent);
};
</script>

<template>
  <n-modal
    :show="props.show"
    preset="card"
    title="Exporter / Importer"
    :style="{ width: 'min(520px, 92vw)' }"
    @update:show="emit('update:show', $event)"
  >
    <n-tabs type="segment" animated>
      <n-tab-pane name="export" tab="Exporter">
        <p class="section-desc">
          Sélectionnez les données à exporter dans un fichier JSON.
        </p>

        <div class="checkbox-group">
          <n-checkbox v-model:checked="exportSettings">
            Paramètres entreprise
          </n-checkbox>
          <n-checkbox v-model:checked="exportClients">
            Clients
          </n-checkbox>
          <n-checkbox v-model:checked="exportAccounting">
            Comptabilité
          </n-checkbox>
        </div>

        <div class="actions">
          <n-button
            type="primary"
            :disabled="!canExport"
            :loading="exporting"
            @click="onExport"
          >
            <template #icon>
              <n-icon><CloudDownloadOutline /></n-icon>
            </template>
            Exporter
          </n-button>
        </div>
      </n-tab-pane>

      <n-tab-pane name="import" tab="Importer">
        <p class="section-desc">
          Chargez un fichier d'export pour importer vos données.
        </p>

        <label
          class="drop-zone"
          :class="{ 'drop-zone--active': dragging }"
          @dragover.prevent="dragging = true"
          @dragenter.prevent="dragging = true"
          @dragleave.prevent="dragging = false"
          @drop.prevent="onDrop"
        >
          <input
            type="file"
            accept=".json,.tii.json"
            class="file-input"
            @change="onFileSelect"
          />
          <n-icon size="28" class="drop-icon"><CloudUploadOutline /></n-icon>
          <span v-if="importFileName" class="drop-text">{{ importFileName }}</span>
          <span v-else class="drop-text">Cliquer ou déposer un fichier .tii.json</span>
        </label>

        <n-alert
          v-if="importError"
          type="error"
          :show-icon="true"
          class="mt-half"
        >
          {{ importError }}
        </n-alert>

        <template v-if="importFile">
          <p class="section-desc mt-1">
            Contenu détecté — sélectionnez ce que vous souhaitez importer :
          </p>
          <div class="checkbox-group">
            <n-checkbox
              v-model:checked="importSettings"
              :disabled="!hasSettings"
            >
              Paramètres entreprise
              <span v-if="!hasSettings" class="muted"> (absent)</span>
            </n-checkbox>
            <n-checkbox
              v-model:checked="importClients"
              :disabled="!hasClients"
            >
              Clients
              <template v-if="hasClients">
                ({{ importFile.clients!.length }})
              </template>
              <span v-else class="muted"> (absent)</span>
            </n-checkbox>
            <n-checkbox
              v-model:checked="importAccounting"
              :disabled="!hasAccounting"
            >
              Comptabilité
              <template v-if="hasAccounting">
                ({{ importFile.accountingMonths!.length }} mois)
              </template>
              <span v-else class="muted"> (absent)</span>
            </n-checkbox>
          </div>

          <div class="actions">
            <n-button
              type="primary"
              :disabled="!canImport"
              :loading="importing"
              @click="onImport"
            >
              <template #icon>
                <n-icon><CloudUploadOutline /></n-icon>
              </template>
              Importer
            </n-button>
          </div>
        </template>
      </n-tab-pane>
    </n-tabs>
  </n-modal>
</template>

<style scoped>
.section-desc {
  margin: 0 0 0.8rem;
  color: #666;
  font-size: 0.9rem;
}

.checkbox-group {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  margin-bottom: 1rem;
}

.actions {
  display: flex;
  gap: 0.7rem;
  margin-top: 0.5rem;
}

.drop-zone {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  min-height: 90px;
  border: 2px dashed var(--n-border-color, #ccc);
  border-radius: 8px;
  cursor: pointer;
  transition: border-color 0.2s, background 0.2s;
  margin-bottom: 0.8rem;
}

.drop-zone:hover,
.drop-zone--active {
  border-color: #0f617a;
  background: rgba(15, 97, 122, 0.04);
}

.drop-icon {
  color: #999;
}

.drop-text {
  font-size: 0.85rem;
  color: #888;
}

.file-input {
  display: none;
}

.muted {
  color: #999;
}

.mt-half {
  margin-top: 0.5rem;
}

.mt-1 {
  margin-top: 1rem;
}
</style>
