# 边语义

`edges` 是对象之间的有向边。v0.1 支持：

```text
requires
uses
proves
blocks
refines
replaces
cites
related_to
```

| 边 | 方向 | 含义 |
|---|---|---|
| `requires` | A -> B | 为了陈述、读懂或解释 A，需要先有 B |
| `uses` | A -> B | 为了证明、推导、构造或计算 A，实际使用 B |
| `proves` | proof -> claim | A 是证明对象，证明 B |
| `blocks` | issue -> object | A 阻塞 B |
| `refines` | A -> B | A 是 B 的更精确版本 |
| `replaces` | A -> B | A 取代 B |
| `cites` | A -> source | A 引用文献或外部对象 B |
| `related_to` | A <-> B | 弱相关，不表示依赖 |

## 不写反向边

不要手写：

```yaml
proved_by:
blocked_by:
used_by:
required_by:
```

这些由系统从正向边自动推导。

## 例子

```yaml
name: main.proof.lr_iteration
kind: math
role: proof
edges:
  proves:
    - target: main.claim.null_controllability
  uses:
    - target: main.claim.partial_null_control
      strength: hard
      reason: Supplies the one-window control.
    - target: main.claim.free_decay
      strength: hard
```

对应的主定理右栏会自动显示：

```text
proved_by main.proof.lr_iteration
```

## 建议

- claim 通常写 statement context 到 `requires`，不要把证明依赖直接写在 claim 的 `uses` 上。
- proof 和 claim 的关系通过 `proof -> proves -> claim` 表达。
- issue 的阻塞关系用 `issue -> blocks -> object`。
- 文献来源用 `cites`，不要把文献写成普通 `uses`。

## EdgeRef schema

每个 edge entry 是对象形式：

```yaml
- target: main.setting.discrete_mesh
  strength: hard
  reason: The formula uses the mesh norm.
```

`target` 必填。`strength` 默认 `hard`，可写 `hard` 或 `soft`。`reason` 可选。

严格校验不接受旧字符串形式：

```yaml
uses:
  - main.claim.some_result
```

## Hard dependency projection

严格 cycle check 只看 hard `requires` 和 hard `uses`：

```text
G_dep = hard requires + hard uses
```

`proves`、`cites`、`blocks`、`refines`、`replaces`、`related_to` 不进入 hard dependency cycle check。
