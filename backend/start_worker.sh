#!/bin/bash
# Celery Worker 启动脚本

cd "$(dirname "$0")"

echo "🚀 Starting Celery Worker..."

celery -A app.core.celery_app worker \
    --loglevel=info \
    --concurrency=4 \
    --hostname=worker@%h \
    --pool=prefork

# 使用方法：
# chmod +x start_worker.sh
# ./start_worker.sh
