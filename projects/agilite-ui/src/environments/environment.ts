/**
 * Valeurs par défaut de la lib agilite-ui (dev / tests). En production, l'URL de l'API et du
 * WebSocket sont fournies par `provideAgiliteUi()` (tokens AGILITE_API_URL / AGILITE_WS_URL), qui
 * priment sur ces défauts — voir `core/config/tokens.ts`. Ce fichier reste la valeur de repli
 * utilisée par les tokens quand aucun provider n'est posé (harnais de test, dev direct).
 */
export const environment = {
  apiUrl: 'http://localhost:8082/api/agilite',
  wsUrl: 'ws://localhost:8082/ws/agilite',
};
