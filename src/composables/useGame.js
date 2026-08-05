// useGame composable — 连接游戏逻辑与 Vue 组件

import { shallowRef, ref, reactive, computed, markRaw } from 'vue';
import { createGameState, initPlayers, placeInitialBuildings, startTurn, endTurn } from '../game/state.js';
import { generateTerrain } from '../game/terrain.js';
import { spawnUnit } from '../game/units.js';
import { render, drawMapOverlay, mapClickToWorld } from '../game/renderer.js';
import { updateAllExplored, isUnitVisibleToPlayer } from '../game/vision.js';
import { centerViewOn } from '../game/camera.js';
import { getReachableTiles, moveUnit } from '../game/movement.js';
import { canAttack, resolveCombat, canAttackBuilding, resolveBuildingCombat } from '../game/combat.js';
import { getBuilding, screenToWorld, worldToScreen, updateTileSize, clamp } from '../game/utils.js';
import { getUnitsAt } from '../game/units.js';
import { canBuildOn, buildStructure, canProduce, produceUnit, demolishStructure } from '../game/buildings.js';
import { UNIT_TYPES, BUILDING_TYPES, BARRACKS_TYPE_MAP } from '../game/config.js';
import { TERRAIN } from '../game/config.js';
import { saveApi } from '../api/saveApi.js';
import { serializeGameState, deserializeGameState } from '../game/save.js';

