import { Stack } from '@/layout';
import { Card, ListItem, Text } from '@/design-system/components';
import type { SellerCardViewModel } from '@/platform-core/viewmodels/SellerCardViewModel';

/**
 * Секция «Сообщения покупателей» страницы продавца. Презентационный список:
 * отчёты приходят из карточки продавца (SellerCardViewModel) уже готовыми.
 */
export interface SellerCardReportsProps {
  reports: SellerCardViewModel['reports'];
}

export function SellerCardReports({ reports }: SellerCardReportsProps) {
  if (reports.length === 0) return null;

  return (
    <Stack gap="md">
      <Text variant="title" as="h2">
        Сообщения покупателей
      </Text>
      <Card>
        <Stack gap="none">
          {reports.map((report) => (
            <ListItem key={report.id} static leading={<Text as="span">💬</Text>}>
              <Stack gap="xs">
                <Text variant="bodyStrong">{report.title}</Text>
                <Text variant="caption" tone="secondary">
                  {[report.author, report.date].filter(Boolean).join(' · ')}
                </Text>
              </Stack>
            </ListItem>
          ))}
        </Stack>
      </Card>
    </Stack>
  );
}
