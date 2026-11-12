/* Piano Path — piano input: Bluetooth MIDI (Web Bluetooth), USB MIDI (Web MIDI), on-screen keys, computer keys. */
(function () {
  'use strict';
  const PP = (window.PP = window.PP || {});
  const BLE_MIDI_SERVICE = '03b80e5a-ede8-4b33-a751-6f72895d7c3e';
  const BLE_MIDI_CHAR = '7772e5db-3868-4112-a1a9-f2669d106bf3';

  const Input = {
    held: new Map(), // midi -> {t, src}
    subs: new Set(),
    statusSubs: new Set(),
    status: { kind: 'none', name: '', msg: '' },
    btDevice: null,
    btChar: null,
    btManualDisconnect: false,
    btRetries: 0,
    midiAccess: null,

    on(fn) { this.subs.add(fn); return () => this.subs.delete(fn); },
    onStatus(fn) { this.statusSubs.add(fn); fn(this.status); return () => this.statusSubs.delete(fn); },
    setStatus(s) {
      this.status = Object.assign({ kind: 'none', name: '', msg: '' }, s);
      this.statusSubs.forEach((fn) => { try { fn(this.status); } catch (e) { console.error(e); } });
    },
    heldMidis() { return [...this.held.keys()].sort((a, b) => a - b); },

    emit(type, midi, vel, t, src) {
      if (type === 'on') {
        this.held.set(midi, { t, src });
      } else {
        if (!this.held.has(midi)) return;
        this.held.delete(midi);
      }
      const ev = { type, midi, vel, t: t || performance.now(), src };
      this.subs.forEach((fn) => { try { fn(ev); } catch (e) { console.error(e); } });
    },
    clearHeld(src) {
      for (const [m, h] of [...this.held]) if (!src || h.src === src) this.emit('off', m, 0, performance.now(), h.src);
    },
    handleMsg(status, d1, d2, t, src) {
      const type = status & 0xf0;
      if (type === 0x90 && d2 > 0) this.emit('on', d1, d2 / 127, t, src);
      else if (type === 0x80 || (type === 0x90 && d2 === 0)) this.emit('off', d1, 0, t, src);
      else if (type === 0xb0 && (d1 === 123 || d1 === 120)) this.clearHeld(src);
    },

    // ----- USB / system MIDI -----
    midiSupported() { return !!navigator.requestMIDIAccess; },
    async connectMidi() {
      if (!this.midiSupported()) throw new Error('This browser can’t use MIDI. Open the app in Chrome.');
      const access = this.midiAccess || (await navigator.requestMIDIAccess({ sysex: false }));
      this.midiAccess = access;
      const attach = () => {
        const names = [];
        access.inputs.forEach((inp) => {
          inp.onmidimessage = (e) => {
            const d = e.data;
            if (!d || d.length < 1) return;
            this.handleMsg(d[0], d[1] || 0, d[2] || 0, e.timeStamp || performance.now(), 'midi');
          };
          if (inp.state !== 'disconnected') names.push(inp.name || 'MIDI device');
        });
        if (names.length) this.setStatus({ kind: 'midi', name: names.join(', ') });
        else if (this.status.kind === 'midi' || this.status.kind === 'none') {
          this.clearHeld('midi');
          this.setStatus({ kind: 'none', msg: 'No USB MIDI device found. Plug the piano in with a USB cable (and an OTG adapter on a tablet), then try again.' });
        }
      };
      attach();
      access.onstatechange = attach;
      PP.store && PP.store.setPref('lastConn', 'midi');
      return this.status.kind === 'midi';
    },

    // ----- Bluetooth MIDI -----
    btSupported() { return !!(navigator.bluetooth && navigator.bluetooth.requestDevice); },
    async connectBluetooth(showAll) {
      if (!this.btSupported()) throw new Error('Bluetooth isn’t available in this browser. Use Chrome on Android, and open the app from an https:// address.');
      const opts = showAll
        ? { acceptAllDevices: true, optionalServices: [BLE_MIDI_SERVICE] }
        : { filters: [{ services: [BLE_MIDI_SERVICE] }], optionalServices: [BLE_MIDI_SERVICE] };
      const device = await navigator.bluetooth.requestDevice(opts);
      await this.useBtDevice(device);
    },
    async useBtDevice(device) {
      if (this.btDevice && this.btDevice !== device) this.disconnectBluetooth();
      this.btDevice = device;
      this.btManualDisconnect = false;
      if (!device._ppBound) {
        device.addEventListener('gattserverdisconnected', () => this.onBtDisconnected());
        device._ppBound = true;
      }
      this.setStatus({ kind: 'connecting', name: device.name || 'Bluetooth piano' });
      await this.btConnectGatt();
      PP.store && PP.store.setPref('lastConn', 'bt');
    },
    async btConnectGatt() {
      const device = this.btDevice;
      const server = await device.gatt.connect();
      let svc;
      try {
        svc = await server.getPrimaryService(BLE_MIDI_SERVICE);
      } catch (e) {
        throw new Error('“' + (device.name || 'This device') + '” doesn’t offer Bluetooth MIDI. Check that the piano’s Bluetooth MIDI is switched on (some pianos have separate Bluetooth audio and MIDI).');
      }
      const ch = await svc.getCharacteristic(BLE_MIDI_CHAR);
      if (this.btChar) this.btChar.removeEventListener('characteristicvaluechanged', this._btHandler);
      this._btHandler = this._btHandler || ((e) => this.parseBle(e.target.value));
      ch.addEventListener('characteristicvaluechanged', this._btHandler);
      await ch.startNotifications();
      // Some devices only start sending after a read.
      try { await ch.readValue(); } catch (e) { /* optional */ }
      this.btChar = ch;
      this.btRetries = 0;
      if (PP.store && device.id) PP.store.setPref('btId', device.id);
      this.setStatus({ kind: 'bt', name: device.name || 'Bluetooth piano' });
    },
    onBtDisconnected() {
      this.clearHeld('bt');
      if (this.btManualDisconnect || !this.btDevice) { this.setStatus({ kind: 'none' }); return; }
      if (this.btRetries >= 5) {
        this.setStatus({ kind: 'none', msg: 'Lost the Bluetooth connection. Check the piano is on and nearby, then connect again.' });
        return;
      }
      const wait = 800 * Math.pow(2, this.btRetries++);
      this.setStatus({ kind: 'connecting', name: this.btDevice.name || 'Bluetooth piano', msg: 'Reconnecting…' });
      setTimeout(() => {
        if (this.btManualDisconnect) return;
        this.btConnectGatt().catch(() => this.onBtDisconnected());
      }, wait);
    },
    disconnectBluetooth() {
      this.btManualDisconnect = true;
      try { if (this.btDevice && this.btDevice.gatt.connected) this.btDevice.gatt.disconnect(); } catch (e) { /* ignore */ }
      this.btDevice = null;
      this.clearHeld('bt');
      this.setStatus({ kind: 'none' });
    },
    /** Try to reconnect to a previously allowed Bluetooth piano without a picker (Chrome supports this on some platforms). */
    async tryAutoReconnect() {
      try {
        if (!navigator.bluetooth || !navigator.bluetooth.getDevices) return false;
        const devices = await navigator.bluetooth.getDevices();
        const want = PP.store && PP.store.pref('btId');
        const d = devices.find((x) => x.id === want);
        if (!d) return false;
        await this.useBtDevice(d);
        return true;
      } catch (e) {
        if (this.status.kind === 'connecting') this.setStatus({ kind: 'none' });
        return false;
      }
    },

    /** Parse a BLE-MIDI packet (header, then [timestamp] status data… with running status). */
    parseBle(dv) {
      const n = dv.byteLength;
      if (n < 2) return;
      const t = performance.now();
      let i = 1;
      let running = 0;
      let guard = 0;
      while (i < n && guard++ < 512) {
        let b = dv.getUint8(i);
        if (b & 0x80) {
          // timestamp-low byte, possibly followed by a status byte
          i++;
          if (i >= n) break;
          b = dv.getUint8(i);
          if (b & 0x80) {
            if (b >= 0xf8) { i++; continue; } // real-time message, no data
            if (b === 0xf0) { // SysEx: skip to the end marker (a timestamp byte followed by 0xF7)
              i++;
              while (i + 1 < n && !((dv.getUint8(i) & 0x80) && dv.getUint8(i + 1) === 0xf7)) i++;
              i += 2;
              running = 0;
              continue;
            }
            running = b;
            i++;
          }
        }
        const type = running & 0xf0;
        const len = type === 0xc0 || type === 0xd0 ? 1 : type >= 0x80 && type <= 0xe0 ? 2 : 0;
        if (!len) { i++; continue; }
        if (i + len > n) break;
        const d1 = dv.getUint8(i);
        const d2 = len === 2 ? dv.getUint8(i + 1) : 0;
        if (d1 & 0x80) continue; // a timestamp byte: the loop top handles it
        if (d2 & 0x80) { i += 1; continue; } // truncated message: skip its first data byte
        this.handleMsg(running, d1, d2, t, 'bt');
        i += len;
      }
    },
  };
  PP.Input = Input;

  // ---------- On-screen keyboard ----------
  const Keys = {
    lo: 36, // C2
    hi: 84, // C6
    root: null,
    els: new Map(),
    marks: {},
    pointers: new Map(),
    showNames: false,
    isBlack: (m) => [1, 3, 6, 8, 10].includes(((m % 12) + 12) % 12),

    mount(root) {
      this.root = root;
      root.innerHTML = '';
      const inner = document.createElement('div');
      inner.className = 'kb-inner';
      root.appendChild(inner);
      let whiteIndex = 0;
      const W = 100 / this.countWhite();
      for (let m = this.lo; m <= this.hi; m++) {
        const k = document.createElement('div');
        const black = this.isBlack(m);
        k.className = 'key ' + (black ? 'black' : 'white');
        k.dataset.midi = m;
        if (black) k.style.left = `calc(${whiteIndex * W}% - var(--bkw) / 2)`;
        else { k.style.left = whiteIndex * W + '%'; k.style.width = W + '%'; whiteIndex++; }
        const lab = document.createElement('span');
        lab.className = 'kl';
        k.appendChild(lab);
        inner.appendChild(k);
        this.els.set(m, k);
      }
      this.relabel();
      inner.addEventListener('pointerdown', (e) => this.down(e));
      inner.addEventListener('pointermove', (e) => this.move(e));
      ['pointerup', 'pointercancel', 'lostpointercapture'].forEach((t) => inner.addEventListener(t, (e) => this.up(e)));
      inner.addEventListener('contextmenu', (e) => e.preventDefault());
      Input.on((ev) => {
        const k = this.els.get(ev.midi);
        if (k) k.classList.toggle('down', ev.type === 'on');
      });
    },
    countWhite() { let c = 0; for (let m = this.lo; m <= this.hi; m++) if (!this.isBlack(m)) c++; return c; },
    relabel() {
      for (const [m, k] of this.els) {
        const lab = k.firstChild;
        const pc = m % 12;
        if (this.showNames) lab.textContent = this.isBlack(m) ? '' : PP.M.LETTERS[PP.M.LETTER_PC.indexOf(pc)] + (pc === 0 ? Math.floor(m / 12) - 1 : '');
        else lab.textContent = pc === 0 ? 'C' + (Math.floor(m / 12) - 1) : '';
      }
    },
    keyAt(e) {
      const t = document.elementFromPoint(e.clientX, e.clientY);
      const k = t && t.closest ? t.closest('.key') : null;
      return k ? parseInt(k.dataset.midi, 10) : null;
    },
    down(e) {
      const m = this.keyAt(e);
      if (m === null) return;
      e.preventDefault();
      try { e.currentTarget.setPointerCapture(e.pointerId); } catch (x) { /* ignore */ }
      this.pointers.set(e.pointerId, m);
      this.press(m);
    },
    move(e) {
      if (!this.pointers.has(e.pointerId)) return;
      const m = this.keyAt(e);
      const prev = this.pointers.get(e.pointerId);
      if (m === null || m === prev) return;
      this.release(prev);
      this.pointers.set(e.pointerId, m);
      this.press(m);
    },
    up(e) {
      if (!this.pointers.has(e.pointerId)) return;
      this.release(this.pointers.get(e.pointerId));
      this.pointers.delete(e.pointerId);
    },
    press(m) {
      PP.Sound.note(m, 0, 1.2, 0.7);
      Input.emit('on', m, 0.7, performance.now(), 'screen');
    },
    release(m) { Input.emit('off', m, 0, performance.now(), 'screen'); },

    mark(midis, cls) {
      (this.marks[cls] || []).forEach((m) => { const k = this.els.get(m); if (k) k.classList.remove(cls); });
      this.marks[cls] = midis || [];
      this.marks[cls].forEach((m) => { const k = this.els.get(m); if (k) k.classList.add(cls); });
    },
    markPcs(pcs, cls) {
      const out = [];
      for (let m = this.lo; m <= this.hi; m++) if (pcs.includes(m % 12)) out.push(m);
      this.mark(out, cls);
    },
    clearMarks() { Object.keys(this.marks).forEach((c) => this.mark([], c)); },
    focus(midi) {
      const k = this.els.get(midi);
      if (!k || !this.root) return;
      const r = this.root;
      const left = k.offsetLeft - r.clientWidth / 2 + k.offsetWidth / 2;
      r.scrollTo({ left: Math.max(0, left), behavior: 'smooth' });
    },
  };
  PP.Keys = Keys;

  // ---------- Computer keyboard (for trying the app on a laptop) ----------
  const MAP = { KeyA: 0, KeyW: 1, KeyS: 2, KeyE: 3, KeyD: 4, KeyF: 5, KeyT: 6, KeyG: 7, KeyY: 8, KeyH: 9, KeyU: 10, KeyJ: 11, KeyK: 12, KeyO: 13, KeyL: 14, KeyP: 15, Semicolon: 16 };
  let octaveBase = 60;
  const downKeys = new Map();
  window.addEventListener('keydown', (e) => {
    if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
    const tag = (e.target && e.target.tagName) || '';
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    const k = e.code;
    if (k === 'KeyZ') { octaveBase = Math.max(36, octaveBase - 12); return; }
    if (k === 'KeyX') { octaveBase = Math.min(84, octaveBase + 12); return; }
    if (!(k in MAP)) return;
    const m = octaveBase + MAP[k];
    downKeys.set(k, m);
    PP.Sound.note(m, 0, 1.2, 0.7);
    Input.emit('on', m, 0.7, performance.now(), 'screen');
  });
  window.addEventListener('keyup', (e) => {
    const k = e.code;
    if (!downKeys.has(k)) return;
    Input.emit('off', downKeys.get(k), 0, performance.now(), 'screen');
    downKeys.delete(k);
  });
  window.addEventListener('blur', () => { downKeys.clear(); Input.clearHeld('screen'); });
})();
