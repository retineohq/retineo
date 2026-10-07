# RETINEO Memory Core — Detailed Roadmap

> Фиксация итоговой цели, роадмапа, первоисточников и языкового ограничения.
> Сохранено 2026-10-07.

---

## 1. Итоговая цель проекта

Retineo — Persistent Context Engine. Не RAG, не search. Система, которая
заранее строит и поддерживает знание и контекст организации, а retrieval —
лишь навигация по готовой памяти.

Финальная архитектура:

```
Sources → Evidence → Candidate → Decision → Policy → MEMORY CORE
                                                          │
                                        ┌─────────────────┼─────────────────┐
                                        ▼                 ▼                 ▼
                                     Indexes           Segments          Agents
                                  (rebuildable)      (portable)      (context pkgs)
```

**Критерий успеха (handoff #82):** запрос «что случилось с решением по БД?»
восстанавливает полную цепочку decision → incident → reassessment → new decision
с provenance — без LLM-реконструкции из chunks.

---

## 2. Роадмап до финала

### Этап 1 — Стабилизация домена (текущий)

- Тесты на все 20 инвариантов M1–M20 — **выполнено** (39 тестов, все проходят)
- Negative cases: попытки нарушить каждый инвариант — **выполнено** для M1, M4, M5, M9, M10, M14, M16, M20
- Property-based тесты на state transitions
- Выход: домен детерминирован, exhaustively протестирован, без внешних зависимостей

### Этап 2 — Persistent adapter (SQLite)

- SQLite реализация всех 9 портов — **выполнено** (objects, claims, relationships, contexts, memberships, gaps, evidence, provenance, journal)
- Тот же набор тестов против SQLite
- Journal с настоящей атомарностью (BEGIN IMMEDIATE/COMMIT/ROLLBACK) — **выполнено**
- Persistence тест: close + reopen — память переживает перезапуск — **выполнено**

### Этап 3 — Evidence ingestion

- Source adapters (filesystem первый, потом API/Git) — **filesystem выполнен**
- Конвертация внешнего материала → immutable Evidence — **выполнено**
- Sandboxing untrusted sources (handoff #40)
- Выход: реальные документы попадают в память

### Этап 4 — Candidate extraction

- Extraction layer: LLM/rules → Candidate (не memory!) — **выполнено** (RegexExtractionModel, replaceable)
- Decision Model через порт (LLM заменим, M13)
- Policy Model через порт
- Выход: AI работает, но не имеет прямого мутационного доступа

### Этап 5 — Retrieval projections

- Essence/Summary как SemanticRepresentation + index — **выполнено** (findEntryPoints)
- Claims/Relationships как knowledge index — **выполнено** (knowledgeQuery)
- Multi-hop traversal как context query — **выполнено** (reconstructContext)
- BM25/vector как derived projections (rebuildable, M8)
- Multilingual support (embeddings + claims-level extraction)
- Выход: многослойный retrieval работает —
  Essence → entry, Claims → relationships, Multi-hop → context, Original → verification

### Этап 6 — Segments и Agent access

- Segment export/import с верификацией (частично сделано в Phase 12)
- Agent Context Package через authorized query
- Agent propose → Candidate (никогда — direct mutation, M13)
- Segment import с verify + autoApply — **выполнено**
- Выход: агенты могут использовать память и предлагать изменения, но не ломать её

### Этап 7 — Интеграция и замена старого ядра

- CLI на новых портах (не через packages/core) — в работе
- HTTP bridge на новых портах — **выполнено** (Fastify, 13 endpoints)
- MCP server на новых портах
- Программная валидация Phase 4–5 экспериментов (реальные embeddings, не аналитика)
- Выход: вся пользовательская инфраструктура работает на memory-core

### Этап 8 — Cleanup

- Удаление `packages/core` целиком
- Обновление structure.md (старые разделы → удалены)
- Обновление README, docs
- Выход: единственное ядро — memory-core

---

## 3. Первоисточники (Source types)

Что попадает в память (handoff #7 L0, domain spec Source/SourceItem):

### Документы организации

- ADR (Architecture Decision Records) — решения и их контекст
- Meeting notes / протоколы — что решили, кто, когда
- Incident reports — что случилось, причина, последствия
- Postmortems — анализ инцидентов с выводами
- RFC / Design docs — предложения и обсуждения до решения
- Отчёты (месячные, квартальные, проектные)
- Runbook'и — инструкции по операциям
- Onboarding docs
- Policies / Security docs

### Технические артефакты

- Git commits / PR descriptions — что изменено и почему
- Issues / Tickets (Jira, Linear, GitHub)
- Changelog entries
- API documentation
- Infrastructure configs (Terraform, K8s manifests)
- Postmortem tool outputs (Sentry reports, incident timelines)

### Коммуникации

- Email threads
- Slack/Discord discussions
- Chat exports

### Внешние

- Vendor docs
- Contracts / agreements
- Industry reports

### Критерии хорошего первоисточника (handoff #62.5)

Подходит:

- Содержит конкретное решение или вывод
- Имеет условия, ограничения, временные рамки
- Может быть связан с другими документами

Не подходит:

- Документ без решения (протокол обсуждения без вывода)
- Документ, понятный только в контексте других (без связи)
- Слишком технический, где смысл в деталях

### Порядок для первого ingestion (Этап 3)

1. Markdown/text — простые, уже есть парсеры
2. ADR
3. Incident reports
4. Email/Slack
5. PDF/сканы (OCR)

Первый реальный тест: 2–3 связанных ADR из реального проекта,
проверка — восстанавливается ли цепочка решений с provenance.

---

## 4. Языковое ограничение

**Один язык — требование первого эксперимента (handoff #62.5), не системы.**

Почему для эксперимента:

1. **Ликвидация переменных.** Compression experiment измеряет semantic recall,
   relationship recall, compression ratio. Разные языки = смешение потерь
   от сжатия с потерями от языкового барьера.
2. **Cross-language similarity — отдельная сложная проблема.**
   «PostgreSQL выбран» и «PostgreSQL was chosen» семантически одинаковы,
   лексически нет. BM25 не найдёт. Multilingual embedding — найдёт,
   но это отдельная проверка.
3. **Первый milestone должен быть простым.**

Для системы в целом ограничения нет:

- Evidence хранится как есть (в своём языке)
- SemanticRepresentation может быть multilingual
- Cross-language relationship решается через claims-level extraction
  (Candidate → Decision pipeline), независимо от языка
- «Similarity не равна relationship» (handoff #74.7) — cross-language
  similarity это similarity, отдельный механизм

Multilingual — работа Этапа 5 (retrieval projections).
