export const environment = {
  production: false,
  // Port 8082 — pivot-agilite-core en dev (voir pivot-docs/docs/architecture/platform-overview.md).
  apiUrl: 'http://localhost:8082/api/agilite',
  // WS natif (pas SockJS) — WebSocketConfig backend n'enregistre pas .withSockJS() (US09.1.2).
  // Endpoint direct, PAS sous /api/agilite.
  wsUrl: 'ws://localhost:8082/ws/agilite',
};
