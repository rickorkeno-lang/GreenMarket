import { useCallback, useEffect, useRef, useState, type FormEvent, type KeyboardEvent, type MouseEvent } from 'react';
import { Loader, Text } from '@/design-system/components';
import { DistanceFormatter } from '@/platform-core/formatting/DistanceFormatter';
import type { SearchSuggestionsState, SellerMapRecord } from '@/platform-core/map/viewmodels/MapViewModel';

/**
 * Строка поиска с автодополнением (MAP-019) для шапки экрана Map.
 *
 * Чистое отображение, домен живёт в MapRuntime:
 *   - текст поля — локальное состояние экрана (по конвенции MapScreenView,
 *     см. комментарий в шапке MapScreenView.tsx: «локальное состояние — только
 *     поля ввода пользователя»);
 *   - подсказки и их загрузка — MapRuntime#requestSearchSuggestions (дебаунс
 *     ввода, защита от гонок) → state.searchSuggestions, который передаётся
 *     сюда пропом suggestionsState.
 *
 * Компонент владеет только чистым UI-состоянием: открыт ли дропдаун и какая
 * строка подсвечена (клавиатура). Запрос подсказок при изменении текста
 * отправляет через onQueryChange; выбор продавца — через onSelect; сабмит
 * (Enter) без подсвеченной строки — через onSubmit (старое поведение
 * «найти и центрировать», MAP-053).
 *
 * Дропдаун показывается только когда подсказки актуальны для текущего текста
 * (suggestionsState.query === value): между сменой текста и ответом Repository
 * показывается спиннер (оптимистичный SEARCH_SUGGESTIONS_START в runtime),
 * устаревшие подсказки для прежнего запроса не мелькают.
 */

/** Максимум строк в дропдауне: длинный список скроллится, а не растягивается
 *  на весь экран. */
const MAX_SUGGESTIONS = 8;

interface MapSearchAutocompleteProps {
  query: string;
  suggestionsState: SearchSuggestionsState;
  placeholder?: string;
  testId?: string;
  onQueryChange: (value: string) => void;
  onSelect: (seller: SellerMapRecord) => void;
  onSubmit: (query: string) => void;
}

