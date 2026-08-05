# 兵临城下 · 存档后端

Spring Boot 3.5.16 + JDK 21 + Maven 3.9.12 + MySQL 8.0，为前端 H5 战棋游戏提供存档/读档接口。

## 环境要求

- JDK 21
- Maven 3.9.12（本机已安装于 `C:\Program Files\Java\apache-maven-3.9.12`）
- MySQL 8.0（本机服务名 MySQL80，root 密码 123456）

## 数据库初始化

```sql
CREATE DATABASE IF NOT EXISTS ink_game DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

表结构由 JPA 首次启动时自动创建（`ddl-auto: update`），无需手动建表。

## 运行

```bash
cd backend
mvn spring-boot:run
# 或打包后运行
mvn -DskipTests package
java -jar target/ink-game-backend-1.0.0.jar
```

服务默认监听 `http://localhost:8080`。

## 配置

通过环境变量覆盖默认值：

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `DB_HOST` | `localhost` | MySQL 主机 |
| `DB_PORT` | `3306` | MySQL 端口 |
| `DB_NAME` | `ink_game` | 数据库名 |
| `DB_USERNAME` | `root` | 数据库用户 |
| `DB_PASSWORD` | `123456` | 数据库密码 |

## 接口

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/saves` | 存档摘要列表（按更新时间倒序，不含正文） |
| GET | `/api/saves/{id}` | 存档详情（含 `stateJson` 字符串） |
| POST | `/api/saves` | 新建存档 |
| PUT | `/api/saves/{id}` | 覆盖存档 |
| DELETE | `/api/saves/{id}` | 删除存档 |

新建/覆盖请求体：

```json
{
  "slotName": "第3回合-0805 10:30",
  "mapSize": 500,
  "turn": 3,
  "phase": "playing",
  "stateJson": "{...游戏状态 JSON...}"
}
```

## 前端联调

- 开发环境：Vite 已配置代理，前端请求 `/api/*` 会自动转发到 `http://localhost:8080`，直接 `npm run dev` 即可。
- 生产环境：将 `dist/` 静态文件部署后，需把 `/api` 反向代理到后端 8080 端口；或在构建时指定后端地址：

```bash
VITE_API_BASE=http://your-host:8080/api npm run build
```
