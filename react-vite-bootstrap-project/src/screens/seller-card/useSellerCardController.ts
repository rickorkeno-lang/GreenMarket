import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useGreenMarketRuntime } from '@/platform-core/navigation-runtime-layer/hooks/useGreenMarketRuntime';
import { isAtRoot } from '@/platform-core/navigation-runtime-layer/navigation/NavigationStack';
import { asSellerId } from '@/platform-core/contracts/Action';
import { MockSellerRepository } from '@/platform-core/map/repository/MockSellerRepository';
import type { SellerProductRecord } from '@/platform-core/map/repository/mockSellerCatalog';
import type { RecommendedSeller } from '@/platform-core/map/recommendations/SellerRecommendations';
import type { SellerCardViewModel } from '@/platform-core/viewmodels/SellerCardViewModel';
import type { SellerMapRecord } from '@/platform-core/map/viewmodels/MapViewModel';
import { Diagnostics } from '@/platform-core/diagnostics/Diagnostics';

/**
 * Контроллер страницы продавца (замечания ревью 5–7): собирает все доменные
 * модели (SellerMapRecord, SellerCardViewModel, SellerProductRecord,
 * RecommendedSeller) в одну агрегированную SellerCardPageModel и отдаёт её
 * экрану. Экран больше не знает деталей загрузки, URL, навигации и
 * бизнес-правил — только рендерит готовую модель.
 *
 * Замечание 5 (сортировка — бизнес-правило): продукты не сортируются здесь.
 * Единственный источник порядка по доступности — MockSellerRepository
 * (getSellerProducts), который возвращает уже отсортированный список; экран
 * и контроллер лишь прокидывают его.
 */
export type SellerCardPageState = 'loading' | 'error' | 'ready';
export type ShareNotice = 'ok' | 'error' | null;

/** Готовый статус продавца для карточки «О продавце»: бизнес-маппинг
 *  «недоступен/открыт сейчас/сейчас закрыт» живёт в контроллере, а не в JSX. */
export interface SellerStatusPresentation {
  text: string;
  tone: 'success' | 'neutral' | 'danger';
}

/** Агрегированная view model страницы продавца. Экран рендерит только её. */
export interface SellerCardPageModel {
  loadState: SellerCardPageState;
  record: SellerMapRecord | null;
  card: SellerCardViewModel | null;
  /** Товары продавца, уже отсортированные репозиторием по доступности. */
  products: SellerProductRecord[];
  recommendations: RecommendedSeller[];
  isFavorite: boolean;
  /** Статус продавца для бейджа «О продавце» (null до готовности данных). */
  status: SellerStatusPresentation | null;
  /** true — экран готов, но продавец не найден (404). */
  notFound: boolean;
  /** true — данные страницы готовы и можно рендерить контент. */
  pageReady: boolean;
  /** true — экран открыт как корневой (без кнопки «Назад»). */
  atRoot: boolean;
  /** Состояние Snackbar «Ссылка скопирована» (чисто UI). */
  shareState: ShareNotice;
  onRetry: () => void;
  onBack: () => void;
  onToggleFavorite: () => void;
  onStartRoute: () => void;
  onShare: () => void;
  onOpenRecommendation: (recommendation: RecommendedSeller) => void;
}

const SHARE_NOTICE_TIMEOUT_MS = 4000;

function sellerStatus(record: SellerMapRecord): SellerStatusPresentation {
  if (!record.isAvailable) return { text: 'Недоступен', tone: 'danger' };
  if (record.isOpenNow) return { text: 'Открыт сейчас', tone: 'success' };
  return { text: 'Сейчас закрыт', tone: 'neutral' };
}

/** Копирование в буфер обмена с fallback'ом для несекурных контекстов
 *  (navigator.clipboard недоступен без https/localhost). */
async function copyTextToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // переходим к legacy-пути ниже
  }
  try {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    const copied = document.execCommand('copy');
    document.body.removeChild(textarea);
    return copied;
  } catch {
    return false;
  }
}

/**
 * Загрузка и агрегация всех данных страницы продавца. Хранит локальное
 * состояние страницы (данные + служебные UI-состояния) и возвращает его
 * одной моделью; действия (share/favorite/route/back/recommendation) — тоже
 * здесь, чтобы экран оставался чисто презентационным.
 */
