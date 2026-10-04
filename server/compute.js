// 成绩计算核心：
// 从出发后的有效读数中，选出「时间严格递增、依序通过各组、截止前到终点」的最早有效链。
// 逆序打卡与多余打卡不会成为完成依据；无有效链时指出首个未完成组或终点超时。

// 读数 -> 有效内容：作废的排除；被更正的使用更正后的点位/秒数。
export function effectiveReadings(rows) {
  return rows
    .filter((r) => r.status !== 'void')
    .map((r) => ({
      recordNo: r.record_no,
      bib: r.bib,
      pointCode: r.status === 'corrected' ? r.corrected_point_code : r.point_code,
      seconds: r.status === 'corrected' ? r.corrected_seconds : r.seconds,
      status: r.status,
    }))
    // 时间严格递增；同一秒以记录号较小者为先（确定性决胜）。
    .sort((a, b) => a.seconds - b.seconds || a.recordNo - b.recordNo);
}

function computeOne(bib, rows, event, groupsBySeq) {
  const all = rows.sort((a, b) => a.seconds - b.seconds || a.recordNo - b.recordNo);
  const chain = [];

  const fail = (stage, reason, extra = {}) => ({
    bib,
    finished: false,
    rank: null,
    duration: null,
    chain,
    failStage: stage,
    failReason: reason,
    readingCount: rows.length,
    ...extra,
  });

  // 1) 唯一出发打卡
  const starts = all.filter((r) => r.pointCode === event.start_point);
  if (starts.length === 0) {
    return fail('start', `未找到出发打卡（点位 ${event.start_point}）`);
  }
  if (starts.length > 1) {
    return fail(
      'start',
      `存在 ${starts.length} 条有效出发打卡（记录号 ${starts.map((s) => s.recordNo).join('、')}），出发打卡必须唯一`
    );
  }
  const start = starts[0];
  chain.push({ stage: 'start', seq: 0, recordNo: start.recordNo, pointCode: start.pointCode, seconds: start.seconds });

  // 2) 依序通过各组，每组取「当前时间之后、属于本组任一点位」的最早一条（贪心即最早链）。
  let currentTime = start.seconds;
  for (const seq of [...groupsBySeq.keys()].sort((a, b) => a - b)) {
    const group = groupsBySeq.get(seq);
    const hit = all.find((r) => group.points.has(r.pointCode) && r.seconds > currentTime);
    if (!hit) {
      return fail(
        'group',
        `未完成第 ${seq} 组「${group.name}」：出发${currentTime}秒后无该组点位（${[...group.points].join('/')}）的有效打卡`,
        { groupSeq: seq, groupName: group.name, lastSeconds: currentTime }
      );
    }
    chain.push({ stage: 'group', seq, recordNo: hit.recordNo, pointCode: hit.pointCode, seconds: hit.seconds, name: group.name });
    currentTime = hit.seconds;
  }

  // 3) 终点：最后一组之后的最早终点读数；必须不晚于截止秒数。
  const finishes = all.filter((r) => r.pointCode === event.finish_point && r.seconds > currentTime);
  if (finishes.length === 0) {
    return fail(
      'finish',
      `最后一组（${currentTime}秒）之后没有终点点位 ${event.finish_point} 的有效打卡`,
      { lastSeconds: currentTime }
    );
  }
  const finish = finishes[0];
  if (finish.seconds > event.finish_deadline) {
    return fail(
      'finish',
      `终点超时：最早到达终点为 ${finish.seconds} 秒，晚于截止 ${event.finish_deadline} 秒`,
      { lastSeconds: currentTime, finishSeconds: finish.seconds, deadline: event.finish_deadline }
    );
  }
  chain.push({ stage: 'finish', seq: -1, recordNo: finish.recordNo, pointCode: finish.pointCode, seconds: finish.seconds });

  return {
    bib,
    finished: true,
    rank: null,
    duration: finish.seconds - start.seconds,
    startTime: start.seconds,
    finishSeconds: finish.seconds,
    chain,
    failStage: null,
    failReason: null,
    readingCount: rows.length,
  };
}

function bibCompare(a, b) {
  const na = Number(a);
  const nb = Number(b);
  if (Number.isInteger(na) && Number.isInteger(nb) && String(na) === a && String(nb) === b) return na - nb;
  return a.localeCompare(b, 'zh-Hans-CN');
}

// event: events 行；groups: [{seq,name,point_code}]；rawReadings: readings 表行。
export function computeResults(event, groups, rawReadings) {
  const groupsBySeq = new Map();
  for (const g of groups) {
    if (!groupsBySeq.has(g.seq)) groupsBySeq.set(g.seq, { seq: g.seq, name: g.name, points: new Set() });
    groupsBySeq.get(g.seq).points.add(g.point_code);
  }

  const byBib = new Map();
  for (const r of effectiveReadings(rawReadings)) {
    if (!byBib.has(r.bib)) byBib.set(r.bib, []);
    byBib.get(r.bib).push(r);
  }

  let results = [...byBib.entries()].map(([bib, rows]) => computeOne(bib, rows, event, groupsBySeq));

  // 完成者按耗时升序；同耗时并列（标准竞赛排名，并列后名次跳空）。
  const finishers = results.filter((r) => r.finished).sort(
    (a, b) => a.duration - b.duration || bibCompare(a.bib, b.bib)
  );
  let lastDuration = null;
  let lastRank = 0;
  finishers.forEach((r, i) => {
    if (lastDuration !== r.duration) {
      lastRank = i + 1;
      lastDuration = r.duration;
    }
    r.rank = lastRank;
  });

  const dnf = results.filter((r) => !r.finished).sort((a, b) => bibCompare(a.bib, b.bib));
  return {
    finishers,
    unfinished: dnf,
    all: [...finishers, ...dnf],
    finisherCount: finishers.length,
    bibCount: results.length,
  };
}
