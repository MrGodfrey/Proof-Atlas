# 半离散论文示例

完整示例位于：

```text
examples/semidiscrete/ProofAtlas
```

它挂载的共享引用库位于：

```text
examples/reference-atlas/ProofAtlas
```

这个示例把半离散随机抛物方程论文拆成对象图，包括论文概览、引言、连续模型、离散网格、主定理、预备命题、证明、主证明迭代、适应性审计和文献引用。文献 note 和外部结果位于 `shared-reference-atlas`，论文项目通过 `references.mounts` 只读挂载。

## 推荐阅读顺序

1. 打开 `Dashboard`：看主问题、主定理、当前证明路线和审计项。
2. 打开 `Full Paper Route`：按论文顺序读全部内容。
3. 打开 `Proof Map`：只看主定理证明所需的依赖链。
4. 打开 `Gaps and Audits`：看适应性问题和历史失败路线。
5. 打开 `Literature and Imported Results`：看所有 citation source。
6. 打开 `Why null controllability holds`：查看由 `views/null_controllability.route.yml`
   解析出的 Generated View，包括 Proof Tree 和 Narrative。

## 关键对象

```text
paper.note.frontmatter
main.note.introduction
main.problem.control_question
main.setting.probability_and_spaces
main.setting.domain_and_coefficients
main.model.continuous_problem
main.setting.discrete_mesh
main.setting.grid_operator
main.model.forward_semidiscrete_system
main.setting.spectral_spaces
main.claim.null_controllability
source.boyer_2010a.claim.partial_discrete_lr
main.model.backward_adjoint_system
main.claim.observability
main.proof.observability
main.claim.partial_null_control
main.construction.partial_control_duality
main.proof.partial_null_control
main.claim.free_decay
main.proof.free_decay
main.construction.lr_time_grid
main.calculation.lr_product_estimate
main.proof.lr_iteration
main.issue.adaptedness
main.proof.naive_duality
```

## 主线关系

```text
main.proof.lr_iteration proves main.claim.null_controllability
main.proof.lr_iteration uses main.claim.partial_null_control
main.proof.lr_iteration uses main.claim.free_decay
main.proof.lr_iteration uses main.calculation.lr_product_estimate

main.proof.partial_null_control proves main.claim.partial_null_control
main.proof.partial_null_control uses main.claim.observability

main.proof.observability proves main.claim.observability
main.proof.observability uses source.boyer_2010a.claim.partial_discrete_lr
```

当前 v1 建模中，claim 的陈述上下文放在 `requires`；证明中实际使用的数学结果放在对应
proof 的 `uses`。因此 `main.claim.observability` 本身只声明读懂陈述所需的模型和谱空间，
而 `main.proof.observability` 负责记录它使用了 Reference Atlas 中的外部结果
`source.boyer_2010a.claim.partial_discrete_lr`。

## 公式性材料

重要公式不保留 TeX label，也不使用 `equation` 对象。它们按语义升格成 statement、estimate 或 calculation 对象，例如：

```text
main.estimate.observability_spectral_bound
main.statement.partial_control_representation
main.statement.partial_control_ito_duality
main.statement.lr_low_mode_cancellation
main.estimate.lr_control_estimate
main.estimate.lr_induction_product
main.calculation.lr_exponent_identities
```

正文通过普通对象链接引用这些材料。前向/后向系统保持为 `role: model`；原文里的 equation number 只适合作为来源位置或对象内部本地编号，不作为 Proof Atlas 对象类型。

## 文献关系

```text
source.boyer_2010a.claim.partial_discrete_lr cites source.boyer_2010a
main.model.forward_semidiscrete_system cites source.lue_zhang_2021
main.model.backward_adjoint_system cites source.lue_zhang_2021
main.model.continuous_problem cites source.lue_2011
main.note.introduction cites all introduction references
```

网页会把 literature 链接显示成方括号样式。`source.*` 对象来自 `examples/reference-atlas/ProofAtlas`，因此右栏会显示 `origin: global_reference`、`origin_atlas: shared-reference-atlas`、bibkey 和 trust。普通论文项目不再本地维护这些 `source.*` 对象。