export function useSellerCardController(): SellerCardPageModel {
  const { state, dispatch } = useGreenMarketRuntime();
  const { sellerId: sellerIdParam } = useParams<{ sellerId: string }>();
  const sellerId = sellerIdParam ? asSellerId(sellerIdParam) : null;

  const [loadState, setLoadState] = useState<SellerCardPageState>('loading');
  const [record, setRecord] = useState<SellerMapRecord | null>(null);
  const [card, setCard] = useState<SellerCardViewModel | null>(null);
  const [products, setProducts] = useState<SellerProductRecord[]>([]);
  const [recommendations, setRecommendations] = useState<RecommendedSeller[]>([]);
  const [isFavorite, setIsFavorite] = useState(false);
  const [shareState, setShareState] = useState<ShareNotice>(null);
  const shareTimerRef = useRef<number | null>(null);

  const load = useCallback(async () => {
    if (!sellerId) {
      setLoadState('ready');
      setRecord(null);
      setCard(null);
      setProducts([]);
      setRecommendations([]);
      return;
    }
    setLoadState('loading');
    try {
      const [recordRes, cardRes, productsRes, recommendationsRes] = await Promise.all([
        MockSellerRepository.getSeller(sellerId),
        MockSellerRepository.getSellerCard(sellerId),
        MockSellerRepository.getSellerProducts(sellerId),
        MockSellerRepository.getRecommendedSellers(sellerId),
      ]);
      setRecord(recordRes);
      setCard(cardRes);
      setIsFavorite(cardRes.isFavorite);
      setProducts(productsRes);
      setRecommendations(recommendationsRes);
      setLoadState('ready');
    } catch {
      setLoadState('error');
    }
  }, [sellerId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(
    () => () => {
      if (shareTimerRef.current !== null) window.clearTimeout(shareTimerRef.current);
    },
    [],
  );

  const showShareNotice = useCallback((next: Exclude<ShareNotice, null>) => {
    setShareState(next);
    if (shareTimerRef.current !== null) window.clearTimeout(shareTimerRef.current);
    shareTimerRef.current = window.setTimeout(() => setShareState(null), SHARE_NOTICE_TIMEOUT_MS);
  }, []);

  const handleShare = useCallback(async () => {
    if (!sellerId) return;
    Diagnostics.track('seller_card.share', { sellerId });
    const copied = await copyTextToClipboard(window.location.href);
    showShareNotice(copied ? 'ok' : 'error');
  }, [sellerId, showShareNotice]);

  const handleToggleFavorite = useCallback(() => {
    if (!sellerId) return;
    Diagnostics.track('seller_card.toggle_favorite', { sellerId });
    dispatch({ type: 'TOGGLE_FAVORITE_SELLER', payload: { sellerId } });
    setIsFavorite((value) => !value);
  }, [dispatch, sellerId]);

  const handleStartRoute = useCallback(() => {
    if (!sellerId) return;
    Diagnostics.track('seller_card.start_route', { sellerId });
    dispatch({ type: 'START_ROUTE' });
  }, [dispatch, sellerId]);

  const handleOpenRecommendation = useCallback(
    (recommendation: RecommendedSeller) => {
      Diagnostics.track('seller_card.open_recommendation', { sellerId: recommendation.seller.sellerId });
      dispatch({ type: 'OPEN_SELLER', payload: { sellerId: recommendation.seller.sellerId } });
    },
    [dispatch],
  );

  const atRoot = isAtRoot(state.navigation);
  const handleBack = useCallback(() => dispatch({ type: 'BACK' }), [dispatch]);

  const ready = loadState === 'ready';
  const notFound = ready && !record;
  const pageReady = ready && record !== null && card !== null;

  return {
    loadState,
    record,
    card,
    products,
    recommendations,
    isFavorite,
    status: record ? sellerStatus(record) : null,
    notFound,
    pageReady,
    atRoot,
    shareState,
    onRetry: () => void load(),
    onBack: handleBack,
    onToggleFavorite: handleToggleFavorite,
    onStartRoute: handleStartRoute,
    onShare: () => void handleShare(),
    onOpenRecommendation: handleOpenRecommendation,
  };
}
