import type { ScreenDefinition } from "./ScreenDefinition";
import type { ScreenBuilder } from "@/platform-core/builders/ScreenBuilder";
import type { ContentBlock } from "@/platform-core/contracts/ContentBlock";

/** Экран «Список продавцов» (переход Map → Seller List, AR-003).
 *
 *  ТЗ-024 §10: список — контент Bottom Sheet ПОВЕРХ карты-поверхности, а не
 *  страница: реализован как React-компонент (src/screens/seller-list/
 *  SellerListScreenView.tsx), который MapSurface монтирует оверлеем над
 *  MapScreenView по той же схеме: доменный слой берёт данные из
 *  SellerRepository.getAllSellers(), а навигационные действия проходят через
 *  общий GreenMarketRuntime — именно поэтому здесь важен список
 *  availableActions (его читает isActionAllowed в Runtime):
 *   - BACK — «показать продавца на карте»: карта уже смонтирована за
 *     панелью (Main ниже в стеке), выбор продавца просто закрывает список
 *     и возвращает к «Главному экрану» карты;
 *   - OPEN_MAP — допускается как общее «на карту» (navigateToMapSurface:
 *     усекает стек до Main — эффект тот же, что у BACK);
 *   - CLOSE_SCREEN — общее для всех экранов закрытие (pop).
 *
 *  Builder остаётся заглушкой: у списка нет Bottom Sheet / ContentBlock-ов,
 *  он рендерится как самостоятельный контент панели, а не через общий
 *  рендерер. */
export interface SellerListViewModel {
  placeholder: true;
}

const SellerListBuilder: ScreenBuilder<SellerListViewModel> = {
  build(): ContentBlock[] {
    return [{ type: "empty", text: "Все продавцы" }];
  },
};

export const SellerListScreen: ScreenDefinition<SellerListViewModel> = {
  builder: SellerListBuilder,
  availableActions: ["OPEN_MAP", "BACK", "CLOSE_SCREEN"] as const,
};
