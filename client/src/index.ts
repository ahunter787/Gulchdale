import AppComponent from "./App.vue";
import GulchdaleLanding from "./components/GulchdaleLanding.vue";
import { createCommonApp } from "./appCommon";

import SortableJS, { MultiDrag } from "sortablejs";
SortableJS.mount(new MultiDrag());

const pathSession = window.location.pathname.match(/^\/join\/([A-Za-z0-9]{6})\/?$/)?.[1];
const querySession = new URLSearchParams(window.location.search).get("session");
const app = createCommonApp(pathSession || querySession ? AppComponent : GulchdaleLanding);
app.mount("#main-vue");
