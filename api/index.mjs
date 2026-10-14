// The build bundles the workspace's TypeScript/project references first.
// Vercel receives one plain Node handler; it does not recompile the monorepo.
export { default } from "../artifacts/api-server/dist/app.mjs";
