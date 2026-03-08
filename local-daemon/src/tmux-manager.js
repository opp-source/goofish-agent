import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

export class TmuxManager {
  constructor() {
    this.sessionName = null;
  }

  async init(sessionName) {
    this.sessionName = sessionName;
    
    // 检查会话是否已存在
    try {
      const { stdout } = await execAsync('tmux ls');
      if (stdout.includes(sessionName + ':')) {
        console.log(`tmux 会话 "${sessionName}" 已存在`);
        return;
      }
    } catch (error) {
      // tmux ls 失败说明没有会话
    }

    // 创建新会话
    try {
      await execAsync(`tmux new -d -s ${sessionName}`);
      console.log(`已创建 tmux 会话 "${sessionName}"`);
    } catch (error) {
      throw new Error(`创建 tmux 会话失败: ${error.message}`);
    }
  }

  async startClaude(claudePath, workDir) {
    if (!this.sessionName) {
      throw new Error('tmux 会话未初始化');
    }

    try {
      const isRunning = await this.isClaudeRunning();
      
      if (isRunning) {
        console.log('Claude 已在运行，跳过启动步骤');
        return;
      }

      const command = `tmux send-keys -t ${this.sessionName} 'cd ${workDir} && ${claudePath} sales-agent --dangerously-skip-permissions'`;
      await execAsync(command);
      
      await sleep(500);
      
      await execAsync(`tmux send-keys -t ${this.sessionName} Enter`);
      
      console.log('Claude 已在 tmux 会话中启动');
    } catch (error) {
      throw new Error(`启动 Claude 失败: ${error.message}`);
    }
  }

  async sendToClaude(message) {
    if (!this.sessionName) {
      throw new Error('tmux 会话未初始化');
    }

    try {
      const escapedMessage = message
        .replace(/\\/g, '\\\\')
        .replace(/"/g, '\\"')
        .replace(/\$/g, '\\$')
        .replace(/`/g, '\\`');

      await execAsync(`tmux send-keys -t ${this.sessionName} "${escapedMessage}"`);
      
      await sleep(500);
      
      await execAsync(`tmux send-keys -t ${this.sessionName} Enter`);
    } catch (error) {
      throw new Error(`发送消息到 Claude 失败: ${error.message}`);
    }
  }

  async checkSession() {
    if (!this.sessionName) {
      return false;
    }

    try {
      const { stdout } = await execAsync('tmux ls');
      return stdout.includes(this.sessionName + ':');
    } catch (error) {
      return false;
    }
  }

  async killSession() {
    if (!this.sessionName) {
      return;
    }

    try {
      await execAsync(`tmux kill-session -t ${this.sessionName}`);
      console.log(`已关闭 tmux 会话 "${this.sessionName}"`);
    } catch (error) {
      console.error(`关闭 tmux 会话失败: ${error.message}`);
    }
  }

  async captureOutput() {
    if (!this.sessionName) {
      throw new Error('tmux 会话未初始化');
    }

    try {
      const { stdout } = await execAsync(`tmux capture-pane -t ${this.sessionName} -p`);
      return stdout;
    } catch (error) {
      throw new Error(`捕获 tmux 输出失败: ${error.message}`);
    }
  }

  async isClaudeRunning() {
    if (!this.sessionName) {
      return false;
    }

    try {
      const output = await this.captureOutput();
      
      if (!output || output.trim() === '') {
        return false;
      }

      const lines = output.split('\n');
      const lastLine = lines[lines.length - 1];

      if (lastLine.includes('bypass permissions') || 
          lastLine.includes('shift+tab to cycle') || 
          lastLine.includes('esc to interrupt')) {
        return true;
      }

      if (output.includes('opencode') || output.includes('I can help') || output.includes('What would you like')) {
        return true;
      }

      if (output.includes('chrome-devtools') && output.includes('MCP')) {
        return true;
      }

      return false;
    } catch (error) {
      console.error(`检查 Claude 运行状态失败: ${error.message}`);
      return false;
    }
  }
}
