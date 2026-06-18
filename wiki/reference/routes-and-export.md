# Route 与导出

Route 是 Proof Atlas 用来回答“从某个对象出发，当前需要哪些上下文”的配方。
当前实现把 route 保存在 `views/*.route.yml`，网页只读取和展示它，CLI 负责创建、解析和导出。

## Route 文件 schema

当前 `views/*.route.yml` 支持这些字段：

```yaml
schema_version: "0.1"
uid: view_20260618_null_controllability
type: route
title: Why null controllability holds

target: main.claim.null_controllability
profile: proof

proof_choices:
  main.claim.null_controllability: main.proof.lr_iteration
  main.claim.partial_null_control: main.proof.partial_null_control

boundaries:
  - main.claim.partial_discrete_lr

representation:
  main.claim.null_controllability: full
  main.claim.partial_discrete_lr: statement

render:
  order: prerequisites_first
  show_graph: true
  show_status: true
  order_hints:
    - main.setting.probability_and_spaces
    - main.setting.domain_and_coefficients
```

字段含义：

| 字段 | 当前实现 |
|---|---|
| `schema_version` | 必须是 `"0.1"`。 |
| `uid` | route 身份；缺失会产生 strict error，但代码会用文件名生成 fallback 继续构图。 |
| `type` | 必须是 `route`。 |
| `title` | 左栏和 Generated View 标题；缺失会产生 strict error。 |
| `target` | route 根对象，使用对象 `name` 或可解析 alias。 |
| `profile` | `meaning`、`proof`、`audit`、`history`；缺失时按 `proof` 解析。 |
| `proof_choices` | claim name 到 proof object name 的显式选择；proof 必须 `proves` 该 claim。 |
| `boundaries` | 明确纳入但不继续展开 outgoing hard dependencies 的对象。 |
| `representation` | object name 到 `full`、`statement`、`summary`、`reference` 或 `omit`。 |
| `render.order` | 当前只支持 `prerequisites_first`。 |
| `render.show_graph` / `render.show_status` | 作为 route 渲染偏好保存；当前网页始终按 Generated View 支持图和状态展示。 |
| `render.order_hints` | 同层线性化排序提示；不改变依赖边。 |

`npm run atlas -- rename` 会重写 route 文件里的 `target`、`proof_choices`、`boundaries`、
`representation` 和 `render.order_hints`。

## Profile 行为

| profile | 当前解析行为 |
|---|---|
| `meaning` | 展开 target 的 hard `requires` 传递闭包，遇到 boundary 停止。 |
| `proof` | 如果 target 是 claim，选择 proof，展开 proof 的 hard `uses`，递归处理被使用的 claim；同时展开 hard `requires`。 |
| `proof` with proof target | 以 proof 对象自身为 root，纳入它 `proves` 的 claim 作为上下文，并展开 proof 的 hard `uses`。不会为 proof 本身再找 proof。 |
| `audit` | 在 proof route 基础上纳入阻塞它的 issue 作为 soft context。 |
| `history` | 沿 hard `refines`、`replaces`、`cites` 展开历史和来源关系。 |

当前实现还会把 slice 内对象的直接 soft `requires` / `uses` 纳入，但不会对 soft 依赖继续做传递闭包。

## 表示粒度

`representation` 控制导出时每个对象给多少内容：

```text
full
statement
summary
reference
omit
```

当前下限规则：

| profile | hard dependency floor | soft dependency floor |
|---|---|---|
| `proof` | `statement` | `reference` |
| `meaning` | `statement` | `reference` |
| `audit` | `reference` | `reference` |
| `history` | `reference` | `reference` |

hard dependency 不能设为 `omit`。在 `proof` / `meaning` 中，如果 hard dependency 需要
`statement` 但对象没有可抽取 statement source，会产生内容充分性诊断。

当前导出器的 statement 物化规则：

