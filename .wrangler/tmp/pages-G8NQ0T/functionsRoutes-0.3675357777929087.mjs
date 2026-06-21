import { onRequestGet as __api_health_js_onRequestGet } from "C:\\xampp\\htdocs\\tv\\functions\\api\\health.js"
import { onRequestGet as __api_matches_js_onRequestGet } from "C:\\xampp\\htdocs\\tv\\functions\\api\\matches.js"
import { onRequestGet as __api_standings_js_onRequestGet } from "C:\\xampp\\htdocs\\tv\\functions\\api\\standings.js"
import { onRequestGet as __api_teams_js_onRequestGet } from "C:\\xampp\\htdocs\\tv\\functions\\api\\teams.js"

export const routes = [
    {
      routePath: "/api/health",
      mountPath: "/api",
      method: "GET",
      middlewares: [],
      modules: [__api_health_js_onRequestGet],
    },
  {
      routePath: "/api/matches",
      mountPath: "/api",
      method: "GET",
      middlewares: [],
      modules: [__api_matches_js_onRequestGet],
    },
  {
      routePath: "/api/standings",
      mountPath: "/api",
      method: "GET",
      middlewares: [],
      modules: [__api_standings_js_onRequestGet],
    },
  {
      routePath: "/api/teams",
      mountPath: "/api",
      method: "GET",
      middlewares: [],
      modules: [__api_teams_js_onRequestGet],
    },
  ]