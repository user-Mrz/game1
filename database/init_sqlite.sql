-- ============================================
-- 兵临城下 H5 战棋游戏 · 数据库初始化脚本
-- 适用：SQLite 3
-- 说明：后端已配置 JPA 自动建表（ddl-auto: update），
--       此脚本用于需要手动初始化数据库/表结构的场景。
-- ============================================

-- SQLite 不需要 CREATE DATABASE 和 USE
-- 直接连接到 .db 文件即可，例如：jdbc:sqlite:./data/ink_game.db

-- ============================================
-- 游戏存档表
-- ============================================
CREATE TABLE IF NOT EXISTS game_save (
  id          INTEGER      NOT NULL PRIMARY KEY AUTOINCREMENT,  -- 存档ID（SQLite自增主键必须是INTEGER + PRIMARY KEY）
  slot_name   TEXT         NOT NULL,                             -- 存档名称
  map_size    INTEGER      NOT NULL,                             -- 地图大小
  turn        INTEGER      NOT NULL,                             -- 回合数
  phase       TEXT         NOT NULL,                             -- 游戏阶段
  state_json  TEXT         NOT NULL,                             -- 游戏状态JSON（SQLite只有TEXT，无长度限制）
  created_at  TEXT         NOT NULL,                             -- 创建时间（ISO格式字符串，如 2025-01-01 12:00:00）
  updated_at  TEXT         NOT NULL                              -- 更新时间
);

-- 索引（SQLite 索引要单独创建，不能写在 CREATE TABLE 里）
CREATE INDEX IF NOT EXISTS idx_game_save_updated_at ON game_save(updated_at);
