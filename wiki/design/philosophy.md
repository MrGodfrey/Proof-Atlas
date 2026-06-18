# 设计理念

## 对象图，而不是线性大纲

数学论文最终是线性的，但数学研究过程不是线性的。

一个证明往往不是：

```text
Step 1 -> Step 2 -> Step 3
```

而是：

```text
对象 A 使用对象 B、C
对象 D 证明对象 A
对象 E 阻塞对象 D
对象 F 是 D 的失败路线
对象 G 替代 F
```

Proof Atlas 的核心不是大纲，而是对象图。

## 文件是事实源

Proof Atlas 不把数据锁在数据库里。`ProofAtlas/` 目录就是事实源，git 可以记录历史，本地 AI 可以直接读写文件，用户也可以用普通编辑器维护对象。

好处：

- 可审计：每个对象就是本地文件。
- 可迁移：没有服务端数据库绑定。
- 可协作：可以用已有 git 工作流。
- 可被本地 AI 精确修改：AI 不需要网页导出一大段上下文，只要拿到 `uid` 和路径。

这也决定了 Web UI 的边界：网页负责浏览、跳转、诊断和复制引用；真正写文件的动作交给 CLI、本地 AI 或编辑器。这样每次修改都可以被 git diff 审计。

## 最小对象模型

底层 `kind` 只有：

```text
math
issue
note
```

定理、引理、命题、估计、证明、构造这些差异不做成底层类型，而用 `role` 和 `display_as` 表达。这样可以避免用户反复纠结“这段到底算 lemma 还是 estimate”，也允许一个对象随着写作阶段改变展示方式。

## 渐进披露

Proof Atlas 不应该一上来把整篇长证明铺满。它应该先显示结构，再让用户按需展开：

1. 在 dashboard 看主问题、主结论和当前风险。
2. 在 paper view 按论文顺序阅读。
3. 点开 proof 卡片看证明。
4. 从证明里的链接进入引理。
5. 从引理右栏看依赖、证明对象、阻塞 issue 和文献。

这就是“可点击的论文”：保留线性阅读体验，但允许随时顺着对象图跳转。

## Route 是可解释的依赖切片

Generated View 不是让 LLM 每次临时生成一篇文章，而是保存一个可重复解析的 route 配方：

```text
target
profile
proof choices
boundaries
representation
```

resolver 根据这个配方计算依赖 slice，并解释每个对象为什么被纳入。它要回答的问题包括：

- 这个 claim 当前采用哪条证明路线？
- 这条路线是否闭合？
- 哪些对象是 hard dependency，哪些只是 soft/background？
- 哪些对象是人为 boundary？
- 导出给云端 AI 时，hard dependency 是否有足够 statement？
- 如果要裁剪 context，哪些对象可以降级，代价是多少？

所以 Generated View 里的 `Linear` 和 `Graph` 都是同一个 resolved route 的只读投影。图帮助理解结构，但不是编辑器。

## 内容充分优先

Proof Atlas 的云端导出目标不是把 token 压到最小，而是先保证上下文充分、来源可追溯、内部链接可读。

在 proof / meaning context 中，hard dependency 不能只剩 `reference`。它至少需要可读的 `statement`，否则云端 AI 看到的是一串对象名，而不是可验证的数学材料。

token estimate 和 marginal cost 是裁剪建议，不是默认优化目标。

## 本地 AI 闭环

网页不复制完整上下文给 AI，而是复制稳定引用：

```text
uid
name
path
body files
optional selection excerpt
```

本地 AI 根据引用读取对象、依赖和 issue，然后修改文件。网页文件监听后自动重建。这个闭环比把大量正文塞进剪贴板更可靠。

云端 AI 则相反：它不能读本地文件，所以需要 `npm run atlas -- export ...`
生成完整 Markdown context。Local AI reference 和 cloud export 是两种不同工具，不应该混用。
