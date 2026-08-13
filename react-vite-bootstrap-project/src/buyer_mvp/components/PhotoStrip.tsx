import { useEffect, useState } from 'react';
import { IconButton } from '@/design-system/components';
import { PhotoPlaceholder } from './PhotoPlaceholder';

interface PhotoStripProps {
  photos: string[];
  label: string;
}

/**
 * Лента фото предложения (offer.photos[] — все, не только первое).
 * Источник поля: catalog_schemas.py — SellerOffer.photos, в детальном ответе
 * /catalog/products/{id} фото лежат внутри offers[], не на уровне продукта.
 *
 * Клик по главному фото открывает лайтбокс: увеличенное фото, стрелки
 * предыдущее/следующее (при нескольких фото), закрытие по крестику, клику по
 * подложке или Escape; навигация стрелками клавиатуры.
 */
export function PhotoStrip({ photos, label }: PhotoStripProps) {
  const [active, setActive] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [viewing, setViewing] = useState(0);

  useEffect(() => {
    if (!lightboxOpen) return;

    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setLightboxOpen(false);
        return;
      }
      if (photos.length <= 1) return;
      if (e.key === 'ArrowLeft') setViewing((i) => (i - 1 + photos.length) % photos.length);
      if (e.key === 'ArrowRight') setViewing((i) => (i + 1) % photos.length);
    }

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [lightboxOpen, photos.length]);

  function openLightbox(index: number) {
    setViewing(index);
    setLightboxOpen(true);
  }

  if (photos.length === 0) {
    return <PhotoPlaceholder label={label} />;
  }

  return (
    <div className="gm-buyer-photo-strip">
      <button
        type="button"
        className="gm-buyer-photo-strip__open"
        onClick={() => openLightbox(active)}
        aria-label={`Увеличить фото: ${label}`}
      >
        <img className="gm-buyer-photo gm-buyer-photo-strip__main" src={photos[active]} alt={label} loading="lazy" />
      </button>
      {photos.length > 1 && (
        <div className="gm-buyer-photo-strip__thumbs" role="tablist" aria-label={`Фото: ${label}`}>
          {photos.map((photo, index) => (
            <button
              key={photo}
              type="button"
              role="tab"
              aria-selected={index === active}
              className={`gm-buyer-photo-strip__thumb${index === active ? ' gm-buyer-photo-strip__thumb--active' : ''}`}
              onClick={() => setActive(index)}
            >
              <img src={photo} alt="" loading="lazy" />
            </button>
          ))}
        </div>
      )}

      {lightboxOpen && (
        <div
          className="gm-buyer-lightbox"
          role="dialog"
          aria-modal="true"
          aria-label={`Фото: ${label}`}
          onClick={() => setLightboxOpen(false)}
        >
          <div className="gm-buyer-lightbox__content" onClick={(e) => e.stopPropagation()}>
            <IconButton label="Закрыть" className="gm-buyer-lightbox__close" onClick={() => setLightboxOpen(false)}>
              ×
            </IconButton>
            <img className="gm-buyer-lightbox__img" src={photos[viewing]} alt={label} />
            {photos.length > 1 && (
              <>
                <IconButton
                  label="Предыдущее фото"
                  className="gm-buyer-lightbox__nav gm-buyer-lightbox__nav--prev"
                  onClick={() => setViewing((i) => (i - 1 + photos.length) % photos.length)}
                >
                  ‹
                </IconButton>
                <IconButton
                  label="Следующее фото"
                  className="gm-buyer-lightbox__nav gm-buyer-lightbox__nav--next"
                  onClick={() => setViewing((i) => (i + 1) % photos.length)}
                >
                  ›
                </IconButton>
              </>
            )}
            <div className="gm-buyer-lightbox__counter">
              {viewing + 1} / {photos.length}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
