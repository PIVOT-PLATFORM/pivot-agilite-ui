// Utilisé en build `production` via fileReplacements (angular.json). apiUrl relatif
// /api/agilite : l'image Docker nginx proxifie vers pivot-agilite-core (voir nginx.conf et
// platform-overview.md — nginx route /api/agilite/ -> pivot-agilite-core:8082). NE PAS mettre
// d'URL absolue ici (casserait le déploiement derrière reverse-proxy).
//
// wsUrl suit le même principe pour le endpoint WS natif /ws/agilite (pas SockJS, US09.1.2) :
// chemin relatif, résolu à l'exécution contre window.location.host/protocol (voir
// RoomWsService.buildWsUrl) — nginx doit proxifier l'upgrade WebSocket sur ce même chemin.
export const environment = {
  production: true,
  apiUrl: '/api/agilite',
  wsUrl: '/ws/agilite',
};
