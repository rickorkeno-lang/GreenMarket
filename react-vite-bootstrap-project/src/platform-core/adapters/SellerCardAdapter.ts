import type { ContentBlock, RowItem } from "../contracts/ContentBlock";
import type { SellerCardViewModel } from "../viewmodels/SellerCardViewModel";
import type { SellerId } from "../contracts/Action";
import { PRODUCT_AVAILABILITY_ORDER, type ProductRecord } from "../contracts/DomainTypes";

function productRow(sellerId: SellerId, product: ProductRecord): RowItem {
  return {
    id: product.id,
    avatar: "🥕",
    title: product.name,
    subtitle: product.unit,
    trailing: `${product.price} ₽`,
    tag: product.availability === "replacement" ? "replacement" : product.availability === "missing" ? "missing" : undefined,
    action: { type: "OPEN_PRODUCT", payload: { sellerId, productId: product.id } },
  };
}

/** Adapter (= SellerCardBuilder, ТЗ-027 §5): SellerCardViewModel → ContentBlock[].
 *  Единственное место, которое знает и доменные поля ТЗ-025, и примитивы
 *  разметки Bottom Sheet одновременно. Ни Backend, ни BottomSheetRenderer сюда
 *  не заглядывают — см. диаграмму:
 *
 *    SellerCardViewModel → SellerCardAdapter → ContentBlock[] → BottomSheetRenderer
 *
 *  Задача адаптера — только преобразование формы данных (domain VM → блоки
 *  разметки) и сортировка по уже готовому domain-полю availability. Никаких
 *  бизнес-правил (расчётов, решений о доступности товара и т.п.) здесь нет —
 *  они приходят из SellerCardViewModel уже готовыми.
 */
export const SellerCardAdapter = {
  toBlocks(vm: SellerCardViewModel): ContentBlock[] {
    if (vm.loadState === "loading") return [{ type: "skeleton" }];
    if (vm.loadState === "error") {
      return [{ type: "errorRetry", text: "Не удалось загрузить карточку продавца.", retryAction: { type: "RETRY_SELLER_LOAD", payload: { sellerId: vm.seller.id } } }];
    }

    const blocks: ContentBlock[] = [
      { type: "coverage", have: vm.coverage.have, total: vm.coverage.total, fullyCovered: vm.coverage.fullyCovered },
    ];
    if (vm.importantAlerts.length) blocks.push({ type: "alerts", items: vm.importantAlerts });

    if (vm.photos.length) blocks.push({ type: "photoStrip", items: vm.photos });

    const trustLabel = { high: "Высокий уровень доверия", medium: "Средний уровень доверия", low: "Низкий уровень доверия" }[vm.trustLevel];
    blocks.push({ type: "text", text: [vm.trustInfo, `${trustLabel} · подтверждено: ${vm.lastConfirmedAt}`].filter(Boolean).join(" — ") });
    if (vm.dataMayBeStale) blocks.push({ type: "staleBanner", text: "Информация может быть неактуальной" });

    blocks.push({ type: "sectionLabel", text: "Товары из вашей покупки" });
    if (vm.basketProducts.length === 0) {
      blocks.push({ type: "empty", text: "У этого продавца нет товаров из вашей текущей покупки." });
    } else {
      // ТЗ-025 v1.1 §6: фиксированный порядок — доступные → замены → отсутствующие.
      const sorted = [...vm.basketProducts].sort(
        (a, b) => PRODUCT_AVAILABILITY_ORDER[a.availability ?? "available"] - PRODUCT_AVAILABILITY_ORDER[b.availability ?? "available"]
      );
      blocks.push({ type: "list", items: sorted.map((p) => productRow(vm.seller.id, p)), virtualize: sorted.length > 8 });
    }

    blocks.push({
      type: "collapsible",
      label: `Остальные товары (${vm.otherProducts.length})`,
      expanded: vm.otherProductsExpanded,
      toggleAction: { type: "TOGGLE_OTHER_PRODUCTS", payload: { sellerId: vm.seller.id } },
      items: vm.otherProductsExpanded ? vm.otherProducts.map((p) => productRow(vm.seller.id, p)) : [],
    });

    if (vm.reports.length) {
      blocks.push({ type: "sectionLabel", text: "Сообщения покупателей" });
      blocks.push({
        type: "list",
        items: vm.reports.map((r) => ({
          id: r.id,
          avatar: "💬",
          title: r.title,
          subtitle: [r.author, r.date].filter(Boolean).join(" · "),
          action: null,
        })),
      });
    }
    return blocks;
  },
};