export function MapSearchAutocomplete({
  query,
  suggestionsState,
  placeholder = 'Найти продавца',
  testId = 'map-search',
  onQueryChange,
  onSelect,
  onSubmit,
}: MapSearchAutocompleteProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  const trimmedQuery = query.trim();
  const suggestions = suggestionsState.suggestions;
  const visibleSuggestions = suggestions.slice(0, MAX_SUGGESTIONS);
  // Дропдаун виден, только когда подсказки в состоянии получены именно для
  // текущего текста поля (иначе в момент набора мелькали бы старые).
  const showDropdown = open && trimmedQuery.length > 0 && suggestionsState.query === trimmedQuery;

  // Новый ответ Repository — новая подсветка не имеет смысла (строки могли
  // измениться), сбрасываем на «ничего не выбрано».
  useEffect(() => {
    setActiveIndex(-1);
  }, [suggestions]);

  // Клик/тап вне дропдауна закрывает его (и сбрасывает подсветку). Слушаем
  // pointerdown на document: он срабатывает до клика по строке подсказки, но
  // проверка contains() оставляет клики внутри автодополнения нетронутыми.
  useEffect(() => {
    if (!open) return;
    function handlePointerDown(event: PointerEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
        setActiveIndex(-1);
      }
    }
    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [open]);

  // Клавиши вниз/вверх в длинном списке прокручивают подсвеченную строку в
  // видимую область дропдауна.
  useEffect(() => {
    listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  const handleChange = useCallback(
    (value: string) => {
      setOpen(true);
      setActiveIndex(-1);
      onQueryChange(value);
    },
    [onQueryChange],
  );

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        if (suggestions.length > 0) {
          if (!showDropdown) setOpen(true);
          setActiveIndex((i) => (i + 1) % visibleSuggestions.length);
        }
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        if (visibleSuggestions.length > 0) {
          setActiveIndex((i) => (i <= 0 ? visibleSuggestions.length - 1 : i - 1));
        }
      } else if (event.key === 'Escape') {
        setOpen(false);
        setActiveIndex(-1);
      }
    },
    [showDropdown, suggestions.length, visibleSuggestions.length],
  );

  const closeAndReset = useCallback(() => {
    setOpen(false);
    setActiveIndex(-1);
  }, []);

  const handleSubmit = useCallback(
    (event: FormEvent) => {
      event.preventDefault();
      const current = visibleSuggestions[activeIndex];
      if (visibleSuggestions.length > 0 && current) {
        closeAndReset();
        onSelect(current);
      } else {
        // Нет подсказок или не подсвечено ни одной — классический поиск по
        // сабмиту (первое совпадение по названию, MAP-053).
        closeAndReset();
        onSubmit(trimmedQuery);
      }
    },
    [activeIndex, visibleSuggestions, trimmedQuery, onSelect, onSubmit, closeAndReset],
  );

  // Не даём полю потерять фокус при клике по строке: иначе pointerdown-слушатель
  // мог бы закрыть дропдаун раньше, чем сработает click.
  const handleSuggestionMouseDown = useCallback((event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
  }, []);

  const handleSuggestionSelect = useCallback(
    (seller: SellerMapRecord) => {
      closeAndReset();
      onSelect(seller);
    },
    [onSelect, closeAndReset],
  );

  const handleFocus = useCallback(() => {
    if (query.trim().length > 0) setOpen(true);
  }, [query]);

  return (
    <form role="search" onSubmit={handleSubmit}>
      <div ref={containerRef} className="gm-map-search">
        <input
          className="gm-map-search__input"
          type="search"
          value={query}
          onChange={(e) => handleChange(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={handleFocus}
          placeholder={placeholder}
          aria-label={placeholder}
          role="combobox"
          aria-expanded={showDropdown}
          aria-controls="gm-map-search-dropdown"
          aria-activedescendant={
            showDropdown && activeIndex >= 0 ? `gm-map-search-option-${visibleSuggestions[activeIndex].sellerId}` : undefined
          }
          autoComplete="off"
          spellCheck={false}
          data-testid={testId}
        />

        {showDropdown && (
          <div
            id="gm-map-search-dropdown"
            ref={listRef}
            className="gm-map-search__dropdown"
            role="listbox"
            data-testid="map-search-dropdown"
          >
            {suggestionsState.loading && (
              <div className="gm-map-search__status" role="status">
                <Loader size="md" />
                <Text variant="caption" tone="secondary">
                  Ищем…
                </Text>
              </div>
            )}

            {!suggestionsState.loading && suggestions.length === 0 && (
              <div className="gm-map-search__status">
                <Text variant="caption" tone="secondary">
                  {suggestionsState.rawSuggestions.length > 0
                    ? `По запросу «${trimmedQuery}» под действующими фильтрами ничего не найдено`
                    : `Ничего не найдено по запросу «${trimmedQuery}»`}
                </Text>
              </div>
            )}

            {!suggestionsState.loading &&
              visibleSuggestions.map((seller, i) => (
                <button
                  key={seller.sellerId}
                  id={`gm-map-search-option-${seller.sellerId}`}
                  type="button"
                  role="option"
                  aria-selected={i === activeIndex}
                  data-active={i === activeIndex}
                  className={[
                    'gm-map-search__suggestion',
                    'gm-focusable',
                    i === activeIndex ? 'gm-map-search__suggestion--active' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  onMouseEnter={() => setActiveIndex(i)}
                  onMouseDown={handleSuggestionMouseDown}
                  onClick={() => handleSuggestionSelect(seller)}
                >
                  <span className="gm-map-search__suggestion-icon" aria-hidden="true">
                    🏪
                  </span>
                  <span className="gm-map-search__suggestion-body">
                    <span className="gm-map-search__suggestion-name">{seller.name}</span>
                    <span className="gm-map-search__suggestion-meta">
                      {seller.categoryNames.slice(0, 2).join(' · ')} ·{' '}
                      {DistanceFormatter.format({ meters: seller.distanceMeters })}
                    </span>
                  </span>
                </button>
              ))}
          </div>
        )}
      </div>
    </form>
  );
}
