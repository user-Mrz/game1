-- ============================================
-- 兵临城下 H5 战棋游戏 · 数据库初始化脚本
-- 适用：MySQL 8.0 · 字符集 utf8mb4
-- 说明：后端已配置 JPA 自动建表（ddl-auto: update），
--       此脚本用于需要手动初始化数据库/表结构的场景。
-- ============================================

CREATE DATABASE IF NOT EXISTS ink_game
  DEFAULT CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE ink_game;

CREATE TABLE IF NOT EXISTS game_save (
  id          BIGINT       NOT NULL AUTO_INCREMENT COMMENT '存档ID',
  slot_name   VARCHAR(64)  NOT NULL COMMENT '存档名称',
  map_size    INT          NOT NULL COMMENT '地图大小',
  turn        INT          NOT NULL COMMENT '回合数',
  phase       VARCHAR(16)  NOT NULL COMMENT '游戏阶段',
  state_json  LONGTEXT     NOT NULL COMMENT '游戏状态JSON',
  created_at  DATETIME(6)  NOT NULL COMMENT '创建时间',
  updated_at  DATETIME(6)  NOT NULL COMMENT '更新时间',
  PRIMARY KEY (id),
  KEY idx_updated_at (updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='游戏存档表';
