# Docker Compose 使用指南

## 启动所有服务

```bash
cd backend/docker

# 首次启动（需要构建镜像）
docker-compose up --build

# 后续启动
docker-compose up -d  # -d 表示后台运行
```

## 服务说明

启动后将运行以下服务：

1. **PostgreSQL** (端口 5438)
   - 数据库服务
   
2. **Redis** (端口 6389)
   - 消息队列 & 缓存

3. **FastAPI Backend** (端口 8000)
   - Web API 服务
   - 访问: http://localhost:8000

4. **Celery Worker**
   - 后台任务执行器
   - 从 Redis 队列中取任务执行

## 常用命令

```bash
# 查看日志
docker-compose logs -f backend      # 查看 FastAPI 日志
docker-compose logs -f celery_worker  # 查看 Celery 日志

# 停止所有服务
docker-compose down

# 停止并删除数据卷（慎用！）
docker-compose down -v

# 重启某个服务
docker-compose restart backend

# 进入容器
docker-compose exec backend bash
docker-compose exec celery_worker bash
```

## 环境变量

创建 `.env` 文件在 `backend/docker` 目录：

```env
ANTHROPIC_API_KEY=your-api-key-here
LLM_PROVIDER=anthropic
LLM_MODEL=claude-3-5-sonnet-20240620
MCP_TOKEN=your-mcp-token
```

## 开发模式

代码修改会自动重载：
- Backend: uvicorn --reload
- Worker: 需要手动重启 `docker-compose restart celery_worker`
