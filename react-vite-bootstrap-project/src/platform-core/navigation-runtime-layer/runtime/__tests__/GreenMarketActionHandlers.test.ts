import assert from "node:assert/strict";
import { asSellerId } from "../../../contracts/Action";
import { createGreenMarketActionHandlers } from "../GreenMarketActionHandlers";
import { createGreenMarketRuntime } from "../GreenMarketRuntime";
import { currentEntry } from "../../navigation/NavigationStack";

/** Формат — как в GreenMarketRuntime.test.ts: node:assert без test runner'а.
 *  Запуск: npx tsx runtime/__tests__/GreenMarketActionHandlers.test.ts */

function run() {
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

  console.log("GreenMarketActionHandlers: все проверки пройдены");
}

run();
