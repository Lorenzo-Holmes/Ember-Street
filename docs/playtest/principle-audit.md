# Principle audit

本报告只把自然策略（Random、Survival、Production、Exploration、Strong Heuristic）用于“是否统治/是否死亡”的判断；Principle Greedy 只用于反事实强度测量，避免人为选择偏好污染 pickRate。

| 阶段 | 原则 | 选择率 | 生存率 | 坏结局率 | 结局分 | 资源Δ |
| --- | --- | --- | --- | --- | --- | --- |
| 7 | everyone-shares | 42.8% | 40.0% | 94.0% | -15.40 | -12.21 |
| 7 | triage-first | 26.6% | 25.1% | 96.4% | -31.01 | -2.63 |
| 7 | outward-search | 30.6% | 6.3% | 99.5% | -50.80 | -4.37 |
| 14 | core-leads | 44.5% | 11.0% | 98.9% | -46.64 | -3.59 |
| 14 | community-shares-risk | 26.5% | 7.5% | 99.7% | -50.77 | -5.85 |
| 14 | preserve-strength | 29.0% | 64.9% | 89.2% | 13.13 | -6.17 |
| 21 | hold-the-street | 58.3% | 39.4% | 94.0% | -16.26 | -2.42 |
| 21 | prepare-evacuation | 34.8% | 7.6% | 99.4% | -50.01 | -5.16 |
| 21 | await-aid | 6.9% | 2.0% | 100.0% | -50.78 | -6.74 |

## 状态与 trade-off 解读

- **DAY7 · everyone-shares**：相对同阶段平均结局分 +17.0；终局收益较高，但资源面没有同步占优，存在可见代价。
- **DAY7 · triage-first**：相对同阶段平均结局分 +1.4；总体接近同阶段均值，价值更依赖具体状态。
- **DAY7 · outward-search**：相对同阶段平均结局分 -18.4；终局与资源均偏弱，需要检查适用状态是否过窄。
- **DAY14 · core-leads**：相对同阶段平均结局分 -18.5；终局与资源均偏弱，需要检查适用状态是否过窄。
- **DAY14 · community-shares-risk**：相对同阶段平均结局分 -22.7；终局与资源均偏弱，需要检查适用状态是否过窄。
- **DAY14 · preserve-strength**：相对同阶段平均结局分 +41.2；终局收益较高，但资源面没有同步占优，存在可见代价。
- **DAY21 · hold-the-street**：相对同阶段平均结局分 +22.8；终局收益较高，但资源面没有同步占优，存在可见代价。
- **DAY21 · prepare-evacuation**：相对同阶段平均结局分 -11.0；终局与资源均偏弱，需要检查适用状态是否过窄。
- **DAY21 · await-aid**：相对同阶段平均结局分 -11.8；终局与资源均偏弱，需要检查适用状态是否过窄。

> resourceDeltaAfterPick 是从选择时点到 DAY30 的观察性加权库存变化，不应单独解释为原则的纯因果效应；需和 Principle Greedy 反事实结果一起看。
