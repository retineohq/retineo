/**
 * RETINEO Core — Chinese (Simplified) Language Pack
 * Phase 4: Prompt templates and search tuning for Chinese.
 */

import type { LanguagePack } from '../language-pack.js';

export const zhPack: LanguagePack = {
  code: 'zh',
  name: '中文',
  prompts: {
    intentClassification: `将查询意图分类为以下之一：VAGUE（宽泛主题）、SECTION（具体章节）、PRECISION（精确事实）。

查询：{query}
语言：{language}

仅回复有效JSON：
{"intent": "vague|section|precision", "reason": "简要说明"}`,

    entityExtraction: `从查询中提取关键实体和代词。

查询：{query}
语言：{language}

仅回复有效JSON：
{"entities": ["..."], "pronouns": ["..."]}`,

    l2Generation: `你是知识提取引擎。根据结构化文档大纲，生成JSON格式的语义摘要。

文档：
{document}

仅回复有效JSON：
{
  "summary": "2-3段语义摘要",
  "concepts": ["概念1", "概念2", ...],
  "entities": ["实体1", "实体2", ...],
  "claims": ["事实陈述1", "事实陈述2", ...],
  "relations": [
    {"source": "概念A", "target": "概念B", "type": "depends_on"}
  ]
}`,

    contextAssembly: `你是上下文组装器。根据搜索结果，为LLM生成连贯的上下文以回答用户查询。

查询：{query}
语言：{language}

结果：
{results}

规则：
- 使用 [[sourceId]] 格式引用来源
- 遵守令牌预算：{maxTokens}
- 精确匹配优先于摘要`,
  },
  search: {
    defaultThreshold: 0.7,
    keywordBoost: 1.2,
    semanticBoost: 1.0,
  },
  intentPatterns: {
    vague: [
      /^(?:什么是|解释|介绍|描述|说明|告诉我关于|如何工作|如何使用|怎么做)/,
      /^(?:怎么|如何|为什么).+(?:工作|使用|运行|作用)/,
    ],
    precision: [
      /精确/,
      /第\s*\d+\s*行/,
      /第\s*\d+\s*页/,
      /时间戳/,
      /原文/,
      /引用/,
      /逐字/,
      /\d{1,2}:\d{2}/,
    ],
    section: [
      /章节/,
      /部分/,
      /标题/,
      /在.+(?:文件|文档|会议|通话)中/,
      /关于.+在/,
      /讨论了.+关于/,
    ],
  },
  scriptRegex: /[\u4E00-\u9FFF\u3400-\u4DBF]/,
};
