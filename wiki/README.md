# Proof Atlas Wiki

Proof Atlas 是一个本地、文件驱动的数学对象图工作台：Markdown 写正文，YAML 写对象元数据和依赖关系，本地网页负责浏览、跳转、渐进披露、校验问题展示和复制本地 AI 可定位的对象引用。

当前完整示例位于：

```text
examples/semidiscrete/ProofAtlas
```

## 目录树

```text
wiki/
  README.md
  guides/
    quick-start.md
    navigation.md
    concepts-and-workflows.md
    local-ai.md
  reference/
    projects-and-paths.md
    file-layout.md
    object-protocol.md
    edges.md
    routes-and-export.md
    markdown-links.md
    validation.md
    llm-suggestions.md
  design/
    philosophy.md
    generated-view-ui-tradeoffs.md
  examples/
    semidiscrete-paper.md
    splitting-guidelines.md
```

## 推荐阅读路径

新用户：

1. [快速开始](guides/quick-start.md)
2. [页面和跳转](guides/navigation.md)
3. [核心概念与操作流程](guides/concepts-and-workflows.md)
4. [半离散论文示例](examples/semidiscrete-paper.md)

写对象或让本地 AI 改对象：

1. [项目路径与最近项目](reference/projects-and-paths.md)
2. [文件结构](reference/file-layout.md)
3. [对象协议](reference/object-protocol.md)
4. [边语义](reference/edges.md)
5. [Route 与导出](reference/routes-and-export.md)
6. [Markdown 链接](reference/markdown-links.md)
7. [校验与常见错误](reference/validation.md)
8. [LLM / local AI suggestion 工作流](reference/llm-suggestions.md)

理解产品设计：

1. [设计理念](design/philosophy.md)
2. [核心概念与操作流程](guides/concepts-and-workflows.md)
3. [Generated View UI 取舍](design/generated-view-ui-tradeoffs.md)
4. [拆分粒度建议](examples/splitting-guidelines.md)

## 常用命令

```bash
npm install
npm run atlas -- check --strict examples/semidiscrete
npm run atlas -- dev examples/semidiscrete --port 3217
npm run atlas -- register examples/semidiscrete
npm run atlas -- projects
```
