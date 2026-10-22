export default defineNuxtRouteMiddleware(async (to) => {
  if (["/login", "/forgot-password", "/reset-password"].includes(to.path) || import.meta.server) return;
  const { ensureSession, currentUser } = useApi();
  if (!(await ensureSession())) return navigateTo("/login");
  if (to.path === "/manage-users" && currentUser.value?.systemRole !== "ADMIN") {
    return navigateTo("/");
  }
});
