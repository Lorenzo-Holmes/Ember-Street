# DAY29 choice audit

DAY29 当前是 6 个连续最终尸潮阶段，而不是单一终局按钮。因此矩阵按 **stageEventId × choiceId** fork：每个合法状态先复制同一源状态，强制执行一个候选选择，再由同一 Strong Heuristic 完成剩余阶段；源状态 mutation 会触发测试失败。

| 阶段 | 选择 | 样本 | 最佳率 | 最差率 | 平均结果 | σ |
| --- | --- | --- | --- | --- | --- | --- |
| final-horde-clinic | final-clinic-delay | 3000 | 10.3% | 67.4% | 143.34 | 69.22 |
| final-horde-clinic | final-clinic-supplies | 2310 | 42.0% | 6.2% | 161.12 | 64.92 |
| final-horde-clinic | final-clinic-triage | 3000 | 57.4% | 27.8% | 147.54 | 69.10 |
| final-horde-community | final-community-calm | 3000 | 65.5% | 21.1% | 146.22 | 69.93 |
| final-horde-community | final-community-ignore | 3000 | 13.9% | 78.8% | 131.45 | 65.35 |
| final-horde-community | final-community-rations | 1187 | 52.1% | 0.2% | 163.46 | 62.26 |
| final-horde-last-line | final-last-hold | 3000 | 78.3% | 12.1% | 147.70 | 68.83 |
| final-horde-last-line | final-last-retreat | 3000 | 5.1% | 87.9% | 132.88 | 70.90 |
| final-horde-last-line | final-last-stockpile | 2050 | 24.2% | 0.0% | 171.64 | 57.60 |
| final-horde-north-gate | final-gate-fallback | 3000 | 10.9% | 62.9% | 143.13 | 69.37 |
| final-horde-north-gate | final-gate-hold | 3000 | 64.5% | 22.9% | 147.50 | 69.06 |
| final-horde-north-gate | final-gate-reinforce | 2303 | 32.1% | 18.5% | 162.92 | 62.52 |
| final-horde-power-grid | final-grid-dark | 3000 | 17.6% | 47.4% | 145.01 | 69.58 |
| final-horde-power-grid | final-grid-parts | 2313 | 30.6% | 26.2% | 162.37 | 63.31 |
| final-horde-power-grid | final-grid-repair | 3000 | 58.8% | 32.5% | 147.45 | 69.05 |
| final-horde-reroute | final-route-barricade | 2370 | 23.9% | 16.6% | 159.75 | 64.09 |
| final-horde-reroute | final-route-scout | 3000 | 77.2% | 8.0% | 147.62 | 68.89 |
| final-horde-reroute | final-route-stand | 3000 | 3.9% | 78.9% | 139.82 | 71.59 |

