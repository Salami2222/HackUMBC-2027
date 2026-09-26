import { FormEvent, useEffect, useRef, useState } from 'react';
import {
  AddUnknownDeviceRequestT,
  RpcMessage,
  SerialDeviceT,
  SerialDeviceType,
  SerialDevicesRequestT,
  SerialDevicesResponseT,
  StartWifiProvisioningRequestT,
  StopWifiProvisioningRequestT,
  UnknownDeviceHandshakeNotificationT,
  WifiProvisioningStatus,
  WifiProvisioningStatusResponseT,
} from 'solarxr-protocol';
import { useWebsocketAPI } from '@/hooks/websocket-api';
import { NodePicker } from './NodePicker';

const statusMessages: Record<WifiProvisioningStatus, string> = {
  [WifiProvisioningStatus.NONE]:
    'Waiting for a USB node. Plug it in and turn it on.',
  [WifiProvisioningStatus.SERIAL_INIT]: 'Opening the USB connection…',
  [WifiProvisioningStatus.OBTAINING_MAC_ADDRESS]: 'Identifying your node…',
  [WifiProvisioningStatus.PROVISIONING]: 'Sending Wi-Fi settings to the node…',
  [WifiProvisioningStatus.CONNECTING]:
    'The node is joining your Wi-Fi network…',
  [WifiProvisioningStatus.LOOKING_FOR_SERVER]:
    'Wi-Fi connected. Looking for MotionLab…',
  [WifiProvisioningStatus.DONE]:
    'Node connected. You can unplug USB, or plug in the next node.',
  [WifiProvisioningStatus.CONNECTION_ERROR]:
    'Could not join Wi-Fi. Check the network name, password, and 2.4 GHz setting. Stop setup to edit and retry.',
  [WifiProvisioningStatus.COULD_NOT_FIND_SERVER]:
    'Wi-Fi joined, but the node cannot reach this computer. Connect both to the same network and check its firewall settings.',
  [WifiProvisioningStatus.NO_SERIAL_LOGS_ERROR]:
    'The USB device is not responding. Turn the node on and use a data-capable cable.',
  [WifiProvisioningStatus.NO_SERIAL_DEVICE_FOUND]:
    'No USB node detected yet. Plug it in, power it on, and setup will continue.',
};

