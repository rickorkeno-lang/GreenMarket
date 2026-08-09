import assert from "node:assert/strict";
import { asSellerId, asProductId } from "../../../contracts/Action";
import type { Action } from "../../../contracts/Action";
import { createGreenMarketRuntime, type ActionHandlers } from "../GreenMarketRuntime";
import { currentEntry } from "../../navigation/NavigationStack";

/** Формат — как в MockCatalogRepository.test.ts: node:assert без test runner'а.
 *  Запуск: npx tsx runtime/__tests__/GreenMarketRuntime.test.ts */

function run() {
  // 1. Разрешённый на экране Action проходит и меняет навигацию.
  const runtime1 = createGreenMarketRuntime();
  const sellerId = asSellerId("s1");
  const accepted = runtime1.dispatch({ type: "OPEN_SELLER", payload: { sellerId } });
  assert.ok(accepted, "dispatch: OPEN_SELLER разрешён на Catalog (см. screens/CatalogScreen.ts)");
  assert.equal(currentEntry(runtime1.getState().navigation).screen, "SellerCard", "dispatch: переход на SellerCard выполнен");

  // 2. Action, не входящий в availableActions текущего экрана, отклоняется.
  const runtime2 = createGreenMarketRuntime();
  const rejected = runtime2.dispatch({ type: "CHANGE_QUANTITY", payload: { sellerId, productId: asProductId("p1"), quantity: 2 } });
  assert.equal(rejected, false, "dispatch: CHANGE_QUANTITY не входит в availableActions экрана Catalog — отклонён");
  assert.equal(runtime2.getState().navigation.stack.length, 1, "dispatch: отклонённый Action не меняет навигацию");

  // 3. BACK/GO_TO_MAIN.
  const runtime3 = createGreenMarketRuntime();
  runtime3.dispatch({ type: "OPEN_SELLER", payload: { sellerId } });
  runtime3.dispatch({ type: "BACK" });
  assert.equal(currentEntry(runtime3.getState().navigation).screen, "Catalog", "dispatch: BACK возвращает на предыдущий экран");

  const runtime4 = createGreenMarketRuntime();
  runtime4.dispatch({ type: "OPEN_SELLER", payload: { sellerId } });
  runtime4.dispatch({ type: "GO_TO_MAIN" });
  assert.equal(currentEntry(runtime4.getState().navigation).screen, "Catalog", "dispatch: GO_TO_MAIN сбрасывает стек к Catalog");

  // 4. ActionHandlers вызывается только для принятых действий, события пробрасываются подписчикам.
  const seen: Action[] = [];
  const handlers: ActionHandlers = {
    handle(action) {
      seen.push(action);
      return action.type === "OPEN_SELLER" ? [{ type: "SELLER_OPENED", payload: { sellerId } }] : undefined;
    },
  };
  const runtime5 = createGreenMarketRuntime(handlers);
  const receivedEvents: string[] = [];
  runtime5.onBusinessEvent((event) => receivedEvents.push(event.type));
  runtime5.dispatch({ type: "OPEN_SELLER", payload: { sellerId } });
  runtime5.dispatch({ type: "CHANGE_QUANTITY", payload: { sellerId, productId: asProductId("p1"), quantity: 1 } });
  assert.equal(seen.length, 1, "ActionHandlers.handle: вызван только для разрешённого Action (OPEN_SELLER), не для отклонённого");
  assert.deepEqual(receivedEvents, ["SELLER_OPENED"], "onBusinessEvent: событие из ActionHandlers дошло до подписчика");

  // 5. subscribe получает уведомления об изменении состояния.
  const runtime6 = createGreenMarketRuntime();
  let notifications = 0;
  const unsubscribe = runtime6.subscribe(() => {
    notifications += 1;
  });
  runtime6.dispatch({ type: "OPEN_SELLER", payload: { sellerId } });
  unsubscribe();
  runtime6.dispatch({ type: "BACK" });
  assert.equal(notifications, 1, "subscribe: вызывается на каждое принятое изменение состояния, но не после unsubscribe");

  // 6. forceReset (deep-link): стек ровно в один экран, без синтетической
  //    хронологии — BACK не отматывает то, чего пользователь не делал.
  const runtime7 = createGreenMarketRuntime();
  runtime7.forceReset({ screen: "SellerList", params: {} });
  assert.equal(runtime7.getState().navigation.stack.length, 1, "forceReset: стек содержит ровно один экран");
  assert.equal(
    currentEntry(runtime7.getState().navigation).screen,
    "SellerList",
    "forceReset: текущий экран — целевой (deep-link)"
  );
  runtime7.dispatch({ type: "BACK" });
  assert.equal(
    currentEntry(runtime7.getState().navigation).screen,
    "SellerList",
    "forceReset + BACK: кнопка «назад» при прямом входе по ссылке не возвращает на синтетический Catalog"
  );

  // 7. forceNavigate после forceReset: обычные переходы пользователя push'ятся.
  const runtime8 = createGreenMarketRuntime();
  runtime8.forceReset({ screen: "SellerList", params: {} });
  runtime8.forceNavigate({ screen: "Map", params: {} });
  assert.equal(runtime8.getState().navigation.stack.length, 2, "forceNavigate после forceReset: переход пользователя кладётся поверх");

  // 8. SellerCard: OPEN_SELLER (переход из блока «Похожие продавцы») разрешён
  //    и кладёт карточку другого продавца поверх текущей.
  const runtime9 = createGreenMarketRuntime();
  runtime9.dispatch({ type: "OPEN_SELLER", payload: { sellerId } });
  assert.equal(currentEntry(runtime9.getState().navigation).screen, "SellerCard", "SellerCard: открыт первый продавец");
  const anotherSeller = asSellerId("s2");
  const acceptedAgain = runtime9.dispatch({ type: "OPEN_SELLER", payload: { sellerId: anotherSeller } });
  assert.ok(acceptedAgain, "SellerCard: OPEN_SELLER входит в availableActions (рекомендации)");
  assert.equal(currentEntry(runtime9.getState().navigation).screen, "SellerCard", "SellerCard: открыт другой продавец");
  assert.equal(runtime9.getState().navigation.stack.length, 3, "SellerCard: карточка другого продавца положена поверх");

  console.log("GreenMarketRuntime: все проверки пройдены");
}

run();
