import { ApiSellerRepository } from "./ApiSellerRepository";
import type { SellerRepository } from "./SellerRepository";

/** Единственная точка выбора реализации SellerRepository (замечание ревью №12):
 *  экранные слои (MapRuntime, контроллеры экранов) обращаются только к этому
 *  интерфейсному экземпляру, а не к конкретной реализации.
 *
 *  Задача «Маркеты»: точки торговли и их продавцы приходят из ЖИВОГО бэкенда
 *  (ApiSellerRepository, GET /api/v1/catalog/markets) — мок подключён как
 *  фолбэк внутри ApiSellerRepository (сеть недоступна / точка пуста), чтобы
 *  приложение оставалось показуемым офлайн. */
export const sellerRepository: SellerRepository = ApiSellerRepository;
