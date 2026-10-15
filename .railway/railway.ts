import { defineRailway, preserve, project, service } from "railway/iac";

export default defineRailway(() => {
  const api = service("api", {
    replicas: { "sfo": 1 },
    env: { MATHPIX_MOCK: preserve(), WEB_ORIGIN: preserve() },
  });
  const web = service("web", {
    replicas: { "sfo": 1 },
    env: { NEXT_PUBLIC_API_URL: preserve() },
  });

  return project("orbit", {
    resources: [api, web],
  });
});
