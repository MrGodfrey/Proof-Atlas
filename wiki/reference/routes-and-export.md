# Route 与导出

Route 是 Proof Atlas 用来回答“从某个对象出发，当前需要哪些上下文”的配方。
当前实现把 route 保存在 `views/*.route.yml`，网页只读取和展示它，CLI 负责创建、解析和导出。

代码事实源：

- `src/core/types.ts`：`RouteProfile`、`RepresentationMode`、`RouteView`。
- `src/core/graph.ts`：route YAML 归一化和 schema 校验。
- `src/core/routeResolver.ts`：profile 展开规则、proof 选择、boundary、representation 下限、token 估算。
- `src/core/contextExporter.ts`：Markdown / manifest / JSON 导出的物化规则。

注意：当前合法 representation 值是 `full`、`statement`、`summary`、`reference`、`omit`。不要写 `full_statement` 或 `full statement`。

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

## 最小 route

最小可用 route：

```yaml
schema_version: "0.1"
uid: view_20260618_partial_null_control
type: route
title: Why partial null controllability holds
target: main.claim.partial_null_control
profile: proof
```

省略字段的默认行为：

- `profile` 在代码路径里缺省按 `proof` 解析；写文件时建议显式写出。
- `proof_choices` 缺省为空，resolver 会按 proof 候选排序自动选择。
- `boundaries` 缺省为空。
- `representation` 缺省为空，resolver 会按 profile、hard/soft、对象角色和 selected proof 自动建议。
- `render` 缺省为空，网页仍能显示 Generated View。

## Profile 行为

| profile | 当前解析行为 |
|---|---|
| `meaning` | 展开 target 的 hard `requires` 传递闭包，遇到 boundary 停止。 |
| `proof` | 如果 target 是 claim，选择 proof，展开 proof 的 hard `uses`，递归处理被使用的 claim；同时展开 hard `requires`。 |
| `proof` with proof target | 以 proof 对象自身为 root，纳入它 `proves` 的 claim 作为上下文，并展开 proof 的 hard `uses`。不会为 proof 本身再找 proof。 |
| `audit` | 在 proof route 基础上纳入阻塞它的 issue 作为 soft context。 |
| `history` | 沿 hard `refines`、`replaces`、`cites` 展开历史和来源关系。 |

当前实现还会把 slice 内对象的直接 soft `requires` / `uses` 纳入，但不会对 soft 依赖继续做传递闭包。

选择 profile 的规则：

| 目标 | 推荐 profile | 原因 |
|---|---|---|
| 想让 AI 理解一个定义、模型、假设或 theorem statement | `meaning` | 只展开 statement/definition 所需的 hard `requires`，不寻找 proof。 |
| 想解释一个 claim 为什么成立 | `proof` | 自动选择或使用指定 proof，并展开 proof 的 hard `uses`。 |
| 想检查证明路线是否有风险 | `audit` | 在 proof route 基础上加入 `blocks` 它的 issue。 |
| 想追踪旧版本、替代关系、文献来源 | `history` | 沿 `refines`、`replaces`、`cites` 展开。 |

例子：

```yaml
# 只解释 forward system 的符号、空间和设定
target: main.model.forward_semidiscrete_system
profile: meaning
```

```yaml
# 解释主结论的证明路线
target: main.claim.null_controllability
profile: proof
proof_choices:
  main.claim.null_controllability: main.proof.lr_iteration
```

```yaml
# 审计主证明，把阻塞 issue 也放进 context
target: main.claim.null_controllability
profile: audit
```

如果对非 claim 对象使用 `proof` profile，代码会退化为展开 hard `requires` / `uses`，并给 `profile_target_mismatch` warning。

## Proof 选择

claim 的 proof 候选来自反向 `proved_by`，也就是 proof 对象上的：

```yaml
edges:
  proves:
    - target: main.claim.null_controllability
```

没有显式 `proof_choices` 时，resolver 会按以下顺序选择：

1. 排除 `disproved`、`obsolete`、`archived` proof。
2. 按 proof status 排序：`checked` > `needs_check` > `partial` > `draft`。
3. status 相同时按 importance 排序：`main` > `supporting` > `background` > `local`。
4. 再按对象名排序，保证确定性。

多个候选同时合理时，resolver 会给 `needs_confirmation` warning。此时建议在 route 文件里写明：

```yaml
proof_choices:
  main.claim.partial_null_control: main.proof.partial_null_control
```

显式选择必须满足：

- claim 对象存在。
- proof 对象存在。
- proof 的 `edges.proves` 指向该 claim。

