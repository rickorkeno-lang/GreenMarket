import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useGreenMarketRuntime } from '@/platform-core/navigation-runtime-layer/hooks/useGreenMarketRuntime';
import { isAtRoot } from '@/platform-core/navigation-runtime-layer/navigation/NavigationStack';
import { asSellerId } from '@/platform-core/contracts/Action';
import { sellerRepository } from '@/platform-core/map/repository/repository';
import type { SellerProductRecord } from '@/platform-core/map/repository/SellerRepository';
import type { RecommendedSeller } from '@/platform-core/map/recommendations/SellerRecommendations';
import type { SellerCardViewModel } from '@/platform-core/viewmodels/SellerCardViewModel';
import type { SellerMapRecord } from '@/platform-core/map/viewmodels/MapViewModel';
import { Diagnostics } from '@/platform-core/diagnostics/Diagnostics';
import { sellerStatus, type SellerStatusPresentation } from '@/platform-core/formatting/SellerStatus';
import { copyTextToClipboard } from '@/platform-core/utils/clipboard';
import { SellerHistoryStore } from '@/platform-core/map/persistence/SellerHistoryStore';

/**
 * Контроллер страницы продавца (замечания ревью 5–7): собирает все доменные
 * модели (SellerMapRecord, SellerCardViewModel, SellerProductRecord,
 * RecommendedSeller) в одну агрегированную SellerCardPageModel и отдаёт её
 * экрану. Экран больше не знает деталей загрузки, URL, навигации и
 * бизнес-правил — только рендерит готовую модель.
 *
 * Замечание 5 (сортировка — бизнес-правило): продукты не сортируются здесь.
 * Единственный источник порядка по доступности — репозиторий
 * (getSellerProducts), который возвращает уже отсортированный список; экран
 * и контроллер лишь прокидывают его. Доступ к данным — через интерфейс
 * SellerRepository (см. repository.ts, замечание 12).
 */
export type SellerCardPageState = 'loading' | 'error' | 'ready';
export type ShareNotice = 'ok' | 'error' | null;

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
        sellerRepository.getSeller(sellerId),
        sellerRepository.getSellerCard(sellerId),
        sellerRepository.getSellerProducts(sellerId),
        sellerRepository.getRecommendedSellers(sellerId),
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

  // История просмотра: просмотр засчитывается после успешной загрузки страницы
  // продавца (record — реальные данные, не 404 и не загрузка). Повторный заход
  // на ту же страницу обновляет запись (upsert) — время просмотра становится
  // текущим. Запись хранит снапшот продавца — карта показывает его в панели
  // истории без повторных запросов.
  useEffect(() => {
    if (record) SellerHistoryStore.record(record);
  }, [record]);

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
