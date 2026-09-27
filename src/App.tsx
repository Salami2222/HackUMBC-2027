import { createContext, useEffect, useState } from 'react';
import {
  HashRouter as Router,
  NavLink,
  Navigate,
  useLocation,
} from 'react-router-dom';
import { AppContextProvider } from './components/providers/AppContext';
import {
  useProvideWebsocketApi,
  WebSocketApiContext,
} from './hooks/websocket-api';
import { OnboardingContextProvider } from './components/onboarding/OnboardingContextProvider';
import { ConfigContextProvider } from './components/providers/ConfigContext';
import semver from 'semver';
import { error, log } from './utils/logging';
import { Preload } from './components/Preload';
import { TrackingChecklistProvider } from './components/tracking-checklist/TrackingChecklistProvider';
import { ElectronContextC, provideElectron } from './hooks/electron';
import { AppLocalizationProvider } from './i18n/config';
import { SportsDashboard } from './components/sports/SportsDashboard';
import { LiveMovementDashboard } from './components/sports/LiveMovementDashboard';
import {
  FeedbackDashboard,
  SetFeedbackNavigation,
} from './components/sports/SetFeedback';
import { PresentationDashboard } from './components/sports/PresentationDashboard';
import { DocumentationPage } from './components/sports/DocumentationPage';
import { SquatSessionProvider } from './exercise/SquatSessionProvider';
import { MeasurementProvider } from './measurement/MeasurementProvider';
import { useHeadlessGrounding } from './hooks/headless-grounding';
import './components/sports/CalibrationWorkspace.scss';
export const GH_REPO = 'SlimeVR/SlimeVR-Server';
export const VersionContext = createContext('');
export const DOCS_SITE = 'https://docs.slimevr.dev';
export const SLIMEVR_DISCORD = 'https://discord.gg/slimevr';

function AppSurface() {
  const { pathname } = useLocation();
  const groundingError = useHeadlessGrounding();
  const [presentationActions, setPresentationActions] =
    useState<HTMLDivElement | null>(null);
  if (
    !['/', '/calibration', '/presentation', '/feedback', '/docs'].includes(
      pathname
    )
  )
    return <Navigate to="/" replace />;

  return (
    <div className="sports-app">
      <SetFeedbackNavigation />
      <header className="sports-header">
        <div className="sports-brand">
          <img
            className="brand-mark"
            src="/kinetiq-squat.svg"
            alt="Kinetiq"
            width="36"
            height="36"
          />
          <NavLink
            to="/docs"
            className="documentation-link"
            aria-label="Documentation"
            title="Documentation"
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M12 5.5C9.3 3.8 6 3.7 3 5v15c3-1.3 6.3-1.2 9 .5 2.7-1.7 6-1.8 9-.5V5c-3-1.3-6.3-1.2-9 .5Z" />
              <path d="M12 5.5v15M6.5 8.5l2 .3M6.5 12l2 .3M15.5 8.8l2-.3M15.5 12.3l2-.3" />
            </svg>
          </NavLink>
        </div>
        <nav className="sports-nav" aria-label="Main navigation">
          <NavLink to="/" end>
            Tracking
          </NavLink>
          <NavLink to="/calibration">Sensor Calibration</NavLink>
          <NavLink to="/presentation">Presentation</NavLink>
          <NavLink to="/feedback">Feedback</NavLink>
        </nav>
        <div
          className="presentation-header-slot"
          ref={setPresentationActions}
          hidden={pathname !== '/presentation'}
        />
      </header>
      {groundingError && <p role="alert">{groundingError}</p>}
      <div hidden={pathname !== '/'}>
        <SportsDashboard active={pathname === '/'} />
      </div>
      <div hidden={pathname !== '/calibration'}>
        <LiveMovementDashboard active={pathname === '/calibration'} />
      </div>
      {pathname === '/feedback' && <FeedbackDashboard />}
      {pathname === '/docs' && <DocumentationPage />}
      {pathname === '/presentation' && (
        <PresentationDashboard headerTarget={presentationActions} />
      )}
    </div>
  );
}

export default function App() {
  const websocketAPI = useProvideWebsocketApi();
  const [updateFound, setUpdateFound] = useState('');
  const electron = provideElectron();

  useEffect(() => {
    const onKeydown: (arg0: KeyboardEvent) => void = function (event) {
      // prevent search bar keybind
      if (
        event.key === 'F3' ||
        (event.ctrlKey && event.key === 'f') ||
        (event.metaKey && event.key === 'f')
      ) {
        event.preventDefault();
      }
    };

    window.addEventListener('keydown', onKeydown);
    return () => window.removeEventListener('keydown', onKeydown);
  }, []);

  useEffect(() => {
    // don't show update stuff when on android
    if (window.__ANDROID__?.isThere()) return;

    if (!semver.valid(__VERSION_TAG__)) {
      log(
        { version: __VERSION_TAG__ || 'development' },
        'Non semver version, skipping the server update check'
      );
      return;
    }

    async function fetchReleases() {
      const releases = await fetch(
        `https://api.github.com/repos/${GH_REPO}/releases`
      )
        .then((res) => res.json())
        .catch(() => null)
        .then((json: any[]) => json.filter((rl) => rl?.prerelease === false));

      if (!releases) return;

      if (typeof releases[0].tag_name !== 'string') return;

      const version = semver.coerce(releases[0].tag_name);

      if (version && semver.gt(version, __VERSION_TAG__)) {
        setUpdateFound(releases[0].tag_name);
      }
    }
    fetchReleases().catch((e) => error(e, 'failed to fetch releases'));
  }, []);

  if (electron.isElectron) {
    useEffect(() => {
      const unlisten = electron.api.onServerStatus(({ type, message }) => {
        if (type === 'stderr') {
          // This strange invocation is what lets us lose the line information in the console
          // See more here: https://stackoverflow.com/a/48994308
          // These two are fine to keep with console.log, they are server logs
          setTimeout(
            console.log.bind(
              console,
              `%c[SERVER] %c${message}`,
              'color:cyan',
              'color:red'
            )
          );
        } else if (type === 'stdout') {
          setTimeout(
            console.log.bind(
              console,
              `%c[SERVER] %c${message}`,
              'color:cyan',
              'color:green'
            )
          );
        } else if (type === 'error') {
          error('Error: %s', message);
        } else if (type === 'terminated') {
          error('Server Process Terminated: %s', message);
        } else if (type === 'other') {
          log('Other process event: %s', message);
        }
      });

      return () => {
        unlisten();
      };
    }, []);
  }

  return (
    <ElectronContextC.Provider value={electron}>
      <AppLocalizationProvider>
        <Router>
          <ConfigContextProvider>
            <WebSocketApiContext.Provider value={websocketAPI}>
              <AppContextProvider>
                <OnboardingContextProvider>
                  <TrackingChecklistProvider>
                    <VersionContext.Provider value={updateFound}>
                      <div className="h-full w-full text-standard bg-background-80 text-background-10">
                        <Preload />
                        <MeasurementProvider>
                          <SquatSessionProvider>
                            <AppSurface />
                          </SquatSessionProvider>
                        </MeasurementProvider>
                      </div>
                    </VersionContext.Provider>
                  </TrackingChecklistProvider>
                </OnboardingContextProvider>
              </AppContextProvider>
            </WebSocketApiContext.Provider>
          </ConfigContextProvider>
        </Router>
      </AppLocalizationProvider>
    </ElectronContextC.Provider>
  );
}
