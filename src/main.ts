import { createApp } from "vue";
import { createPinia } from "pinia";
import App from "./App.vue";
import router from "./router";
import "./style.css";
import { useSettingsStore } from "./stores/settings.store";
import { useClientsStore } from "./stores/clients.store";

const app = createApp(App);
const pinia = createPinia();

app.use(pinia);
app.use(router);

// Initialize stores before mounting so the router guard can access them
const settingsStore = useSettingsStore();
const clientsStore = useClientsStore();
await Promise.all([settingsStore.initialize(), clientsStore.initialize()]);

app.mount("#app");

if (navigator.storage?.persist) {
  await navigator.storage.persist();
}