- 任意对象只要有 `statement.md`，`statement` 表示就使用 `statement.md`。
- `setting` / `notation` / `definition` / `model` / `construction` / `calculation`
  没有 `statement.md` 时，可使用第一个 body 文件作为 `statement`。
- 其他对象，包括 `claim`、`problem`、`assumption`、`equation`、`proof`、`proof_fragment`
  和 `note`，没有 `statement.md` 时不能可靠物化为 `statement`；导出时会记录诊断并尽量退回到 summary。
- proof route 中，selected proof 通常使用 `full`。

## CLI：解析 route

命令形式：

```bash
npm run atlas -- route <target-or-route> [project] [options]
```

常用例子：

```bash
npm run atlas -- route main.claim.null_controllability \
  examples/semidiscrete/ProofAtlas \
  --profile proof
```

也可以直接解析已有 route 文件：

```bash
npm run atlas -- route views/null_controllability.route.yml \
  examples/semidiscrete/ProofAtlas
```

支持的选项：

| 选项 | 作用 |
|---|---|
| `--profile <profile>` | 从对象 target 临时创建 route 时使用的 profile。 |
| `--save <file>` | 把解析后的 route recipe 保存到项目内。 |
| `--proof-choice <claim=proof>` | 显式选择某个 claim 的 proof；可重复。 |
| `--boundary <name>` | 设置 boundary；可重复。 |
| `--representation <name=mode>` | 设置表示粒度 override；可重复。 |

`--save` 会把当前解析出的 selected proofs、boundaries 和每个节点的 representation
写入 route 文件。保存路径相对 `ProofAtlas/` 根目录解析，常见写法是：

```bash
npm run atlas -- route main.claim.null_controllability \
  examples/semidiscrete/ProofAtlas \
  --profile proof \
  --boundary main.claim.partial_discrete_lr \
  --representation main.claim.partial_discrete_lr=statement \
  --save views/null_controllability.route.yml
```

`npm run atlas -- route` 输出包括 route 是否闭合、cloud context 是否内容充分、对象数量、估算 token、
selected proofs、boundaries、每个节点的 witness path 和 marginal cost。

## CLI：导出 context

命令形式：

```bash
npm run atlas -- export <route-file> [project] [options]
```

支持格式：

| format | 输出 |
|---|---|
| `markdown` | 面向云端 AI 的物化 Markdown context。默认格式。 |
| `manifest` | 面向本地 AI 的 JSON manifest，不包含完整正文。 |
| `json` | manifest 加 resolved route 结构。 |

例子：

```bash
npm run atlas -- export views/null_controllability.route.yml \
  examples/semidiscrete/ProofAtlas \
  --format markdown \
  --output /tmp/null-control-context.md \
  --snapshot snapshots/null-control.snapshot.yml
```

当前路径规则：

- `--output` 是绝对路径时按原路径写；相对路径时相对当前 shell 工作目录。
- `--snapshot` 是绝对路径时按原路径写；相对路径时相对 `ProofAtlas/` 根目录。
- 不传 `--output` 时，导出内容写到 stdout。

Markdown 导出会：

- 输出 Task、Selected Proof Route、Target、Definitions and Settings、Boundaries、Supporting Claims、Proofs、Issues、Source Manifest 和 Diagnostics。
- 给每个对象段落附带 `uid`、`name`、`status`、`provenance`、source path、representation、decision、hardness 和 project。
- 把 slice 内部的 `[[object.name]]` / `![[object.name]]` 改写成 Markdown anchor 链接。
- 对 slice 外引用标注 `not included in this context`。
- 对 slice 外 hard dependency 链接产生诊断。

Snapshot 是冻结材料：

```yaml
schema_version: "0.1"
type: snapshot
exported_at: ...
project_uid: ...
graph_built_at: ...
route: ...
object_names: [...]
markdown: ...
diagnostics: [...]
```

它用于记录当时实际喂给云端 AI 的完整 Markdown，而不只是 route 配方。
