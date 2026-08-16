import { useState, type FormEvent } from 'react';
import { ModalContainer } from '@/containers';
import { Button, Text } from '@/design-system/components';
import type { ReportDialogState } from '@/screens/seller-card/useSellerCardController';

const REPORT_TITLE_ID = 'seller-card-report-title';
const REPORT_MESSAGE_ID = 'seller-card-report-message';
const REPORT_MAX_LENGTH = 2000;

export interface SellerCardReportDialogProps {
  sellerName: string;
  state: ReportDialogState;
  onSubmit: (message: string) => void;
  onClose: () => void;
}

export function SellerCardReportDialog({ sellerName, state, onSubmit, onClose }: SellerCardReportDialogProps) {
  const [message, setMessage] = useState('');
  const canSubmit = state !== 'sending' && message.trim().length > 0;

  const handleSubmit = (event: FormEvent): void => {
    event.preventDefault();
    if (!canSubmit) return;
    onSubmit(message);
  };

  return (
    <ModalContainer onDismiss={state !== 'sending' ? onClose : undefined} labelledBy={REPORT_TITLE_ID}>
      <form className="gm-dialog" onSubmit={handleSubmit} data-testid="seller-card-report-dialog">
        <Text as="h2" id={REPORT_TITLE_ID} variant="title">
          Сообщить о проблеме
        </Text>
        <Text tone="secondary" className="gm-seller-card-report__hint">
          Расскажите, что не так с точкой «{sellerName}». Мы получим ваше сообщение и поправим информацию.
        </Text>
        <label className="gm-seller-card-report__label" htmlFor={REPORT_MESSAGE_ID}>
          <textarea
            id={REPORT_MESSAGE_ID}
            className="gm-seller-card-report__input"
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            placeholder="Например: продавец переехал или временно закрыт, изменились часы работы…"
            maxLength={REPORT_MAX_LENGTH}
            rows={5}
            disabled={state === 'sending'}
            data-testid="seller-card-report-textarea"
          />
          <span className="gm-seller-card-report__counter">
            {message.length}/{REPORT_MAX_LENGTH}
          </span>
        </label>
        {state === 'error' && (
          <Text tone="danger" className="gm-seller-card-report__error" data-testid="seller-card-report-error">
            Не удалось отправить сообщение. Проверьте соединение и попробуйте ещё раз.
          </Text>
        )}
        <div className="gm-dialog__actions">
          <Button
            variant="secondary"
            onClick={onClose}
            disabled={state === 'sending'}
            data-testid="seller-card-report-cancel"
          >
            Отмена
          </Button>
          <Button
            type="submit"
            variant="primary"
            loading={state === 'sending'}
            disabled={!canSubmit}
            data-testid="seller-card-report-submit"
          >
            Отправить
          </Button>
        </div>
      </form>
    </ModalContainer>
  );
}
