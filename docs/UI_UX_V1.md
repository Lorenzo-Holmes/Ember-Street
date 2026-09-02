# Ember Street / 余烬长街 — UI/UX v1 Frozen Working Spec

Status: Phase 2.5 implementation baseline  
Primary target: mobile Web / 小红书小工具  
Reference viewport: 390×844, with QA coverage across 360–430 px widths

## 1. Product-facing visual thesis

> 先让玩家看见这条街，再让玩家意识到危险，最后逼他做选择。

The UI is **illustration-first, mobile-native, choice-driven survival UI**.

It must not regress into:

- a desktop survival dashboard
- a wartime command terminal
- a military dossier
- a card wall where every module has equal visual weight
- a purely decorative imitation of another survival game

The approved Ember Street canonical illustration system carries the world. UI exists to expose state and action clearly.

## 2. Player-facing terminology

### Core survivors / 核心幸存者

Named, individually managed characters:

- 林夏
- 老周
- 阿禾
- 程医生
- 阿梁
- 小满

They have portraits, conditions, energy, trust, specialty, and one major daytime assignment.

### Street residents / 街区居民

`civilianResidents` are anonymous ordinary residents living in the street community.

They are **not** additional survivor cards.

They:

- count toward population and food pressure
- can become active community labor
- can rotate as a group into 后勤 / 维修 / 守备
- can be lost to incidents
- can voluntarily leave when the community becomes unsustainable

Do not label named survivors as “居民”.

## 3. Primary navigation

Exactly four first-level destinations:

> **据点｜探索｜幸存者｜记录**

Buildings are systems inside 据点, not separate navigation items.
Street residents are a community layer, not a separate first-level page.

## 4. Six canonical screen templates

### 4.1 首页 / 据点概览

Visual order:

1. DAY / phase / weather + compact critical resources
2. large shelter/street illustration
3. up to three “today” summaries
4. one dominant CTA
5. bottom navigation

The first screen must answer:

- Where are we?
- What is wrong today?
- What should I do next?

Do not expose the full eight-item inventory as equal KPI cards on the first screen.

### 4.2 据点建筑页

Contents:

1. shelter/building visual anchor
2. street resident labor module
3. six buildings as vertically scrolling large cards
4. night preparation summary

Buildings remain:

- 搜索站
- 修理工坊
- 诊疗站
- 守夜岗
- 宿营屋
- 广播亭

Do not force all six buildings into one viewport. Approximately 2–3 building cards visible at once is acceptable.

### 4.3 探索页

Flow is fixed:

> 选人 → 选地点 → 进入地点 → 事件 → 决策

The location is the visual subject. The exploration team is a secondary control.

Location cards should contain:

- large canonical location image
- player-facing location name
- one short environmental sentence
- likely resource type
- qualitative risk: 安全 / 谨慎 / 危险 / 极险
- select action

Never expose A-series production IDs in player-facing UI.

### 4.4 幸存者页

Top-level list contains only named survivors.

A survivor list card contains:

- portrait
- name
- current condition
- specialty
- current assignment
- compact energy/trust state
- 查看 / 安排 entry

Seven assignments are progressively disclosed on detail/assignment interaction. Do not render all seven buttons for every survivor in the main list.

Street resident information is secondary copy only, e.g.:

> 街区另外住着 8 名居民，其中 5 人今天能参加轮值。

### 4.5 记录页

Primary sections:

1. 今日纪要
2. 街区日志
3. 已发现地点
4. 角色档案
5. 纪念墙

The previous “结局图鉴” must not dominate this page.

Character background files unlock only after the character joins/is known.

Street resident arrivals, departures and deaths belong in the street log without pretending every resident is a named character.

### 4.6 夜间事件页

Visual order:

1. NIGHT / DAY / event progress
2. compact relevant night resources
3. large event illustration
4. title + concise situation text
5. exactly three choices for ordinary decision events
6. explicit consequence/2D6/cost preview

Do not reduce choices to abstract “高风险 / 中收益” labels. Hard consequences must remain readable.

## 5. Community labor

Named survivor assignments remain individual.

Street resident labor remains a **single daily group rotation**:

- 后勤 (`logistics`)
- 维修 (`repair`)
- 守备 (`defense`)

The UI should use human-facing effect language first:

- “今晚能多顾到约 X 人份”
- “今晚能多补一轮薄弱处”
- “夜里的岗能轮得更开”

Exact numbers can appear as secondary information.

## 6. Civilian departure crisis

Resident population must not be monotonic.

Existing incident loss/death behavior remains. A separate voluntary-departure loop is now allowed when existing street conditions deteriorate.

Signals:

- low Hope
- consecutive food shortage
- high social pressure
- very low defense

Resolution is intentionally lightweight:

1. spend rations to keep them temporarily
2. let them leave

Voluntary departure:

- reduces `civilianResidents`
- reduces available community labor
- does **not** increment death statistics
- is recorded separately as `civilianDepartures`
- must appear in dawn brief / street log

Do not add individual resident careers or anonymous resident cards.

## 7. Canonical art integration

Runtime UI must use logical gameplay IDs, not A-series IDs.

Use `src/ui/visualAssets.ts` as the canonical mapping layer.

Final offline layout:

```text
public/assets/canonical/
  a01-...
  a02-...
  ...
```

Rules:

- A numbers are internal production identifiers only.
- No `<img src="/A03.png">` scattered through JSX.
- A27 and A29 remain blocked until corrected/approved masters are imported.
- A19 is intentionally unresolved rather than guessed.
- Binary files must be bundled locally for the final 小红书小工具 build.

## 8. Visual language

Illustrations:

- charcoal / graphite / rough ink
- weathered paper feeling
- documentary realism
- restrained civilian body language
- low saturation

UI:

- dark neutral background
- restrained surfaces and borders
- dirty off-white primary text
- muted secondary text
- dark rust for real danger
- dull amber only for scarce emphasis/current action
- gray-green for stable/safe states
- cold blue-gray for night/external signal context

Principle:

> **插画粗粝，UI 克制。**

Do not make illustration, cards, typography, buttons and background all equally distressed.

## 9. Interaction hierarchy

- One screen, one dominant decision.
- No more than one primary CTA at the same hierarchy level unless an event is explicitly comparing alternatives.
- Critical irreversible outcomes must be explicit.
- Touch targets should remain ~44px or larger.
- Bottom navigation remains stable and reachable.
- Important images must preserve subject crop and UI-safe regions.

## 10. Implementation order

1. close civilian population loop
2. canonical visual manifest
3. homepage / shelter overview
4. base + resident rotation
5. exploration
6. night events
7. survivors
8. records
9. mobile QA
10. offline 小红书 package

Gameplay systems not listed as part of the UI work remain frozen.

## 11. Explicit non-goals for this refactor

Do not change merely for visual work:

- DAY1–30 structure
- DAY10/20/29 horde milestones
- DAY30 ending-only boundary
- seeded RNG
- 2D6 result model
- 1–2 person exploration limit
- six core buildings
- seven named-survivor assignment types
- thirteen ending resolver structure
- resident three-mode group rotation

The purpose of Phase 2.5 is to make the existing game legible, tactile and visually coherent—not to open a new systems phase.
