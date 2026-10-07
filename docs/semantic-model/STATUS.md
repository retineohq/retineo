# RETINEO Memory Core — Status Snapshot

> Фиксация состояния на 2026-10-06. Точка перехода от экспериментов
> (Phase 0–6) к реализации (Phase 7) и дальнейшей стабилизации.

---

## 1. Что сделано

### 1.1. Экспериментальная фаза (Phase 0–6)

| Фаза | Артефакт | Результат |
|---|---|---|
| Phase 0–1 (conceptual validation, one document) | `HANDOFF_Q.md` | Concrete Semantic Model v0.1 на документе A. 20 Objects, 17 Claims, 17 Relationships. |
| Phase 2 (two documents) | `RETINEO-MEMORY-CORE-DOMAIN-SPEC-v0.1.md` | Cross-document analysis A→B. 12 подтверждений, 8 развитий, 0 противоречий. |
| Phase 3 (three documents) | `RETINEO-MEMORY-CORE-TECHNICAL-SPEC-v0.2.md` | Multi-hop analysis A→B→C. 6 путей подтверждены, 0 противоречий. |
| Phase 4 (retrieval experiment) | `phase4-retrieval-experiment.md` | Chunk vs Essence vs Knowledge vs Context. 5 гипотез подтверждено, 1 частично. |
| Phase 5 (compression experiment) | `phase5-compression-experiment.md` | Compression 25–51×. H-B опровергнута: essence недостаточна для relationship discovery. |
| Phase 6 (domain model definition) | `phase6-domain-model.md` | 17 сущностей, M1–M20, retrieval architecture. |

### 1.2. Реализация (Phase 7, partial)

Пакет `packages/memory-core/`:

- **Domain:** 17 typed entities (Source → Segment), value objects с temporal state, support state, scope, lifecycle
- **Ports:** 9 repository interfaces + Journal + Transaction + IdentityResolver + DecisionModel + PolicyModel + RepresentationRepository + SegmentRepository
- **InMemory adapters:** все порты, детерминированные модели (Decision, Policy, Representation, SegmentSecurity)
- **MemoryCore:** 25 операций, каждая атомарна с Journal event
- **Тесты:** 42, все проходят. 16-шаговый milestone без AI. Все 20 инвариантов M1–M20 покрыты тестами (Этап 1 завершён).
- **SQLite adapter (Этап 2):** полный набор репозиториев, Journal с auto-increment, Transaction с BEGIN/COMMIT, IdentityResolver через redirect. Persistence тест: close + reopen — память переживает перезапуск.
- **Filesystem ingestion (Этап 3):** SourceAdapter → Source → SourceItem → SourceVersion → Evidence. Повторный ingest unchanged = skip. Изменённый файл = новая SourceVersion (M3 append-only). Content hash проверен (M2). Репозитории Source/SourceItem/SourceVersion добавлены в оба adapter'а.
- **Sandboxing (Этап 3):** untrusted/sandboxed → Evidence state=unavailable. `requireEvidence` блокирует quarantined evidence в claims (handoff #40).
- **Candidate extraction (Этап 4):** ExtractionModel port + RegexExtractionModel (детерминированный). `extractFromEvidence`: Evidence → extraction → Candidate → Decision → Policy → Memory (Object + Claim/Relationship). Полный pipeline работает без AI.
- **tsc:** чисто для memory-core и для старого ядра.

### 1.3. Решения пользователя

1. Summary/Essence — representation layer, не память (подтверждено)
2. Support State вычисление — отложено до Phase 7/6
3. Acceptance test метрики — отложены до retrieval experiment
4. Три документа достаточно для Phase 3
5. Объём документов превышает протокол — принято продолжение
6. SemanticRepresentation — отложена до Phase 6 (реализована в Phase 7 как derived representation, не memory)

---

## 2. Ключевые выводы экспериментов

1. **Essence — entry point, не память.** Compression 51×, сохраняет Topic/Decision/Negation/Causality. Не сохраняет Time (0%), State (17%), Scope (33%).
2. **Claims — основа relationship discovery.** 48% recall, 5/7 C1–C7. Требуют temporal_state, lifecycle_state, support_state, scope как поля.
3. **Multi-hop paths — основа context reconstruction.** 65% recall, 6/7 C1–C7.
4. **Нет универсального представления.** Разные запросы требуют разных уровней: Essence для entry, Claims+Multi-hop для context, Original для verification.
5. **Многослойная retrieval architecture:** Essence → entry points; Claims+Multi-hop → context; Original → verification.

---

## 3. Что не сделано

| Пункт | Фаза | Причина |
|---|---|---|
| SQLite/Postgres adapter | Phase 7 (persistent) | Инфраструктура, не domain. Отложена до стабилизации. |
| HTTP API | Phase 12 | Инфраструктура. Не нужна для 16-шагового milestone. |
| CLI интеграция | — | Старый CLI работает со старым ядром. Замена — после стабилизации. |
| Semantic compression через LLM | Phase 5 (real) | Эксперимент аналитический. Программная валидация — будущий этап. |
| Acceptance test метрики | Phase 4 | Отложено по решению пользователя. |
| Support State вычисление | Phase 6 | Отложено по решению пользователя. |
| structure.md docs section | — | Обновлён (см. Top-Level Layout + Functional Cross-Reference Index). |

---

## 4. Следующие шаги

Рекомендуемый порядок:

1. **Stabilization.** Расширить покрытие инвариантов M2, M3, M6, M7, M8, M11–M18 тестами. 20 из 27 тестов — happy path; нужно больше negative cases.
2. **Persistent adapter.** SQLite как первый persistent adapter (простой, надёжный, локальный).
3. **Retrieval projections.** BM25/vector/graph/temporal как derived projections (не память).
4. **CLI/HTTP integration.** Через новые порты, не через старое ядро.
5. **Programmatic compression experiment.** Подтверждение Phase 5 программно.
6. **Cleanup старого ядра.** После замены CLI/bridge на новых портах — удалить `packages/core`.

---

## 5. Коммит-граница

Рекомендуемый первый commit:

```
docs/semantic-model/       # Phase 1–6 артефакты
packages/memory-core/      # Phase 7 implementation (partial)
structure.md               # updated
docs/semantic-model/STATUS.md  # this file
```

Старое ядро (`packages/core/`) не изменено.
