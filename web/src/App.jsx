import React, { useCallback, useEffect, useState } from 'react';
import { api } from './api.js';
import ResultsTab from './components/ResultsTab.jsx';
import ReadingsTab from './components/ReadingsTab.jsx';
import ImportTab from './components/ImportTab.jsx';
import SetupTab from './components/SetupTab.jsx';
import PublishTab from './components/PublishTab.jsx';

const TABS = [
  { key: 'results', label: '成绩榜与链' },
  { key: 'readings', label: '打卡复核' },
  { key: 'import', label: '导入打卡' },
  { key: 'setup', label: '关卡设置' },
  { key: 'publish', label: '发布冻结' },
];

export default function App() {
  const [tab, setTab] = useState('results');
  const [eventInfo, setEventInfo] = useState(null);
  const [live, setLive] = useState(null);
  const [toast, setToast] = useState(null);

  const showToast = useCallback((msg, isError = false) => {
    setToast({ msg, isError });
    setTimeout(() => setToast(null), 4500);
  }, []);

  const refresh = useCallback(async () => {
    const [ev, lv] = await Promise.all([api.getEvent(), api.getLiveResults()]);
    setEventInfo(ev);
    setLive(lv);
  }, []);

  useEffect(() => {
    refresh().catch((e) => showToast(e.message, true));
  }, [refresh]);

  // 409：操作依据的修订号过期，自动刷新并提示。
  const handleError = useCallback(
    (e) => {
      if (e.status === 409) {
        showToast(`赛事已被他人修改（当前修订号 ${e.data.current_revision}），已为你刷新`);
        refresh();
      } else {
        showToast(e.message, true);
      }
    },
    [refresh, showToast]
  );

  const revision = eventInfo?.event?.revision;

  return (
    <>
      <header className="topbar">
        <h1>🧭 定向越野打卡争议复核</h1>
        {eventInfo && (
          <>
            <span>{eventInfo.event.name}</span>
            <span className="badge live">当前修订号 {revision}</span>
            {eventInfo.latest_publication ? (
              <span className="badge frozen">
                最新冻结版 {eventInfo.latest_publication.version_label}（修订号 {eventInfo.latest_publication.event_revision}）
              </span>
            ) : (
              <span className="badge">尚未发布</span>
            )}
          </>
        )}
      </header>

      <nav className="tabs">
        {TABS.map((t) => (
          <button key={t.key} className={tab === t.key ? 'active' : ''} onClick={() => setTab(t.key)}>
            {t.label}
          </button>
        ))}
      </nav>

      <main>
        {tab === 'results' && <ResultsTab live={live} onError={handleError} />}
        {tab === 'readings' && (
          <ReadingsTab
            live={live}
            revision={revision}
            onChanged={refresh}
            onError={handleError}
            showToast={showToast}
          />
        )}
        {tab === 'import' && (
          <ImportTab revision={revision} onChanged={refresh} onError={handleError} showToast={showToast} />
        )}
        {tab === 'setup' && (
          <SetupTab
            eventInfo={eventInfo}
            onChanged={refresh}
            onError={handleError}
            showToast={showToast}
          />
        )}
        {tab === 'publish' && (
          <PublishTab
            eventInfo={eventInfo}
            onChanged={refresh}
            onError={handleError}
            showToast={showToast}
          />
        )}
      </main>

      {toast && <div className={`toast ${toast.isError ? 'error' : ''}`}>{toast.msg}</div>}
    </>
  );
}
