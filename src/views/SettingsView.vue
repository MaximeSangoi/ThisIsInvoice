<script setup lang="ts">
import { h, reactive, ref, toRaw, watch, watchEffect } from "vue";
import {
  NAlert,
  NButton,
  NCard,
  NDataTable,
  NIcon,
  NInput,
  NInputNumber,
  NModal,
  useNotification,
  type DataTableColumns,
} from "naive-ui";
import {
  CreateOutline,
  TrashOutline,
  FolderOpenOutline,
  SwapHorizontalOutline,
} from "@vicons/ionicons5";
import type { ClientProfile } from "../domain/invoice/types";
import { useClientsStore } from "../stores/clients.store";
import { useSettingsStore } from "../stores/settings.store";
import { useAccountingStore } from "../stores/accounting.store";
import { useIsMobile } from "../composables/useIsMobile";
import { useRouter } from "vue-router";
import ExportImportModal from "./ExportImportModal.vue";

const settingsStore = useSettingsStore();
const clientsStore = useClientsStore();
const accountingStore = useAccountingStore();
const notification = useNotification();
const isMobile = useIsMobile();
const router = useRouter();

// --- Onboarding ---
const showWelcomeModal = ref(!settingsStore.onboardingCompleted);
const showFolderSetupModal = ref(false);
const showExportImportModal = ref(false);

const onManualSetup = (): void => {
  showWelcomeModal.value = false;
};

const onImportSetup = (): void => {
  showWelcomeModal.value = false;
  showExportImportModal.value = true;
};

const onImported = async (): Promise<void> => {
  // Force-reload all stores after import
  await Promise.all([
    settingsStore.initialize(true),
    clientsStore.initialize(true),
    accountingStore.initialize(true),
  ]);
  // If we are in onboarding, proceed to folder selection step
  if (!settingsStore.onboardingCompleted) {
    showFolderSetupModal.value = true;
  }
};

const onFinishOnboarding = (): void => {
  if (!settingsStore.isConfigured) {
    notification.warning({
      content:
        "Veuillez renseigner au minimum le SIRET, l'IBAN et le numéro de TVA avant de continuer.",
      duration: 4000,
    });
    return;
  }
  showFolderSetupModal.value = true;
};

const onSkipFolders = async (): Promise<void> => {
  showFolderSetupModal.value = false;
  await settingsStore.completeOnboarding();
  router.push("/invoices/new");
};

const onPickInvoiceDirOnboarding = async (): Promise<void> => {
  try {
    await settingsStore.pickOutputDir();
    notification.success({
      content: `Dossier "${settingsStore.outputDirName}" sélectionné pour les factures.`,
      duration: 3000,
    });
  } catch {
    // User cancelled
  }
};

const onPickQuoteDirOnboarding = async (): Promise<void> => {
  try {
    await settingsStore.pickQuoteDir();
    notification.success({
      content: `Dossier "${settingsStore.quoteDirName}" sélectionné pour les devis.`,
      duration: 3000,
    });
  } catch {
    // User cancelled
  }
};

const onFinishFolderSetup = async (): Promise<void> => {
  showFolderSetupModal.value = false;
  await settingsStore.completeOnboarding();
  router.push("/invoices/new");
};

// --- Company profile form ---
// reactive() takes a snapshot — when initialize() replaces companyProfile.value later,
// the form would point to the stale empty object. watchEffect keeps them in sync.
const form = reactive({ ...settingsStore.companyProfile });
watchEffect(() => {
  Object.assign(form, settingsStore.companyProfile);
});
const saveMessage = reactive({ text: "" });

const onSave = async (): Promise<void> => {
  settingsStore.companyProfile = { ...form };
  await settingsStore.save();
  notification.success({
    content: "Paramètres enregistrés localement.",
    duration: 3000,
  });
};

// --- Client table ---
const selectedKeys = ref<Array<string | number>>(
  clientsStore.selectedClientId ? [clientsStore.selectedClientId] : [],
);

let syncing = false;

// Store → table: when initialize() loads the persisted selection, update the radio
watch(
  () => clientsStore.selectedClientId,
  (id) => {
    const next = id ? [id] : [];
    if (JSON.stringify(selectedKeys.value) !== JSON.stringify(next)) {
      syncing = true;
      selectedKeys.value = next;
    }
  },
);

// Table → store: when the user clicks a radio, persist the selection
watch(selectedKeys, (keys) => {
  if (syncing) {
    syncing = false;
    return;
  }
  clientsStore.selectClient((keys[0] as string) ?? null);
  notification.info({
    content: clientsStore.selectedClient
      ? `Client "${clientsStore.selectedClient.legalName}" sélectionné.`
      : "Aucun client sélectionné.",
    duration: 3000,
  });
});