export function NodeSetup({
  open,
  onToggle,
}: {
  open: boolean;
  onToggle: () => void;
}) {
  const { isConnected, sendRPCPacket, useRPCPacket } = useWebsocketAPI();
  const [ports, setPorts] = useState<SerialDeviceT[]>([]);
  const [port, setPort] = useState('');
  const [ssid, setSsid] = useState('');
  const [password, setPassword] = useState('');
  const [active, setActive] = useState(false);
  const owned = useRef(false);
  const interrupted = useRef(false);
  const [status, setStatus] = useState(WifiProvisioningStatus.NONE);
  const [error, setError] = useState('');
  const [nearby, setNearby] = useState<Record<string, number>>({});
  const [pending, setPending] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now);

  useEffect(() => {
    if (!isConnected) {
      setPorts([]);
      setNearby({});
      if (owned.current) {
        setError(
          'Connection to the local service was lost. Reconnect, then enter your Wi-Fi details to retry.'
        );
        owned.current = false;
        interrupted.current = true;
        setActive(false);
      }
      return;
    }
    if (interrupted.current) {
      sendRPCPacket(
        RpcMessage.StopWifiProvisioningRequest,
        new StopWifiProvisioningRequestT()
      );
      interrupted.current = false;
    }
    const scan = () =>
      sendRPCPacket(
        RpcMessage.SerialDevicesRequest,
        new SerialDevicesRequestT()
      );
    scan();
    const timer = setInterval(scan, 3000);
    return () => clearInterval(timer);
  }, [isConnected]);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    const release = () => {
      if (owned.current)
        sendRPCPacket(
          RpcMessage.StopWifiProvisioningRequest,
          new StopWifiProvisioningRequestT()
        );
      owned.current = false;
    };
    window.addEventListener('pagehide', release);
    return () => {
      clearInterval(timer);
      window.removeEventListener('pagehide', release);
      release();
    };
  }, []);
  useRPCPacket(
    RpcMessage.SerialDevicesResponse,
    (data: SerialDevicesResponseT) => {
      setPorts(
        (data.devices ?? []).filter(
          (device) => device.type === SerialDeviceType.ESP_TRACKER
        )
      );
    }
  );
  useRPCPacket(
    RpcMessage.WifiProvisioningStatusResponse,
    (data: WifiProvisioningStatusResponseT) => {
      if (owned.current) setStatus(data.status);
    }
  );
  useRPCPacket(
    RpcMessage.UnknownDeviceHandshakeNotification,
    (data: UnknownDeviceHandshakeNotificationT) => {
      if (!data.macAddress) return;
      const mac = String(data.macAddress);
      setNearby((current) =>
        Object.fromEntries([
          ...Object.entries(current).filter(
            ([, time]) => Date.now() - time < 10000
          ),
          [mac, Date.now()],
        ])
      );
    }
  );
  const discovered = Object.keys(nearby).filter(
    (mac) => now - nearby[mac] < 10000
  );
  const start = (event: FormEvent) => {
    event.preventDefault();
    if (!isConnected || active) return;
    const bytes = new TextEncoder();
    if (
      !ssid.length ||
      bytes.encode(ssid).length > 32 ||
      /[\r\n\0]/.test(ssid)
    ) {
      setError('Enter a network name of 1–32 bytes.');
      return;
    }
    const passwordBytes = bytes.encode(password).length;
    if (
      (passwordBytes > 0 && passwordBytes < 8) ||
      passwordBytes > 63 ||
      /[\r\n\0]/.test(password)
    ) {
      setError(
        'Use an 8–63 byte Wi-Fi password, or leave it empty for an open network.'
      );
      return;
    }
    if (port && !ports.some((device) => String(device.port) === port)) {
      setError(
        'That USB node is no longer attached. Choose automatic detection or reconnect it.'
      );
      return;
    }
    setError('');
    setStatus(WifiProvisioningStatus.NONE);
    owned.current = true;
    setActive(true);
    sendRPCPacket(
      RpcMessage.StartWifiProvisioningRequest,
      new StartWifiProvisioningRequestT(ssid, password, port || null)
    );
    setPassword('');
  };
  const stop = () => {
    sendRPCPacket(
      RpcMessage.StopWifiProvisioningRequest,
      new StopWifiProvisioningRequestT()
    );
    owned.current = false;
    setActive(false);
    setPassword('');
    setError('');
  };

  return (
    <section className="sports-panel node-setup" aria-label="Node setup">
      <button
        className="node-setup-toggle"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls="node-setup-content"
      >
        <span>
          <span className="panel-index">NODE CONNECTION</span>
          <strong>Connect your nodes</strong>
        </span>
        <span>
          {active
            ? 'USB setup on'
            : ports.length
              ? `${ports.length} USB node${ports.length === 1 ? '' : 's'} detected`
              : 'Wi-Fi & USB setup'}{' '}
          <span aria-hidden="true">{open ? '−' : '+'}</span>
        </span>
      </button>
      {discovered.length > 0 && (
        <div className="node-discovery" role="status">
          {discovered.map((mac) => (
            <div key={mac}>
              <span>
                Node {mac.slice(-5).replace(':', '')} found on your network
              </span>
              <button
                type="button"
                className="secondary-button"
                onClick={() => {
                  sendRPCPacket(
                    RpcMessage.AddUnknownDeviceRequest,
                    new AddUnknownDeviceRequestT(mac)
                  );
                  setPending(mac);
                }}
              >
                {pending === mac ? 'Retry connection' : 'Connect node'}
              </button>
            </div>
          ))}
        </div>
      )}
      {open && (
        <div id="node-setup-content" className="node-setup-content">
          <div className="node-setup-guide">
            <h3>Plug in. Power on. Connect.</h3>
            <p>
              For a new node, enter your Wi-Fi details and start USB setup. Plug
              in nodes one at a time; MotionLab detects and connects them
              automatically. Stop USB setup when you are finished.
            </p>
            <p>
              Once configured, nodes remember their Wi-Fi and reconnect when you
              turn them on. USB is only needed for setup or charging.
            </p>
            <p className="node-setup-hint">
              Use the same 2.4 GHz network as this computer. For an iPhone
              hotspot, enable Maximize Compatibility.
            </p>
          </div>
          <form
            className="node-wifi-form sentry-mask"
            autoComplete="off"
            onSubmit={start}
          >
            <label className="node-input">
              Wi-Fi network
              <input
                name="wifi-network"
                autoComplete="off"
                value={ssid}
                disabled={active}
                onChange={(event) => setSsid(event.target.value)}
                placeholder="Network name"
                required
                maxLength={32}
              />
            </label>
            <label className="node-input">
              Wi-Fi password
              <input
                name="wifi-password"
                type="password"
                autoComplete="new-password"
                value={password}
                disabled={active}
                onChange={(event) => setPassword(event.target.value)}
                placeholder={active ? 'Sent to node setup' : 'Password'}
                maxLength={63}
              />
            </label>
            <NodePicker
              label="USB node"
              value={port}
              onChange={setPort}
              disabled={active}
              placeholder="Detect automatically"
              options={[
                {
                  value: '',
                  label: 'Detect automatically',
                  detail: ports.length
                    ? `${ports.length} attached`
                    : 'Waiting for USB',
                },
                ...ports.map((device) => ({
                  value: String(device.port),
                  label: 'USB node',
                  detail: String(device.port),
                })),
              ]}
            />
            <p className="node-privacy-note">
              Wi-Fi details are sent to your node through the local service.
              MotionLab does not save them in browser storage.
            </p>
            <div className="node-setup-actions">
              {active ? (
                <button
                  type="button"
                  className="secondary-button"
                  onClick={(event) => {
                    event.preventDefault();
                    stop();
                  }}
                >
                  Stop USB setup
                </button>
              ) : (
                <button
                  className="primary-button"
                  type="submit"
                  disabled={!isConnected}
                >
                  Start USB setup
                </button>
              )}
            </div>
          </form>
        </div>
      )}
      <div className="node-setup-status" role="status">
        {!isConnected
          ? 'Local tracking service is offline. Start it on this computer to connect nodes.'
          : error ||
            (active
              ? statusMessages[status]
              : 'Ready. Previously configured nodes reconnect automatically.')}
      </div>
    </section>
  );
}
