# User Instruction Memory

## Entries

[Project Knowledge Summary]
- Date: 2026-08-27
- Context: Agent 在为 opencode 安装外部 skills（anthropics/skills frontend-design、vercel-labs/agent-skills web-design-guidelines）时确认
- Category: Environment Configuration
- Instructions:
  - opencode 全局 skills 安装在 /root/.config/opencode/skills/<name>/SKILL.md，会话启动时加载，改动后需重启 opencode 生效
  - 已安装 frontend-design（来自 anthropics/skills，含 LICENSE.txt）与 web-design-guidelines（来自 vercel-labs/agent-skills）
  - web-design-guidelines 的规则源在 https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md，审查前应重新拉取
