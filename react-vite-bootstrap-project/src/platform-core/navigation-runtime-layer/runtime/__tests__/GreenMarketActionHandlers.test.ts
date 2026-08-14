import assert from "node:assert/strict";
import { asSellerId } from "../../../contracts/Action";
import { createGreenMarketActionHandlers } from "../GreenMarketActionHandlers";
import { createGreenMarketRuntime } from "../GreenMarketRuntime";
import { currentEntry } from "../../navigation/NavigationStack";
import { handleMapProjectionEvent } from "../../../map/runtime/MapProjection";

/** Формат — как в GreenMarketRuntime.test.ts: node:assert без test runner'а.
 *  Запуск: npx tsx runtime/__tests__/GreenMarketActionHandlers.test.ts */

async function run() {
  // 1. START_ROUTE → ROUTE_STARTED: без реальных handlers (заглушка noop)
  //    маршрут со страницы продавца не строился бы — события не эмитятся.
  const handlers = createGreenMarketActionHandlers();
  const runtime = createGreenMarketRuntime(handlers);
  const sellerId = asSellerId("s1");
  const events: string[] = [];
  runtime.onBusinessEvent((event) => events.push(event.type));

  runtime.dispatch({ type: "OPEN_SELLER", payload: { sellerId } });
  const accepted = runtime.dispatch({ type: "START_ROUTE", payload: { sellerId } });
  assert.ok(accepted, "START_ROUTE разрешён на SellerCard (см. screens/SellerCardScreen.ts)");
  assert.equal(
    currentEntry(runtime.getState().navigation).screen,
    "Main",
    "START_ROUTE: навигационный эффект возвращает к «Главному экрану» карты (ТЗ-024: карта — поверхность вне стека)"
  );
  assert.deepEqual(
    events,
    ["ROUTE_STARTED"],
    "START_ROUTE: ActionHandlers эмитит ROUTE_STARTED (его слушает MapProjection)"
  );

  // 2. Действия без бизнес-события (чистая навигация) ничего не эмитят.
  const runtime2 = createGreenMarketRuntime(handlers);
  const events2: string[] = [];
  runtime2.onBusinessEvent((event) => events2.push(event.type));
  runtime2.dispatch({ type: "OPEN_SELLER", payload: { sellerId } });
  runtime2.dispatch({ type: "BACK" });
  assert.deepEqual(events2, [], "BACK/OPEN_SELLER не эмитят бизнес-событий");

  // 3. Интеграционный тест: START_ROUTE → ROUTE_STARTED → MapProjection → requestRoute
  // Проверяет, что цепочка не обрывается и доходит до физического построения маршрута
  const runtime3 = createGreenMarketRuntime(handlers);

  let requestedTarget: any = null;
  let requestedSeller: any = null;
  let unselectDispatched = false;

  // Fake MapRuntime (перехватывает методы)
  const fakeMapRuntime = {
    dispatch: (action: any) => {
      if (action.type === "UNSELECT_SELLER") unselectDispatched = true;
    },
    requestRoute: (target: any, seller: any) => {
      requestedTarget = target;
      requestedSeller = seller;
    }
  };

  // Fake SellerRepository
  const fakeRepo = {
    getSeller: async (id: string) => ({ sellerId: id, location: { lat: 10, lng: 20 } })
  };

  // Подключаем "мост" к runtime
  runtime3.onBusinessEvent((e) => handleMapProjectionEvent(e, fakeMapRuntime as any, fakeRepo as any));

  // Имитируем поток пользователя: зашел в карточку -> нажал "Начать маршрут"
  runtime3.dispatch({ type: "OPEN_SELLER", payload: { sellerId } });
  runtime3.dispatch({ type: "START_ROUTE", payload: { sellerId } });

  // MapProjection внутри асинхронно вызывает getSeller, поэтому ждем разрешения промисов (microtasks)
  await Promise.resolve();
  await Promise.resolve();

  assert.ok(unselectDispatched, "MapProjection должен закрыть карточку (UNSELECT_SELLER) на карте");
  assert.deepEqual(requestedTarget, { kind: "seller", sellerId }, "requestRoute должен получить правильный target");
  assert.equal(requestedSeller?.sellerId, sellerId, "requestRoute должен получить данные продавца из репозитория");

  console.log("GreenMarketActionHandlers: все проверки (вкл. интеграцию с MapProjection) пройдены");
}

run().catch((err) => {
  console.error("Тест упал:", err);
  process.exit(1);
});
