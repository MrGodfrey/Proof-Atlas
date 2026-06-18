# LLM 与本地 AI 建议

Proof Atlas 把 LLM 输出视为待确认建议，而不是对象图事实。

浏览器不会写入对象、边、摘要或 route 文件。它可以复制本地 AI 请求。
写回动作通过 CLI、本地 AI 文件编辑或手工文件编辑完成。

## 待确认建议集

生成一个待确认建议文件：

```bash
npm run atlas -- suggest examples/semidiscrete/ProofAtlas \
  --route views/null_controllability.route.yml \
  --output .atlas/suggestions/null_controllability.suggestions.yml
```

文件结构如下：

```yaml
schema_version: "0.1"
type: suggestion_set
status: pending_confirmation
created_at: "2026-06-18T00:00:00.000Z"
project: semi-discrete-stochastic-control
route: views/null_controllability.route.yml
generator: proof_atlas_heuristic_prefill
instructions: These are pending suggestions for local AI or human review...
suggestions:
  - id: sug_edge_main_claim_a_requires_main_setting_b
    kind: missing_edge
    status: pending
    object: main.claim.a
    edge_type: requires
    target: main.setting.b
    strength: hard
    reason: Referenced from statement.md; confirm whether this is a real requires dependency.
    rationale: main.claim.a links to main.setting.b in statement.md...
```

当前生成器是保守的本地预填工具。它只把候选项列出来，交给本地 AI 或人工复核：

- 根据对象正文链接推测缺失的 `requires` / `uses` 边；
- 为没有 `summary` 的对象生成摘要草稿；
- 根据当前保持依赖顺序的线性化结果，建议 route 级别的 `render.order_hints`。

如果不传 `--route`，不会生成 `route_order_hints` 建议。如果不传 `--output`，
suggestion set 会写到 stdout。

这些建议会刻意保持为 pending。它们可能错误、不完整或范围过宽，写回前必须复核。

## 确认与写回

只应用明确接受的建议：

```bash
npm run atlas -- apply-suggestions .atlas/suggestions/null_controllability.suggestions.yml \
  examples/semidiscrete/ProofAtlas \
  --accept sug_edge_main_claim_a_requires_main_setting_b
```

只有在确实想整体确认时，才应用所有未被拒绝的建议：

```bash
npm run atlas -- apply-suggestions .atlas/suggestions/null_controllability.suggestions.yml \
  examples/semidiscrete/ProofAtlas \
  --accept all
```

`apply-suggestions` 在没有至少一个 `--accept` 参数时会拒绝写入。
这样可以保证 LLM 或本地 AI 的输出一直处于可复核状态，直到人工或本地 AI agent
明确确认要物化的建议 ID。

## 浏览器边界

Generated View 的图搜索、缩放和 witness path 高亮都是只读功能。
它们帮助检查已经解析出的 route，但不会创建边、摘要、boundary、proof choice
或 route order hint。
