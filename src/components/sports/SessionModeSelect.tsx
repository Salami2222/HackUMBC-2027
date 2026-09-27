import { useSquatSession } from '@/exercise/SquatSessionProvider';
import { SessionMode } from '@/exercise/session-config';
import './SessionModeSelect.scss';

export function SessionModeSelect({
  id,
  className = '',
}: {
  id: string;
  className?: string;
}) {
  const { sessionMode, selectSessionMode, phase } = useSquatSession();
  return (
    <label className={`session-mode-select ${className}`} htmlFor={id}>
      <span>Session Type</span>
      <select
        id={id}
        value={sessionMode}
        disabled={phase !== 'idle'}
        onChange={(event) =>
          selectSessionMode(event.target.value as SessionMode)
        }
      >
        <option value="form-test">Form Test</option>
        <option value="working-set">Working Set</option>
      </select>
    </label>
  );
}
