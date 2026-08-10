import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent, type MouseEvent } from 'react';
import { Loader, Text } from '@/design-system/components';
import { DistanceFormatter } from '@/platform-core/formatting/DistanceFormatter';
import type { ProductSellerMatch } from '@/platform-core/map/product-search/ProductSearch';
import type {
  ProductSearchState,
  SearchSuggestionsState,
  SellerMapRecord,
} from '@/platform-core/map/viewmodels/MapViewModel';

/**
 * Строка поиска с автодополнением (MAP-019) для шапки экрана Map.
 *
 * Два режима поиска, переключаемых надписью под полем при пустом тексте
 * (переключатель исчезает, как только в поле есть символ):
 *   - «по названию» (SearchMode.name) — подсказки = продавцы, выбор продавца
 *     центрирует карту и открывает Bottom Sheet (старое поведение MAP-019);
 *   - «по товару» (SearchMode.product) — пока есть прямые совпадения, подсказки
 *     = названия товаров (дописать название); выбор названия подставляет его
 *     в поле, и подсказки заменяются продавцами с ценой на этот товар. Если
 *     прямых совпадений нет, но есть товар со схожестью >85%, система
 *     «Возможно вы имели в виду» сразу показывает его продавцов.
 *
 * Чистое отображение, домен живёт в MapRuntime: тексты/подсказки и режим
 * хранятся там (productSearch.mode), сюда приходят готовые состояния пропами.
 * Компонент владеет только чистым UI-состоянием: открыт ли дропдаун, какая
 * строка подсвечена (клавиатура) и в фокусе ли поле (для переключателя).
 */

/** Максимум строк в дропдауне: длинный список скроллится, а не растягивается
 *  на весь экран. */
const MAX_SUGGESTIONS = 8;

interface MapSearchAutocompleteProps {
  query: string;
  searchMode: 'name' | 'product';
  suggestionsState: SearchSuggestionsState;
  productSearch: ProductSearchState;
  placeholder?: string;
  testId?: string;
  onQueryChange: (value: string) => void;
  onModeChange: (mode: 'name' | 'product') => void;
  /** Выбор продавца в режиме «по названию». */
  onSelect: (seller: SellerMapRecord) => void;
  /** Выбор названия товара в режиме «по товару»: подстановка в поле +
   *  подсказки продавцов. */
  onProductNameSelect: (name: string) => void;
  /** Выбор продавца в режиме «по товару» (с ценой на искомый товар). */
  onProductSellerSelect: (match: ProductSellerMatch) => void;
  /** Сабмит (Enter) без подсвеченной строки; экран выбирает действие по режиму. */
  onSubmit: (query: string) => void;
}

/** Строка дропдауна: либо продавец (режим «по названию», или продавец с ценой
 *  в режиме «по товару»), либо название товара (автодополнение). */
type DropdownOption =
  | { kind: 'seller'; key: string; seller: SellerMapRecord; match?: ProductSellerMatch }
  | { kind: 'product'; key: string; name: string; emoji: string; subtitle: string };

