// A minimal Discord gateway client. Node 22 has WebSocket built in, so this
// needs no library: identify, heartbeat, resume, and hand dispatches upwards.
import { EventEmitter } from 'node:events';

const OP = {
  DISPATCH: 0,
  HEARTBEAT: 1,
  IDENTIFY: 2,
  RESUME: 6,
  RECONNECT: 7,
  INVALID_SESSION: 9,
  HELLO: 10,
  HEARTBEAT_ACK: 11,
};

export class Gateway extends EventEmitter {
  /**
   * @param {string} token bot token
   * @param {number} intents GUILDS is enough for slash commands and buttons
   */
  constructor(token, intents = 1) {
    super();
    this.token = token;
    this.intents = intents;
    this.ws = null;
    this.seq = null;
    this.sessionId = null;
    this.resumeUrl = null;
    this.heartbeat = null;
    this.acked = true;
    this.closing = false;
    this.backoff = 1000;
  }

  connect(url = 'wss://gateway.discord.gg/?v=10&encoding=json') {
    this.closing = false;
    this.ws = new WebSocket(url);

    this.ws.addEventListener('message', (event) => {
      let packet;
      try {
        packet = JSON.parse(event.data);
      } catch {
        return;
      }
      if (packet.s !== null && packet.s !== undefined) this.seq = packet.s;

      switch (packet.op) {
        case OP.HELLO:
          this.startHeartbeat(packet.d.heartbeat_interval);
          if (this.sessionId && this.resumeUrl) this.resume();
          else this.identify();
          break;
        case OP.HEARTBEAT_ACK:
          this.acked = true;
          break;
        case OP.RECONNECT:
          this.reconnect(true);
          break;
        case OP.INVALID_SESSION:
          this.sessionId = null;
          this.resumeUrl = null;
          setTimeout(() => this.identify(), 1500);
          break;
        case OP.DISPATCH:
          if (packet.t === 'READY') {
            this.sessionId = packet.d.session_id;
            this.resumeUrl = packet.d.resume_gateway_url
              ? `${packet.d.resume_gateway_url}/?v=10&encoding=json`
              : null;
            this.backoff = 1000;
          }
          this.emit('dispatch', packet.t, packet.d);
          break;
        default:
          break;
      }
    });

    this.ws.addEventListener('close', (event) => {
      this.stopHeartbeat();
      this.emit('closed', event.code, event.reason);
      // 4004 is a bad token and 4014 is a missing intent; retrying is pointless.
      if (this.closing || event.code === 4004 || event.code === 4014) return;
      this.reconnect();
    });

    this.ws.addEventListener('error', (err) => this.emit('error', err));
  }

  identify() {
    this.send(OP.IDENTIFY, {
      token: this.token,
      intents: this.intents,
      properties: { os: process.platform, browser: 'etsyauto', device: 'etsyauto' },
      presence: { status: 'online', activities: [{ name: 'the valley', type: 3 }], afk: false },
    });
  }

  resume() {
    this.send(OP.RESUME, { token: this.token, session_id: this.sessionId, seq: this.seq });
  }

  startHeartbeat(interval) {
    this.stopHeartbeat();
    this.acked = true;
    // First beat at a random offset, as Discord asks.
    setTimeout(() => this.beat(), Math.floor(interval * Math.random()));
    this.heartbeat = setInterval(() => this.beat(), interval);
  }

  beat() {
    if (!this.acked) {
      // The connection is a zombie. Start again.
      try {
        this.ws?.close(4000);
      } catch {}
      return;
    }
    this.acked = false;
    this.send(OP.HEARTBEAT, this.seq);
  }

  stopHeartbeat() {
    if (this.heartbeat) clearInterval(this.heartbeat);
    this.heartbeat = null;
  }

  send(op, d) {
    if (this.ws?.readyState !== 1) return;
    this.ws.send(JSON.stringify({ op, d }));
  }

  reconnect(immediate = false) {
    this.stopHeartbeat();
    try {
      this.ws?.close();
    } catch {}
    const delay = immediate ? 500 : this.backoff;
    this.backoff = Math.min(this.backoff * 2, 60000);
    setTimeout(() => this.connect(this.resumeUrl || undefined), delay);
  }

  close() {
    this.closing = true;
    this.stopHeartbeat();
    try {
      this.ws?.close(1000);
    } catch {}
  }
}

export default Gateway;
