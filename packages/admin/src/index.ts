// `no-external.css`: no third-party font request (privacy, and works behind strict proxies). The
// admin's own font (Inter, OFL) is bundled with the site instead.
import "@fontsource-variable/inter/wght.css";
import "@puckeditor/core/no-external.css";
import "./styles.css";

export type { OpenFlowAdminProps } from "./app.js";
export { OpenFlowAdminApp } from "./app.js";
export { ImageInput, LinkInput, mapFields, prepareEditorConfig } from "./fields.js";
export type { FirebaseSetup } from "./firebase.js";
