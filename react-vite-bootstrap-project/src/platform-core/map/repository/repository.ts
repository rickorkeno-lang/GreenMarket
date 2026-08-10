import { MockSellerRepository } from "./MockSellerRepository";
import type { SellerRepository } from "./SellerRepository";

/** Единственная точка выбора реализации SellerRepository (замечание ревью №12):
 *  экранные слои (MapRuntime, контроллеры экранов) обращаются только к этому
 *  интерфейсному экземпляру, а не к конкретной реализации. Замена Mock на
 *  Backend-клиент — правка одной строки здесь. */
export const sellerRepository: SellerRepository = MockSellerRepository;
