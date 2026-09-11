# Experiments & Research

This document separates work that is implemented in `packages/core/src` from
experimental ideas and future research directions. It is intentionally
conservative: nothing here should be read as a finished product capability
unless it is also described in the architecture documentation.

## Implemented foundations

Retineo already contains several building blocks that can support
relationship-oriented analysis:

| Capability | Where it lives | Status |
|---|---|---|
| Document graph inputs: parent/child segments | `ContextNode.parentHash`, `ContextNode.childrenIds`, Registry | Implemented |
| Explicit semantic links | `ContextNode.semanticLinks` (`targetHash`, `reason`) | Data model implemented; Core does not populate links automatically |
| In-document concept relations | `L2Artifact.relations` (`source`, `target`, `type`) | LLM extraction contract implemented |
| Content-based similarity | `findSimilar` / `POST /v1/similar` / `retineo similar` | Implemented, with semantic and exact modes |
| Text references | Wikilinks, Markdown links, backtick references, and bare `.md`/`.txt` mentions | Parsed by the orphan metric |
| Document connectivity | Explicit links, text references, child segments, and basename mentions in L2 summaries | Used by `retineo health` to detect orphaned documents |

This is not yet a graph engine. There is no general traversal API, no
relationship taxonomy, and no automatic cross-document relation discovery in
the open-source Core.

## Similarity is not relationship discovery

The current similarity API answers a narrow question: “which documents are
nearest to this one in embedding space, or byte-identical to it?” That is
useful for duplicate detection and neighbour browsing, but it does not
classify *why* two documents are related.

The current research direction is to move from untyped similarity to typed,
evidence-backed edges such as:

- `contradicts`
- `supersedes`
- `supports`
- `complements`
- `elaborates`
- `depends_on`

The L2 prompt already asks for concept-level `relations`, and `SemanticLink`
provides a document-level storage shape, but Core does not currently infer or
persist these relationship types automatically.

## Conceptual relationship example

The following is a conceptual example, not current CLI output. It illustrates
why relationships can carry meaning that pair-by-pair similarity does not:

```text
meeting-2024-05.md
  ↓ proposes price change
pricing-analysis.md
  ↓ identifies risk
support-report-2024-06.md
  ↓ reports churn spike
postmortem.md
```

Semantic search could retrieve each document for a different query. A
relationship layer could additionally expose the causal chain: proposal →
risk analysis → observed effect → retrospective. In that chain, the meaning
of the support report depends partly on its relationship to the earlier
proposal, not only on the words it contains.

## Open research questions

- How can typed relationships be proposed with enough confidence for a human
  to review them without creating noisy graphs?
- How should contradictions and supersession be represented when documents
  change over time?
- How can concept-level relations from L2 be aggregated into reliable
  document-level relations?
- How should relationships be versioned in a content-addressable store where
  every artifact is immutable?
- Which relationships are best derived from explicit references, which from
  content similarity, and which require LLM judgment?

## Future retrieval directions

- Traverse accepted semantic links instead of returning only ranked documents.
- Use relationship type as a filter, for example: show only documents that
  supersede a decision.
- Combine text references, structural links, and semantic neighbours into a
  weighted graph.
- Use graph context to rerank search results when connected documents are
  collectively relevant.

None of these directions are current `retineo search` behaviour.
