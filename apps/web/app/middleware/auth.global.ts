export default defineNuxtRouteMiddleware(async (to) => {
  if (to.path === "/login" || import.meta.server) return;
  const { ensureSession } = useApi();
  if (!(await ensureSession())) return navigateTo("/login");
});
