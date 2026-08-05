# 研究发现

## 玩法设计分析结果

### 兵种系统（6种）
| 兵种 | 移速 | 攻击距离 | 兵力/血 | 攻击力 | 粮草消耗 | 粮草上限 | 特殊 |
|------|------|----------|---------|--------|----------|----------|------|
| 轻骑兵 | 4格/回合 | 1格 | 100=100血 | 1/兵 | 兵力×2 | 200 | - |
| 步兵 | 1格/回合 | 1格 | 1000=1000血 | 1/兵 | 兵力×1 | 1000 | - |
| 弓兵 | 1格/回合 | 2格 | 200=200血 | 1/兵 | 兵力×1 | 100 | - |
| 重骑兵 | 1格/2回合 | 1格 | 100=1000血 | 2/兵(10血/兵) | 兵力×4 | 100 | - |
| 后勤补给兵 | 1格/回合 | 无 | 100=100血 | 0 | - | 10000 | 补给相邻队友 |

### 地形系统（5种）
- 山地：不可通行
- 河流：通行+1回合
- 平原：无影响
- 沃土：田地产出×2
- 森林：隐身（仅进入或攻击时暴露）
  - 不可建造建筑（仅平原/沃土可建）

### 建筑系统（9种）
- 主营：10000血，摧毁则失败
- 农田：1000粮草/回合，1000血，被摧毁归攻击者并回500血
- 步兵营/弓兵营/轻骑兵营/重骑兵营/后勤补给兵营
- 箭塔：2格范围100伤害/回合
- 城墙：5000血，无攻击
- 哨塔：3格半径视野
- 粮仓：2000血，己方单位站上后以个人粮草补其储备；被摧毁归攻击者并回500血，每回合回200

### 游戏规则要点
- 九宫格视野（哨塔除外3格半径）
- 地图：500×500 / 1000×1000 / 2000×2000
- 1-9个人机对手
- 随机地形生成
- 建筑被摧毁消失（农田除外）
- 己方兵种不能在他人建筑上行走

## 2026-08-05 — 对照玩法设计文档优化
- 补全粮仓建筑（此前缺失）：config/渲染图标/补给机制/占领回血
- 新增建筑战斗：兵种可攻击范围内敌方建筑，农田/粮仓归摧毁者（lastHitBy），其余建筑销毁
- 森林隐身补充：森林内兵种本回合攻击后暴露（原仅同格可见）
- 河流通行补充：移速不足时仍可进入河流（本回合止步），实现"通行增加一回合"
- 已知偏差（保留）：攻击距离按曼哈顿距离含斜角（文档"上下左右"字面为十字格）；击杀补给兵额外奖励玩家粮草（文档仅补满击杀者兵种储备）

## 2026-08-05 — 存档系统设计
- 环境：JDK 21.0.7 已装；MySQL80 服务已安装未启动（端口3306，数据目录 C:/ProgramData/MySQL/MySQL Server 8.0/Data）；Maven 未安装，需下载 3.9.12
- 网络：Maven Central / Spring Initializr 可访问
- 存档内容：mapW/mapH/terrain/explored(转普通数组)/buildings(Map转数组)/players/units/currentPlayer/turn/nextUnitId/viewCX/viewCY/tileSize/phase/winner
- 接口契约：GET /api/saves（摘要列表）、GET /api/saves/{id}（完整存档 stateJson 字符串）、POST /api/saves（新建）、PUT /api/saves/{id}（覆盖）、DELETE /api/saves/{id}
- 决策：stateJson 以 JSON 字符串存入 LONGTEXT，避免后端二次解析大数组；存档仅允许在己方回合内进行，读档后直接恢复状态不重复结算

## 2026-08-05 — 后端回合结算方案（降低浏览器内存）
- 内存热点分析：
  - `state.explored` 为每个玩家各一份 mapW×mapH 的 Uint8Array：2000×2000×10 玩家 ≈ 40MB，1000×1000×10 ≈ 10MB
  - 结算时 AI 逐个做 `getReachableTiles` 全图 BFS，临时分配大量字符串键 Map/Set（2000×2000 时每次可到数十 MB 峰值）
  - `serializeGameState` 的 Array.from + JSON.stringify 产生额外副本（500×500 存档约 1.9MB，2000×2000 更大）
- 关键发现：AI 决策（ai.js）完全不读 explored；渲染器只用人类视野（renderer.js 对缺失 explored 有 `?` 保护）。因此 AI 玩家 explored 数组可整体移除，仅保留人类一份（已探索残影语义不受影响，人类 explored 继续本地增量维护）
- 迁移决策：回合结算（preparePlayerTurn + aiTurn + checkBuildingDestroyed + 胜负判定）整体搬到后端；人类回合准备/视野更新/相机仍留在前端（startTurn 复用，行为与原来完全一致）
- 接口契约：POST /api/sim/end-turn（无状态）
  - 请求：mapW/mapH/terrain(base64)/players/units/buildings/currentPlayer/turn/nextUnitId/seed/tutorialMode
  - 响应：players/units/buildings/currentPlayer/turn/nextUnitId/phase/winner/actionMsg（不含 terrain/explored，前端保留本地副本）
  - seed：可选，用 mulberry32 使 AI 决策可复现，便于 JS/Java 一致性验证
- 实现要点：
  - 后端用 LinkedHashMap 保存 buildings、ArrayDeque BFS + LinkedHashMap 可达集、按序迭代 units/players，保证与 JS 语义逐位一致
  - Building.lastHitBy 用 @JsonInclude(NON_NULL)，null 时不输出（对应 JS undefined 语义，避免 `null >= 0` 陷阱）
  - 前端 simApi 将 terrain 以 base64 传输（每 0x8000 字节分块 String.fromCharCode），避免 4M 数字的 JSON 膨胀
  - 后端不可用时前端自动回退本地 endTurn（AbortController 8s 超时），教学关直接本地结算
- 预期收益（2000×2000 / 10 玩家）：持久数组 44MB → 8MB；结算期 BFS 瞬时分配从浏览器移除
- 验证结果（2026-08-05）：
  - JS 本地结算 vs 后端结算，同种子（20260805）5+1 轮全部一致：100×100×4P×3回合、500×500×3P×2回合、定制建筑攻占场景（农田占领 owner/hp 均一致）
  - 前端构建通过（53 modules, 134.8KB JS / 48.55KB gzip）
  - 内存实测（2000×2000×10玩家）：terrain 3.8MB + explored 38.1MB → terrain 3.8MB + explored 3.8MB，释放 34.3MB
  - 实测注意：V8 ArrayBuffer 缓存池不会即时归还内存，逻辑释放量以 byteLength 统计为准
- 后续可选：玩家移动寻路搬后端（进一步降瞬时内存，但每步增加网络延迟）；会话化（sessionId）避免每回合重传 terrain
