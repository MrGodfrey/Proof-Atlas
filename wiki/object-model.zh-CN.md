# 对象模型

每个对象位于独立目录：

```text
objects/main.claim.null_controllability/
  object.yml
  statement.md
```

YAML 文件保存身份、元数据和图边。Markdown 文件保存数学正文。

## 最小对象

```yaml
uid: obj_20260611_a7f3
name: main.claim.null_controllability
kind: math
role: claim
title: "Main theorem: null controllability"
body:
  - statement.md
```

## 推荐对象

```yaml
uid: obj_20260611_a7f3
name: main.claim.null_controllability
kind: math
role: claim
display_as: theorem
importance: main
status: needs_check
title: "Main theorem: null controllability"
summary: Main theorem asserting low-mode control and a small final residual.
body:
  - statement.md
edges:
  uses:
    - main.claim.partial_null_control
    - main.claim.free_decay
```

## 身份

- `uid` 是永久的机器身份。
- `name` 是可读引用名，用在 Markdown 链接里。
- 改名时使用 `atlas rename`，这样链接、边、目录和 alias 会保持一致。

## Kind 和 Role

Kind：

```text
math
issue
note
```

常见 math role：

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

Issue role：

```text
gap
question
todo
risk
possible_error
review_concern
missing_reference
```

Note role：

```text
literature
ai_note
meeting
review_note
historical
scratch
external_context
```

## 边

正向边保存在 `object.yml`：

| 边 | 方向 | 含义 |
|---|---|---|
| `uses` | A -> B | A 依赖 B |
| `proves` | proof -> claim | A 证明 B |
| `blocks` | issue -> object | A 阻塞 B |
| `refines` | A -> B | A 是 B 的更精确版本 |
| `replaces` | A -> B | A 替代 B |
| `cites` | A -> source | A 引用 B |
| `related_to` | A <-> B | 弱相关 |

不要手写 `proved_by`、`blocked_by`、`used_by` 等反向边；Proof Atlas 会自动推导。

## 校验

运行：

```bash
npm run atlas -- check --strict <path-to-ProofAtlas>
```

严格校验会检查重复 ID、缺失正文文件、非法 schema 值、断边、断开的 Markdown 链接、非法 view 嵌入、对象正文中的嵌入，以及普通正文中的 TeX 宏定义。
