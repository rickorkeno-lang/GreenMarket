import { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  useGreenMarketRuntime,
  useRuntimeInstance,
} from '@/platform-core/navigation-runtime-layer/hooks/useGreenMarketRuntime';
import { currentEntry } from '@/platform-core/navigation-runtime-layer/navigation/NavigationStack';
import { MapRuntime } from '@/platform-core/map/runtime/MapRuntime';
import { entryFromPath, pathFromEntry } from '@/app/routeMapping';

/**
 * Мост между реальным GreenMarketRuntime (стек экранов Platform Core) и
 * react-router (URL браузера). Platform Core сам по себе не знает про URL —
 * это намеренно (ТЗ не просит менять Navigation Layer), а React Router даёт
 * пользователю адресную строку и кнопку "назад" браузера, нужные веб-версии.
 *
 * Работает в обе стороны:
 *  - URL → Runtime: при заходе/смене пути извне (ссылка, адресная строка,
 *    кнопка "назад" браузера) синхронизирует стек через forceNavigate — это
 *    НЕ пользовательское действие из Action Catalog, поэтому не идёт через
 *    dispatch()/isActionAllowed() (см. GreenMarketRuntime.ts#forceNavigate).
 *  - Runtime → URL: при dispatch() внутриприкладного Action (OPEN_MAP,
 *    OPEN_SELLER_LIST, OPEN_CATALOG, BACK и т.д.) стек меняется, и этот
 *    компонент переносит изменение в URL, чтобы адресная строка не отставала.
 *
 * Отображение pathname ↔ NavigationEntry живёт в routeMapping.ts (чистые
 * функции, тестируются отдельно).
 */

/** Рендерится один раз внутри BrowserRouter + GreenMarketRuntimeProvider,
 *  ничего не отображает — только синхронизирует состояние. */
export function RuntimeRouteSync() {
  const runtime = useRuntimeInstance();
  const { state } = useGreenMarketRuntime();
  const location = useLocation();
  const navigate = useNavigate();
  const isSyncingFromUrl = useRef(false);
  /** Первый прогон эффекта URL → Runtime — это «точка входа» (загрузка
   *  страницы по текущему URL, в том числе deep-link). В этот момент у
   *  пользователя ещё нет хронологии переходов, поэтому стек сбрасывается
   *  ровно в один экран (forceReset), а не push'ится поверх синтетического
   *  корневого Catalog. Все последующие синхронизации — реальные переходы
   *  пользователя, их надо push'ить (forceNavigate). */
  const isEntryPointSync = useRef(true);

  // URL → Runtime
  useEffect(() => {
    const isEntryPoint = isEntryPointSync.current;
    isEntryPointSync.current = false;
    const desired = entryFromPath(location.pathname);
    if (!desired) return;
    const active = currentEntry(runtime.getState().navigation);
    const alreadyThere =
      active.screen === desired.screen && JSON.stringify(active.params) === JSON.stringify(desired.params);
    if (!alreadyThere) {
      isSyncingFromUrl.current = true;
      if (isEntryPoint) {
        runtime.forceReset(desired);
      } else {
        runtime.forceNavigate(desired);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- намеренно реагирует только на смену пути
  }, [location.pathname]);

  // При уходе с карты маршрут убирается автоматически (MAP-020): полилиния
  // живёт только пока открыт экран Map. Переход «страница продавца → карта»
  // (маршрут построен на странице и должен дожить до карты) маршрут сохраняет,
  // поэтому сравниваем предыдущий верхний экран, а не очищаем безусловно.
  // Слушатель живёт здесь, а не в MapScreenView (уход = unmount): у RuntimeRouteSync
  // нет собственного unmount при смене маршрута, и StrictMode-двойное
  // монтирование не сотрёт маршрут сразу после входа на карту.
  const prevTopScreenRef = useRef<string | null>(null);
  useEffect(() => {
    const top = currentEntry(runtime.getState().navigation).screen;
    const prev = prevTopScreenRef.current;
    prevTopScreenRef.current = top;
    if (prev === 'Map' && top !== 'Map') {
      MapRuntime.clearRoute();
    }
  }, [state, runtime]);

  // Runtime → URL
  useEffect(() => {
    if (isSyncingFromUrl.current) {
      isSyncingFromUrl.current = false;
      return;
    }
    // Читаем актуальное состояние Runtime через runtime.getState(), а не
    // замыкание `state`: в StrictMode (dev) эффекты монтируются дважды, и на
    // втором проходе замыкание `state` всё ещё содержит старый стек (напр.
    // [Catalog]), из-за чего на deep-link /seller/:id происходил лишний
    // navigate('/catalog'). getState() всегда возвращает свежий стек.
    const entry = currentEntry(runtime.getState().navigation);
    const path = pathFromEntry(entry);
    if (path && path !== location.pathname) {
      navigate(path);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `state` служит триггером на изменение навигации
  }, [state, runtime, location.pathname]);

  return null;
}
