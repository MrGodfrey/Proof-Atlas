# Route 与导出

Route 是 Proof Atlas 用来回答“某个 proof-obligation claim 当前如何被证明”的配方。
当前实现把 route 保存在 `views/*.route.yml`，网页只读取并展示 proof tree，CLI 负责创建、解析和导出。

代码事实源：

- `src/core/types.ts`：`RouteProfile`、`RepresentationMode`、`RouteView`。
- `src/core/graph.ts`：route YAML 归一化和 schema 校验。
- `src/core/proofObjects.ts`：proof-obligation claim 判断。
- `src/core/routeResolver.ts`：proof 展开规则、proof 选择、boundary、representation 下限、token 估算。
- `src/core/routeProofTree.ts`：把 resolved route 投影成网页 Proof Tree。
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
  - source.boyer_2010a.claim.partial_discrete_lr

representation:
  main.claim.null_controllability: full
  source.boyer_2010a.claim.partial_discrete_lr: statement

render:
  order: prerequisites_first
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
| `target` | route 根对象，必须是 proof-obligation claim，使用对象 `name` 或可解析 alias。 |
| `profile` | 只能是 `proof`；缺失时按 `proof` 解析。 |
| `proof_choices` | claim name 到 proof object name 的显式选择；proof 必须 `proves` 该 claim。 |
| `boundaries` | 明确纳入但不继续展开 outgoing hard dependencies 的对象。 |
| `representation` | object name 到 `full`、`statement`、`summary`、`reference` 或 `omit`。 |
| `render.order` | 当前只支持 `prerequisites_first`。 |
| `render.order_hints` | 同层排序提示；不改变依赖边，也不暗示 Linear View。 |

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
- `representation` 缺省为空，resolver 会按 proof route、hard/soft、对象角色和 selected proof 自动建议。
- `render` 缺省为空，网页仍能显示 Proof Tree。

## Proof Tree 行为

Generated View 只支持 `profile: proof`，并生成一个 Proof Tree。

合法 target 必须是 proof obligation：

```text
kind: math
role: claim
display_as != statement
display_as != estimate
```

定理、引理、命题、推论、猜想和普通 claim 可以作为根节点。`proof`、`proof_fragment`、
`construction`、`calculation`、`definition`、`setting`、`model`、`statement`、`estimate`、
`problem`、`note` 和 `issue` 不能作为 Generated View 根节点。

如果 `profile: proof` 的 target 不是 proof obligation，resolver 会给
`unsupported_proof_tree_target`，网页只显示诊断，不再退化成通用依赖视图。

Proof Tree 主干规则：

```text
claim
  -> selected proof
      -> hard uses: claim / construction / calculation / proof_fragment
          -> if claim, selected proof recursively
          -> if boundary or external accepted claim, leaf
          -> if already expanded elsewhere, shared reference
```

`setting`、`model`、`definition`、`notation`、`assumption`、`statement`、`estimate`
等材料不混入主树；网页在中栏主树下方按进入关系分成单列 context 组，例如 `Required Context`、`Used Statements and Estimates`、`Used Inputs` 和 `Citation and Source Context`。右栏关系区仍可查看同一对象的完整出边和反向边。

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
  - source.boyer_2010a.claim.partial_discrete_lr
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

hard dependency 不能设为 `omit`。在 proof route 中，如果 hard dependency 需要
`statement` 但对象没有可抽取 statement source，会产生内容充分性诊断。

自动建议规则：

| 情况 | 默认建议 |
|---|---|
| route target | `full` |
| selected proof | `full` |
| soft dependency 有 `summary` | `summary` |
| soft dependency 没有 `summary` | `reference` |
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
- 其他对象，包括 `claim`、`problem`、`assumption`、`proof`、`proof_fragment`
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
| `--profile <profile>` | 从对象 target 临时创建 route 时使用的 profile；当前只能是 `proof`。 |
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
  --boundary source.boyer_2010a.claim.partial_discrete_lr \
  --representation source.boyer_2010a.claim.partial_discrete_lr=statement \
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
5. `profile` 只能是 `proof`。
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

### 网页 Export 按钮

网页 Generated View 的 `Export` 按钮不会直接运行 CLI，也不会直接写文件。它只复制一段本机
Terminal 命令。命令大致形态是：

```bash
TOOL_ROOT='/path/to/proof-atlas-tool'
ATLAS_ROOT='/path/to/paper/ProofAtlas'
ROUTE_FILE='views/example.route.yml'
OUT='/path/to/paper/ProofAtlas/.atlas/exports/example.context.md'

mkdir -p "$(dirname "$OUT")" &&
cd "$TOOL_ROOT" &&
npm run atlas -- export "$ROUTE_FILE" "$ATLAS_ROOT" --format markdown --output "$OUT" &&
if command -v pbcopy >/dev/null 2>&1; then
  pbcopy < "$OUT"
  echo "Wrote and copied: $OUT"
else
  echo "Wrote: $OUT"
fi
```

这些路径是运行时生成的，不是源码硬编码：

- `TOOL_ROOT` 是当前 dev server 所在的 Proof Atlas 工具仓库。
- `ATLAS_ROOT` 是网页当前打开项目的 `atlasRoot`。
- `ROUTE_FILE` 必须是当前项目 graph 中已加载的 `views/*.route.yml`；后端会拒绝不属于当前项目的 route path。
- `OUT` 默认写到当前项目的 `.atlas/exports/`。该目录是本机生成物，应由 `.gitignore` 忽略。

用户通常只需要配置两件事：

1. 用 `npm run atlas -- dev <paper-root-or-ProofAtlas-root>` 启动正确的工具仓库和项目。
2. 在网页里用 `Open` 切到当前要导出的项目。

如果移动了工具仓库或项目目录，重启 dev server 或重新 `Open` 项目后再复制命令。复制出的命令
包含本机绝对路径，可能暴露用户名和目录结构；它应当在本机 Terminal 运行，不应直接贴给云端
AI。运行后生成的 Markdown context 才是给云端 AI 的材料。macOS 上命令会用 `pbcopy` 把
Markdown context 放入剪贴板；没有 `pbcopy` 时，只写文件并打印路径。

Markdown 导出会：

- 输出 Proof Route、Accepted Inputs、Target、Definitions and Settings、Statements / Estimates / Calculations、Supporting Claims、Proofs、Issues、Citation / Source Notes 和 References。
- Proof Route 是短 proof tree，用于展示 target、selected proof、主要 supporting claims 和 proof components；完整 dependency edges 留在 JSON / manifest 导出里。
- Accepted Inputs 来自 resolved route 中的 boundary nodes，包括显式 `boundaries` 和外部 claim 无展开 proof 时产生的隐式 boundary。
- 每个对象段落只保留标题、`Object:` 行和正文；默认不输出 `uid`、`status`、`trust`、`content_included` 或 YAML metadata block。
- 把 slice 内部的 `[[object.name]]` / `![[object.name]]` 改写成 Markdown anchor 链接。
- 指向当前对象自己的 link 只保留显示文本，不生成指向同一标题的 self-link。
- 对 slice 外引用标注 `not included in this context`。
- 在末尾 References 中把 citation bibkey materialize 成简洁文献信息，并标出它在当前 context 中是 accepted input、imported statement source 或 background reference。
- 通过 CLI/API result 返回导出诊断，但不在 Markdown context 里打印 Diagnostics 段。

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
