# RETINEO — Phase 4 Retrieval Experiment

> Аналитический эксперимент по разделам 65–68 handoff.
> Три документа A (HANDOFF_Q), B (DOMAIN-SPEC v0.1), C (TECH-SPEC v0.2).
> Сравниваются: chunk retrieval (baseline), essence retrieval, knowledge
> retrieval, context retrieval. Результат — аналитический документ, не код.

---

## 1. Материал

| Документ | Слов | Essence A (слов) | Essence B (слов) | Claims | Relationships | Multi-hop paths |
|---|---|---|---|---|---|---|
| A: HANDOFF_Q | 1961 | ~120 | ~90 (structured) | 17 | 17 | — |
| B: DOMAIN-SPEC v0.1 | 2741 | ~85 | ~120 (structured) | 20 | 23 | 12 |
| C: TECH-SPEC v0.2 | 2549 | ~85 | ~130 (structured) | 14 | 15 | 6 |

Semantic compression ratio (оригинал → Essence A):

| Документ | Оригинал (слов) | Essence A (слов) | Ratio |
|---|---|---|---|
| A | 1961 | ~120 | 16.3× |
| B | 2741 | ~85 | 32.2× |
| C | 2549 | ~85 | 30.0× |

---

## 2. Тестовые запросы

Пять запросов, проверяющих разные требования handoff (разделы 65, 82):

### Q1 — Topic discovery

> Что такое Retineo и зачем он нужен?

Ожидается: обе версии (A, B, C) релевантны. Простая тема.

### Q2 — Causal chain

> Почему предыдущая реализация Retineo была отвергнута?

Ожидается: A — прямой ответ. B и C — подтверждение через инварианты.
Требует multi-hop: A → B → C.

### Q3 — Supersession / уточнение

> Что такое Summary и Essence? В чём их различие?

Ожидается: A — определение и различие. B — классификация («not memory»).
Решение пользователя (representation layer) — связка между A и B.

### Q4 — Architectural boundary

> Может ли LLM напрямую изменить память?