如果显式选择了 `disproved`、`obsolete` 或 `archived` proof，代码会给 warning，但不会覆盖你的选择。

## Boundary

`boundaries` 表示“把这个对象作为已接受输入放进 context，但不再展开它的 outgoing hard dependencies”。

适合设为 boundary 的对象：

- 外部文献定理或导入结果。
- 已接受的大型背景定理，不想把其证明带进当前 route。
- 当前任务中可以当作黑箱的中间结论。

不适合设为 boundary 的对象：

- 当前 target。
- 当前需要审计的关键 proof。
- 你希望 AI 检查其依赖是否充分的对象。

例子：

```yaml
boundaries:
  - source.lue_2011
  - main.claim.partial_discrete_lr
```

boundary 对象仍然会进入 route 节点列表，并在 Markdown 导出中带有说明：

```text
Accepted boundary; dependencies are not expanded in this context.
```

## 表示粒度

`representation` 控制导出时每个对象给多少内容：

```text
full
statement
summary
reference
omit
```

每个值的含义：

| representation | 导出内容 | 何时使用 | 例子 |
|---|---|---|---|
| `full` | 导出对象 `body` 列表中的所有 Markdown 文件。 | target、selected proof、必须检查完整推理的构造或计算。 | `main.proof.lr_iteration: full`。 |
| `statement` | 只导出 statement-level source。 | hard dependency 需要明确陈述，但不需要它的证明。 | `main.claim.partial_null_control: statement`。 |
| `summary` | 只导出 `object.yml.summary`。没有 summary 时基本为空。 | soft context，AI 只需要知道对象大意。 | 文献背景、非核心 related object。 |
| `reference` | 只导出对象元数据，不导出正文。 | citation、provenance、仅需可定位名字的对象。 | `source.boyer_2010: reference`。 |
| `omit` | 不导出正文，token 估算为 0。 | 只用于 soft context 中你明确不想放入的对象。 | 把大型旁支 note 从 context 中拿掉。 |

`statement` 不是 “full statement” 的字符串写法。YAML 中只能写：

```yaml
representation:
  main.claim.partial_null_control: statement
```

不能写：

```yaml
representation:
  main.claim.partial_null_control: full statement
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

自动建议规则：

| 情况 | 默认建议 |
|---|---|
| route target | `full` |
| selected proof | `full` |
| soft dependency 有 `summary` | `summary` |
| soft dependency 没有 `summary` | `reference` |
| `audit` / `history` 中的 hard dependency | `reference` |
| hard claim dependency | `statement` |
| hard proof / proof_fragment dependency | `full` |
| external/imported hard object | `statement` |
| 其他 hard object 有 statement source | `statement` |
| 其他 hard object 没有 statement source | `full` |

覆盖建议时要先问两个问题：

1. 它是不是 hard dependency？如果是，不能低于当前 profile 的 floor。
2. 当前任务是否需要检查它的内部推理？如果需要，用 `full`；如果只需要陈述，用 `statement`。

常见写法：

```yaml
representation:
  # target 和 selected proof 通常 full
  main.claim.null_controllability: full
  main.proof.lr_iteration: full

  # hard supporting claims 通常 statement
  main.claim.partial_null_control: statement
  main.claim.free_decay: statement

  # 背景文献或软上下文通常 summary/reference
  source.lue_2011: reference
  main.note.introduction: summary
```

如果 route 解析时出现 `representation_below_floor` 或 `hard_dependency_omitted`，说明 representation override 太激进。把该对象升到 `statement` 或 `full`。

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

## 机器操作规则

本地 AI 或自动脚本改 route 时遵循这些规则：

1. 只在 `ProofAtlas/views/*.route.yml` 下新建或修改 route。
2. `target`、`proof_choices`、`boundaries`、`representation`、`render.order_hints` 优先使用对象 `name`，不要使用标题。
3. 收到 local reference 时优先用 `uid` 定位对象，再写回当前 `name`。
4. 新 route 必须写 `schema_version: "0.1"`、`type: route`、`uid`、`title`、`target`、`profile`。
5. `profile` 只能是 `meaning`、`proof`、`audit`、`history`。
6. `representation` 只能是 `full`、`statement`、`summary`、`reference`、`omit`。
7. 对 hard dependency 不要写 `omit`。
8. `proof_choices` 只能选择 `role: proof` 或 `role: proof_fragment` 且确实 `proves` 对应 claim 的对象。
9. 如果要减少 token，优先把 soft context 从 `summary` 降到 `reference`，不要先压缩 hard dependencies。
10. 修改后运行 `npm run atlas -- check --strict <paper-root-or-ProofAtlas-root>`。

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