const makeEmptyClient = (): ClientProfile => ({
  id: crypto.randomUUID(),
  legalName: "",
  address: { line1: "", postalCode: "", city: "", country: "FR" },
  siret: "",
  dailyRate: 0,
  logo: null,
});

const editingClient = ref<ClientProfile | null>(null);
const isEditMode = ref(false);
const showClientModal = ref(false);

const openCreate = (): void => {
  editingClient.value = makeEmptyClient();
  isEditMode.value = false;
  showClientModal.value = true;
};

const openEdit = (row: ClientProfile): void => {
  editingClient.value = { ...row, address: { ...row.address } };
  isEditMode.value = true;
  showClientModal.value = true;
};

const onSaveClient = async (): Promise<void> => {
  if (!editingClient.value) return;
  const raw = toRaw(editingClient.value);
  const plain: ClientProfile = {
    id: raw.id,
    legalName: raw.legalName,
    address: {
      line1: raw.address.line1,
      postalCode: raw.address.postalCode,
      city: raw.address.city,
      country: raw.address.country,
    },
    siret: raw.siret,
    dailyRate: raw.dailyRate ?? 0,
    logo: raw.logo ?? null,
  };
  await clientsStore.upsertClient(plain);
  showClientModal.value = false;
  notification.success({
    content: "Client enregistré.",
    duration: 3000,
  });
};

const onDeleteClient = async (row: ClientProfile): Promise<void> => {
  await clientsStore.removeClient(row.id);
  notification.success({
    content: `Client "${row.legalName}" supprimé.`,
    duration: 3000,
  });
};

const readFileAsDataURL = (file: File): void => {
  if (!editingClient.value) return;
  const reader = new FileReader();
  reader.onload = () => {
    if (editingClient.value) editingClient.value.logo = reader.result as string;
  };
  reader.readAsDataURL(file);
};

const onLogoChange = (event: Event): void => {
  const file = (event.target as HTMLInputElement).files?.[0];
  if (file) readFileAsDataURL(file);
};

const dragging = ref(false);

const onLogoDrop = (event: DragEvent): void => {
  dragging.value = false;
  const file = event.dataTransfer?.files[0];
  if (file && file.type.startsWith("image/")) readFileAsDataURL(file);
};

const removeLogo = (): void => {
  if (editingClient.value) editingClient.value.logo = null;
};

// --- Output directory ---
const onPickDir = async (): Promise<void> => {
  try {
    await settingsStore.pickOutputDir();
    notification.success({
      content: `Dossier "${settingsStore.outputDirName}" sélectionné.`,
      duration: 3000,
    });
  } catch {
    // User cancelled the picker
  }
};

const onClearDir = async (): Promise<void> => {
  await settingsStore.removeOutputDir();
  notification.info({
    content: "Dossier de sortie retiré.",
    duration: 3000,
  });
};

const onPickQuoteDir = async (): Promise<void> => {
  try {
    await settingsStore.pickQuoteDir();
    notification.success({
      content: `Dossier "${settingsStore.quoteDirName}" sélectionné pour les devis.`,
      duration: 3000,
    });
  } catch {
    // User cancelled the picker
  }
};

const onClearQuoteDir = async (): Promise<void> => {
  await settingsStore.removeQuoteDir();
  notification.info({
    content: "Dossier de sortie des devis retiré.",
    duration: 3000,
  });
};

const clientColumns = ref<DataTableColumns<ClientProfile>>([
  { type: "selection", multiple: false },
  {
    title: "",
    key: "logo",
    width: 40,
    render: (row) =>
      row.logo
        ? h("img", {
            src: row.logo,
            alt: row.legalName + " logo",
            style:
              "width:28px;height:28px;object-fit:contain;border-radius:4px",
          })
        : null,
  },
  { title: "Nom légal", key: "legalName" },
  {
    title: "Ville",
    key: "city",
    render: (row) => row.address.city,
  },
  {
    title: "",
    key: "actions",
    width: 80,
    render: (row) =>
      h(
        "div",
        {
          style: "display:flex;gap:4px;",
          class: "client-actions",
        },
        [
          h(
            NButton,
            { size: "small", quaternary: true, "aria-label": `Éditer ${row.legalName}`, onClick: () => openEdit(row) },
            () => h(NIcon, null, () => h(CreateOutline)),
          ),
          h(
            NButton,
            {
              size: "small",
              quaternary: true,
              type: "error",
              "aria-label": `Supprimer ${row.legalName}`,
              onClick: () => onDeleteClient(row),
            },
            () => h(NIcon, null, () => h(TrashOutline)),
          ),
        ],
      ),
  },
]);

