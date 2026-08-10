import type { ScreenDefinition } from "./ScreenDefinition";
import type { ScreenBuilder } from "@/platform-core/builders/ScreenBuilder";
import type { ContentBlock } from "@/platform-core/contracts/ContentBlock";

/** Экран «Список продавцов» (переход Map → Seller List, AR-003).
 *
 *  Сам экран реализован как React-компонент (src/screens/seller-list/
 *  SellerListScreenView.tsx) по той же схеме, что MapScreenView: доменный
 *  слой берёт данные из SellerRepository.getAllSellers(), а навигационные
 *  действия проходят через общий GreenMarketRuntime — именно поэтому здесь
 *  важен список availableActions (его читает isActionAllowed в Runtime):
 *   - OPEN_MAP / BACK — «показать продавца на карте» (вариант Б): список
 *     возвращает пользователя на карту, центрирует её и подсвечивает
 *     продавца; если карты в стеке нет (прямой вход по ссылке), вместо
 *     BACK пушится свежая Map через OPEN_MAP;
 *   - CLOSE_SCREEN — общее для всех экранов закрытие (pop).
 *
 *  Builder остаётся заглушкой: у списка нет Bottom Sheet / ContentBlock-ов,
 *  он рендерится как самостоятельный экран, а не через общий рендерер. */
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
