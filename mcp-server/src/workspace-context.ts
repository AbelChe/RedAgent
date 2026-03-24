/**
 * WorkspaceContext - 管理当前活跃的 workspace ID
 *
 * 提供全局的 workspace 上下文，支持：
 * - 自动生成初始 workspace
 * - 创建新 workspace
 * - 切换 workspace
 * - 查询当前 workspace
 */
import crypto from 'crypto';

class WorkspaceContext {
    private currentWorkspaceId: string;
    private workspaceHistory: Array<{ id: string; createdAt: Date; name?: string }> = [];

    constructor() {
        // 初始化时创建默认 workspace
        this.currentWorkspaceId = this.generateWorkspaceId();
        this.workspaceHistory.push({
            id: this.currentWorkspaceId,
            createdAt: new Date(),
            name: 'default'
        });
    }

    /**
     * 获取当前活跃的 workspace ID
     */
    getCurrentWorkspaceId(): string {
        return this.currentWorkspaceId;
    }

    /**
     * 创建新 workspace 并切换到它
     * @param name 可选的 workspace 名称（用于标识）
     * @returns 新创建的 workspace ID
     */
    createWorkspace(name?: string): { id: string; createdAt: Date; name?: string } {
        const newId = this.generateWorkspaceId(name);
        const workspace = {
            id: newId,
            createdAt: new Date(),
            name
        };
        this.workspaceHistory.push(workspace);
        this.currentWorkspaceId = newId;
        return workspace;
    }

    /**
     * 切换到已存在的 workspace
     * @param workspaceId 要切换到的 workspace ID
     * @returns 是否切换成功
     */
    switchWorkspace(workspaceId: string): boolean {
        const exists = this.workspaceHistory.some(w => w.id === workspaceId);
        if (exists) {
            this.currentWorkspaceId = workspaceId;
            return true;
        }
        return false;
    }

    /**
     * 列出所有 workspace
     */
    listWorkspaces(): Array<{ id: string; createdAt: Date; name?: string; isCurrent: boolean }> {
        return this.workspaceHistory.map(w => ({
            ...w,
            isCurrent: w.id === this.currentWorkspaceId
        }));
    }

    /**
     * 生成 workspace ID
     */
    private generateWorkspaceId(name?: string): string {
        const timestamp = Date.now();
        const shortUuid = crypto.randomUUID().slice(0, 8);
        if (name) {
            // 清理名称：只保留字母数字和连字符
            const cleanName = name.replace(/[^a-zA-Z0-9-]/g, '-').toLowerCase();
            return `ws-${cleanName}-${timestamp}-${shortUuid}`;
        }
        return `ws-${timestamp}-${shortUuid}`;
    }
}

// 单例实例
export const workspaceContext = new WorkspaceContext();