if (isMobile.value) {
  clientColumns.value.splice(3, 1);
}

watch(isMobile, (mobile) => {
  if (mobile) {
    clientColumns.value.splice(3, 1);
  } else if (
    !clientColumns.value.find((col) => "key" in col && col.key === "city")
  ) {
    clientColumns.value.splice(3, 0, {
      title: "Ville",
      key: "city",
      render: (row) => row.address.city,
    });
  }
});
</script>

<template>
  <!-- Welcome modal (first launch only) -->
  <n-modal
    v-model:show="showWelcomeModal"
    preset="card"
    title="Bienvenue sur This Is Invoice !"
    :closable="false"
    :mask-closable="false"
    :style="{ width: 'min(480px, 92vw)' }"
  >
    <p style="margin: 0 0 0.5rem; line-height: 1.5">
      L'application a besoin d'être configurée avant la première utilisation.
    </p>
    <p style="margin: 0 0 1.2rem; color: #666; font-size: 0.9rem">
      Vous pouvez remplir les paramètres manuellement ou importer une
      configuration existante depuis un autre appareil.
    </p>
    <div style="display: flex; gap: 0.7rem; flex-wrap: wrap">
      <n-button type="primary" @click="onManualSetup">
        Configurer manuellement
      </n-button>
      <n-button @click="onImportSetup">
        <template #icon>
          <n-icon><SwapHorizontalOutline /></n-icon>
        </template>
        Importer une configuration
      </n-button>
    </div>
  </n-modal>

  <!-- Folder setup modal (second onboarding step) -->
  <n-modal
    v-model:show="showFolderSetupModal"
    preset="card"
    title="Dossiers de synchronisation"
    :closable="false"
    :mask-closable="false"
    :style="{ width: 'min(520px, 92vw)' }"
  >
    <p style="margin: 0 0 1rem; line-height: 1.5; color: #666; font-size: 0.9rem">
      Choisissez les dossiers où enregistrer automatiquement vos factures et
      devis. Vous pouvez aussi passer cette étape et les configurer plus tard.
    </p>

    <div class="folder-setup-row">
      <div class="folder-setup-item">
        <strong>Factures</strong>
        <span v-if="settingsStore.outputDirName" class="dir-name">
          <n-icon size="20"><FolderOpenOutline /></n-icon>
          {{ settingsStore.outputDirName }}
        </span>
        <span v-else class="muted">Non configuré</span>
        <n-button size="small" @click="onPickInvoiceDirOnboarding">
          {{ settingsStore.outputDirName ? "Changer" : "Choisir un dossier" }}
        </n-button>
      </div>
      <div class="folder-setup-item">
        <strong>Devis</strong>
        <span v-if="settingsStore.quoteDirName" class="dir-name">
          <n-icon size="20"><FolderOpenOutline /></n-icon>
          {{ settingsStore.quoteDirName }}
        </span>
        <span v-else class="muted">Non configuré</span>
        <n-button size="small" @click="onPickQuoteDirOnboarding">
          {{ settingsStore.quoteDirName ? "Changer" : "Choisir un dossier" }}
        </n-button>
      </div>
    </div>

    <div style="display: flex; gap: 0.7rem; flex-wrap: wrap; margin-top: 1.2rem">
      <n-button type="primary" @click="onFinishFolderSetup">Terminer</n-button>
      <n-button quaternary @click="onSkipFolders">Passer cette étape</n-button>
    </div>
  </n-modal>

  <!-- Export / Import modal -->
  <ExportImportModal
    v-model:show="showExportImportModal"
    @imported="onImported"
  />

  <n-card class="panel" :bordered="false">
    <div class="panel-header">
      <h2>Informations entreprise</h2>
      <n-button size="small" @click="showExportImportModal = true">
        <template #icon>
          <n-icon><SwapHorizontalOutline /></n-icon>
        </template>
        Export / Import
      </n-button>
    </div>
    <p class="meta">Ces informations concernent votre entreprise</p>

    <div class="grid-2">
      <div class="field">
        <label for="firstName">Prenom</label>
        <n-input id="firstName" v-model:value="form.firstName" />
      </div>
      <div class="field">
        <label for="lastName">Nom</label>
        <n-input id="lastName" v-model:value="form.lastName" />
      </div>
      <div class="field">
        <label for="line1">Adresse</label>
        <n-input id="line1" v-model:value="form.address.line1" />
      </div>
      <div class="field">
        <label for="postalCode">Code postal</label>
        <n-input id="postalCode" v-model:value="form.address.postalCode" />
      </div>
      <div class="field">
        <label for="city">Ville</label>
        <n-input id="city" v-model:value="form.address.city" />
      </div>
      <div class="field">
        <label for="country">Pays</label>
        <n-input id="country" v-model:value="form.address.country" />
      </div>
      <div class="field">
        <label for="siret">SIRET</label>
        <n-input id="siret" v-model:value="form.siret" />
      </div>
      <div class="field">
        <label for="vatNumber">Numero de TVA</label>
        <n-input id="vatNumber" v-model:value="form.vatNumber" />
      </div>
      <div class="field">
        <label for="iban">IBAN</label>
        <n-input id="iban" v-model:value="form.iban" />
      </div>
      <div class="field">
        <label for="bic">BIC</label>
        <n-input id="bic" v-model:value="form.bic" />
      </div>
    </div>

    <div class="actions">
      <n-button type="primary" @click="onSave">Enregistrer</n-button>
      <n-button
        v-if="!settingsStore.onboardingCompleted"
        type="primary"
        ghost
        @click="onFinishOnboarding"
      >
        Terminer la configuration
      </n-button>
      <n-alert v-if="saveMessage.text" type="success" :show-icon="false">{{
        saveMessage.text
      }}</n-alert>
    </div>
  </n-card>

  <n-card class="panel panel-output mt-1" :bordered="false">
    <h2>Dossiers de sortie</h2>

    <h3 class="output-section-title">Factures</h3>
    <p class="meta">
      Choisissez un dossier où enregistrer automatiquement les factures générées
    </p>
    <div class="output-dir">
      <span v-if="settingsStore.outputDirName" class="dir-name">
        <n-icon size="25"><FolderOpenOutline /></n-icon>
        {{ settingsStore.outputDirName }}
      </span>
      <span v-else class="dir-name muted"
        >Aucun dossier sélectionné (téléchargement classique)</span
      >
      <div class="output-dir-actions">
        <n-button size="small" @click="onPickDir">
          {{ settingsStore.outputDirName ? "Changer" : "Choisir un dossier" }}
        </n-button>
        <n-button
          v-if="settingsStore.outputDirName"
          size="small"
          type="error"
          quaternary
          @click="onClearDir"
        >
          Retirer
        </n-button>
      </div>
    </div>

    <h3 class="output-section-title">Devis</h3>
    <p class="meta">
      Choisissez un dossier où enregistrer automatiquement les devis générés
    </p>
    <div class="output-dir">
      <span v-if="settingsStore.quoteDirName" class="dir-name">
        <n-icon size="25"><FolderOpenOutline /></n-icon>
        {{ settingsStore.quoteDirName }}
      </span>
      <span v-else class="dir-name muted"
        >Aucun dossier sélectionné (téléchargement classique)</span
      >
      <div class="output-dir-actions">
        <n-button size="small" @click="onPickQuoteDir">
          {{ settingsStore.quoteDirName ? "Changer" : "Choisir un dossier" }}
        </n-button>
        <n-button
          v-if="settingsStore.quoteDirName"
          size="small"
          type="error"
          quaternary
          @click="onClearQuoteDir"
        >
          Retirer
        </n-button>
      </div>
    </div>
  </n-card>

  <n-card class="panel panel-clients mt-1" :bordered="false">
    <div class="panel-header">
      <h2>Clients</h2>
      <n-button size="small" @click="openCreate">+ Nouveau client</n-button>
    </div>
    <p class="meta">Sélectionnez un client pour la prochaine facture</p>

    <n-data-table
      v-model:checked-row-keys="selectedKeys"
      :columns="clientColumns"
      :data="clientsStore.clients"
      :row-key="(row) => row.id"
      size="large"
    />
  </n-card>

  <n-modal
    v-model:show="showClientModal"
    preset="card"
    :title="
      isEditMode ? `Éditer ${editingClient?.legalName}` : 'Nouveau client'
    "
    :style="{ width: 'min(560px, 92vw)' }"
  >
    <template v-if="editingClient">
      <div class="grid-2">
        <div class="field">
          <label for="client-legalName">Nom légal</label>
          <n-input id="client-legalName" v-model:value="editingClient.legalName" />
        </div>
        <div class="field">
          <label for="client-siret">SIRET</label>
          <n-input id="client-siret" v-model:value="editingClient.siret" />
        </div>
        <div class="field">
          <label for="client-address">Adresse</label>
          <n-input id="client-address" v-model:value="editingClient.address.line1" />
        </div>
        <div class="field">
          <label for="client-postalCode">Code postal</label>
          <n-input id="client-postalCode" v-model:value="editingClient.address.postalCode" />
        </div>
        <div class="field">
          <label for="client-city">Ville</label>
          <n-input id="client-city" v-model:value="editingClient.address.city" />
        </div>
        <div class="field">
          <label for="client-country">Pays</label>
          <n-input id="client-country" v-model:value="editingClient.address.country" />
        </div>
        <div class="field">
          <label for="client-dailyRate">TJM (€)</label>
          <n-input-number
            id="client-dailyRate"
            v-model:value="editingClient.dailyRate"
            :min="0"
            :step="10"
            :show-button="false"
          />
        </div>
      </div>
      <div class="field logo-field">
        <label>Logo</label>
        <div v-if="editingClient.logo" class="logo-filled">
          <img :src="editingClient.logo" class="logo-preview" :alt="editingClient.legalName + ' logo'" />
          <div class="logo-actions">
            <label class="logo-change-label">
              <input
                type="file"
                accept="image/*"
                class="logo-file-input"
                @change="onLogoChange"
              />
              Changer
            </label>
            <n-button size="small" quaternary type="error" @click="removeLogo">
              Retirer
            </n-button>
          </div>
        </div>
        <label
          v-else
          class="logo-dropzone"
          :class="{ 'logo-dropzone--active': dragging }"
          @dragover.prevent="dragging = true"
          @dragenter.prevent="dragging = true"
          @dragleave.prevent="dragging = false"
          @drop.prevent="onLogoDrop"
        >
          <input
            type="file"
            accept="image/*"
            class="logo-file-input"
            @change="onLogoChange"
          />
          <span class="logo-dropzone-text">Cliquer ou déposer une image</span>
        </label>
      </div>
      <div class="actions">
        <n-button type="primary" @click="onSaveClient">Enregistrer</n-button>
      </div>
    </template>
  </n-modal>
