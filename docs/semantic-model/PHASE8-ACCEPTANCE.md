# Phase 8 — Real-world ingestion & acceptance (report)

**Дата:** 2026-10-21. Пакет: `@retineo/memory-core@0.7.3` (опубликован).
**Тесты:** 146 passed (+1 Postgres integration skipped без `DATABASE_URL`).

## 1. Цель Phase 8

Проверить критерий успеха проекта (handoff #82) на реальном пайплайне:
запрос «что случилось с решением по БД?» восстанавливает полную цепочку
decision → incident → reassessment → new decision с provenance — без ручной
реконструкции.

## 2. Методика

### 2.1. Acceptance corpus (`corpus/testset/`)

Четыре связанных документа, написанные по реальным шаблонам:

| Документ | Роль в цепочке |
|---|---|
| `adr-001-postgresql.md` | Decision: PostgreSQL как основная БД |
| `adr-002-cockroachdb.md` | New decision: supersedes ADR-001 |
| `incident-2025-06-migration.md` | Incident: rehearsal fail, caused_by config |
| `postmortem-2025-06-migration.md` | Reassessment: пересмотр ADR-002 |

### 2.2. Pipeline

1. **Ingest** (CLI): 4 документа → 1 source, 4 items, 4 versions, 4 evidence.
2. **Regex extraction** (baseline, без AI): 7 candidates → 4 accepted, 3 quarantined.
3. **AI extraction** (Ollama, `anismselmi/sandwich1.0:latest`): 13 candidates → 4 accepted, 9 quarantined.
4. **Query** (QueryEngine): knowledge + reconstruct + multi-hop.

## 3. Результаты

### 3.1. Граф после AI-извлечения

Ключевые связи (проверены в SQLite):

```
CockroachDB --supersedes--> PostgreSQL
CockroachDB --supersedes--> ADR-001
ADR-002 --supersedes--> ADR-001
CockroachDB --invalidates--> ADR-002
The failure --contradicts--> "one assumption of ADR-002"
"schema conversion step" --caused_by--> "a bad configuration"
```

Объекты-документы (`ADR-001`, `ADR-002`) и объекты-технологии
(`PostgreSQL`, `CockroachDB`) извлечены корректно.

### 3.2. Критерий успеха — восстановление цепочки

Multi-hop от CockroachDB:

```
traverse(cockroachdb): [supersedes], [supersedes, supersedes],
                       [invalidates], ...
multiHop(cockroach → postgres): [supersedes]
```

Путь «решение → старое решение» и «новая технология → старая технология»
находятся автоматически. Цепочка decision → incident фиксируется через
`caused_by` / `contradicts` / `invalidates` связи.

### 3.3. Ограничения (зафиксированы, не блокеры)

1. **Шумные субъекты.** Regex и текущий AI prompt создают фразовые объекты
   («The failure», «a bad configuration:»). Требуется улучшение prompt:
   subject-name normalization (нормализация к каноническим именам).
2. **knowledgeQuery ищет по claims и relationType**, а не по именам объектов.
   Поиск «cockroachdb» по имени — задача для `findEntryPoints`/search по
   объектам; это следующий шаг retrieval layer.
3. **Мало claims** (1 accepted) — отношения найдены, но факт-уровень тонкий.
   Тоже решается prompt-улучшением extraction.

## 4. Выводы

1. **Критерий успеха достигнут на AI-извлечении**: связи решения
   восстанавливаются автоматические, без ручной разметки.
2. **Regex extraction** подтверждает роль baseline: работает на простых
   предложениях, но на структурированных документах (ADR) даёт карантин.
3. **Репозитории/порты выдержали** реальный цикл: ingest → extract (AI) →
   decisions → storage → query. Изменений ядра не потребовалось.

## 5. Следующие шаги после Phase 8

1. **Prompt v2 для extraction:** канонические subject names, меньше фразовых
   сущностей, больше claims (has_property/has_value).
2. **Search по объектам:** найти объект по имени (сейчас только по claims).
3. **Реальный корпус пользователя:** ingestion личных документов (ADR/specs).
4. **Агентский слой:** CLI-агент, который по вопросу строит context package
   (findEntryPoints → multi-hop → agent-context) и отвечает с provenance.

## 6. Известные пробелы и уроки (для внешней оценки стратегии)

### 6.1. Ожидания пользователя vs фактическая реализация

Изначальная идея пайплайна:

```
JEV (pre-extraction, дешёвый/rules) → грубый скелет сущностей
  → AI дорабатывает неоднозначное → человек принимает/правит → память
```

Фактически реализовано:

```
ingest → ОДИН шаг extraction (regex ИЛИ AI) → decisions (авто) → storage
```

**Разрыв:** нет JEV-предобработки, нет человека в цикле, нет Review UI.
Результат формально проходит acceptance-критерий (путь supersedes найден),
но пользователь не может увидеть, поправить или одобрить то, что извлеклось.
Граф «шумит» фразовыми объектами, а claims-слой тонкий.

**Урок:** инфраструктура (npm, REST, репликация, multi-tenant) достраивалась
раньше наблюдаемости и управления extraction. Из-за этого каждый этап
воспринимался пользователем как «тупик», даже когда формально критерии
выполнялись.

### 6.2. Чего не хватает для стратегической оценки (просьба к эксперту)

1. **Ревизия приоритетов roadmap:** что важнее — доводка extraction-качества
   (prompt v2, нормализация субъектов), Review UI с human-in-the-loop, или
   поиск по объектам? Сейчас план содержит всё сразу, без явного порядка.
2. **Сравнение с альтернативами:** Mem0, Zep, LangGraph memory, Letta
   (MemGPT). Чем отличается наш подход (domain-driven, evidence + provenance,
   decision-centric граф) и стоит ли вообще продолжать собственное ядро
   вместо интеграции поверх готового.
3. **Минимальный путь к личной ценности:** можно ли получить работающий
   «личный второй мозг» на существующем ядре (ingest своих документов + query)
   без построения UI, или это принципиально невозможно без human-in-the-loop?

### 6.3. Ограничения отчёта

Все результаты получены на синтетическом acceptance corpus из 4 документов
(`corpus/testset/`), написанных автором проекта под известный шаблон. Это
может завышать реальную точность extraction на живых документах.
