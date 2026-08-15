// ========================= 宝塔面板 PM2 配置文件 =========================
// 宝塔"网站 → Node 项目"添加项目时选择"自定义 ecosystem.config.cjs"方式。
// 部署注意（详见 README「宝塔面板部署」节，均为宝塔实测踩坑点）：
// 1. name 必须与宝塔面板中的【项目名称】完全一致，否则面板显示"未启动"
// 2. 环境变量必须写在本文件的 env 段（宝塔执行 pm2 start 不带 --env production，
//    env_production 不会注入进程）
// 3. cwd 是绝对路径，需与宝塔网站目录一致（默认 /www/wwwroot/eco-builder，
//    路径不同请修改）
// 4. 单进程 fork 模式（少用户场景，内存限流不跨进程共享）

module.exports = {
  apps: [
    {
      // 项目名称：与宝塔 Node 项目名保持一致（注意勿混用空格/下划线）
      name: "eco-builder",
      // 入口文件：npm run build 后生成的编译产物
      script: "./dist-server/index.js",
      // 运行目录：宝塔网站根目录（绝对路径）
      cwd: "/www/wwwroot/eco-builder",
      // 单进程模式（少用户场景，避免多进程内存限流不同步）
      exec_mode: "fork",
      instances: 1,
      // 环境变量（宝塔只注入 env 段；API key 由部署者在面板/此处填写）
      env: {
        NODE_ENV: "production",
        PORT: 3000,
        OPENAI_BASE_URL: "https://api.deepseek.com",
        OPENAI_MODEL: "deepseek-v4-flash",
        // 部署时替换为真实 key（或在宝塔面板"环境变量"栏填写）
        OPENAI_API_KEY: "sk-your-key-here",
      },
      // 日志不指定路径，用 PM2 默认（~/.pm2/logs，避免 www 用户写权限问题）
    },
  ],
};