</template>

<style scoped>
.panel .panel-header {
  display: grid;
  grid-template-columns: 1fr auto;
  align-items: center;
  gap: 0.5rem;
}

.panel-clients,
.panel-output {
  margin-top: 18px;
}

.output-section-title {
  margin: 1.2rem 0 0;
  font-size: 1rem;
}

.output-section-title:first-of-type {
  margin-top: 0;
}

.actions {
  display: flex;
  gap: 0.7rem;
  flex-wrap: wrap;
  margin-top: 0.9rem;
  align-items: center;
}

.output-dir {
  display: flex;
  align-items: center;
  gap: 1rem;
  flex-wrap: wrap;
  margin-top: 0.5rem;
}

.dir-name {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-weight: 500;
}

.dir-name.muted {
  color: var(--n-text-color-disabled, #999);
  font-weight: normal;
}

.output-dir-actions {
  display: flex;
  gap: 0.5rem;
}

.logo-field {
  margin-top: 0.5rem;
}

.logo-dropzone {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 80px;
  border: 2px dashed var(--n-border-color, #ccc);
  border-radius: 6px;
  cursor: pointer;
  transition:
    border-color 0.2s,
    background 0.2s;
}

.logo-dropzone:hover,
.logo-dropzone--active {
  border-color: var(--n-color-target, #18a058);
  background: rgba(24, 160, 88, 0.04);
}

.logo-dropzone-text {
  font-size: 0.85rem;
  color: var(--n-text-color-disabled, #999);
  pointer-events: none;
}

.logo-filled {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.logo-preview {
  width: 48px;
  height: 48px;
  object-fit: contain;
  border-radius: 4px;
  border: 1px solid var(--n-border-color, #e0e0e0);
}

.logo-actions {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.logo-change-label {
  cursor: pointer;
  font-size: 0.85rem;
  padding: 4px 12px;
  border-radius: 4px;
  border: 1px solid var(--n-border-color, #ddd);
  background: var(--n-color, #fff);
  transition: background 0.2s;
}

.logo-change-label:hover {
  background: var(--n-color-hover, #f5f5f5);
}

.logo-file-input {
  display: none;
}

:deep(.n-data-table-td--last-col) {
  padding-right: 0;
}

@media (max-width: 1024px) {
  :deep(.client-actions) {
    flex-direction: column;
    padding-right: 0;
  }
}

.folder-setup-row {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.folder-setup-item {
  display: flex;
  align-items: center;
  gap: 0.8rem;
  flex-wrap: wrap;
}

.folder-setup-item strong {
  min-width: 70px;
}

.muted {
  color: #999;
  font-size: 0.9rem;
}
</style>
