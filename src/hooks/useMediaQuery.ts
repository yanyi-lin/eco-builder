import { useEffect, useState } from "react";

/** 响应式断点检测：订阅 matchMedia 变化，返回当前是否命中查询。
 *  用于 JS 分支渲染（如桌面侧栏形态 / 移动端文档流形态），
 *  查询值需与 styles.css 的媒体查询断点保持互补（961px / 960px）。 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(
    () => window.matchMedia(query).matches,
  );

  useEffect(() => {
    const mq = window.matchMedia(query);
    const onChange = () => setMatches(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [query]);

  return matches;
}
