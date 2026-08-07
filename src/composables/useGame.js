// useGame composable — 连接游戏逻辑与 Vue 组件

import { shallowRef, ref, reactive, computed, markRaw } from 'vue';
import { createGameState, initPlayers, placeInitialBuildings, startTurn, endTurn } from '../game/state.js';
import { generateTerrain } from '../game/terrain.js';
import { spawnUnit } from '../game/units.js';
import { render, drawMapOverlay, mapClickToWorld } from '../game/renderer.js';
import { updateAllExplored, isUnitVisibleToPlayer } from '../game/vision.js';
import { centerViewOn } from '../game/camera.js';
import { getReachableTiles, moveUnit } from '../game/movement.js';
import { canAttack, resolveCombat, canAttackBuilding, resolveBuildingCombat, canRangedAttack, canRangedAttackBuilding, resolveRangedCombat, resolveRangedBuildingCombat } from '../game/combat.js';
import { getBuilding, screenToWorld, worldToScreen, updateTileSize, clamp, dist } from '../game/utils.js';
import { getUnitsAt } from '../game/units.js';
import { canBuildOn, buildStructure, canProduce, produceUnit, demolishStructure } from '../game/buildings.js';
import { UNIT_TYPES, BUILDING_TYPES, BARRACKS_TYPE_MAP } from '../game/config.js';
import { TERRAIN } from '../game/config.js';
import { saveApi } from '../api/saveApi.js';
import { simApi } from '../api/simApi.js';
import { serializeGameState, deserializeGameState } from '../game/save.js';
import { TUTORIAL_STEPS } from '../game/tutorial.js';
import { useSettings } from './useSettings.js';

