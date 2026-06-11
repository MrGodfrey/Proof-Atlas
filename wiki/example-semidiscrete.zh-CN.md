# 半离散示例

内置示例位于：

```text
examples/semidiscrete/ProofAtlas
```

它把一个半离散随机可控性证明建模为可浏览的对象图。

## 推荐阅读路线

1. 打开 `Dashboard`，看主问题、主定理、证明路线和当前审计状态。
2. 打开 `Full Paper Route`，按论文顺序阅读对象。
3. 打开 `Proof Map`，检查主定理依赖链。
4. 打开 `Gaps and Audits`，查看已解决和未解决的证明风险。
5. 打开 `Literature and Imported Results`，检查文献对象。

## 关键对象

```text
main.problem.control_question
main.claim.null_controllability
main.claim.partial_discrete_lr
main.claim.observability
main.proof.observability
main.claim.partial_null_control
main.proof.partial_null_control
main.claim.free_decay
main.proof.free_decay
main.proof.lr_iteration
main.issue.adaptedness
```

## 主图关系

```text
main.proof.lr_iteration proves main.claim.null_controllability
main.proof.lr_iteration uses main.claim.partial_null_control
main.proof.lr_iteration uses main.claim.free_decay
main.proof.lr_iteration uses main.calculation.lr_product_estimate

main.proof.partial_null_control proves main.claim.partial_null_control
main.proof.partial_null_control uses main.claim.observability

main.proof.observability proves main.claim.observability
main.claim.observability uses main.claim.partial_discrete_lr
```

## 拆分策略

- 可复用的长结论拆成 `math/claim` 对象。
- 证明拆成 `math/proof` 对象，并用 `proves` 指向 claim。
- 需要稳定引用的重要公式设为 `display_as: equation` 对象。
- 文献条目设为 `note/literature` 对象，并用 `cites` 连接。
- gap、审计项和可疑错误设为 `issue` 对象，不藏在正文注释中。