export function MapSearchAutocomplete({
  query,
  searchMode,
  suggestionsState,
  productSearch,
  placeholder,
  testId = 'map-search',
  onQueryChange,
  onModeChange,
  onSelect,
  onProductNameSelect,
  onProductSellerSelect,
  onSubmit,
}: MapSearchAutocompleteProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [focused, setFocused] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  const trimmedQuery = query.trim();
  const suggestions = suggestionsState.suggestions;

  /** Единый список строк дропдауна по режиму и фазе товарного поиска. */
  const options: DropdownOption[] = useMemo(() => {
    if (searchMode === 'name') {
      return suggestions.slice(0, MAX_SUGGESTIONS).map((seller): DropdownOption => ({ kind: 'seller', key: seller.sellerId, seller }));
    }
    if (productSearch.phase === 'names') {
      return productSearch.nameSuggestions
        .slice(0, MAX_SUGGESTIONS)
        .map((p): DropdownOption => ({
          kind: 'product',
          key: `product-${p.name}`,
          name: p.name,
          emoji: p.emoji,
          subtitle: p.sellerCount > 0 ? `у ${p.sellerCount} продавцов · от ${p.minPrice} ₽` : '',
        }));
    }
    return productSearch.sellers
      .slice(0, MAX_SUGGESTIONS)
      .map((match): DropdownOption => ({ kind: 'seller', key: `match-${match.seller.sellerId}`, seller: match.seller, match }));
  }, [searchMode, suggestions, productSearch.phase, productSearch.nameSuggestions, productSearch.sellers]);

  const loading = searchMode === 'name' ? suggestionsState.loading : productSearch.loading;
  // Дропдаун виден только когда подсказки получены именно для текущего текста.
  const suggestionsFresh =
    searchMode === 'name' ? suggestionsState.query === trimmedQuery : productSearch.query === trimmedQuery;
  const showDropdown = open && trimmedQuery.length > 0 && suggestionsFresh;

  /** Надпись-переключатель режима: видна при фокусе и пустом поле, исчезает
   *  при вводе символа. «По товару» из режима «по названию» и обратно. */
  const showModeSwitch = focused && trimmedQuery.length === 0;
  const switchLabel = searchMode === 'name' ? 'Искать по товару' : 'Искать по названию';

  // Новый ответ Repository — новая подсветка не имеет смысла (строки могли
  // измениться), сбрасываем на «ничего не выбрано».
  useEffect(() => {
    setActiveIndex(-1);
  }, [options]);

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
        if (options.length > 0) {
          if (!showDropdown) setOpen(true);
          setActiveIndex((i) => (i + 1) % options.length);
        }
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        if (options.length > 0) {
          setActiveIndex((i) => (i <= 0 ? options.length - 1 : i - 1));
        }
      } else if (event.key === 'Escape') {
        setOpen(false);
        setActiveIndex(-1);
      }
    },
    [options.length, showDropdown],
  );

  const closeAndReset = useCallback(() => {
    setOpen(false);
    setActiveIndex(-1);
  }, []);

  const handleOptionSelect = useCallback(
    (option: DropdownOption) => {
      if (option.kind === 'product') {
        // Выбор названия товара: подстановка в поле + подсказки продавцов с
        // ценой. Дропдаун не закрываем — он сразу переключится на продавцов
        // (спиннер → список), без лишнего клика.
        setOpen(true);
        setActiveIndex(-1);
        onProductNameSelect(option.name);
      } else if (searchMode === 'product' && option.match) {
        closeAndReset();
        onProductSellerSelect(option.match);
      } else {
        closeAndReset();
        onSelect(option.seller);
      }
    },
    [searchMode, onProductNameSelect, onProductSellerSelect, onSelect, closeAndReset],
  );

  const handleSubmit = useCallback(
    (event: FormEvent) => {
      event.preventDefault();
      const current = options[activeIndex];
      if (options.length > 0 && current) {
        handleOptionSelect(current);
      } else if (searchMode === 'product') {
        // Enter в режиме «по товару»: ищем продавцов и держим дропдаун
        // открытым, чтобы показать их сразу (без повторного клика/фокуса).
        setOpen(true);
        setActiveIndex(-1);
        onSubmit(trimmedQuery);
      } else {
        // Нет строк или не подсвечено ни одной — классический сабмит; экран
        // по режиму выбирает: поиск по названию или по товару.
        closeAndReset();
        onSubmit(trimmedQuery);
      }
    },
    [options, activeIndex, trimmedQuery, searchMode, handleOptionSelect, onSubmit, closeAndReset],
  );

  // Не даём полю потерять фокус при клике по строке (и по переключателю):
  // иначе pointerdown-слушатель мог бы закрыть дропдаун раньше, чем сработает click.
  const handleMouseDown = useCallback((event: MouseEvent<HTMLElement>) => {
    event.preventDefault();
  }, []);

  const handleFocus = useCallback(() => {
    setFocused(true);
    if (query.trim().length > 0) setOpen(true);
  }, [query]);

  const handleBlur = useCallback(() => {
    setFocused(false);
    setOpen(false);
    setActiveIndex(-1);
  }, []);

  const handleModeSwitchClick = useCallback(() => {
    onModeChange(searchMode === 'name' ? 'product' : 'name');
  }, [searchMode, onModeChange]);

  const activeId =
    showDropdown && activeIndex >= 0 ? `gm-map-search-option-${options[activeIndex].key.replace(/\s+/g, '-')}` : undefined;

  const emptyProductText =
    productSearch.phase === 'sellers' && productSearch.sellers.length === 0
      ? 'Продавцов с этим товаром не найдено'
      : `Ничего не найдено по запросу «${trimmedQuery}»`;

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
          onBlur={handleBlur}
          placeholder={placeholder ?? (searchMode === 'product' ? 'Найти продавца по товару' : 'Найти продавца')}
          aria-label={placeholder ?? (searchMode === 'product' ? 'Найти продавца по товару' : 'Найти продавца')}
          role="combobox"
          aria-expanded={showDropdown}
          aria-controls="gm-map-search-dropdown"
          aria-activedescendant={activeId}
          autoComplete="off"
          spellCheck={false}
          data-testid={testId}
        />

        {showModeSwitch && (
          <button
            type="button"
            className="gm-map-search__mode-switch gm-focusable"
            data-testid="map-search-mode-switch"
            onMouseDown={handleMouseDown}
            onClick={handleModeSwitchClick}
          >
            {switchLabel}
          </button>
        )}

        {showDropdown && (
          <div
            id="gm-map-search-dropdown"
            ref={listRef}
            className="gm-map-search__dropdown"
            role="listbox"
            data-testid="map-search-dropdown"
          >
            {loading && (
              <div className="gm-map-search__status" role="status">
                <Loader size="md" />
                <Text variant="caption" tone="secondary">
                  Ищем…
                </Text>
              </div>
            )}

            {/* Ошибка запроса: отличается от пустого результата («товара нет» /
                «продавцов нет») — retry по текущей фазе (подсказки или продавцы). */}
            {!loading && productSearch.failed && (
              <div className="gm-map-search__status" role="alert">
                <Text variant="caption" tone="secondary">
                  Не удалось выполнить поиск
                </Text>
                <button
                  type="button"
                  className="gm-map-search__retry gm-focusable"
                  onClick={() => (productSearch.phase === 'names' ? onQueryChange(query) : onSubmit(query))}
                >
                  Повторить
                </button>
              </div>
            )}

            {/* «Возможно вы имели в виду»: прямых совпадений нет, но система
                предложила товар по схожести (>85%) — сразу продавцы с ценой. */}
            {!loading && !productSearch.failed && searchMode === 'product' && productSearch.phase === 'sellers' && productSearch.suggestedProduct && (
              <div className="gm-map-search__did-you-mean" data-testid="map-search-did-you-mean">
                Возможно вы имели в виду: «{productSearch.suggestedProduct}»
              </div>
            )}

            {!loading && !productSearch.failed && options.length === 0 && (
              <div className="gm-map-search__status">
                <Text variant="caption" tone="secondary">
                  {searchMode === 'name' && suggestionsState.rawSuggestions.length > 0
                    ? `По запросу «${trimmedQuery}» под действующими фильтрами ничего не найдено`
                    : emptyProductText}
                </Text>
              </div>
            )}

            {!loading &&
              options.map((option, i) =>
                option.kind === 'product' ? (
                  <button
                    key={option.key}
                    id={`gm-map-search-option-${option.key.replace(/\s+/g, '-')}`}
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
                    onMouseDown={handleMouseDown}
                    onClick={() => handleOptionSelect(option)}
                  >
                    <span className="gm-map-search__suggestion-icon" aria-hidden="true">
                      {option.emoji}
                    </span>
                    <span className="gm-map-search__suggestion-body">
                      <span className="gm-map-search__suggestion-name">{option.name}</span>
                      {option.subtitle && (
                        <span className="gm-map-search__suggestion-meta">{option.subtitle}</span>
                      )}
                    </span>
                  </button>
                ) : (
                  <button
                    key={option.key}
                    id={`gm-map-search-option-${option.key.replace(/\s+/g, '-')}`}
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
                    onMouseDown={handleMouseDown}
                    onClick={() => handleOptionSelect(option)}
                  >
                    <span className="gm-map-search__suggestion-icon" aria-hidden="true">
                      🏪
                    </span>
                    <span className="gm-map-search__suggestion-body">
                      <span className="gm-map-search__suggestion-name">{option.seller.name}</span>
                      <span className="gm-map-search__suggestion-meta">
                        {option.match
                          ? `${option.match.productName} · ${option.match.price} ₽/${option.match.unit} · ` +
                            DistanceFormatter.format({ meters: option.seller.distanceMeters })
                          : `${option.seller.categoryNames.slice(0, 2).join(' · ')} · ` +
                            DistanceFormatter.format({ meters: option.seller.distanceMeters })}
                      </span>
                    </span>
                  </button>
                ),
              )}
          </div>
        )}
      </div>
    </form>
  );
}