export function useGame() {
  // Canvas refs (set by GameView)
  const gameCanvas = shallowRef(null);
  const minimapCanvas = shallowRef(null);
  const bigMapCanvas = shallowRef(null);

  // 一次性获取设置服务，避免 onKeydown 中重复创建闭包
  const settingsService = useSettings();

  // 游戏状态 — markRaw 防止 Vue 深度代理
  const state = markRaw(createGameState());

  // 响应式 UI 值
  const phase = ref('menu');
  const hudPlayerName = ref('');
  const hudPlayerColor = ref('#8b4513');
  const hudFood = ref(0);
  const hudTurn = ref(0);
  const hudUnits = ref(0);
  const isHumanTurn = ref(false);
  const unitInfoText = ref('点击己方单位选择');
  const actionMsg = ref('');
  const buildMenuVisible = ref(false);
  const buildMenuItems = ref([]);
  const buildMenuTitle = ref('');
  const btnEndTurnDisabled = ref(false);
  const btnBuildDisabled = ref(true);
  const btnProduceDisabled = ref(true);
  const btnSkipDisabled = ref(true);
  const btnDemolishDisabled = ref(true);
  const btnRangedVisible = ref(false);
  const btnRangedDisabled = ref(true);
  const rangedMode = ref(false);
  const gameOverVisible = ref(false);
  const gameOverTitle = ref('');
  const gameOverMsg = ref('');
  const isCreating = ref(false);
  const saveMenuVisible = ref(false);
  const saveMenuMode = ref('save');
  const saveList = ref([]);
  const saveBusy = ref(false);
  const saveMsg = ref('');
  const unitDetail = ref(null);
  const buildingDetail = ref(null);
  const isPlacing = ref(false);
  const tutorialActive = ref(false);
  const tutorialDone = ref(false);
  const tutorialStep = ref(0);
  let tutorialInitialUnits = 0;
  let tutorialInitialFarms = 0;

  // 大地图状态
  const bigMapVisible = ref(false);
  const bigMapW = ref(0);
  const bigMapH = ref(0);

  // 缩放状态
  const zoomFactor = ref(1.0);

  // 点击状态
  let touchStartTime = 0, touchStartX = 0, touchStartY = 0;
  let pointerDown = false;
  let panning = false;
  let panStartCX = 0, panStartCY = 0;
  let panFrame = null;

  function syncPhase() {
    phase.value = state.phase;
    gameOverVisible.value = state.phase === 'over';
    buildMenuVisible.value = false;
  }

  function refreshUI() {
    const hp = state.players.find(p => p.isHuman && p.alive);
    const cp = state.players[state.currentPlayer];
    hudPlayerName.value = cp ? cp.name : '';
    hudPlayerColor.value = cp ? cp.color : '#8b4513';
    hudFood.value = hp ? hp.food : 0;
    hudTurn.value = state.turn;
    hudUnits.value = hp ? state.units.filter(u => u.owner === hp.index).length : 0;
    isHumanTurn.value = hp ? state.currentPlayer === hp.index : false;
    btnEndTurnDisabled.value = !isHumanTurn.value || state.aiThinking;

    // 单位/建筑信息（仅在右键查看时显示，左键选择时不显示卡片）
    const selUnit = state.selectedUnitId ? state.units.find(u => u.id === state.selectedUnitId) : null;
    if (selUnit) {
      const cfg = UNIT_TYPES[selUnit.type];
      const maxHp = cfg.troops * cfg.hpPerTroop;
      const hp = selUnit.troops * cfg.hpPerTroop;
      const atkPower = selUnit.troops * cfg.atkPerTroop;
      const rangedInfo = cfg.rangedAtkRange ? ` | 远程射程:${cfg.rangedAtkRange}格(半伤)` : '';
      unitInfoText.value = `${cfg.name} 兵力:${selUnit.troops} | 血量:${hp}/${maxHp} | 攻击力:${atkPower} | 粮草:${selUnit.supplies}/${cfg.foodCap} | 移动:${selUnit.moved ? '已用' : '可用'} | 攻击:${selUnit.attacked ? '已用' : '可用'}${rangedInfo}`;
      // 不再自动设置 unitDetail，让左键选择不显示信息卡片
      btnSkipDisabled.value = !isHumanTurn.value || state.aiThinking;
      // 远程攻击按钮：仅弓兵可见
      btnRangedVisible.value = !!cfg.rangedAtkRange;
      btnRangedDisabled.value = selUnit.attacked || !isHumanTurn.value || state.aiThinking;
      if (selUnit.attacked) rangedMode.value = false;
    } else if (state.selectedBuilding) {
      const b = getBuilding(state, state.selectedBuilding.x, state.selectedBuilding.y);
      if (b) {
        const bCfg = BUILDING_TYPES[b.type];
        unitInfoText.value = `${bCfg.name} HP:${b.hp}/${bCfg.hp} | 所属:${state.players[b.owner]?.name || '?'}`;
      }
      btnSkipDisabled.value = true;
      btnRangedVisible.value = false;
    } else {
      unitInfoText.value = isHumanTurn.value ? '点击己方单位或建筑选择，右键查看信息' : (state.aiThinking ? 'AI思考中...' : '等待中...');
      btnSkipDisabled.value = true;
      btnRangedVisible.value = false;
    }

    // 建造/生产按钮
    const selBuild = state.selectedBuilding ? getBuilding(state, state.selectedBuilding.x, state.selectedBuilding.y) : null;
    btnBuildDisabled.value = !isHumanTurn.value || state.aiThinking || pendingBuildType !== null;
    const canProd = selBuild && selBuild.owner === (hp?.index) &&
      ['infantry_barracks', 'archer_barracks', 'lc_barracks', 'hc_barracks', 'supply_barracks'].includes(selBuild.type);
    btnProduceDisabled.value = !canProd || !isHumanTurn.value || state.aiThinking;

    // 除主营外，其他己方建筑均可拆除
    const demolishable = selBuild && selBuild.owner === (hp?.index) && selBuild.type !== 'hq' &&
      (BUILDING_TYPES[selBuild.type]?.buildCost || 0) > 0;
    btnDemolishDisabled.value = !demolishable || !isHumanTurn.value || state.aiThinking || pendingBuildType !== null;

    actionMsg.value = state.actionMsg;
  }

  function doRender() {
    if (gameCanvas.value && state.phase === 'playing') {
      render(state, gameCanvas.value, minimapCanvas.value);
    }
    // 大地图打开时持续刷新
    if (bigMapVisible.value && bigMapCanvas.value) {
      drawBigMap();
    }
  }

  function syncAndRender() {
    syncPhase();
    refreshUI();
    doRender();
    checkTutorialProgress();
  }

  function handleGameOver(won) {
    gameOverTitle.value = won ? '旗开得胜' : '全军覆没';
    gameOverMsg.value = won ? '运筹帷幄之中，决胜千里之外。' : '主帅已殁，大势已去。';
    gameOverVisible.value = true;
    state.phase = 'over';
    syncPhase();
  }

  // 只保留人类玩家的探索视野数组；AI 视野已由后端结算，前端不再保留
  function keepOnlyHumanExplored(s) {
    const size = s.mapW * s.mapH;
    s.explored = s.players.map(p => {
      if (!p.isHuman) return null;
      const exp = s.explored && s.explored[p.index];
      return exp && exp.length === size ? exp : new Uint8Array(size);
    });
  }

  // ========== 游戏流程 ==========

  function startGame(mapSize, aiCount) {
    isCreating.value = true;
    setTimeout(() => {
      tutorialActive.value = false;
      tutorialDone.value = false;
      state.tutorialMode = false;
      state.zoomFactor = 1.0;
      zoomFactor.value = 1.0;
      state.mapW = mapSize;
      state.mapH = mapSize;
      state.phase = 'playing';
      state.turn = 1;

      initPlayers(state, 1, aiCount);
      state.terrain = generateTerrain(state.mapW, state.mapH);
      placeInitialBuildings(state);

      // 清理人类玩家主营周围
      const hp = state.players[0];
      if (hp) {
        for (let dy = -2; dy <= 2; dy++) {
          for (let dx = -2; dx <= 2; dx++) {
            const nx = hp.hqX + dx, ny = hp.hqY + dy;
            if (nx >= 0 && ny >= 0 && nx < state.mapW && ny < state.mapH &&
                state.terrain[ny * state.mapW + nx] === TERRAIN.MOUNTAIN) {
              state.terrain[ny * state.mapW + nx] = 0; // PLAIN
            }
          }
        }
      }

      // 初始单位
      for (let p = 0; p < state.players.length; p++) {
        const player = state.players[p];
        const hx = player.hqX, hy = player.hqY;
        // 主营周围1格（8邻格）中，排除建筑（含开局农田）的空位
        const offsets = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]];
        const freeTiles = [];
        for (const [dx, dy] of offsets) {
          const x = hx + dx, y = hy + dy;
          if (x < 0 || y < 0 || x >= state.mapW || y >= state.mapH) continue;
          if (state.buildings.has(`${x},${y}`)) continue;
          freeTiles.push([x, y]);
        }
        const toSpawn = p === 0
          ? [['infantry'], ['infantry']]
          : [['infantry'], ['infantry'], ['archer']];
        for (let i = 0; i < toSpawn.length; i++) {
          const [sx, sy] = freeTiles[i % freeTiles.length];
          spawnUnit(state, p, toSpawn[i][0], sx, sy);
        }
      }

      updateAllExplored(state);
      centerViewOn(state, state.players[0].hqX, state.players[0].hqY);
      isCreating.value = false;
      syncAndRender();

      startTurn(state, doRender, refreshUI, handleGameOver);
    }, 100);
  }

  // ========== 教学关卡 ==========

  // 在主营附近找一块可通行、无建筑、无单位的格子
  function findTutorialTile(state, cx, cy) {
    const offsets = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]];
    for (const [dx, dy] of offsets) {
      const x = cx + dx, y = cy + dy;
      if (x < 0 || y < 0 || x >= state.mapW || y >= state.mapH) continue;
      if (state.terrain[y * state.mapW + x] === TERRAIN.MOUNTAIN) continue;
      if (state.buildings.has(`${x},${y}`)) continue;
      if (state.units.some(u => u.x === x && u.y === y)) continue;
      return { x, y };
    }
    return null;
  }

  function startTutorial() {
    isCreating.value = true;
    setTimeout(() => {
      state.zoomFactor = 1.0;
      zoomFactor.value = 1.0;
      state.mapW = 100;
      state.mapH = 100;
      state.phase = 'playing';
      state.turn = 1;

      initPlayers(state, 1, 1); // 1个人类 + 1个敌方靶子
      state.terrain = generateTerrain(100, 100);
      placeInitialBuildings(state);

      // 清理人类玩家主营周围的山地
      const hp = state.players[0];
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          const nx = hp.hqX + dx, ny = hp.hqY + dy;
          if (nx >= 0 && ny >= 0 && nx < state.mapW && ny < state.mapH &&
              state.terrain[ny * state.mapW + nx] === TERRAIN.MOUNTAIN) {
            state.terrain[ny * state.mapW + nx] = 0;
          }
        }
      }

      // 步兵 + 步兵营（主营旁）
      const infTile = findTutorialTile(state, hp.hqX, hp.hqY);
      if (infTile) spawnUnit(state, 0, 'infantry', infTile.x, infTile.y);
      const barTile = findTutorialTile(state, hp.hqX, hp.hqY);
      if (barTile) state.buildings.set(`${barTile.x},${barTile.y}`, { type: 'infantry_barracks', owner: 0, hp: 1000 });

      // 敌方靶子（主营东侧约4格）
      const enemyTile = findTutorialTile(state, hp.hqX + 4, hp.hqY)
        || findTutorialTile(state, hp.hqX - 4, hp.hqY)
        || findTutorialTile(state, hp.hqX, hp.hqY + 4);
      if (enemyTile) {
        const dummy = spawnUnit(state, 1, 'infantry', enemyTile.x, enemyTile.y);
        dummy.troops = 50;
      }

      hp.food = 5000;
      state.tutorialMode = true;
      tutorialActive.value = true;
      tutorialDone.value = false;
      tutorialStep.value = 0;
      tutorialInitialUnits = state.units.filter(u => u.owner === 0).length;
      tutorialInitialFarms = [...state.buildings.values()].filter(b => b.owner === 0 && b.type === 'farm').length;

      updateAllExplored(state);
      centerViewOn(state, hp.hqX, hp.hqY);
      isCreating.value = false;
      syncAndRender();

      startTurn(state, doRender, refreshUI, handleGameOver);
    }, 100);
  }

  // 根据玩家当前操作自动推进教学步骤
  function checkTutorialProgress() {
    if (!tutorialActive.value || tutorialDone.value) return;
    const idx = tutorialStep.value;
    const conditions = [
      null, // 欢迎：手动下一步
      () => state.selectedUnitId != null,
      () => state.units.some(u => u.owner === 0 && u.moved),
      () => state.selectedBuilding != null,
      () => [...state.buildings.values()].filter(b => b.owner === 0 && b.type === 'farm').length > tutorialInitialFarms,
      () => state.units.filter(u => u.owner === 0).length > tutorialInitialUnits,
      () => state.turn > 1,
      () => state.units.filter(u => u.owner !== 0).length === 0,
      null,
    ];
    const cond = conditions[idx];
    if (cond && cond()) {
      tutorialStep.value = idx + 1;
      if (tutorialStep.value >= TUTORIAL_STEPS.length - 1) {
        tutorialDone.value = true;
      }
    }
  }

  function nextTutorialStep() {
    if (!tutorialActive.value || tutorialDone.value) return;
    tutorialStep.value = Math.min(tutorialStep.value + 1, TUTORIAL_STEPS.length - 1);
    if (tutorialStep.value >= TUTORIAL_STEPS.length - 1) {
      tutorialDone.value = true;
    }
    syncAndRender();
  }

  function skipTutorial() {
    tutorialActive.value = false;
    tutorialDone.value = false;
    state.tutorialMode = false;
    state.actionMsg = '已跳过教学，可自由游玩本局';
    syncAndRender();
  }

  function finishTutorial(continuePlay) {
    if (continuePlay) {
      tutorialActive.value = false;
      tutorialDone.value = false;
      state.tutorialMode = false;
      state.actionMsg = '教学完成！祝旗开得胜！';
      syncAndRender();
    } else {
      location.reload();
    }
  }

  function restartGame() {
    location.reload();
  }

  // ========== 视角缩放 ==========

  function applyZoom(factor) {
    const minZ = 0.4, maxZ = 3.0;
    const z = clamp(factor, minZ, maxZ);
    state.zoomFactor = z;
    zoomFactor.value = z;
    // 重新计算 tileSize
    const w = window.innerWidth, h = window.innerHeight;
    updateTileSize(state, w, h);
    clampViewToExplored();
    doRender();
  }

  function zoomIn() {
    applyZoom(state.zoomFactor * 1.2);
  }

  function zoomOut() {
    applyZoom(state.zoomFactor / 1.2);
  }

  function setZoom(z) {
    applyZoom(z);
  }

  function resetZoom() {
    applyZoom(1.0);
  }

  function onWheel(e) {
    if (state.phase !== 'playing') return;
    if (state.aiThinking) return;
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const delta = e.deltaY < 0 ? 1.1 : 0.9;
      applyZoom(state.zoomFactor * delta);
      return;
    }
    // 普通滚轮 → 平移视角
    e.preventDefault();
    const panSpeed = 0.5 / state.tileSize;
    if (e.shiftKey) {
      state.viewCX += e.deltaY * panSpeed;
    } else {
      state.viewCY += e.deltaY * panSpeed;
    }
    clampViewToExplored();
    doRender();
  }

  // ========== 玩家操作 ==========

  function playerEndTurn() {
    if (!isHumanTurn.value || state.aiThinking) return;
    state.selectedUnitId = null;
    state.selectedBuilding = null;
    buildMenuVisible.value = false;
    runEndTurn();
  }

  // 回合结算：优先交给后端执行（省浏览器内存/CPU），后端不可用时回退本地结算
  async function runEndTurn() {
    if (state.tutorialMode) {
      // 教学关无 AI，直接本地结算
      endTurn(state, doRender, refreshUI, handleGameOver);
      return;
    }

    state.aiThinking = true;
    state.actionMsg = 'AI 结算中…';
    refreshUI();
    try {
      const result = await simApi.endTurn(state);
      applySimResult(result);
    } catch {
      // 后端不可用（未启动/超时）→ 本地结算兜底，行为与原来一致
      state.aiThinking = false;
      endTurn(state, doRender, refreshUI, handleGameOver);
    }
  }

  // 应用后端结算结果；人类回合准备/视野更新/相机仍由 startTurn 完成
  function applySimResult(result) {
    state.players = result.players;
    state.units = result.units;
    state.buildings = new Map(
      (result.buildings || []).map(b => [b.key, {
        type: b.type,
        owner: b.owner,
        hp: b.hp,
        lastHitBy: b.lastHitBy,
      }])
    );
    state.currentPlayer = result.currentPlayer;
    state.turn = result.turn;
    state.nextUnitId = result.nextUnitId;
    state.aiThinking = false;
    state.actionMsg = result.actionMsg || '';
    keepOnlyHumanExplored(state);

    if (result.phase === 'over') {
      state.phase = 'over';
      state.winner = result.winner ?? null;
      handleGameOver(!!state.players.find(p => p.isHuman && p.alive));
      return;
    }

    state.phase = 'playing';
    startTurn(state, doRender, refreshUI, handleGameOver);
  }

  function skipUnit() {
    if (!state.selectedUnitId) return;
    const unit = state.units.find(u => u.id === state.selectedUnitId);
    if (unit) {
      unit.moved = true;
      unit.attacked = true;
    }
    state.selectedUnitId = null;
    state.actionMsg = '跳过此单位';
    syncAndRender();
  }

  function clearSelection() {
    state.selectedUnitId = null;
    state.selectedBuilding = null;
    rangedMode.value = false;
    state.rangedMode = false;
    buildMenuVisible.value = false;
    syncAndRender();
  }

  function toggleRangedMode() {
    const selUnit = state.selectedUnitId ? state.units.find(u => u.id === state.selectedUnitId) : null;
    if (!selUnit || selUnit.attacked) return;
    const cfg = UNIT_TYPES[selUnit.type];
    if (!cfg.rangedAtkRange) return;
    rangedMode.value = !rangedMode.value;
    state.rangedMode = rangedMode.value;
    state.actionMsg = rangedMode.value ? '远程攻击模式：点击4格内敌军或建筑进行射击' : '';
    syncAndRender();
  }

  // ========== 视野锁定 — 限制视野范围 ==========
  function clampViewToExplored() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const ts = state.tileSize;
    const halfW = Math.ceil((w / ts) / 2) + 1;
    const halfH = Math.ceil(((h - 44 - 120) / ts) / 2) + 1;

    // 只做地图边界钳制，允许玩家自由拖动到任意位置
    state.viewCX = clamp(state.viewCX, halfW, Math.max(halfW, state.mapW - halfW));
    state.viewCY = clamp(state.viewCY, halfH, Math.max(halfH, state.mapH - halfH));
  }

  // ========== 右键查看信息 ==========

  function showInfo(tx, ty) {
    if (tx < 0 || ty < 0 || tx >= state.mapW || ty >= state.mapH) return;

    // 先查看是否有单位（优先显示单位信息）
    const units = getUnitsAt(state, tx, ty);
    if (units.length > 0) {
      const unit = units[0];
      const cfg = UNIT_TYPES[unit.type];
      const maxHp = cfg.troops * cfg.hpPerTroop;
      const hp = unit.troops * cfg.hpPerTroop;
      const atkPower = unit.troops * cfg.atkPerTroop;
      buildingDetail.value = null;
      unitDetail.value = {
        name: cfg.name,
        type: unit.type,
        troops: unit.troops,
        maxTroops: cfg.troops,
        hp,
        maxHp,
        atkPower,
        atkRange: cfg.atkRange,
        move: cfg.move,
        supplies: unit.supplies,
        foodCap: cfg.foodCap,
        moved: unit.moved,
        attacked: unit.attacked,
        ownerName: state.players[unit.owner]?.name || '',
        ownerColor: state.players[unit.owner]?.color || '#333',
        note: unit.type === 'supply' ? '可为相邻友军补充粮草 · 站上己方粮仓可补充储备' : '',
      };
      return;
    }

    // 查看建筑
    const b = getBuilding(state, tx, ty);
    if (b) {
      const bCfg = BUILDING_TYPES[b.type];
      const ut = BARRACKS_TYPE_MAP[b.type] ? UNIT_TYPES[BARRACKS_TYPE_MAP[b.type]] : null;
      const descMap = {
        hq: '主营 · 被摧毁则战败',
        farm: '农田 · 每回合产出粮草',
        arrow_tower: '箭塔 · 自动攻击2格内敌军',
        wall: '城墙 · 高耐久防御工事',
        watchtower: '哨塔 · 扩大视野范围',
        granary: '粮仓 · 单位站上后转化个人粮草补充储备',
      };
      unitDetail.value = null;
      buildingDetail.value = {
        name: bCfg.name,
        type: b.type,
        hp: b.hp,
        maxHp: bCfg.hp,
        ownerName: state.players[b.owner]?.name || '?',
        ownerColor: state.players[b.owner]?.color || '#333',
        atk: bCfg.atk || 0,
        atkRange: bCfg.atkRange || 0,
        visionRadius: bCfg.visionRadius ?? 1,
        foodPerTurn: bCfg.foodPerTurn || 0,
        buildCost: bCfg.buildCost || 0,
        desc: descMap[b.type] || '',
        unit: ut ? {
          name: ut.name,
          troops: ut.troops,
          hp: ut.troops * ut.hpPerTroop,
          atk: ut.troops * ut.atkPerTroop,
          foodCap: ut.foodCap,
          move: ut.move,
          atkRange: ut.atkRange,
          buildCost: ut.buildCost,
        } : null,
      };
      return;
    }

    // 点击空白处，关闭信息卡片
    unitDetail.value = null;
    buildingDetail.value = null;
  }

  // ========== 冲锋攻击辅助 ==========

  // 在可达范围内寻找能攻击目标的最近格子
  function findAttackPosition(state, unit, targetX, targetY, atkRange, playerIdx) {
    const reachable = getReachableTiles(state, unit, playerIdx);
    let bestTile = null, bestDist = Infinity;
    for (const rk of reachable.keys()) {
      const [rx, ry] = rk.split(',').map(Number);
      if (rx === unit.x && ry === unit.y) continue; // 跳过原位
      const d = dist(rx, ry, targetX, targetY);
      if (d <= atkRange && d < bestDist) {
        bestDist = d;
        bestTile = { x: rx, y: ry };
      }
    }
    return bestTile;
  }

  // 冲锋到攻击位置 → 攻击 → 撤退回原位
  function chargeAndRetreat(state, unit, atkTile, attackFn) {
    const origX = unit.x, origY = unit.y;
    // 临时移动到攻击位置
    unit.x = atkTile.x;
    unit.y = atkTile.y;
    // 执行攻击
    attackFn();
    // 攻击后回到原位
    unit.x = origX;
    unit.y = origY;
    // 消耗移动力和攻击次数
    unit.moved = true;
    state.actionMsg = (state.actionMsg || '') + ' 冲锋攻击后撤回原位！';
  }

  // ========== 点击处理 ==========

  function handleTap(tx, ty) {
    if (tx < 0 || ty < 0 || tx >= state.mapW || ty >= state.mapH) return;
    const hp = state.players.find(p => p.isHuman && p.alive);
    if (!hp || state.currentPlayer !== hp.index) return;

    // 点击空白处关闭信息卡片
    const clickedUnit = getUnitsAt(state, tx, ty).find(u => u.owner === hp.index);
    const clickedBuilding = getBuilding(state, tx, ty);
    const isOwnBuilding = clickedBuilding && clickedBuilding.owner === hp.index;
    if (!clickedUnit && !clickedBuilding) {
      unitDetail.value = null;
      buildingDetail.value = null;
    }

    // 放置模式优先
    if (pendingBuildType) {
      // 连续建造：放不了也不退出放置模式，提示原因即可
      tryPlaceBuilding(tx, ty);
      return;
    }

    // 移动已选中单位
    if (state.selectedUnitId && !clickedUnit) {
      const selUnit = state.units.find(u => u.id === state.selectedUnitId);
      const cfg = selUnit ? UNIT_TYPES[selUnit.type] : null;

      // === 远程攻击模式（弓兵专属） ===
      if (rangedMode.value && selUnit && !selUnit.attacked && cfg && cfg.rangedAtkRange) {
        const enemies = getUnitsAt(state, tx, ty).filter(u => u.owner !== hp.index);
        if (enemies.length > 0 && canRangedAttack(state, selUnit, enemies[0])) {
          resolveRangedCombat(state, selUnit, enemies[0]);
          rangedMode.value = false;
          updateAllExplored(state);
          syncAndRender();
          return;
        }
        if (clickedBuilding && clickedBuilding.owner !== hp.index && canRangedAttackBuilding(state, selUnit, tx, ty)) {
          resolveRangedBuildingCombat(state, selUnit, tx, ty);
          rangedMode.value = false;
          updateAllExplored(state);
          syncAndRender();
          return;
        }
        // 点击无效目标 → 退出远程模式
        rangedMode.value = false;
        state.actionMsg = '已退出远程攻击模式';
        syncAndRender();
        return;
      }

      // === 攻击敌人 ===
      if (selUnit && !selUnit.attacked && cfg && cfg.atkRange > 0) {
        const enemies = getUnitsAt(state, tx, ty).filter(u => u.owner !== hp.index);
        if (enemies.length > 0) {
          const enemy = enemies[0];

          // 1. 已在攻击范围内 → 直接攻击
          if (canAttack(state, selUnit, enemy)) {
            resolveCombat(state, selUnit, enemy);
            updateAllExplored(state);
            syncAndRender();
            return;
          }

          // 2. 不在攻击范围内但可移动 → 冲锋攻击后撤退
          if (!selUnit.moved && cfg.move > 0) {
            const atkTile = findAttackPosition(state, selUnit, enemy.x, enemy.y, cfg.atkRange, hp.index);
            if (atkTile) {
              chargeAndRetreat(state, selUnit, atkTile, () => {
                resolveCombat(state, selUnit, enemy);
              });
              updateAllExplored(state);
              syncAndRender();
              return;
            }
          }
        }
      }

      // === 攻击敌方建筑 ===
      if (selUnit && !selUnit.attacked && cfg && cfg.atkRange > 0 &&
          clickedBuilding && clickedBuilding.owner !== hp.index) {
        // 1. 已在攻击范围内 → 直接攻击
        if (canAttackBuilding(state, selUnit, tx, ty)) {
          resolveBuildingCombat(state, selUnit, tx, ty);
          updateAllExplored(state);
          syncAndRender();
          return;
        }
        // 2. 不在攻击范围内但可移动 → 冲锋攻击后撤退
        if (!selUnit.moved && cfg.move > 0) {
          const atkTile = findAttackPosition(state, selUnit, tx, ty, cfg.atkRange, hp.index);
          if (atkTile) {
            chargeAndRetreat(state, selUnit, atkTile, () => {
              resolveBuildingCombat(state, selUnit, tx, ty);
            });
            updateAllExplored(state);
            syncAndRender();
            return;
          }
        }
      }

      // === 普通移动 ===
      if (selUnit && !selUnit.moved) {
        const reachable = getReachableTiles(state, selUnit, hp.index);
        if (reachable.has(`${tx},${ty}`) && (tx !== selUnit.x || ty !== selUnit.y)) {
          moveUnit(state, selUnit, tx, ty);
          state.actionMsg = `${UNIT_TYPES[selUnit.type].name}移动到(${tx},${ty})`;
          updateAllExplored(state);
          // 自动攻击
          checkAutoAttack(selUnit);
          syncAndRender();
          return;
        }
      }

      clearSelection();
      return;
    }

    // 选择己方单位
    if (clickedUnit) {
      // 再次点击已选中的单位 → 取消选择
      if (state.selectedUnitId === clickedUnit.id) {
        clearSelection();
        return;
      }
      state.selectedUnitId = clickedUnit.id;
      state.selectedBuilding = null;
      buildMenuVisible.value = false;
      syncAndRender();
      return;
    }

    // 选择己方建筑
    if (isOwnBuilding) {
      // 再次点击已选中的建筑 → 取消选择
      if (state.selectedBuilding && state.selectedBuilding.x === tx && state.selectedBuilding.y === ty) {
        clearSelection();
        return;
      }
      state.selectedUnitId = null;
      state.selectedBuilding = { x: tx, y: ty };
      buildMenuVisible.value = false;
      syncAndRender();
      return;
    }

    clearSelection();
  }

  function checkAutoAttack(unit) {
    if (unit.attacked) return;
    const cfg = UNIT_TYPES[unit.type];
    if (cfg.atkRange === 0) return;
    const hp = state.players.find(p => p.isHuman && p.alive);
    if (!hp) return;
    for (const enemy of state.units) {
      if (enemy.owner === hp.index) continue;
      if (canAttack(state, unit, enemy)) {
        resolveCombat(state, unit, enemy);
        updateAllExplored(state);
        return;
      }
    }
  }

  // ========== 建造系统 ==========
  let pendingBuildType = null; // 放置模式中待建造的类型

  function showBuildMenu() {
    const hp = state.players.find(p => p.isHuman && p.alive);
    if (!hp || state.currentPlayer !== hp.index) return;

    buildMenuTitle.value = '选择建造';
    const items = [];

    for (const [btype, cfg] of Object.entries(BUILDING_TYPES)) {
      if (!cfg.buildable) continue;
      const affordable = hp.food >= cfg.buildCost;
      items.push({
        label: `${cfg.name} 🌾${cfg.buildCost}`,
        action: () => startPlacement(btype),
        disabled: !affordable,
        hint: !affordable ? ' (粮草不足)' : ''
      });
    }

    items.push({ label: '取消', action: () => { buildMenuVisible.value = false; }, disabled: false, hint: '' });
    buildMenuItems.value = items;
    buildMenuVisible.value = true;
  }

  function startPlacement(buildingType) {
    buildMenuVisible.value = false;
    pendingBuildType = buildingType;
    state.pendingBuildType = buildingType;
    isPlacing.value = true;
    state.selectedUnitId = null;
    state.selectedBuilding = null;
    state.actionMsg = `点击平原或沃土放置${BUILDING_TYPES[buildingType].name}`;
    syncAndRender();
  }

  function cancelPlacement() {
    pendingBuildType = null;
    state.pendingBuildType = null;
    isPlacing.value = false;
    state.actionMsg = '';
    syncAndRender();
  }

  function tryPlaceBuilding(tx, ty) {
    const hp = state.players.find(p => p.isHuman && p.alive);
    if (!hp || state.currentPlayer !== hp.index) return false;

    if (!canBuildOn(state, tx, ty, hp.index)) {
      state.actionMsg = `无法在此建造！仅平原和沃土可建造。`;
      syncAndRender();
      return false;
    }

    const ok = buildStructure(state, hp.index, tx, ty, pendingBuildType);
    if (ok) {
      const cfg = BUILDING_TYPES[pendingBuildType];
      // 连续建造：粮草仍充足则保持放置模式，否则自动退出
      if (hp.food < cfg.buildCost) {
        pendingBuildType = null;
        state.pendingBuildType = null;
        isPlacing.value = false;
        state.actionMsg = `建造了${cfg.name}！粮草不足，已退出建造。`;
      } else {
        state.actionMsg = `建造了${cfg.name}！可继续放置${cfg.name}，点"取消建造"结束。`;
      }
      state.selectedUnitId = null;
      state.selectedBuilding = null;
      updateAllExplored(state);
      syncAndRender();
      return true;
    }
    state.actionMsg = '粮草不足，无法建造！';
    syncAndRender();
    return false;
  }

  function isPlacingValid(state, x, y, playerIdx) {
    if (!pendingBuildType) return false;
    return canBuildOn(state, x, y, playerIdx);
  }

  function showProduceMenu() {
    const hp = state.players.find(p => p.isHuman && p.alive);
    if (!hp || !state.selectedBuilding) return;
    const bk = `${state.selectedBuilding.x},${state.selectedBuilding.y}`;
    const bType = canProduce(state, hp.index, bk);
    if (!bType) return;

    const unitType = BARRACKS_TYPE_MAP[bType];
    if (!unitType) return;

    buildMenuTitle.value = '生产兵种';
    const cfg = UNIT_TYPES[unitType];
    const affordable = hp.food >= cfg.buildCost;

    buildMenuItems.value = [
      { label: `${cfg.name} (${cfg.troops}兵) 🌾${cfg.buildCost}`, action: () => tryProduce(unitType), disabled: !affordable, hint: '' },
      { label: '取消', action: () => { buildMenuVisible.value = false; }, disabled: false, hint: '' }
    ];
    buildMenuVisible.value = true;
  }

  function tryProduce(unitType) {
    const hp = state.players.find(p => p.isHuman && p.alive);
    if (!hp || !state.selectedBuilding) return;
    const bk = `${state.selectedBuilding.x},${state.selectedBuilding.y}`;
    const ok = produceUnit(state, hp.index, bk, unitType);
    buildMenuVisible.value = false;
    if (ok) {
      updateAllExplored(state);
      syncAndRender();
    } else {
      state.actionMsg = '生产失败！粮草不足或位置被占。';
      syncAndRender();
    }
  }

  // ========== 拆除建筑 ==========

  function showDemolishMenu() {
    const hp = state.players.find(p => p.isHuman && p.alive);
    if (!hp || !state.selectedBuilding) return;
    const b = getBuilding(state, state.selectedBuilding.x, state.selectedBuilding.y);
    if (!b || b.owner !== hp.index) return;
    const cfg = BUILDING_TYPES[b.type];
    if (b.type === 'hq' || !cfg.buildCost) return;

    const refund = Math.floor(cfg.buildCost * 0.5);
    buildMenuTitle.value = '拆除建筑';
    buildMenuItems.value = [
      { label: `确认拆除${cfg.name}（返还🌾${refund}）`, action: () => tryDemolish(), disabled: false, hint: '' },
      { label: '取消', action: () => { buildMenuVisible.value = false; }, disabled: false, hint: '' }
    ];
    buildMenuVisible.value = true;
  }

  function tryDemolish() {
    const hp = state.players.find(p => p.isHuman && p.alive);
    if (!hp || !state.selectedBuilding) return;
    const ok = demolishStructure(state, hp.index, state.selectedBuilding.x, state.selectedBuilding.y);
    buildMenuVisible.value = false;
    state.selectedBuilding = null;
    if (ok) {
      updateAllExplored(state);
      syncAndRender();
    } else {
      state.actionMsg = '拆除失败！';
      syncAndRender();
    }
  }

  // ========== 存档/读档 ==========

  async function openSaveMenu(mode = 'save') {
    if (saveBusy.value) return;
    saveMenuMode.value = mode;
    saveMsg.value = '';
    saveMenuVisible.value = true;
    await refreshSaveList();
  }

  function closeSaveMenu() {
    saveMenuVisible.value = false;
  }

  function switchSaveMode(mode) {
    saveMenuMode.value = mode;
    saveMsg.value = '';
    refreshSaveList();
  }

  async function refreshSaveList() {
    saveBusy.value = true;
    try {
      saveList.value = await saveApi.list();
    } catch (e) {
      saveMsg.value = `无法连接存档服务：${e.message}`;
    } finally {
      saveBusy.value = false;
    }
  }

  function buildSavePayload(slotName) {
    return {
      slotName,
      mapSize: state.mapW,
      turn: state.turn,
      phase: 'playing',
      stateJson: JSON.stringify(serializeGameState(state)),
    };
  }

  async function saveCurrentGame() {
    const hp = state.players.find(p => p.isHuman && p.alive);
    if (state.tutorialMode) {
      saveMsg.value = '教学关卡无需存档';
      return;
    }
    if (!hp || state.currentPlayer !== hp.index || state.aiThinking || state.phase !== 'playing') {
      saveMsg.value = '只能在己方回合内存档';
      return;
    }
    if (saveBusy.value) return;
    saveBusy.value = true;
    saveMsg.value = '';
    try {
      const now = new Date();
      const pad = n => String(n).padStart(2, '0');
      const slotName = `第${state.turn}回合-${pad(now.getMonth() + 1)}${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
      await saveApi.create(buildSavePayload(slotName));
      saveMsg.value = '存档成功！';
      await refreshSaveList();
    } catch (e) {
      saveMsg.value = `存档失败：${e.message}`;
    } finally {
      saveBusy.value = false;
    }
  }

  // 返回主界面：确认后自动保存当前进度，再回到主菜单（可读档继续）
  function returnToMenu() {
    if (!window.confirm('确定返回主界面吗？将自动保存当前进度。')) return;
    if (state.tutorialMode) {
      location.reload();
      return;
    }
    const hp = state.players.find(p => p.isHuman && p.alive);
    const canSave = hp && state.phase === 'playing' && state.currentPlayer === hp.index && !state.aiThinking;
    if (canSave) {
      try {
        const now = new Date();
        const pad = n => String(n).padStart(2, '0');
        const slotName = `返回存档-第${state.turn}回合-${pad(now.getMonth() + 1)}${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
        saveApi.create(buildSavePayload(slotName))
          .then(() => location.reload())
          .catch(() => location.reload());
        return;
      } catch { /* 保存失败则直接返回 */ }
    }
    location.reload();
  }

  async function loadSave(id) {
    if (saveBusy.value) return;
    saveBusy.value = true;
    saveMsg.value = '';
    try {
      const detail = await saveApi.get(id);
      const loaded = deserializeGameState(JSON.parse(detail.stateJson));
      applyLoadedState(loaded);
      saveMenuVisible.value = false;
      syncAndRender();
    } catch (e) {
      saveMsg.value = `读档失败：${e.message}`;
    } finally {
      saveBusy.value = false;
    }
  }

  async function deleteSave(id) {
    if (saveBusy.value) return;
    saveBusy.value = true;
    try {
      await saveApi.remove(id);
      saveList.value = saveList.value.filter(s => s.id !== id);
      saveMsg.value = '已删除该存档';
    } catch (e) {
      saveMsg.value = `删除失败：${e.message}`;
    } finally {
      saveBusy.value = false;
    }
  }

  function applyLoadedState(loaded) {
    state.tutorialMode = false;
    tutorialActive.value = false;
    tutorialDone.value = false;
    state.zoomFactor = loaded.zoomFactor || 1.0;
    zoomFactor.value = state.zoomFactor;
    state.mapW = loaded.mapW;
    state.mapH = loaded.mapH;
    state.terrain = loaded.terrain;
    state.explored = loaded.explored;
    state.buildings = loaded.buildings;
    state.players = loaded.players;
    state.units = loaded.units;
    // 旧存档含所有 AI 视野数组（大图多 AI 时可达数十 MB），读档后立即裁剪；
    // 必须在 players 赋值之后执行
    keepOnlyHumanExplored(state);
    state.currentPlayer = loaded.currentPlayer;
    state.turn = loaded.turn;
    state.nextUnitId = loaded.nextUnitId;
    state.viewCX = loaded.viewCX;
    state.viewCY = loaded.viewCY;
    state.tileSize = loaded.tileSize || state.tileSize;
    state.winner = loaded.winner ?? null;
    state.phase = 'playing';
    state.aiThinking = false;
    state.selectedUnitId = null;
    state.selectedBuilding = null;
    state.pendingBuildType = null;
    pendingBuildType = null;
    state.actionMsg = '读档成功，继续战局！';

    // 若存档恰好在 AI 回合（一般不会），则按新回合流程启动
    const hp = state.players.find(p => p.isHuman && p.alive);
    if (hp && state.currentPlayer !== hp.index) {
      startTurn(state, doRender, refreshUI, handleGameOver);
    }
  }

  // ========== 输入处理 ==========

  function onPointerDown(e) {
    if (state.phase !== 'playing' || state.aiThinking) return;
    touchStartTime = Date.now();
    touchStartX = e.clientX;
    touchStartY = e.clientY;
    panStartCX = state.viewCX;
    panStartCY = state.viewCY;
    pointerDown = true;
    panning = false;
    // 捕获指针：拖出画布也能继续平移
    if (e.target && e.target.setPointerCapture) {
      try { e.target.setPointerCapture(e.pointerId); } catch { /* noop */ }
    }
  }

  function onPointerMove(e) {
    if (state.phase !== 'playing' || state.aiThinking || !pointerDown) return;
    const dx = e.clientX - touchStartX;
    const dy = e.clientY - touchStartY;
    // 超过阈值才算拖拽平移，快速点击不受影响
    if (!panning && Math.hypot(dx, dy) > 10) {
      panning = true;
      if (gameCanvas.value) gameCanvas.value.style.cursor = 'grabbing';
    }
    if (!panning) return;

    state.viewCX = panStartCX - dx / state.tileSize;
    state.viewCY = panStartCY - dy / state.tileSize;
    // 用 rAF 节流渲染，拖拽更流畅
    if (!panFrame) {
      panFrame = requestAnimationFrame(() => {
        panFrame = null;
        clampViewToExplored();
        doRender();
      });
    }
  }

  function onPointerUp(e) {
    if (state.phase !== 'playing' || state.aiThinking) {
      pointerDown = false;
      panning = false;
      return;
    }
    const dx = e.clientX - touchStartX;
    const dy = e.clientY - touchStartY;
    const elapsed = Date.now() - touchStartTime;
    panning = false;
    pointerDown = false;
    if (gameCanvas.value) gameCanvas.value.style.cursor = '';
    // 只有快速点击才算 tap，长按或拖拽平移忽略
    if (elapsed <= 400 && Math.abs(dx) <= 15 && Math.abs(dy) <= 15) {
      const { x, y } = screenToWorld(state, touchStartX, touchStartY, window.innerWidth, window.innerHeight);
      handleTap(x, y);
    }
  }

  // ========== 右键查看信息 ==========
  function onContextMenu(e) {
    if (state.phase !== 'playing') return;
    const { x, y } = screenToWorld(state, e.clientX, e.clientY, window.innerWidth, window.innerHeight);
    showInfo(x, y);
  }

  // ========== 小地图 → 点击打开大地图 ==========
  function onMinimapClick(e) {
    if (state.phase !== 'playing') return;
    e.stopPropagation();
    toggleBigMap();
  }

  // ========== 大地图系统 ==========

  function toggleBigMap() {
    bigMapVisible.value = !bigMapVisible.value;
    if (bigMapVisible.value) {
      // 计算大地图尺寸：占屏幕 85%
      bigMapW.value = Math.floor(window.innerWidth * 0.92);
      bigMapH.value = Math.floor((window.innerHeight - 44 - 120) * 0.88);
      // 下一帧绘制
      setTimeout(() => drawBigMap(), 50);
    }
  }

  function closeBigMap() {
    bigMapVisible.value = false;
    doRender();
  }

  function drawBigMap() {
    if (!bigMapCanvas.value || !bigMapVisible.value) return;
    drawMapOverlay(state, bigMapCanvas.value, bigMapW.value, bigMapH.value, false);
  }

  function onBigMapClick(e) {
    e.stopPropagation();
    const pos = mapClickToWorld(state, bigMapCanvas.value, e.clientX, e.clientY, bigMapW.value, bigMapH.value);
    if (!pos) return;
    centerViewOn(state, pos.x, pos.y);
    clampViewToExplored();
    drawBigMap();
    doRender();
  }

  function onBigMapPointerDown(e) {
    if (!bigMapVisible.value) return;
    e.preventDefault();
  }

  function onBigMapPointerMove(e) {
    // 大地图不跟随拖拽 — 仅点击跳转
  }

  function onBigMapPointerUp(e) {
    // no-op
  }

  function onKeydown(e) {
    if (state.phase !== 'playing') return;
    // Escape: 优先关闭大地图，其次清除选择
    if (e.key === 'Escape') {
      if (pendingBuildType) {
        cancelPlacement();
        return;
      }
      if (bigMapVisible.value) {
        closeBigMap();
        return;
      }
      clearSelection();
      return;
    }

    const action = settingsService.getActionForKey(e.key);
    if (!action) return;

    const speed = 3;
    switch (action) {
      case 'moveUp': state.viewCY -= speed; clampViewToExplored(); doRender(); break;
      case 'moveDown': state.viewCY += speed; clampViewToExplored(); doRender(); break;
      case 'moveLeft': state.viewCX -= speed; clampViewToExplored(); doRender(); break;
      case 'moveRight': state.viewCX += speed; clampViewToExplored(); doRender(); break;
      case 'endTurn': playerEndTurn(); break;
      case 'build': showBuildMenu(); break;
      case 'bigMap': toggleBigMap(); break;
      case 'zoomIn': zoomIn(); break;
      case 'zoomOut': zoomOut(); break;
      case 'resetZoom': resetZoom(); break;
    }
  }

  return {
    // refs
    gameCanvas, minimapCanvas, bigMapCanvas,
    // 响应式状态
    phase, hudPlayerName, hudPlayerColor, hudFood, hudTurn, hudUnits,
    isHumanTurn, unitInfoText, actionMsg,
    buildMenuVisible, buildMenuItems, buildMenuTitle,
    btnEndTurnDisabled, btnBuildDisabled, btnProduceDisabled, btnSkipDisabled, btnDemolishDisabled,
    btnRangedVisible, btnRangedDisabled, rangedMode,
    gameOverVisible, gameOverTitle, gameOverMsg, isCreating,
    // 存档
    saveMenuVisible, saveMenuMode, saveList, saveBusy, saveMsg,
    unitDetail,
    buildingDetail,
    isPlacing,
    tutorialActive, tutorialDone, tutorialStep,
    // 缩放
    zoomFactor,
    // 大地图
    bigMapVisible, bigMapW, bigMapH,
    // 方法
    startGame, restartGame,
    playerEndTurn, skipUnit, clearSelection, cancelPlacement, toggleRangedMode,
    showBuildMenu, showProduceMenu, showDemolishMenu,
    openSaveMenu, closeSaveMenu, switchSaveMode, refreshSaveList,
    saveCurrentGame, loadSave, deleteSave,
    returnToMenu,
    startTutorial, nextTutorialStep, skipTutorial, finishTutorial,
    onPointerDown, onPointerMove, onPointerUp,
    onContextMenu,
    onMinimapClick, onKeydown, onWheel,
    showInfo,
    zoomIn, zoomOut, setZoom, resetZoom,
    syncAndRender, doRender,
    // 大地图方法
    toggleBigMap, closeBigMap, drawBigMap,
    onBigMapClick, onBigMapPointerDown, onBigMapPointerMove, onBigMapPointerUp,
  };
}