export function useGame() {
  // Canvas refs (set by GameView)
  const gameCanvas = shallowRef(null);
  const minimapCanvas = shallowRef(null);
  const bigMapCanvas = shallowRef(null);

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

  // 大地图状态
  const bigMapVisible = ref(false);
  const bigMapW = ref(0);
  const bigMapH = ref(0);

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

    // 单位/建筑信息
    const selUnit = state.selectedUnitId ? state.units.find(u => u.id === state.selectedUnitId) : null;
    if (selUnit) {
      const cfg = UNIT_TYPES[selUnit.type];
      buildingDetail.value = null;
      const maxHp = cfg.troops * cfg.hpPerTroop;
      const hp = selUnit.troops * cfg.hpPerTroop;
      const atkPower = selUnit.troops * cfg.atkPerTroop;
      unitInfoText.value = `${cfg.name} 兵力:${selUnit.troops} | 血量:${hp}/${maxHp} | 攻击力:${atkPower} | 粮草:${selUnit.supplies}/${cfg.foodCap} | 移动:${selUnit.moved ? '已用' : '可用'} | 攻击:${selUnit.attacked ? '已用' : '可用'}`;
      unitDetail.value = {
        name: cfg.name,
        type: selUnit.type,
        troops: selUnit.troops,
        maxTroops: cfg.troops,
        hp,
        maxHp,
        atkPower,
        atkRange: cfg.atkRange,
        move: cfg.move,
        supplies: selUnit.supplies,
        foodCap: cfg.foodCap,
        moved: selUnit.moved,
        attacked: selUnit.attacked,
        ownerName: state.players[selUnit.owner]?.name || '',
        note: selUnit.type === 'supply' ? '可为相邻友军补充粮草 · 站上己方粮仓可补充储备' : '',
      };
      btnSkipDisabled.value = !isHumanTurn.value || state.aiThinking;
    } else if (state.selectedBuilding) {
      unitDetail.value = null;
      const b = getBuilding(state, state.selectedBuilding.x, state.selectedBuilding.y);
      if (b) {
        const bCfg = BUILDING_TYPES[b.type];
        unitInfoText.value = `${bCfg.name} HP:${b.hp}/${bCfg.hp} | 所属:${state.players[b.owner]?.name || '?'}`;
        const ut = BARRACKS_TYPE_MAP[b.type] ? UNIT_TYPES[BARRACKS_TYPE_MAP[b.type]] : null;
        const descMap = {
          hq: '主营 · 被摧毁则战败',
          farm: '农田 · 每回合产出粮草',
          arrow_tower: '箭塔 · 自动攻击2格内敌军',
          wall: '城墙 · 高耐久防御工事',
          watchtower: '哨塔 · 扩大视野范围',
          granary: '粮仓 · 单位站上后转化个人粮草补充储备',
        };
        buildingDetail.value = {
          name: bCfg.name,
          type: b.type,
          hp: b.hp,
          maxHp: bCfg.hp,
          ownerName: state.players[b.owner]?.name || '?',
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
      }
      btnSkipDisabled.value = true;
    } else {
      unitDetail.value = null;
      buildingDetail.value = null;
      unitInfoText.value = isHumanTurn.value ? '点击己方单位或建筑选择' : (state.aiThinking ? 'AI思考中...' : '等待中...');
      btnSkipDisabled.value = true;
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
  }

  // ========== 游戏流程 ==========

  function startGame(mapSize, aiCount) {
    isCreating.value = true;
    setTimeout(() => {
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

      startTurn(state, doRender, refreshUI, (won) => {
        gameOverTitle.value = won ? '旗开得胜' : '全军覆没';
        gameOverMsg.value = won ? '运筹帷幄之中，决胜千里之外。' : '主帅已殁，大势已去。';
        gameOverVisible.value = true;
        state.phase = 'over';
        syncPhase();
      });
    }, 100);
  }

  function restartGame() {
    location.reload();
  }

  // ========== 玩家操作 ==========

  function playerEndTurn() {
    if (!isHumanTurn.value || state.aiThinking) return;
    state.selectedUnitId = null;
    state.selectedBuilding = null;
    buildMenuVisible.value = false;
    endTurn(state, doRender, refreshUI, (won) => {
      gameOverTitle.value = won ? '旗开得胜' : '全军覆没';
      gameOverMsg.value = won ? '运筹帷幄之中，决胜千里之外。' : '主帅已殁，大势已去。';
      gameOverVisible.value = true;
      state.phase = 'over';
      syncPhase();
    });
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
    buildMenuVisible.value = false;
    syncAndRender();
  }

  // ========== 视野锁定 — 不能拖入纯黑区域 ==========
  function clampViewToExplored() {
    const hp = state.players.find(p => p.isHuman && p.alive);
    if (!hp) return;
    const exp = state.explored[hp.index];
    if (!exp) return;

    // 计算当前视口覆盖的 tile 范围
    const w = window.innerWidth;
    const h = window.innerHeight;
    updateTileSize(state, w, h);
    const ts = state.tileSize;
    const halfW = Math.ceil((w / ts) / 2) + 1;
    const halfH = Math.ceil(((h - 44 - 120) / ts) / 2) + 1;

    // 搜索最近已探索区域边界
    let minEx = Infinity, maxEx = -Infinity, minEy = Infinity, maxEy = -Infinity;
    const margin = 8; // 允许看到探索区域边缘外一些

    // 采样搜索已探索区域
    const step = Math.max(1, Math.floor(state.mapW / 200));
    for (let y = 0; y < state.mapH; y += step) {
      for (let x = 0; x < state.mapW; x += step) {
        if (exp[y * state.mapW + x]) {
          if (x < minEx) minEx = x;
          if (x > maxEx) maxEx = x;
          if (y < minEy) minEy = y;
          if (y > maxEy) maxEy = y;
        }
      }
    }

    if (minEx === Infinity) return; // 没探索过任何区域（不可能）

    // 视口不能超出探索范围太多
    state.viewCX = clamp(state.viewCX, minEx - halfW + margin, maxEx + halfW - margin);
    state.viewCY = clamp(state.viewCY, minEy - halfH + margin, maxEy + halfH - margin);
    // 也不能超出地图边界
    state.viewCX = clamp(state.viewCX, halfW, state.mapW - halfW);
    state.viewCY = clamp(state.viewCY, halfH, state.mapH - halfH);
  }

  // ========== 点击处理 ==========

  function handleTap(tx, ty) {
    if (tx < 0 || ty < 0 || tx >= state.mapW || ty >= state.mapH) return;
    const hp = state.players.find(p => p.isHuman && p.alive);
    if (!hp || state.currentPlayer !== hp.index) return;

    // 放置模式优先
    if (pendingBuildType) {
      // 连续建造：放不了也不退出放置模式，提示原因即可
      tryPlaceBuilding(tx, ty);
      return;
    }

    const clickedUnit = getUnitsAt(state, tx, ty).find(u => u.owner === hp.index);
    const clickedBuilding = getBuilding(state, tx, ty);
    const isOwnBuilding = clickedBuilding && clickedBuilding.owner === hp.index;

    // 移动已选中单位
    if (state.selectedUnitId && !clickedUnit) {
      const selUnit = state.units.find(u => u.id === state.selectedUnitId);
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

      // 攻击敌人
      if (selUnit && !selUnit.attacked) {
        const enemies = getUnitsAt(state, tx, ty).filter(u => u.owner !== hp.index);
        if (enemies.length > 0 && canAttack(state, selUnit, enemies[0])) {
          resolveCombat(state, selUnit, enemies[0]);
          updateAllExplored(state);
          syncAndRender();
          return;
        }
        // 攻击敌方建筑
        if (clickedBuilding && clickedBuilding.owner !== hp.index && canAttackBuilding(state, selUnit, tx, ty)) {
          resolveBuildingCombat(state, selUnit, tx, ty);
          updateAllExplored(state);
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
    state.mapW = loaded.mapW;
    state.mapH = loaded.mapH;
    state.terrain = loaded.terrain;
    state.explored = loaded.explored;
    state.buildings = loaded.buildings;
    state.players = loaded.players;
    state.units = loaded.units;
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
      startTurn(state, doRender, refreshUI, (won) => {
        gameOverTitle.value = won ? '旗开得胜' : '全军覆没';
        gameOverMsg.value = won ? '运筹帷幄之中，决胜千里之外。' : '主帅已殁，大势已去。';
        gameOverVisible.value = true;
        state.phase = 'over';
        syncPhase();
      });
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
    const speed = 3;
    switch (e.key) {
      case 'ArrowUp': state.viewCY -= speed; clampViewToExplored(); doRender(); break;
      case 'ArrowDown': state.viewCY += speed; clampViewToExplored(); doRender(); break;
      case 'ArrowLeft': state.viewCX -= speed; clampViewToExplored(); doRender(); break;
      case 'ArrowRight': state.viewCX += speed; clampViewToExplored(); doRender(); break;
      case 'e': playerEndTurn(); break;
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
    gameOverVisible, gameOverTitle, gameOverMsg, isCreating,
    // 存档
    saveMenuVisible, saveMenuMode, saveList, saveBusy, saveMsg,
    unitDetail,
    buildingDetail,
    isPlacing,
    // 大地图
    bigMapVisible, bigMapW, bigMapH,
    // 方法
    startGame, restartGame,
    playerEndTurn, skipUnit, clearSelection, cancelPlacement,
    showBuildMenu, showProduceMenu, showDemolishMenu,
    openSaveMenu, closeSaveMenu, switchSaveMode, refreshSaveList,
    saveCurrentGame, loadSave, deleteSave,
    returnToMenu,
    onPointerDown, onPointerMove, onPointerUp,
    onMinimapClick, onKeydown,
    syncAndRender, doRender,
    // 大地图方法
    toggleBigMap, closeBigMap, drawBigMap,
    onBigMapClick, onBigMapPointerDown, onBigMapPointerMove, onBigMapPointerUp,
  };
}
