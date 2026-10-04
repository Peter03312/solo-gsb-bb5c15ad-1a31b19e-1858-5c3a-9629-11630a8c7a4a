// 首次启动时写入演示赛事（可用 SEED_DEMO=0 关闭）。
export function seedDemo(db) {
  const tx = db.transaction(() => {
    db.prepare(
      `UPDATE events
       SET name = ?, start_point = ?, finish_point = ?, finish_deadline = ?
       WHERE id = 1`
    ).run('2026 公园定向邀请赛', 'START', 'FINISH', 1800);

    const insGroup = db.prepare(
      'INSERT INTO checkpoint_groups (seq, name, point_code) VALUES (?, ?, ?)'
    );
    [
      [1, '第一组（近点）', 'A1'],
      [1, '第一组（近点）', 'A2'],
      [2, '第二组（山脊）', 'B1'],
      [2, '第二组（山脊）', 'B2'],
      [3, '第三组（林点）', 'C1'],
      [3, '第三组（林点）', 'C2'],
    ].forEach((g) => insGroup.run(...g));

    const insReading = db.prepare(
      `INSERT INTO readings
         (record_no, bib, point_code, seconds, original_point_code, original_seconds)
       VALUES (?, ?, ?, ?, ?, ?)`
    );
    const rows = [
      // 101：正常完成，1600 秒；1003 为同点多余打卡，不作依据
      [1001, '101', 'START', 0],
      [1002, '101', 'A1', 200],
      [1003, '101', 'A1', 210],
      [1004, '101', 'B1', 600],
      [1005, '101', 'C2', 1200],
      [1006, '101', 'FINISH', 1600],
      // 102：走替代点，同耗时 1600 秒并列
      [2001, '102', 'START', 0],
      [2002, '102', 'A2', 250],
      [2003, '102', 'B2', 600],
      [2004, '102', 'C1', 1200],
      [2005, '102', 'FINISH', 1600],
      // 103：逆序打卡（C2 在 B1 之前），第二组之后无法完成第三组
      [3001, '103', 'START', 0],
      [3002, '103', 'A1', 300],
      [3003, '103', 'C2', 700],
      [3004, '103', 'B1', 1100],
      [3005, '103', 'FINISH', 1500],
      // 104：完成全部组但终点 1900 秒，超过截止 1800
      [4001, '104', 'START', 0],
      [4002, '104', 'A2', 400],
      [4003, '104', 'B2', 900],
      [4004, '104', 'C1', 1500],
      [4005, '104', 'FINISH', 1900],
    ];
    for (const [recordNo, bib, point, seconds] of rows) {
      insReading.run(recordNo, bib, point, seconds, point, seconds);
    }
  });
  tx();
}
