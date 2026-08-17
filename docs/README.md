# Документация проекта GreenMarket Customer UI

В этой директории хранится документация уровня репозитория: технические задания, ревью, архитектурные заметки. Документация самого UI-модуля (Design System, UX, внутренняя архитектура кода) — отдельно, в `greenmarket/GreenMarket/docs/` (см. раздел «Структура репозитория» в README.md корня).

## Структура каталога docs/

- **[`specifications/`](./specifications/)** — технические задания (ТЗ-001…ТЗ-026), включая черновики и утверждённые версии.
- **[`architecture/`](./architecture/)** — подготовка к FSM Engine: промпт-инструкция и ТЗ-022.
- **[`reviews/`](./reviews/)** — ревью, рецензии архива, мета-разборы структуры.

> `research/` в исходном плане структуры пока не создана — в репозитории нет исследовательских материалов отдельно от specifications/reviews. Создавайте её по факту появления первого такого документа, а не заранее.

Полный список документов с расшифровкой каждого — в [README.md корня репозитория](../README.md).

## Где ещё лежит документация

Помимо этой папки, в репозитории есть документация, которая живёт не под `docs/`:

- [`../greenmarket/GreenMarket/docs/`](../greenmarket/GreenMarket/docs/) — документация самого UI-модуля: Design System (DS-001, DS-002 + токены), UX-артефакты Stage 1 (GM-UX-001…013), архитектура (GM-010).
- [`../tests_folder/`](../tests_folder/) — методология и ТЗ на тестирование: `TEST_COVERAGE.md`, `TZ_TESTING_BUYER_MVP.md` (не связаны с серией ТЗ в `specifications/`).
- [`../_inventory/`](../_inventory/) — инвентаризация репозитория: `FILE_TREE.md`, `DOCUMENT_INDEX.md`, `CODE_INDEX.md`, `TRACEABILITY.md` (сверка кода с документацией).
- [`../react-vite-bootstrap-project/README.md`](../react-vite-bootstrap-project/README.md) — README исполняемого приложения Stage 1 (Buyer MVP, Map, Список продавцов, Карточка продавца).
