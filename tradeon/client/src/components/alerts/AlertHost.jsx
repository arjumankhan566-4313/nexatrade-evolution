/**
 * AlertHost — 1:1 port of legacy src/components/alerts/AlertHost.jsx.
 * Mounts the two global alert channels ONCE per app root:
 *   <AlertHost />  →  <ToastStack />  +  <ModalAlertHost />
 */
import ModalAlertHost from './ModalAlertHost';
import ToastStack from './ToastStack';
import '@/styles/alerts.css';

export default function AlertHost() {
  return (
    <>
      <ToastStack />
      <ModalAlertHost />
    </>
  );
}
