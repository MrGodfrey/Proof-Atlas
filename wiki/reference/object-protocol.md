# 对象协议

每个对象由 `object.yml` 和一个或多个 Markdown body 文件组成。

最小形式：

```yaml
uid: obj_20260611_a7f3
name: main.claim.null_controllability
kind: math
role: claim
title: "Main theorem: phi-null controllability with drift control"
body:
  - statement.md
```

推荐完整形式：

```yaml
uid: obj_20260611_a7f3
name: main.claim.null_controllability
kind: math
role: claim
display_as: theorem
importance: main
status: needs_check
title: "Main theorem: phi-null controllability with drift control"
summary: Main theorem asserting low-mode null control, a uniform drift-control bound, and exponentially small final residual.
body:
  - statement.md
edges:
  requires:
    - target: main.model.forward_semidiscrete_system
      reason: The theorem statement refers to the controlled system.
  cites:
    - target: source.lue_2011
```

## `uid`

机器身份，创建后不应改变。

格式：

```text
obj_[0-9]{8}_[a-z0-9]{4,8}
```

不要手写语义化 uid，例如 `obj_main_theorem`。

## `name`

人类可读的语义引用名，Markdown 链接和 view 嵌入使用它。

推荐格式：

```text
[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+
```

例子：

```text
main.claim.null_controllability
main.proof.lr_iteration
main.issue.adaptedness
source.boyer_2010a
```

如果要改名，使用 `npm run atlas -- rename`，不要只手改 `object.yml`。

## `kind`

允许值：

```text
math
issue
note
```

含义：

- `math`：数学内容，包括问题、设定、模型、定义、结论、证明、构造、计算、例子、反例。
- `issue`：当前研究中的问题、缺口、风险或待检查处。
- `note`：非核心数学对象，包括文献笔记、AI 讨论、历史说明、审稿意见、外部上下文。

## `role`

`math` role：

```text
problem
setting
notation
definition
model
assumption
claim
proof
proof_fragment
construction
calculation
example
counterexample
```

`issue` role：

```text
gap
question
todo
risk
possible_error
review_concern
missing_reference
```

`note` role：

```text
literature
ai_note
meeting
review_note
historical
scratch
external_context
```

推荐用法：

- 定理、引理、命题、推论、重要估计：`kind: math`, `role: claim`。
- 完整证明：`kind: math`, `role: proof`。
- 局部证明片段或失败路线：`kind: math`, `role: proof_fragment`。
- 常数估计、代数整理：`kind: math`, `role: calculation`。
- 构造控制、时间网格、截断函数：`kind: math`, `role: construction`。

## `display_as`

控制网页展示样式，不改变对象身份。

允许值：

```text
plain
problem
setting
notation
definition
assumption
equation
theorem
lemma
proposition
corollary
conjecture
proof
proof_fragment
estimate
construction
calculation
example
counterexample
remark
issue
gap
question
todo
warning
note
literature_note
ai_note
review_note
meeting_note
```

同一个 `role: claim` 可以展示成 theorem、lemma、proposition、corollary、estimate 或 equation。

## `importance`

允许值：

```text
main
supporting
background
local
```

含义：

- `main`：主问题、主结论、主证明路线或主要阻塞点。
- `supporting`：证明主线所需的重要辅助对象。
- `background`：设定、定义、文献背景、标准工具。
- `local`：只服务于局部论证或临时讨论的对象。

## `status`

允许值：

```text
draft
partial
needs_check
checked
open
resolved
disproved
obsolete
archived
```

推荐含义：

| status | 含义 |
|---|---|
| `draft` | 刚写下，结构和内容都可能改 |
| `partial` | 有实质内容，但明显未完成 |
| `needs_check` | 看起来可用，但需要复核 |
| `checked` | 已复核，当前认为可靠 |
| `open` | issue 尚未解决 |
| `resolved` | issue 已解决 |
| `disproved` | 发现为错误路线或错误命题 |
| `obsolete` | 被替代，不再作为当前路线使用 |
| `archived` | 保留历史记录，默认视图可以隐藏 |

推荐组合：

- `math`：`draft`, `partial`, `needs_check`, `checked`, `disproved`, `obsolete`, `archived`
- `issue`：`open`, `resolved`, `obsolete`, `archived`
- `note`：`draft`, `checked`, `obsolete`, `archived`

不要写 `status: false`。错误路线用 `status: disproved`，被替代路线用 `status: obsolete`。

## `priority`

只用于 `issue`。

```text
blocker
high
normal
low
```

## `provenance`

表示信任边界。

```text
internal
external
imported
```

文献结果通常是 `provenance: external`。

## `edges`

`edges` 只写正向边。v1 的 edge ref 使用对象形式：

```yaml
edges:
  requires:
    - target: main.setting.spectral_spaces
      strength: hard
      reason: The statement uses the spectral projectors.
  uses:
    - target: main.claim.observability
      strength: hard
  cites:
    - target: source.boyer_2010a
```

字段：

- `target`：必填，对象 `name` 或可解析 alias。
- `strength`：可选，`hard` 或 `soft`，默认 `hard`。
- `reason`：可选，说明依赖原因。

`requires` 表示读懂或陈述当前对象所需的上下文。`uses` 表示证明、推导、构造或计算实际使用的数学依赖。通常 claim 写 `requires`，proof/proof_fragment 写 `proves` 和 `uses`。

严格 schema 不接受旧的字符串列表形式：

```yaml
edges:
  uses:
    - main.claim.old_style
```
