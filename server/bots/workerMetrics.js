/** Metrics for this Node worker process, not the remote Python sandboxes. */
export function createWorkerMetricsSampler({ cpuUsage = () => process.cpuUsage(), memoryUsage = () => process.memoryUsage(),
  uptime = () => process.uptime(), now = () => performance.now() } = {}) {
  let prior = null;
  return () => {
    const cpu = cpuUsage(), at = now(), memory = memoryUsage();
    const elapsed = prior ? at - prior.at : 0;
    const consumed = prior ? cpu.user + cpu.system - prior.cpu.user - prior.cpu.system : 0;
    // CPU microseconds / elapsed milliseconds; 100% means one fully used core.
    const cpuPercent = elapsed > 0 && consumed >= 0 ? Math.round((consumed / (elapsed * 1000) * 100) * 10) / 10 : null;
    prior = { cpu, at };
    return { cpuPercent, rssBytes: memory.rss, uptimeSeconds: Math.floor(uptime()) };
  };
}
