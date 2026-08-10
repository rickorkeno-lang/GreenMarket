import assert from "node:assert/strict";
import { asSellerId } from "../../../contracts/Action";
import { asCategoryId, type CategoryId } from "../../../contracts/DomainTypes";
import type { SellerMapRecord } from "../../viewmodels/MapViewModel";
import type { CategoryOption } from "../SellerRepository";
import { MapRuntime } from "../MapRuntime";

/** Формат — как в MockSellerRepository.test.ts: node:assert, без test runner'а.
 *  Запуск: npx tsx src/platform-core/map/runtime/__tests__/MapRuntime.test.ts */

function seller(id: number, categories: CategoryId[], isOpenNow = true, isAvailable = true): SellerMapRecord {
  return {
    sellerId: asSellerId(`seller-${id}`),
    name: `Продавец ${id}`,
    location: { lat: 50.11, lng: 8.68 },
    rating: 4.2,
    distanceMeters: 500,
    categories,
    categoryNames: [...categories],
    photoUrl: null,
    isOpenNow,
    workingHoursLabel: isOpenNow ? "Открыто до 20:00" : "Закрыто",
    isAvailable,
  };
}

async function run() {
  const veg = asCategoryId("vegetables");
  const dairy = asCategoryId("dairy");
  const meat = asCategoryId("meat");

  // Категории грузим ДО применения категорийного фильтра: опции группы
  // «Категория» строятся из них (buildSellerFilters) — без категорий
  // фильтр по ним применять нечему.
  const categories: CategoryOption[] = [
    { categoryId: veg, name: "Овощи и фрукты" },
    { categoryId: dairy, name: "Молочные продукты" },
    { categoryId: meat, name: "Мясо и птица" },
  ];
  MapRuntime.dispatch({ type: "CATEGORIES_LOADED", categories });
  assert.equal(MapRuntime.getState().categories.length, 3, "CATEGORIES_LOADED сохраняет категории");

  // Продавец 3 — закрыт и недоступен (проверка группы «Состояние»).
  // Продавец 5 — «открыт, но недоступен»: противоречивые данные, которые
  // «Только открытые» обязан блокировать (недоступный не может быть открыт).
  MapRuntime.dispatch({
    type: "SELLERS_LOADED",
    sellers: [
      seller(1, [veg]),
      seller(2, [veg, dairy]),
      seller(3, [meat], false, false),
      seller(4, [dairy]),
      seller(5, [meat], true, false),
    ],
  });
  let s = MapRuntime.getState();
  assert.equal(s.loadedSellers.length, 5, "SELLERS_LOADED: сырой список сохранён");
  assert.equal(s.visibleSellers.length, 5, "SELLERS_LOADED: без фильтра видны все продавцы");

  // Фильтр по одной категории — остаются только пересекающиеся продавцы.
  MapRuntime.dispatch({ type: "SET_FILTER_OPTIONS", groupId: "category", optionIds: [veg] });
  s = MapRuntime.getState();
  assert.equal(s.visibleSellers.length, 2, "фильтр по одной категории");
  assert.ok(
    s.visibleSellers.every((x) => x.sellerId === asSellerId("seller-1") || x.sellerId === asSellerId("seller-2")),
    "фильтр по одной категории: только нужные продавцы"
  );

  // Несколько категорий = объединение (combine: "any").
  MapRuntime.dispatch({ type: "SET_FILTER_OPTIONS", groupId: "category", optionIds: [veg, meat] });
  s = MapRuntime.getState();
  assert.equal(s.visibleSellers.length, 4, "фильтр по нескольким категориям = объединение");

  // Переключение фильтра пересчитывает видимый список из тех же loadedSellers.
  MapRuntime.dispatch({ type: "SET_FILTER_OPTIONS", groupId: "category", optionIds: [dairy] });
  s = MapRuntime.getState();
  assert.equal(s.visibleSellers.length, 2, "переключение категорий фильтра");
  assert.ok(
    s.visibleSellers.every((x) => x.categories.includes(dairy)),
    "видны только продавцы с выбранной категорией"
  );

  // «Все» = пустой набор опций группы.
  MapRuntime.dispatch({ type: "SET_FILTER_OPTIONS", groupId: "category", optionIds: [] });
  assert.equal(MapRuntime.getState().visibleSellers.length, 5, "пустой фильтр = «Все»");

  // Группа «Состояние»: только открытые (combine: "all" с одним чекбоксом).
  MapRuntime.dispatch({ type: "SET_FILTER_OPTIONS", groupId: "state", optionIds: ["open"] });
  s = MapRuntime.getState();
  assert.equal(s.visibleSellers.length, 3, "только открытые");
  assert.ok(
    s.visibleSellers.every((x) => x.isOpenNow && x.isAvailable),
    "только открытые: ни одного закрытого и ни одного недоступного (продавец 5 заблокирован)"
  );

  // Состояние: только доступные — закрытый продавец 3 и «открытый, но
  // недоступный» продавец 5 исключены, остаются 1, 2, 4.
  MapRuntime.dispatch({ type: "SET_FILTER_OPTIONS", groupId: "state", optionIds: ["available"] });
  s = MapRuntime.getState();
  assert.equal(s.visibleSellers.length, 3, "только доступные");

  // Оба чекбокса состояния: продавец должен быть И открыт, И доступен.
  MapRuntime.dispatch({ type: "SET_FILTER_OPTIONS", groupId: "state", optionIds: ["open", "available"] });
  s = MapRuntime.getState();
  assert.equal(s.visibleSellers.length, 3, "открытые и доступные одновременно");

  // Группы складываются (И): открытые + категория «Овощи».
  MapRuntime.dispatch({ type: "SET_FILTER_OPTIONS", groupId: "category", optionIds: [veg] });
  s = MapRuntime.getState();
  assert.equal(s.visibleSellers.length, 2, "открытые среди овощей");
  assert.ok(
    s.visibleSellers.every((x) => x.isOpenNow && x.categories.includes(veg)),
    "открытые среди овощей: условия обеих групп"
  );

  // Сброс категорий, состояние оставляем — фильтр продолжает действовать.
  MapRuntime.dispatch({ type: "SET_FILTER_OPTIONS", groupId: "category", optionIds: [] });
  s = MapRuntime.getState();
  assert.equal(s.visibleSellers.length, 3, "сброс категорий не сбрасывает состояние");

  // Выбранный продавец, отфильтрованный из видимого списка, снимается.
  MapRuntime.dispatch({ type: "SELECT_SELLER", sellerId: asSellerId("seller-3") });
  assert.equal(MapRuntime.getState().selectedSellerId, asSellerId("seller-3"), "продавец выбран");
  MapRuntime.dispatch({ type: "SET_FILTER_OPTIONS", groupId: "category", optionIds: [veg] });
  s = MapRuntime.getState();
  assert.equal(s.selectedSellerId, null, "выбранный продавец отфильтрован -> выбор снят");
  assert.equal(s.bottomSheet, "hidden", "Bottom Sheet закрывается при снятии выбора");

  // «Поиск продавцов» (MAP-053/MAP-018): мастер от выбора точки до результатов.
  // Очищаем фильтры, чтобы результаты поиска считались без помех.
  MapRuntime.dispatch({ type: "SET_FILTER_OPTIONS", groupId: "category", optionIds: [] });
  MapRuntime.dispatch({ type: "SET_FILTER_OPTIONS", groupId: "state", optionIds: [] });

  // Шаг 1 — открытие мастера: сброс выбранного продавца, переход к выбору
  // точки, радиус по умолчанию.
  MapRuntime.dispatch({ type: "SELLER_SEARCH_OPEN" });
  s = MapRuntime.getState();
  assert.equal(s.bottomSheet, "sellerSearchOrigin", "SELLER_SEARCH_OPEN открывает шаг выбора точки");
  assert.equal(s.selectedSellerId, null, "SELLER_SEARCH_OPEN снимает выбор продавца");
  assert.equal(s.sellerSearch.origin, null, "SELLER_SEARCH_OPEN сбрасывает точку поиска");
  assert.equal(s.sellerSearch.radiusMeters, 5000, "SELLER_SEARCH_OPEN использует радиус по умолчанию");

  // Шаг 1 → Шаг 2: выбрана точка — мастер переходит к результатам, старые
  // результаты очищаются (rawResults = null → скелетон), радиус сохраняется.
  MapRuntime.dispatch({
    type: "SELLER_SEARCH_ORIGIN_PICKED",
    origin: { lat: 50.11, lng: 8.68 },
    label: "Моё местоположение",
  });
  s = MapRuntime.getState();
  assert.equal(s.bottomSheet, "sellerSearchResults", "SELLER_SEARCH_ORIGIN_PICKED открывает результаты");
  assert.equal(s.sellerSearch.originLabel, "Моё местоположение", "ORIGIN_PICKED сохраняет подпись точки");
  assert.equal(s.sellerSearch.rawResults, null, "ORIGIN_PICKED сбрасывает прошлые результаты (скелетон)");
  assert.equal(s.sellerSearch.radiusMeters, 5000, "ORIGIN_PICKED не сбрасывает введённый радиус");

  // Шаг 2: смена радиуса не трогает результаты — их перезапросит компонент.
  MapRuntime.dispatch({ type: "SELLER_SEARCH_RADIUS_CHANGED", radiusMeters: 2000 });
  s = MapRuntime.getState();
  assert.equal(s.sellerSearch.radiusMeters, 2000, "SELLER_SEARCH_RADIUS_CHANGED обновляет радиус");

  // Шаг 2: ответ Repository — сырые результаты; результаты пересчитываются
  // тем же глобальным фильтром, что и видимый список (сейчас фильтры пусты).
  MapRuntime.dispatch({
    type: "SELLER_SEARCH_RESULT",
    sellers: [seller(1, [veg]), seller(3, [meat], false, false), seller(5, [meat], true, false)],
  });
  s = MapRuntime.getState();
  assert.equal(s.sellerSearch.rawResults?.length, 3, "SELLER_SEARCH_RESULT сохраняет сырые результаты");
  assert.equal(s.sellerSearch.results.length, 3, "без фильтра видны все результаты поиска");

  // Единый глобальный фильтр применяется и к результатам поиска.
  MapRuntime.dispatch({ type: "SET_FILTER_OPTIONS", groupId: "category", optionIds: [veg] });
  s = MapRuntime.getState();
  assert.deepEqual(
    s.sellerSearch.results.map((x) => x.sellerId),
    [asSellerId("seller-1")],
    "фильтр по категории пересчитывает результаты поиска"
  );

  MapRuntime.dispatch({ type: "SET_FILTER_OPTIONS", groupId: "category", optionIds: [meat] });
  s = MapRuntime.getState();
  assert.equal(s.sellerSearch.results.length, 2, "фильтр по мясу оставляет обоих мясных продавцов");
  assert.ok(
    s.sellerSearch.results.every((x) => x.categories.includes(meat)),
    "фильтр по мясу: только мясные"
  );
  assert.equal(s.sellerSearch.rawResults?.length, 3, "rawResults не меняется от смены фильтра");

  // Группы складываются и для результатов поиска: мясные + «только открытые»
  // — продавец 3 закрыт, продавец 5 открыт, но недоступен (его «открытым»
  // не считаем), итого никого.
  MapRuntime.dispatch({ type: "SET_FILTER_OPTIONS", groupId: "state", optionIds: ["open"] });
  s = MapRuntime.getState();
  assert.equal(s.sellerSearch.results.length, 0, "мясные + только открытые: ни одного (оба отсечены)");

  // «Назад» — возврат к выбору точки, введённый радиус сохраняется.
  MapRuntime.dispatch({ type: "SELLER_SEARCH_BACK" });
  s = MapRuntime.getState();
  assert.equal(s.bottomSheet, "sellerSearchOrigin", "SELLER_SEARCH_BACK возвращает к выбору точки");
  assert.equal(s.sellerSearch.radiusMeters, 2000, "SELLER_SEARCH_BACK сохраняет введённый радиус");

  // UNSELECT_SELLER (закрытие мастера) сбрасывает и результаты поиска.
  MapRuntime.dispatch({ type: "UNSELECT_SELLER" });
  s = MapRuntime.getState();
  assert.equal(s.bottomSheet, "hidden", "UNSELECT_SELLER закрывает мастер");
  assert.equal(s.sellerSearch.origin, null, "UNSELECT_SELLER сбрасывает точку поиска");
  assert.equal(s.sellerSearch.results.length, 0, "UNSELECT_SELLER сбрасывает результаты поиска");

  // ---- Асинхронные методы runtime (вынесены из MapScreenView) ----

  // Сбрасываем фильтры, чтобы поиск и видимая область считались без помех
  // (ранние проверки могли их задать).
  MapRuntime.dispatch({ type: "SET_FILTER_OPTIONS", groupId: "category", optionIds: [] });
  MapRuntime.dispatch({ type: "SET_FILTER_OPTIONS", groupId: "state", optionIds: [] });

  // requestSellerSearch: после выбора точки запускает запрос к Repository и
  // кладёт сырые результаты в sellerSearch.rawResults.
  MapRuntime.dispatch({ type: "SELLER_SEARCH_OPEN" });
  MapRuntime.dispatch({
    type: "SELLER_SEARCH_ORIGIN_PICKED",
    origin: { lat: 50.11, lng: 8.68 },
    label: "Моё местоположение",
  });
  assert.equal(MapRuntime.getState().sellerSearch.rawResults, null, "ORIGIN_PICKED: скелетон до ответа");
  MapRuntime.requestSellerSearch();
  await new Promise((resolve) => setTimeout(resolve, 600));
  s = MapRuntime.getState();
  assert.ok(s.sellerSearch.rawResults && s.sellerSearch.rawResults.length > 0, "requestSellerSearch заполняет rawResults");
  assert.equal(s.sellerSearch.results.length, s.sellerSearch.rawResults?.length ?? 0, "без фильтра видны все результаты поиска");

  // searchSellerByName: заполняет searchResult и возвращает найденного продавца.
  const found = await MapRuntime.searchSellerByName("Медовый");
  assert.ok(found !== null, "searchSellerByName находит продавца по имени");
  assert.equal(
    MapRuntime.getState().searchResult?.[0]?.sellerId,
    found.sellerId,
    "searchSellerByName заполняет searchResult",
  );
  const notFound = await MapRuntime.searchSellerByName("Такого продавца нет");
  assert.equal(notFound, null, "searchSellerByName возвращает null при промахе");
  assert.equal(MapRuntime.getState().searchResult?.length, 0, "searchSellerByName при промахе очищает searchResult");

  // ---- Автодополнение строки поиска (MAP-019) ----

  // requestSearchSuggestions: оптимистичный START применяется сразу (спиннер
  // в дропдауне виден с первого символа), подсказки заполняют состояние после
  // дебаунса + задержки Repository.
  MapRuntime.requestSearchSuggestions("мед");
  assert.equal(
    MapRuntime.getState().searchSuggestions.query,
    "мед",
    "requestSearchSuggestions применяет query сразу (оптимистичный START)",
  );
  assert.equal(
    MapRuntime.getState().searchSuggestions.loading,
    true,
    "requestSearchSuggestions помечает загрузку подсказок",
  );
  await new Promise((resolve) => setTimeout(resolve, 800));
  s = MapRuntime.getState();
  assert.equal(s.searchSuggestions.query, "мед", "подсказки получены для введённого запроса");
  assert.equal(s.searchSuggestions.loading, false, "загрузка подсказок завершена");
  assert.ok(
    s.searchSuggestions.suggestions.some((x) => x.name === "Медовый край"),
    "по запросу «мед» находится «Медовый край» (подстрока, «ё» = «е»)",
  );
  assert.ok(
    s.searchSuggestions.suggestions.some((x) => x.name === "Цветочный мёд"),
    "по запросу «мед» находится «Цветочный мёд»",
  );

  // Дебаунс схлопывает серию быстрого ввода в один запрос: ответ последнего
  // запроса не перетирается ответом более раннего (seq-защита от гонок).
  MapRuntime.requestSearchSuggestions("мёд");
  MapRuntime.requestSearchSuggestions("медовый");
  await new Promise((resolve) => setTimeout(resolve, 800));
  s = MapRuntime.getState();
  assert.equal(
    s.searchSuggestions.query,
    "медовый",
    "после серии ввода подсказки соответствуют последнему запросу",
  );
  assert.ok(
    s.searchSuggestions.suggestions.every((x) => x.name === "Медовый край"),
    "ответ более раннего запроса не перетёр подсказки последнего",
  );

  // Пустой запрос (в т.ч. из пробелов) сбрасывает подсказки — дропдаун
  // закрывается, устаревшие подсказки не остаются в состоянии.
  MapRuntime.requestSearchSuggestions("   ");
  s = MapRuntime.getState();
  assert.equal(s.searchSuggestions.query, "", "пустой запрос очищает query подсказок");
  assert.equal(s.searchSuggestions.suggestions.length, 0, "пустой запрос очищает список подсказок");

  // clearSearchSuggestions (выбор продавца из дропдауна): отменяет отложенный
  // запрос, сбрасывает состояние и не даёт позднему ответу вернуть подсказки.
  MapRuntime.requestSearchSuggestions("мед");
  MapRuntime.clearSearchSuggestions();
  s = MapRuntime.getState();
  assert.equal(s.searchSuggestions.query, "", "clearSearchSuggestions сбрасывает query");
  assert.equal(s.searchSuggestions.loading, false, "clearSearchSuggestions снимает загрузку");
  await new Promise((resolve) => setTimeout(resolve, 800));
  s = MapRuntime.getState();
  assert.equal(s.searchSuggestions.loading, false, "отложенный запрос подсказок отменён");
  assert.equal(s.searchSuggestions.suggestions.length, 0, "поздний ответ подсказок не применён");

  // ---- Подсказки уважают глобальный фильтр (единая сущность) ----

  // Без фильтра по запросу «мед» в подсказки попадают обе мёд-лавки.
  MapRuntime.requestSearchSuggestions("мед");
  await new Promise((resolve) => setTimeout(resolve, 800));
  s = MapRuntime.getState();
  assert.equal(s.searchSuggestions.rawSuggestions.length, 2, "без фильтра в rawSuggestions обе мёд-лавки");
  assert.equal(s.searchSuggestions.suggestions.length, 2, "без фильтра видимы обе подсказки");

  // Включаем фильтр «Овощи и фрукты»: «Цветочный мёд» (зелень/молочные)
  // отсекается, «Медовый край» (овощи) остаётся. Repository не перезапрашивался —
  // пересчёт локальный, из тех же rawSuggestions.
  MapRuntime.dispatch({ type: "SET_FILTER_OPTIONS", groupId: "category", optionIds: [veg] });
  s = MapRuntime.getState();
  assert.deepEqual(
    s.searchSuggestions.suggestions.map((x) => x.name),
    ["Медовый край"],
    "смена фильтра пересчитывает подсказки: остаётся только «Медовый край»",
  );
  assert.equal(s.searchSuggestions.rawSuggestions.length, 2, "rawSuggestions не меняется от смены фильтра");

  // Другой фильтр — другая подсказка: «Молочные продукты» оставляют
  // «Цветочный мёд» (молочные), а «Медовый край» отсекается.
  MapRuntime.dispatch({ type: "SET_FILTER_OPTIONS", groupId: "category", optionIds: [dairy] });
  s = MapRuntime.getState();
  assert.deepEqual(
    s.searchSuggestions.suggestions.map((x) => x.name),
    ["Цветочный мёд"],
    "подсказки пересчитаны под новый фильтр",
  );

  // Группа «Состояние» применяется так же: «только доступные» отсекает
  // недоступный «Цветочный мёд» (i%11 = 0), «Медовый край» (доступен, закрыт)
  // остаётся.
  MapRuntime.dispatch({ type: "SET_FILTER_OPTIONS", groupId: "category", optionIds: [] });
  MapRuntime.dispatch({ type: "SET_FILTER_OPTIONS", groupId: "state", optionIds: ["available"] });
  s = MapRuntime.getState();
  assert.deepEqual(
    s.searchSuggestions.suggestions.map((x) => x.name),
    ["Медовый край"],
    "фильтр «только доступные» отсекает недоступный «Цветочный мёд»",
  );

  // Группы складываются (И) и для подсказок: овощи + «только открытые» — обе
  // мёд-лавки отсечены, но rawSuggestions не пусты: по запросу что-то нашлось,
  // отсеяно фильтром, а не промах запроса (дропдаун объясняет это пользователю).
  MapRuntime.dispatch({ type: "SET_FILTER_OPTIONS", groupId: "category", optionIds: [veg] });
  MapRuntime.dispatch({ type: "SET_FILTER_OPTIONS", groupId: "state", optionIds: ["open"] });
  s = MapRuntime.getState();
  assert.equal(
    s.searchSuggestions.suggestions.length,
    0,
    "овощи + только открытые: «Медовый край» закрыт, «Цветочный мёд» не овощи — пусто",
  );
  assert.equal(
    s.searchSuggestions.rawSuggestions.length,
    2,
    "rawSuggestions сохранены: отсеяно фильтром, а не промах запроса",
  );

  // Свежий ответ Repository при активном фильтре фильтруется так же.
  MapRuntime.requestSearchSuggestions("мед");
  await new Promise((resolve) => setTimeout(resolve, 800));
  s = MapRuntime.getState();
  assert.equal(s.searchSuggestions.rawSuggestions.length, 2, "повторный запрос даёт сырые подсказки");
  assert.equal(s.searchSuggestions.suggestions.length, 0, "свежие подсказки тоже отфильтрованы");

  // Сбрасываем фильтры и подсказки, чтобы дальше считалось без помех.
  MapRuntime.dispatch({ type: "SET_FILTER_OPTIONS", groupId: "category", optionIds: [] });
  MapRuntime.dispatch({ type: "SET_FILTER_OPTIONS", groupId: "state", optionIds: [] });
  MapRuntime.clearSearchSuggestions();

  // requestVisibleSellers: после debounce помечает загрузку и наполняет
  // видимый список (debounce 500ms + имитация задержки Repository 250ms).
  MapRuntime.requestVisibleSellers({ north: 51, south: 50, east: 9, west: 8 });
  await new Promise((resolve) => setTimeout(resolve, 1000));
  s = MapRuntime.getState();
  assert.equal(s.loading, false, "requestVisibleSellers завершает загрузку");
  assert.ok(s.visibleSellers.length > 0, "requestVisibleSellers наполняет видимый список");

  // retryVisibleSellers: принудительный перезапрос последних границ (обход
  // дедупликации — повторный вызов с теми же границами всё равно грузит).
  MapRuntime.retryVisibleSellers();
  await new Promise((resolve) => setTimeout(resolve, 500));
  s = MapRuntime.getState();
  assert.equal(s.loading, false, "retryVisibleSellers завершает загрузку");
  assert.ok(s.visibleSellers.length > 0, "retryVisibleSellers перезагружает видимый список");

  // scheduleSellerSearch: радиус применяется сразу, перезапрос — после дебаунса.
  MapRuntime.dispatch({ type: "SELLER_SEARCH_BACK" });
  MapRuntime.dispatch({
    type: "SELLER_SEARCH_ORIGIN_PICKED",
    origin: { lat: 50.11, lng: 8.68 },
    label: "Моё местоположение",
  });
  MapRuntime.scheduleSellerSearch(2500);
  assert.equal(MapRuntime.getState().sellerSearch.radiusMeters, 2500, "scheduleSellerSearch применяет радиус сразу");
  await new Promise((resolve) => setTimeout(resolve, 1000));
  s = MapRuntime.getState();
  assert.ok(s.sellerSearch.rawResults && s.sellerSearch.rawResults.length > 0, "scheduleSellerSearch перезапрашивает после дебаунса");

  // cancelPendingSellerSearch: отменяет отложенный перезапрос.
  MapRuntime.dispatch({ type: "SELLER_SEARCH_BACK" });
  MapRuntime.dispatch({
    type: "SELLER_SEARCH_ORIGIN_PICKED",
    origin: { lat: 50.11, lng: 8.68 },
    label: "Моё местоположение",
  });
  MapRuntime.scheduleSellerSearch(2500);
  MapRuntime.cancelPendingSellerSearch();
  await new Promise((resolve) => setTimeout(resolve, 1000));
  assert.equal(
    MapRuntime.getState().sellerSearch.rawResults,
    null,
    "cancelPendingSellerSearch отменяет отложенный перезапрос",
  );

  // ---- Чистка «мёртвых» категорий (MAP-053: сервер обновил каталог) ----

  // Выбираем категорию, затем перезагружаем каталог БЕЗ неё — выбранный id
  // должен исчезнуть из selectedFilters, а не «залипнуть» мёртвым.
  MapRuntime.dispatch({ type: "SET_FILTER_OPTIONS", groupId: "category", optionIds: [veg] });
  assert.equal(MapRuntime.getState().selectedFilters.category?.includes(veg), true, "категория выбрана до перезагрузки");
  MapRuntime.dispatch({
    type: "CATEGORIES_LOADED",
    categories: [dairy, meat].map((categoryId) => ({
      categoryId,
      name: categoryId === dairy ? "Молочные продукты" : "Мясо и птица",
    })),
  });
  s = MapRuntime.getState();
  assert.ok(
    !(s.selectedFilters.category ?? []).includes(veg),
    "исчезнувшая категория удаляется из selectedFilters",
  );
  assert.equal(
    s.selectedFilters.category?.length ?? 0,
    0,
    "выбор «мёртвой» категории очищен",
  );

  // Выбранная категория, оставшаяся в каталоге, переживает перезагрузку.
  MapRuntime.dispatch({ type: "SET_FILTER_OPTIONS", groupId: "category", optionIds: [dairy] });
  MapRuntime.dispatch({
    type: "CATEGORIES_LOADED",
    categories: [veg, dairy, meat].map((categoryId) => ({
      categoryId,
      name: `Категория ${categoryId}`,
    })),
  });
  s = MapRuntime.getState();
  assert.deepEqual(
    s.selectedFilters.category,
    [dairy],
    "существующая категория сохраняется после перезагрузки",
  );

  // ---- Экспорт снапшота сеанса (toSessionSnapshot, MapSessionStore) ----

  // Мастер «Поиск продавцов» на шаге результатов: точка, подпись, радиус.
  MapRuntime.dispatch({ type: "MOVE_MAP", center: { lat: 50.2, lng: 8.7 }, zoom: 14 });
  MapRuntime.dispatch({ type: "SELLER_SEARCH_OPEN" });
  MapRuntime.dispatch({
    type: "SELLER_SEARCH_ORIGIN_PICKED",
    origin: { lat: 50.2, lng: 8.7 },
    label: "Моё местоположение",
  });
  MapRuntime.dispatch({ type: "SELLER_SEARCH_RADIUS_CHANGED", radiusMeters: 3000 });
  let snapshot = MapRuntime.toSessionSnapshot({ searchQuery: "мед", searchRadiusKm: "3" });
  assert.deepEqual(snapshot.viewport, { center: { lat: 50.2, lng: 8.7 }, zoom: 14 }, "снапшот сохраняет позицию и масштаб");
  assert.equal(snapshot.searchQuery, "мед", "снапшот сохраняет текст строки поиска");
  assert.equal(snapshot.searchRadiusKm, "3", "снапшот сохраняет текст поля радиуса");
  assert.deepEqual(
    snapshot.sellerSearch,
    { origin: { lat: 50.2, lng: 8.7 }, originLabel: "Моё местоположение", radiusMeters: 3000 },
    "снапшот сохраняет точку, подпись и радиус мастера",
  );
  assert.deepEqual(snapshot.bottomSheet, { type: "sellerSearchResults" }, "снапшот сохраняет открытую панель");

  // Открытая карточка продавца: в снапшот попадает id и данные карточки
  // (продавец ищется в видимой области/результатах/searchResult — findSellerData).
  const firstVisible = MapRuntime.getState().visibleSellers[0];
  assert.ok(firstVisible, "для теста снапшота нужен видимый продавец");
  MapRuntime.dispatch({ type: "SELECT_SELLER", sellerId: firstVisible.sellerId });
  snapshot = MapRuntime.toSessionSnapshot({ searchQuery: "", searchRadiusKm: "5" });
  assert.equal(snapshot.bottomSheet?.type, "sellerSummary", "снапшот сохраняет открытую карточку");
  if (snapshot.bottomSheet?.type === "sellerSummary") {
    assert.equal(snapshot.bottomSheet.sellerId, firstVisible.sellerId, "снапшот сохраняет id выбранного продавца");
    assert.equal(
      snapshot.bottomSheet.seller?.sellerId,
      firstVisible.sellerId,
      "снапшот карточки содержит данные продавца",
    );
  }

  // Закрытая панель — bottomSheet = null.
  MapRuntime.dispatch({ type: "UNSELECT_SELLER" });
  snapshot = MapRuntime.toSessionSnapshot({ searchQuery: "", searchRadiusKm: "5" });
  assert.equal(snapshot.bottomSheet, null, "закрытая панель → null в снапшоте");

  console.log("MapRuntime: все проверки пройдены");
}

run();
