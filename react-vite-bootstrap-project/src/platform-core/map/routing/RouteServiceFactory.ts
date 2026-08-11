import { OsrmHttpProvider } from "./OsrmHttpProvider";
import { createRouteService, type RouteService } from "./RouteService";

/** Публичный OSRM-демо-сервер (бесплатный, без ключа). Проверено, что он
 *  доступен из региона тестирования проекта, отдаёт CORS (Access-Control-
 *  Allow-Origin: *) и строит реальные маршруты для тестовой территории
 *  (Hessen/Франкфурт). Координаты округляются до 5 знаков после запятой —
 *  требование демо-сервера (проверено: с округлением маршрут находится). */
export const PUBLIC_OSRM_BASE_URL = "https://router.project-osrm.org";

/** Локальный/собственный OSRM-сервер (osrm-routed с тем же MLD-индексом из
 *  README — то, что Node-биндинг @project-osrm/osrm использовать не может).
 *  Подключается через переменную окружения VITE_OSRM_SERVER_URL; если задан —
 *  пробуется первым (быстрее, без лимитов демо-сервера), публичный остаётся
 *  фолбэком. Никаких изменений кода при переезде на свой сервер. */
export function createDefaultRouteService(): RouteService {
  const providers = [];
  const localUrl = import.meta.env?.VITE_OSRM_SERVER_URL;
  if (localUrl) {
    providers.push(new OsrmHttpProvider({ name: "local-osrm", baseUrl: localUrl, timeoutMs: 4000 }));
  }
  providers.push(
    new OsrmHttpProvider({ name: "public-osrm", baseUrl: PUBLIC_OSRM_BASE_URL, roundTo: 5, timeoutMs: 8000 }),
  );
  return createRouteService({ providers });
}
