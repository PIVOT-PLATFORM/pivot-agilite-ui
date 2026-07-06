// Utilisé en build `production` via fileReplacements (angular.json). apiUrl relatif
// /api/agilite : l'image Docker nginx proxifie vers pivot-agilite-core (voir nginx.conf et
// platform-overview.md — nginx route /api/agilite/ -> pivot-agilite-core:8082). NE PAS mettre
// d'URL absolue ici (casserait le déploiement derrière reverse-proxy).
export const environment = {
  production: true,
  apiUrl: '/api/agilite',
};
