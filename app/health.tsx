import StatusScreen from '../src/screens/StatusScreen';

/**
 * /health — dependency health.
 *
 * Deliberately not /status: Metro's dev server serves its own packager status
 * on that path and silently shadows the app route, which is a great way to
 * lose a minute in front of a judge.
 */
export default function HealthRoute() {
  return <StatusScreen />;
}