Ожидается: B (M13), C (#34). A формулирует принцип. Ответ требует
знания инвариантов, не topic similarity.

### Q5 — Implementation readiness

> Что нужно, чтобы начать реализацию Memory Core?

Ожидается: B (#42, minimum operations), C (#39–#40, implementation phases,
first milestone). A не отвечает на этот вопрос напрямую.

---

## 3. Retrieval стратегии

### 3.1. Baseline: chunk retrieval

Модель: документ → chunks (~200 слов) → embedding → top-k → LLM.

Применительно к нашим трём документам: каждый документ нарезается на
примерно 10–14 chunks. Запрос матчится против chunks.

### 3.2. Essence retrieval

Модель: Essence (вариант A или B) → embedding → entry point → к документу.

Три essence на выбор (по одному на документ). Запрос матчится против essence.

### 3.3. Knowledge retrieval

Модель: Claims + Objects из артефактов → matching по формулировке.

Для A: 17 claims, B: 20 claims, C: 14 claims. Общий пул — 51 claim.

### 3.4. Context retrieval

Модель: multi-hop пути из cross-document analysis → traversal.

Для A→B: 12 подтверждённых связей. Для B→C: 6 multi-hop путей.
Запрос находит entry point, затем проходит по relationships.

---

## 4. Аналитическое сравнение

### Q1 — Topic discovery

| Стратегия | Что находит | Оригинал требуется | Оценка |
|---|---|---|---|
| Chunk | Relevant chunks из всех 3 документов | ~3 chunks из каждого = ~9 chunks | ✅ |
| Essence | Все 3 essence, выбор нужного | 1 essence → весь документ | ✅ |
| Knowledge | Claims «Retineo is...», «Core stores...» | 1–2 claims | ✅ |
| Context | Entry point в A → traversal | 1 entry point | ✅ |

**Результат:** все стратегии работают. Chunk baseline конкурентоспособен
на простых topic-запросах. Эссенция не даёт преимущества для Q1.

### Q2 — Causal chain (multi-hop)

| Стратегия | Что находит | Оригинал требуется | Оценка |
|---|---|---|---|
| Chunk | Chunks про «отвергнута», но цепочка разорвана | ~5 chunks из A + LLM реконструкция | ❌ реконструкция, не retrieval |
| Essence | Essence A: «отказ от RAG-подхода» → документ A | 1 essence → полное чтение A | ⚠️ частично |
| Knowledge | Claim «chunk-level retrieval разрушает смысл» (A) + подтверждение в B | 1–2 claims | ✅ |
| Context | Multi-hop A #74.5 → B #45 → C #31 | 1 путь, 3 узла | ✅ лучший |

**Результат:** chunk retrieval требует реконструкции (то, что handoff
критикует в разделе 2.2). Essence даёт входную точку, но не цепочку.
Knowledge и Context retrieval восстанавливают причинную связь напрямую.

### Q3 — Supersession / уточнение

| Стратегия | Что находит | Оригинал требуется | Оценка |
|---|---|---|---|
| Chunk | Chunks про Summary/Essence из A, chunks про «not memory» из B | ~4 chunks | ⚠️ нужно соединение |
| Essence | Essence A + Essence B, оба упоминают Summary | 2 essence | ✅ |
| Knowledge | Claim «Summary/Essence не строятся друг из друга» (A) + claim «Summaries not memory» (B) | 2 claims | ✅ |
| Context | User-confirmed decision (representation layer) — связь между A и B | 1 связь | ✅ лучший |

**Результат:** Context retrieval использует решение пользователя, которое
связывает оба документа. Chunk и Knowledge дают фрагменты, требующие синтеза.

### Q4 — Architectural boundary

| Стратегия | Что находит | Оригинал требуется | Оценка |
|---|---|---|---|
| Chunk | Chunks про «security», «boundary» из C | ~2–3 chunks | ⚠️ косвенно |
| Essence | Essence C: «no direct mutation path» | 1 essence | ✅ |
| Knowledge | Claim «Нет прямого пути source/LLM/agent → Memory» | 1 claim | ✅ |
| Context | Security boundary pipeline (C #34) + инвариант M13 (B/C) | 1 узел + 1 инвариант | ✅ |

**Результат:** все стратегии работают, кроме chunk (косвенно).
Knowledge retrieval даёт самый прямой ответ.

### Q5 — Implementation readiness

| Стратегия | Что находит | Оригинал требуется | Оценка |
|---|---|---|---|
| Chunk | Chunks про «implementation order» из C, «minimum operations» из B | ~4 chunks | ⚠️ разрозненно |
| Essence | Essence C: «first milestone — 16-step scenario without AI» | 1 essence → полный C | ✅ |
| Knowledge | Claims из B (#42) и C (#39–#40) | 2–3 claims | ✅ |
| Context | Путь: B #42 (minimum operations) → C #39 (12 фаз) → C #40 (milestone) | 1 путь | ✅ лучший |

**Результат:** Context retrieval снова лучший — соединяет minimum operations
с implementation phases. Chunk требует синтеза разрозненных фрагментов.

---

## 5. Сводная таблица

| Запрос | Chunk | Essence | Knowledge | Context | Лучший |
|---|---|---|---|---|---|
| Q1 topic | ✅ | ✅ | ✅ | ✅ | ничья |
| Q2 causal chain | ❌ | ⚠️ | ✅ | ✅ | Context |
| Q3 supersession | ⚠️ | ✅ | ✅ | ✅ | Context |
| Q4 boundary | ⚠️ | ✅ | ✅ | ✅ | Knowledge/Context |
| Q5 readiness | ⚠️ | ✅ | ✅ | ✅ | Context |

| Метрика | Chunk | Essence | Knowledge | Context |
|---|---|---|---|---|
| Simple topic recall | высокий | высокий | высокий | высокий |
| Causal chain recovery | низкий | средний | высокий | высокий |
| Original text required | много | средне | мало | мало |
| Reconstruction burden | на LLM | средняя | низкая | минимальная |

---

## 6. Ответы на ключевые вопросы handoff

### 6.1. Сколько original text требуется? (раздел 66)

| Стратегия | Для Q2 (causal chain) |
|---|---|
| Chunk | ~5 chunks × ~200 слов = ~1000 слов → LLM реконструирует |
| Essence | ~85 слов essence → документ полностью (~2000–2700 слов) |
| Knowledge | 1–2 claims (~40 слов) |
| Context | 1 multi-hop путь (~50 слов) |

**Вывод:** Knowledge и Context retrieval требуют минимального original text.
Essence — среднее значение: essence мала, но для полного ответа нужен original.
Chunk — худший вариант: передаёт много текста в LLM для реконструкции.

### 6.2. Semantic compression ratio (раздел 67)

Компрессия оригинала в essence: 16–32× (см. раздел 1).

Для relationship discovery (центральная гипотеза, раздел 81 B):

| Уровень | Объём для 3 документов | Содержит связи? |
|---|---|---|
| Original chunks | ~7250 слов (100%) | нет — связи неявные |
| Essence A+B+C | ~290 слов (4%) | частично — сжатые формулировки |
| Claims (knowledge) | ~200 слов (3%) | да — явные claims с provenance |
| Multi-hop paths (context) | ~6 путей (~300 слов) | да — явные связи между документами |

**Вывод:** Essence сохраняет тему, но не связи между документами.
Claims и multi-hop paths сохраняют связи при 3–4% объёма оригинала.
Центральная гипотеза handoff (раздел 81, Hypothesis B) подтверждается
аналитически: essence сохраняет достаточно семантики для retrieval,
но для relationship discovery нужны knowledge/context структуры.

### 6.3. Contradiction/change classification (раздел 68)

Три документа не содержат противоречий или supersession. Cross-document
analysis (в артефактах A, B, C) подтвердила: связи — развитие/подтверждение,
не противоречие.

**Но:** механизм классификации (contradicts vs supersedes vs updates vs unrelated)
уже применён в артефакте B (раздел 8.3) и C (раздел 8.4). Он работает на
claims и multi-hop путях. Для chunk retrieval этот механизм недоступен —
чанки дают similarity, не классификацию.

**Вывод:** contradiction detection требует knowledge-level структур
(claims с provenance и temporal state), не essence или chunks.
Подтверждает Hypothesis C из раздела 81 handoff: relationships дают больше,
чем retrieved chunks.

---

## 7. Выводы

### 7.1. Подтверждённые гипотезы

| Гипотеза из handoff | Статус | Доказательство |
|---|---|---|
| **H-A:** Essence сохраняет достаточно семантики для retrieval | ✅ подтверждена | Essence даёт правильный вход для всех 5 запросов (таблица раздел 5) |
| **H-B:** Essence сохраняет достаточно семантики для cross-document relation discovery | ⚠️ частично | Essence находит документы, но связи извлекаются из claims/multi-hop, не из essence |
| **H-C:** Relationships дают больше, чем retrieved chunks | ✅ подтверждена | Context retrieval решает Q2–Q5 без реконструкции; chunk — нет |
| **H-D:** Original можно отложить до verification | ✅ подтверждена | Для Q1–Q5 original требовался только для детальной проверки (раздел 6.1) |
| **H-E:** Multi-resolution уменьшает retrieval complexity | ✅ подтверждена | Compression ratio 16–32× при сохранении retrieval способности (раздел 6.2) |
| **H-F:** Context reconstructable from compact representations | ✅ подтверждена | Multi-hop пути из раздела 8.4 артефакта C восстанавливают причинные цепочки |

### 7.2. Что не подтверждено

- **H-B (частично):** Essence для relationship discovery. Аналитический
  результат показывает: essence находит документ, но связи между документами
  извлекаются из claims и multi-hop путей. Essence как «одна универсальная
  единица» недостаточна — нужны knowledge-level структуры.

### 7.3. Итоговая рекомендация

Retrieval architecture должна быть **многослойной**:

1. **Essence** — entry points (быстрый поиск документа)
2. **Knowledge (claims/relationships)** — relationship discovery
3. **Context (multi-hop paths)** — причинная реконструкция
4. **Original** — verification, когда semantic representation недостаточна

Это соответствует модели из handoff (раздел 66): essence → entry point,
затем traversal по knowledge/context структурам.

### 7.4. Ограничения эксперимента

- Аналитический, не программный. Реальные embeddings и similarity не вычислялись.
- Три документа одной категории (концептуальный handoff + доменная спецификация
  + техническая спецификация). Обобщаемость на другие категории (ADR, incident
  report, meeting notes) не проверена.
- Запросы сформулированы автором артефактов. Независимая валидация отсутствует.
- Сжатие (essence) выполнено вручную, без LLM. Автоматическое извлечение
  может дать другой результат.

Эти ограничения соответствуют требованию handoff раздела 79.0:
результат фиксируется как рабочая гипотеза, требующая программного
подтверждения в Phase 5.

---

## 8. Следующий шаг

Phase 5 (compression experiment) из handoff раздел 79:

```text
tokens
semantic recall
relationship recall
answer correctness
```

Phase 5 требует программной реализации. Требуется решение пользователя:
переходить ли к Phase 5 (код) или фиксировать текущее состояние как
достаточное для перехода к Phase 6 (domain model definition).
