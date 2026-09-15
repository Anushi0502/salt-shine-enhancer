export function parseProcessTable(output) {
  const processes = [];
  for (const line of String(output || "").split(/\r?\n/)) {
    const match = line.match(/^\s*(\d+)\s+(\d+)\s*$/);
    if (!match) continue;
    processes.push({ pid: Number(match[1]), ppid: Number(match[2]) });
  }
  return processes.filter(({ pid, ppid }) => pid > 0 && ppid >= 0);
}

export function descendantPids(rootPid, processes) {
  const root = Number(rootPid);
  if (!Number.isInteger(root) || root <= 0) return [];

  const childrenByParent = new Map();
  for (const process of Array.isArray(processes) ? processes : []) {
    const children = childrenByParent.get(process.ppid) || [];
    children.push(process.pid);
    childrenByParent.set(process.ppid, children);
  }

  const descendants = [];
  const queue = [...(childrenByParent.get(root) || [])];
  const visited = new Set([root]);
  while (queue.length) {
    const pid = queue.shift();
    if (visited.has(pid)) continue;
    visited.add(pid);
    descendants.push(pid);
    queue.push(...(childrenByParent.get(pid) || []));
  }
  return descendants.reverse();
}

export function buildProcessTerminationTargets(rootPid, processTable, selfPid = 0) {
  const root = Number(rootPid);
  const self = Number(selfPid);
  if (!Number.isInteger(root) || root <= 0 || root === self) return [];
  return [...descendantPids(root, processTable), root]
    .filter((pid, index, values) => pid !== self && values.indexOf(pid) === index);
}
