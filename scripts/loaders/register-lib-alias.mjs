import { register } from "node:module";

register("./lib-alias.mjs", import.meta.url);
