#!/bin/bash
# Phase 1 Task Queue System Test Script

echo "🧪 Testing Phase 1: Task Queue System"
echo "======================================"
echo ""

API_URL="http://localhost:8000"

# 1. Create a workspace first
echo "1️⃣  Creating test workspace..."
WORKSPACE_RESPONSE=$(curl -s -X POST "$API_URL/workspaces" \
  -H "Content-Type: application/json" \
  -d '{"name":"test-queue-workspace","mode":"sandbox"}')

WORKSPACE_ID=$(echo $WORKSPACE_RESPONSE | grep -o '"id":"[^"]*' | cut -d'"' -f4)

if [ -z "$WORKSPACE_ID" ]; then
    echo "❌ Failed to create workspace"
    exit 1
fi

echo "✅ Workspace created: $WORKSPACE_ID"
echo ""

# 2. Submit a job to the queue
echo "2️⃣  Submitting job to queue..."
JOB_RESPONSE=$(curl -s -X POST "$API_URL/api/jobs" \
  -H "Content-Type: application/json" \
  -d "{\"command\":\"echo 'Hello from Celery!' && sleep 3\",\"workspace_id\":\"$WORKSPACE_ID\",\"priority\":5}")

echo "Response: $JOB_RESPONSE"
JOB_ID=$(echo $JOB_RESPONSE | grep -o '"id":"[^"]*' | cut -d'"' -f4)

if [ -z "$JOB_ID" ]; then
    echo "❌ Failed to submit job"
    exit 1
fi

echo "✅ Job submitted: $JOB_ID"
echo ""

# 3. Check job status
echo "3️⃣  Checking job status..."
sleep 2

JOB_STATUS=$(curl -s "$API_URL/api/jobs/$JOB_ID")
echo "Status: $JOB_STATUS"
echo ""

# 4. List all jobs for workspace
echo "4️⃣  Listing all jobs for workspace..."
JOBS_LIST=$(curl -s "$API_URL/api/jobs?workspace_id=$WORKSPACE_ID")
echo "Jobs: $JOBS_LIST"
echo ""

# 5. Wait for job to complete
echo "5️⃣  Waiting for job to complete..."
sleep 5

FINAL_STATUS=$(curl -s "$API_URL/api/jobs/$JOB_ID")
echo "Final Status: $FINAL_STATUS"
echo ""

echo "======================================"
echo "✨ Test complete!"
echo ""
echo "To view in frontend:"
echo "  1. Open http://localhost:3000"
echo "  2. Navigate to workspace: $WORKSPACE_ID"
echo "  3. Open right panel (Tool Logs button)"
echo "  4. Click 'Task Queue' tab"
